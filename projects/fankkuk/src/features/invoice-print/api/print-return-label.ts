import { z } from "zod";
import { ACCESS_DENY_REASONS, type AccessDenyReason } from "@/entities/address/model/access-log";
import type { CreatorAddressLabel } from "@/entities/address/model/creator-address-plaintext";
import { openEnvelope, parseEnvelope } from "@/shared/lib/envelope/envelope";
import { authorizeReturnDecrypt, checkOpenedReturn } from "../model/authorize-return-decrypt";
import type { CreatorLabelDeps } from "./print-creator-label";

// 반송 송장 출력 함수 — 보낸 사람이 확인한 등록 주소(상자 복사본)를 여는 유일한 서버 코드(address-protection INV-P18, office-workflow INV-W8·W15).
// 순서는 역조공 송장 출력(print-share-label)과 같다: 로그인 토큰 검증 → 판정 재료 읽기 → 판정(대표·확인·단계·횟수) → 거부면 기록 한 줄
//   → DB 가 상자를 잠근 자리에서 다시 확인하고 횟수를 올리며 봉투를 내줌 → 봉투 열기 → 봉인 속 계정과 보낸 계정 대조 → 반송 송장 출력 단계로 넘기기.
//   봉투를 연 뒤 송장이 나오기 전에 실패하거나 봉인 속 계정이 달라 쓰지 않으면 그 「연 줄」을 돌려받는다(INV-P15 와 같다).
// 어느 주문에도 이어지지 않은 상자는 열 주소가 없다 — not_linked 로 돌려보내고, 부르는 쪽이 봉투 번호 길(office_print_return_label)로 간다(S15f).
// DB 자격은 복호화 전용 역할(address_decryptor). 평문은 이 호출 안에서만 쓰고 라벨 다섯 칸만 돌려준다 — 로그·오류·기록 줄에 넣지 않는다.

export type ReturnLabelDeps = Omit<CreatorLabelDeps, "signer">;

export type ReturnLabelResult =
  | { kind: "printed"; waybill: string; reprint: boolean; label: CreatorAddressLabel }
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "not_linked" }
  | { kind: "failed" };

const linkedContext = z.object({
  kind: z.literal("linked"),
  parcel_id: z.string(),
  order_no: z.string(),
  parcel_state: z.string(),
  confirmed: z.boolean(),
  decrypt_count: z.number().int().nonnegative(),
});
const contextShape = z.union([linkedContext, z.object({ kind: z.literal("unlinked") })]);

const claimShape = z.union([
  z.object({
    result: z.literal("opened"),
    print_no: z.number().int().min(1),
    // 이번에 남긴 「연 줄」의 id — 송장이 안 나오면 이 줄을 돌려받는다
    log_id: z.number().int().positive(),
    order_no: z.string(),
    // INV-P18 (b): 그 상자 주문을 보낸 계정과, 그 계정이 크리에이터면 크리에이터 id — 봉인 속 식별값과 대조한다
    sender_id: z.string(),
    sender_creator_id: z.string().nullable(),
    // INV-W15 · P18: 봉투를 내준 순간 상자에 적힌 확인 시각 — 마무리가 잠근 자리에서 이 값과 비교해, 그 사이 다시 확인했으면 거부한다.
    // 없으면(봉투 함수가 옛것, manual/0022 적용 전) 출력 단계로 넘기지 않는다 — 연 줄을 돌려받고 실패
    confirmed_at: z.string().min(1).optional(),
    envelope: z.unknown(),
  }),
  z.object({ result: z.literal("denied"), reason: z.enum(ACCESS_DENY_REASONS) }),
]);

const finishShape = z.object({ waybill: z.string().min(1), first: z.boolean() });

type LinkedContext = z.infer<typeof linkedContext>;

async function logDenied(deps: ReturnLabelDeps, ctx: LinkedContext, requesterId: string, reason: AccessDenyReason): Promise<void> {
  const { error } = await deps.db.from("return_decrypt_log").insert({ parcel_id: ctx.parcel_id, requester_id: requesterId, result: "denied", deny_reason: reason });
  if (error) throw new Error("열람 기록을 남기지 못했다");
}

/** 돌려주기 — 결과는 보지 않는다(거부·오류여도 그 시도가 횟수에 남을 뿐이다). 돌려줄 수 있는지는 DB 가 상자를 잠근 자리에서 정한다 */
async function returnOpenedLog(deps: ReturnLabelDeps, logId: number, requesterId: string): Promise<void> {
  await deps.db.rpc("return_release_print", { p_log_id: logId, p_requester: requesterId });
}

async function releaseOpened(deps: ReturnLabelDeps, logId: number, requesterId: string): Promise<ReturnLabelResult> {
  await returnOpenedLog(deps, logId, requesterId);
  return { kind: "failed" };
}

export async function printReturnLabel(deps: ReturnLabelDeps, input: { qr: string; accessToken: string }): Promise<ReturnLabelResult> {
  // 로그인 토큰은 이 함수가 스스로 검증한다. 못 믿으면 DB 도 부르지 않는다(기록 줄의 요청자를 정할 수 없다).
  const requesterId = input.accessToken === "" ? null : await deps.verifyRequester(input.accessToken);
  if (!requesterId) return { kind: "unauthenticated" };

  const ctxReply = await deps.db.rpc("return_print_context", { p_qr: input.qr });
  if (ctxReply.error) return { kind: "failed" };
  if (ctxReply.data === null) return { kind: "not_found" };
  const parsedCtx = contextShape.safeParse(ctxReply.data);
  if (!parsedCtx.success) return { kind: "failed" };
  if (parsedCtx.data.kind === "unlinked") return { kind: "not_linked" };
  const ctx = parsedCtx.data;

  // INV-P18 (a)(c)·상한. 복사본이 실제로 있는지는 봉투를 내주는 DB 함수가 잠근 자리에서 다시 본다.
  const decision = authorizeReturnDecrypt({
    requesterUserId: requesterId,
    ownerUserId: deps.ownerUserId,
    confirmed: ctx.confirmed,
    parcelState: ctx.parcel_state,
    decryptCount: ctx.decrypt_count,
  });
  if (!decision.ok) {
    await logDenied(deps, ctx, requesterId, decision.reason);
    return { kind: "denied", reason: decision.reason };
  }

  // 횟수 확인과 증가는 DB 가 상자를 잠근 자리에서 한 번에 — 동시 요청이 와도 상한을 넘지 않는다. 거부면 DB 가 그 자리에서 기록 줄을 남겼다.
  const claimReply = await deps.db.rpc("return_claim_print", { p_qr: input.qr, p_requester: requesterId });
  if (claimReply.error) return { kind: "failed" };
  const claim = claimShape.safeParse(claimReply.data);
  if (!claim.success) return { kind: "failed" };
  if (claim.data.result === "denied") return { kind: "denied", reason: claim.data.reason };

  const logId = claim.data.log_id;
  const confirmedAt = claim.data.confirmed_at;
  if (confirmedAt === undefined) return releaseOpened(deps, logId, requesterId);
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

  // INV-P18 (b): 봉인 속 계정이 상자 주문을 보낸 계정과 다르면(옮겨 붙인 암호문) 쓰지 않는다 — 연 줄을 돌려받고 거부 사유는 운영자 내부 기록에.
  const opened = checkOpenedReturn({ senderId: claim.data.sender_id, senderCreatorId: claim.data.sender_creator_id, openedPlaintext: plaintext });
  if (!opened.ok) {
    await returnOpenedLog(deps, logId, requesterId);
    await logDenied(deps, ctx, requesterId, opened.reason);
    return { kind: "denied", reason: opened.reason };
  }

  // 첫 출력이면 새 송장번호로 반송 송장 출력 단계로 넘기고, 재출력이면 DB 가 처음 번호를 돌려준다(어느 쪽인지는 DB 가 잠근 자리에서 정한다).
  // 봉투를 내준 뒤 보낸 사람이 다른 주소로 다시 확인했으면 확인 시각이 달라 DB 가 거부한다(P0041) — 먼저 연 주소로 출력하지 않고 연 줄을 돌려받는다.
  const waybill = ctx.parcel_state === "return_printed" ? null : deps.newWaybill();
  const finish = await deps.db.rpc("return_finish_print", { p_qr: input.qr, p_waybill: waybill, p_confirmed_at: confirmedAt });
  if (finish.error) return releaseOpened(deps, logId, requesterId);
  const finished = finishShape.safeParse(finish.data);
  if (!finished.success) return releaseOpened(deps, logId, requesterId);
  return { kind: "printed", waybill: finished.data.waybill, reprint: !finished.data.first, label: opened.label };
}
