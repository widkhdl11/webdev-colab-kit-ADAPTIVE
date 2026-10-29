import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ACCESS_DENY_REASONS, type AccessDenyReason } from "@/entities/address/model/access-log";
import type { CreatorAddressLabel } from "@/entities/address/model/creator-address-plaintext";
import { sha256Hex, type RecordedApproval } from "@/entities/order/model/evaluate-approval";
import { ORDER_STATUSES, type OrderStatus } from "@/entities/order/model/order-status";
import type { SignatureMethod } from "@/shared/api/approval-signer/accepted-method";
import type { KeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { openEnvelope, parseEnvelope } from "@/shared/lib/envelope/envelope";
import { authorizeDecrypt } from "../model/authorize-decrypt";
import { checkOpenedCreatorAddress } from "../model/check-opened-address";

// 송장 출력 함수 — 크리에이터 주소를 여는 유일한 서버 코드(address-protection INV-P4·P5·P7·P8·P14, office-workflow INV-W3).
// 순서: 로그인 토큰 검증 → 판정 재료 읽기 → 판정(대표·서명 재검증·주문번호·단계·차액·횟수) → 거부면 기록 한 줄
//       → DB 가 잠근 자리에서 다시 확인하고 횟수를 올리며 봉투를 내줌 → 봉투 열기 → 봉인 속 크리에이터 대조 → 출력 단계로 넘기기.
//       봉투를 연 뒤 송장이 나오기 전에 실패하거나 주소 주인이 달라 쓰지 않으면 그 「연 줄」을 돌려받는다(INV-P15 — 조건은 DB 가 상자를 잠근 자리에서 본다).
// DB 자격은 복호화 전용 역할(address_decryptor) — 앱 서버 키로는 이 함수들과 열람 기록 쓰기가 막혀 있다.
// 평문은 이 호출 안에서만 쓰고 라벨 다섯 칸만 돌려준다. 로그·오류·기록 줄에 넣지 않는다(INV-P10).

export type CreatorLabelDeps = {
  /** 복호화 전용 역할의 DB 클라이언트 */
  db: Pick<SupabaseClient, "rpc" | "from">;
  /** 로그인 토큰을 이 함수가 스스로 검증해 사용자 ID 를 얻는다(INV-P8). 검증 실패면 null */
  verifyRequester: (accessToken: string) => Promise<string | null>;
  /** 이 함수 자신의 설정에 적힌 대표 ID(INV-P8) */
  ownerUserId: string;
  unwrapper: KeyUnwrapper;
  /** 저장된 서명을 다시 볼 때 받는 서명 방식 — 운영은 kakao, 로컬·시험 사이트는 fake(accepted-method.ts) */
  acceptedMethod: SignatureMethod;
  /**
   * kakao 서명 기록의 서명값 재검증(INV-P4 a) — 서명 게이트웨이만 넣는다. 없으면 kakao 기록은 승인으로 치지 않는다
   * (게이트웨이 밖에는 카카오 인증기관 인증서·폐기 조회 통로가 없다).
   */
  verifyStoredSignature?: StoredSignatureVerifier | undefined;
  /** 첫 출력의 새 송장번호(택배사 연동 전 개발용) */
  newWaybill: () => string;
};

/** 저장된 전자서명문(base64)을 다시 검증하고, 서명된 원문(감싼 틀을 벗긴 것)이 plaintext 와 바이트 단위로 같으면 true. 오류도 false. */
export type StoredSignatureVerifier = (input: { signature: string; plaintext: string }) => Promise<boolean>;

export type CreatorLabelResult =
  | { kind: "printed"; waybill: string; reprint: boolean; label: CreatorAddressLabel }
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "not_gift" }
  | { kind: "no_address" }
  | { kind: "failed" };

const giftContext = z.object({
  kind: z.literal("gift"),
  order_id: z.string(),
  box_id: z.string(),
  order_no: z.string(),
  order_status: z.string(),
  parcel_state: z.string(),
  creator_profile_id: z.string(),
  difference_unpaid: z.boolean(),
  decrypt_count: z.number().int().nonnegative(),
  // INV-P4 (a)·approval-signature INV-S12: 서명값이 있는가 · 방식 · 기록된 원문 해시 · 그 주문 승인 원문(서명자 식별값 없음)
  signature_present: z.boolean(),
  // 서명값 — kakao 면 전자서명문 base64(다시 검증한다). 판정 재료 함수가 아직 이 칸을 주지 않으면(마이그레이션 20261029000011 전) 없음 → kakao 는 거부
  signature: z.string().nullable().optional(),
  signer_method: z.string().nullable(),
  recorded_hash: z.string().nullable(),
  approval_plaintext: z.string().nullable(),
});
const contextShape = z.union([giftContext, z.object({ kind: z.literal("share") })]);

const finishShape = z.object({ waybill: z.string().min(1), first: z.boolean() });

const claimShape = z.union([
  z.object({
    result: z.literal("opened"),
    print_no: z.number().int().min(1),
    creator_id: z.string(),
    envelope: z.unknown(),
    // INV-P15: 이번에 남긴 「연 줄」의 id — 송장이 안 나오면 이 줄을 돌려받는다.
    // 주소를 내주는 DB 함수가 아직 이 값을 주지 않으면(manual/0010 적용 전) 돌려주기를 건너뛰고 지금처럼 출력한다.
    log_id: z.number().int().positive().optional(),
  }),
  z.object({ result: z.literal("denied"), reason: z.enum(ACCESS_DENY_REASONS) }),
  z.object({ result: z.literal("no_address") }),
]);

type GiftContext = z.infer<typeof giftContext>;

/** 목록에 없는 상태(DB 에 새로 생긴 상태 등)는 출력할 수 없는 상태로 친다 — 판정이 거부하고 거부 줄을 남긴다(INV-P4 (c)·P7). */
function orderStatusOf(raw: string): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(raw) ? (raw as OrderStatus) : "canceled";
}

/**
 * INV-P4 (a): 저장된 서명 기록을 지금 받는 방식 기준으로 다시 본다. 서명값이 없거나 방식이 다르면(운영에 가짜 서명 등) 승인으로 치지 않는다.
 * kakao 는 칸이 차 있는 것만으로 믿지 않는다 — 서명값(전자서명문)을 체인·서명·폐기까지 다시 검증하고, 서명된 원문이 그 주문 서명 요청의
 * 원문과 바이트 단위로 같을 때만 승인으로 친다(DB 에 method='kakao', signature='x' 줄을 심어도 열리지 않게). 검증 함수가 없으면 거부.
 * fake 는 지금 규칙 그대로 — 받는 방식이 fake 인 것 자체가 시험 사이트 판정이고, DB 는 가짜 허용 줄이 있을 때만 그 기록을 만든다.
 * 원문 해시 대조·주문번호 대조는 판정(checkRecordedApproval)이 본다.
 */
async function recordedApproval(ctx: GiftContext, deps: Pick<CreatorLabelDeps, "acceptedMethod" | "verifyStoredSignature">): Promise<RecordedApproval | null> {
  if (!ctx.signature_present || ctx.signer_method !== deps.acceptedMethod || ctx.recorded_hash === null || ctx.approval_plaintext === null) return null;
  if (deps.acceptedMethod === "kakao" && !(await storedKakaoSignatureHolds(ctx, deps.verifyStoredSignature))) return null;
  return { plaintext: ctx.approval_plaintext, plaintextHash: await sha256Hex(ctx.approval_plaintext), recordedHash: ctx.recorded_hash };
}

async function storedKakaoSignatureHolds(ctx: GiftContext, verify: StoredSignatureVerifier | undefined): Promise<boolean> {
  if (!verify || !ctx.signature || !ctx.approval_plaintext) return false;
  try {
    return (await verify({ signature: ctx.signature, plaintext: ctx.approval_plaintext })) === true;
  } catch {
    return false;
  }
}

/** 거부 줄에도 어느 상자의 출력이었는지 남긴다(INV-P5 — 횟수는 상자마다, 카드 d30). */
async function logDenied(deps: CreatorLabelDeps, ctx: GiftContext, requesterId: string, reason: AccessDenyReason): Promise<void> {
  const { error } = await deps.db
    .from("decrypt_log")
    .insert({ order_id: ctx.order_id, box_id: ctx.box_id, requester_id: requesterId, result: "denied", deny_reason: reason });
  if (error) throw new Error("열람 기록을 남기지 못했다");
}

/**
 * INV-P15: 주소를 연 뒤 송장이 나오기 전에 실패했다 — 그 「연 줄」을 돌려받아 상자의 횟수를 되돌린다.
 * 돌려줄 수 있는지는 DB 가 상자를 잠근 자리에서 정한다(이미 돌려줌·최근 줄 아님·재출력·돌려주기 2번 등은 거부).
 * 거부·오류여도 이 출력의 결과는 「실패」 그대로다 — 돌려받지 못한 시도는 횟수에 남을 뿐 주소가 더 열리지는 않는다.
 */
async function releaseOpened(deps: CreatorLabelDeps, logId: number | undefined, requesterId: string): Promise<CreatorLabelResult> {
  await returnOpenedLog(deps, logId, requesterId);
  return { kind: "failed" };
}

/** 돌려주기 자체 — 결과는 보지 않는다(거부·오류여도 그 시도가 횟수에 남을 뿐이다). */
async function returnOpenedLog(deps: CreatorLabelDeps, logId: number | undefined, requesterId: string): Promise<void> {
  if (logId !== undefined) {
    await deps.db.rpc("invoice_release_print", { p_log_id: logId, p_requester: requesterId });
  }
}

export async function printCreatorLabel(deps: CreatorLabelDeps, input: { qr: string; accessToken: string }): Promise<CreatorLabelResult> {
  // INV-P8: 로그인 토큰은 이 함수가 스스로 검증한다. 못 믿으면 DB 도 부르지 않는다(기록 줄의 요청자를 정할 수 없다).
  const requesterId = input.accessToken === "" ? null : await deps.verifyRequester(input.accessToken);
  if (!requesterId) return { kind: "unauthenticated" };

  const ctxReply = await deps.db.rpc("invoice_print_context", { p_qr: input.qr });
  if (ctxReply.error) return { kind: "failed" };
  if (ctxReply.data === null) return { kind: "not_found" };
  const parsedCtx = contextShape.safeParse(ctxReply.data);
  if (!parsedCtx.success) return { kind: "failed" };
  if (parsedCtx.data.kind === "share") return { kind: "not_gift" };
  const ctx = parsedCtx.data;

  const approval = await recordedApproval(ctx, deps);
  const decision = authorizeDecrypt({
    requestedOrderNo: ctx.order_no,
    requesterUserId: requesterId,
    ownerUserId: deps.ownerUserId,
    approval,
    orderStatus: orderStatusOf(ctx.order_status),
    parcelState: ctx.parcel_state,
    // 차단은 승인 전 주문을 거절로 바꿀 뿐이고 승인된 주문은 그대로 출고한다(decline-block INV-D8, 카드 d27) —
    // 차단으로 거절된 주문은 위 상태 판정에서 이미 걸린다.
    fanBlocked: false,
    decryptCount: ctx.decrypt_count,
    differenceUnpaid: ctx.difference_unpaid,
  });
  if (!decision.ok) {
    await logDenied(deps, ctx, requesterId, decision.reason);
    return { kind: "denied", reason: decision.reason };
  }

  // INV-P5: 횟수 확인과 증가는 DB 가 상자·주문을 잠근 자리에서 한 번에 — 동시 요청이 와도 상한을 넘지 않는다.
  // 거부면 DB 가 그 자리에서 기록 줄을 남겼다. 열 수 있으면 「연 줄」을 먼저 남기고 봉투를 내준다.
  const claimReply = await deps.db.rpc("invoice_claim_print", { p_qr: input.qr, p_requester: requesterId });
  if (claimReply.error) return { kind: "failed" };
  const claim = claimShape.safeParse(claimReply.data);
  if (!claim.success) return { kind: "failed" };
  if (claim.data.result === "no_address") return { kind: "no_address" };
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

  // INV-P14: 봉인 속 크리에이터가 그 주소 칸의 크리에이터와 다르면 쓰지 않는다 — 출력 단계로 넘기지 않는다.
  // 답은 거부지만 송장은 안 나왔다 — 다른 출력 실패와 같이 그 「연 줄」을 돌려받는다(INV-P15, D12 반영).
  // 그래서 크리에이터 열람 기록에 그 줄은 「출력 실패」이고, 다음 송장은 첫 출력이다. 거부 사유는 운영자 내부 기록에 남긴다.
  const opened = checkOpenedCreatorAddress({ slotCreatorId: claim.data.creator_id, plaintext });
  if (!opened.ok) {
    await returnOpenedLog(deps, logId, requesterId);
    await logDenied(deps, ctx, requesterId, opened.reason);
    return { kind: "denied", reason: opened.reason };
  }

  // 첫 출력이면 새 송장번호로 송장 출력 단계로 넘기고, 재출력이면 DB 가 처음 번호를 돌려준다 — 재출력에는 새 번호를 받지 않는다.
  // 재출력인지는 DB 가 잠근 자리에서 정한다(first). 몇 번째로 주소를 열었는지로 정하면, 송장 없이 끝난 앞선 시도가 있을 때
  // 첫 송장이 「재출력」으로 찍힌다. 판정 재료를 읽은 뒤 다른 요청이 먼저 출력했으면 넘긴 번호는 쓰이지 않는다.
  const waybill = ctx.parcel_state === "label_printed" || ctx.parcel_state === "shipped" ? null : deps.newWaybill();
  const finish = await deps.db.rpc("invoice_finish_print", { p_qr: input.qr, p_waybill: waybill });
  if (finish.error) return releaseOpened(deps, logId, requesterId);
  const finished = finishShape.safeParse(finish.data);
  // 응답만 깨지고 상자는 넘어갔을 수 있다 — 그러면 DB 가 (d)로 돌려주기를 거부한다
  if (!finished.success) return releaseOpened(deps, logId, requesterId);
  return { kind: "printed", waybill: finished.data.waybill, reprint: !finished.data.first, label: opened.label };
}
