import { z } from "zod";
import { ACCESS_DENY_REASONS, type AccessDenyReason } from "@/entities/address/model/access-log";
import type { RevgiftAddressLabel } from "@/entities/revgift/model/sealed-address";
import { openEnvelope, parseEnvelope } from "@/shared/lib/envelope/envelope";
import { authorizeRevgiftDecrypt, checkOpenedRevgift } from "../model/authorize-revgift-decrypt";
import type { CreatorLabelDeps } from "./print-creator-label";

// 역조공 송장 출력 — 팬 주소(몫 하나)를 여는 유일한 서버 코드(reverse-gift INV-R7·R13).
// 순서는 팬 선물 송장 출력(print-creator-label)과 같다: 로그인 토큰 검증 → 판정 재료 읽기 → 판정(대표·받기·단계·횟수) → 거부면 기록 한 줄
//   → DB 가 몫을 잠근 자리에서 다시 확인하고 횟수를 올리며 봉투를 내줌 → 봉투 열기 → 봉인 속 계정(옛 봉인은 주문번호) 대조 → 출력 단계로 넘기기.
//   봉투를 연 뒤 송장이 나오기 전에 실패하거나 봉인 속 주문번호가 달라 쓰지 않으면 그 「연 줄」을 돌려받는다(INV-R13 — 조건은 DB 가 몫을 잠근 자리에서 본다).
// DB 자격은 복호화 전용 역할(address_decryptor). 평문은 이 호출 안에서만 쓰고 라벨 다섯 칸만 돌려준다 — 로그·오류·기록 줄에 넣지 않는다.

export type ShareLabelDeps = Omit<CreatorLabelDeps, "acceptedMethod">;

export type ShareLabelResult =
  | { kind: "printed"; waybill: string; reprint: boolean; label: RevgiftAddressLabel }
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "not_share" }
  | { kind: "failed" };

const shareContext = z.object({
  kind: z.literal("share"),
  share_id: z.string(),
  order_no: z.string(),
  parcel_state: z.string(),
  paid: z.boolean(),
  reply: z.enum(["waiting", "accepted", "declined", "expired"]),
  inspected: z.boolean(),
  shipped: z.boolean(),
  returned: z.boolean(),
  cancelled: z.boolean(),
  decrypt_count: z.number().int().nonnegative(),
});
const contextShape = z.union([shareContext, z.object({ kind: z.literal("gift") })]);

const claimShape = z.union([
  z.object({
    result: z.literal("opened"),
    print_no: z.number().int().min(1),
    // INV-R13: 이번에 남긴 「연 줄」의 id — 송장이 안 나오면 이 줄을 돌려받는다
    log_id: z.number().int().positive(),
    order_no: z.string(),
    // INV-R7 b: 그 몫의 받는 팬 — 계정이 묶인 봉인을 대조한다. manual/0019 전 DB 는 내주지 않는다(그러면 계정 봉인은 쓰지 않는다)
    fan_id: z.string().optional(),
    envelope: z.unknown(),
  }),
  z.object({ result: z.literal("denied"), reason: z.enum(ACCESS_DENY_REASONS) }),
]);

const finishShape = z.object({ waybill: z.string().min(1), first: z.boolean() });

type ShareContext = z.infer<typeof shareContext>;

/** 출력할 수 있는 단계 — 검수 완료부터 송장 출력까지. 출고 확정된 몫은 상자도 출고 확정일 때만 재출력(카드 d120). 결제가 끝난 보내기의 몫만. */
const PRINTABLE_STATES: readonly string[] = ["inspected", "label_printed"];

async function logDenied(deps: ShareLabelDeps, ctx: ShareContext, requesterId: string, reason: AccessDenyReason): Promise<void> {
  const { error } = await deps.db
    .from("revgift_decrypt_log")
    .insert({ share_id: ctx.share_id, requester_id: requesterId, result: "denied", deny_reason: reason });
  if (error) throw new Error("열람 기록을 남기지 못했다");
}

/**
 * INV-R13: 주소를 연 뒤 송장이 나오기 전에 실패했다 — 그 「연 줄」을 돌려받아 몫의 횟수를 되돌린다.
 * 돌려줄 수 있는지는 DB 가 몫을 잠근 자리에서 정한다. 거부·오류여도 이 출력의 결과는 「실패」 그대로다.
 */
async function releaseOpened(deps: ShareLabelDeps, logId: number, requesterId: string): Promise<ShareLabelResult> {
  await returnOpenedLog(deps, logId, requesterId);
  return { kind: "failed" };
}

/** 돌려주기 자체 — 결과는 보지 않는다(거부·오류여도 그 시도가 횟수에 남을 뿐이다). */
async function returnOpenedLog(deps: ShareLabelDeps, logId: number, requesterId: string): Promise<void> {
  await deps.db.rpc("revgift_release_print", { p_log_id: logId, p_requester: requesterId });
}

export async function printShareLabel(deps: ShareLabelDeps, input: { qr: string; accessToken: string }): Promise<ShareLabelResult> {
  // 로그인 토큰은 이 함수가 스스로 검증한다. 못 믿으면 DB 도 부르지 않는다(기록 줄의 요청자를 정할 수 없다).
  const requesterId = input.accessToken === "" ? null : await deps.verifyRequester(input.accessToken);
  if (!requesterId) return { kind: "unauthenticated" };

  const ctxReply = await deps.db.rpc("revgift_print_context", { p_qr: input.qr });
  if (ctxReply.error) return { kind: "failed" };
  if (ctxReply.data === null) return { kind: "not_found" };
  const parsedCtx = contextShape.safeParse(ctxReply.data);
  if (!parsedCtx.success) return { kind: "failed" };
  if (parsedCtx.data.kind === "gift") return { kind: "not_share" };
  const ctx = parsedCtx.data;

  // INV-R7 (a)(c)(d)·상한. 암호문이 실제로 있는지는 봉투를 내주는 DB 함수가 잠근 자리에서 다시 본다.
  const decision = authorizeRevgiftDecrypt({
    requestedOrderNo: ctx.order_no,
    requesterUserId: requesterId,
    ownerUserId: deps.ownerUserId,
    hasEnvelope: ctx.reply === "accepted",
    share: {
      reply: ctx.reply,
      inspected: ctx.inspected && ctx.paid && (ctx.shipped ? ctx.parcel_state === "shipped" : PRINTABLE_STATES.includes(ctx.parcel_state)),
      shipped: ctx.shipped,
      returned: ctx.returned,
      cancelled: ctx.cancelled,
    },
    decryptCount: ctx.decrypt_count,
  });
  if (!decision.ok) {
    await logDenied(deps, ctx, requesterId, decision.reason);
    return { kind: "denied", reason: decision.reason };
  }

  // INV-R7: 횟수 확인과 증가는 DB 가 상자·몫을 잠근 자리에서 한 번에 — 동시 요청이 와도 상한을 넘지 않는다.
  // 거부면 DB 가 그 자리에서 기록 줄을 남겼다. 열 수 있으면 「연 줄」을 먼저 남기고 봉투를 내준다.
  const claimReply = await deps.db.rpc("revgift_claim_print", { p_qr: input.qr, p_requester: requesterId });
  if (claimReply.error) return { kind: "failed" };
  const claim = claimShape.safeParse(claimReply.data);
  if (!claim.success) return { kind: "failed" };
  if (claim.data.result === "denied") return { kind: "denied", reason: claim.data.reason };

  const logId = claim.data.log_id;
  const envelope = parseEnvelope(claim.data.envelope);
  if (!envelope) return releaseOpened(deps, logId, requesterId);
  let plaintext: string;
  try {
    const dek = await deps.unwrapper.unwrap(envelope.wrappedKey);
    try {
      plaintext = await openEnvelope(envelope, dek);
    } finally {
      dek.fill(0);
    }
  } catch {
    return releaseOpened(deps, logId, requesterId);
  }

  // INV-R7 (b): 봉인 속 계정이 잠근 자리의 몫의 받는 팬과 다르면(옛 봉인은 주문번호가 다르면 — 옮겨 붙인 암호문) 쓰지 않는다.
  // 답은 거부지만 송장은 안 나왔다 — 다른 출력 실패와 같이 그 「연 줄」을 돌려받는다(INV-R13, D12 반영). 거부 사유는 운영자 내부 기록에.
  const opened = checkOpenedRevgift({
    requestedOrderNo: claim.data.order_no,
    shareFanId: claim.data.fan_id ?? null,
    openedPlaintext: plaintext,
  });
  if (!opened.ok) {
    await returnOpenedLog(deps, logId, requesterId);
    await logDenied(deps, ctx, requesterId, opened.reason);
    return { kind: "denied", reason: opened.reason };
  }

  // 첫 출력이면 새 송장번호로 송장 출력 단계로 넘기고, 재출력이면 DB 가 처음 번호를 돌려준다(재출력인지는 DB 가 잠근 자리에서 정한다).
  const waybill = ctx.parcel_state === "inspected" ? deps.newWaybill() : null;
  const finish = await deps.db.rpc("revgift_finish_print", { p_qr: input.qr, p_waybill: waybill });
  if (finish.error) return releaseOpened(deps, logId, requesterId);
  const finished = finishShape.safeParse(finish.data);
  // 응답만 깨지고 상자는 넘어갔을 수 있다 — 그러면 DB 가 (d)로 돌려주기를 거부한다
  if (!finished.success) return releaseOpened(deps, logId, requesterId);
  return { kind: "printed", waybill: finished.data.waybill, reprint: !finished.data.first, label: opened.label };
}
