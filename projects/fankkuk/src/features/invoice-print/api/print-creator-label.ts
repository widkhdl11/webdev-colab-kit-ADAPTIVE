import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ACCESS_DENY_REASONS, type AccessDenyReason } from "@/entities/address/model/access-log";
import type { CreatorAddressLabel } from "@/entities/address/model/creator-address-plaintext";
import type { VerifiedSignature } from "@/entities/order/model/evaluate-approval";
import type { OrderStatus } from "@/entities/order/model/order-status";
import type { ApprovalSigner } from "@/shared/api/approval-signer/signer";
import type { KeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { openEnvelope, parseEnvelope } from "@/shared/lib/envelope/envelope";
import { authorizeDecrypt } from "../model/authorize-decrypt";
import { checkOpenedCreatorAddress } from "../model/check-opened-address";

// 송장 출력 함수 — 크리에이터 주소를 여는 유일한 서버 코드(address-protection INV-P4·P5·P7·P8·P14, office-workflow INV-W3).
// 순서: 로그인 토큰 검증 → 판정 재료 읽기 → 판정(대표·서명 재검증·주문번호·단계·차액·횟수) → 거부면 기록 한 줄
//       → DB 가 잠근 자리에서 다시 확인하고 횟수를 올리며 봉투를 내줌 → 봉투 열기 → 봉인 속 크리에이터 대조 → 출력 단계로 넘기기.
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
  /** 승인 서명 창구 — 저장된 서명을 다시 검증할 때 등록된 본인 식별값을 준다. 운영에서 가짜 창구는 없다(null) */
  signer: ApprovalSigner | null;
  /** 첫 출력의 새 송장번호(택배사 연동 전 개발용) */
  newWaybill: () => string;
};

export type CreatorLabelResult =
  | { kind: "printed"; waybill: string; reprint: boolean; label: CreatorAddressLabel }
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "not_gift" }
  | { kind: "no_address" }
  | { kind: "failed" };

const ORDER_STATUSES = ["registered", "approved", "received", "labeled", "inspected", "label_printed", "shipped", "rejected", "expired", "canceled"] as const;

const giftContext = z.object({
  kind: z.literal("gift"),
  order_id: z.string(),
  box_id: z.string(),
  order_no: z.string(),
  order_status: z.string(),
  creator_profile_id: z.string(),
  difference_unpaid: z.boolean(),
  decrypt_count: z.number().int().nonnegative(),
  stored_payload: z.string().nullable(),
  signed_content: z.string().nullable(),
  signer_id: z.string().nullable(),
  signer_method: z.string().nullable(),
});
const contextShape = z.union([giftContext, z.object({ kind: z.literal("share") })]);

const claimShape = z.union([
  z.object({ result: z.literal("opened"), print_no: z.number().int().min(1), creator_id: z.string(), envelope: z.unknown() }),
  z.object({ result: z.literal("denied"), reason: z.enum(ACCESS_DENY_REASONS) }),
  z.object({ result: z.literal("no_address") }),
]);

type GiftContext = z.infer<typeof giftContext>;

/** 모르는 상태 값(결제 전 등)은 출력할 수 없는 상태로 본다 — 「모르는 값이면 연다」가 되지 않게. */
function orderStatusOf(raw: string): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(raw) ? (raw as OrderStatus) : "canceled";
}

/**
 * INV-P4 (a): 저장된 서명을 지금 서명 창구 기준으로 다시 본다. 서명 방식이 창구와 다르거나(운영에 가짜 서명 등),
 * 서명이 없으면 승인으로 치지 않는다. 원문 일치·본인 일치는 판정(checkApprovalSignature)이 본다.
 */
function storedSignature(ctx: GiftContext, signer: ApprovalSigner | null): VerifiedSignature | null {
  if (!signer || ctx.signed_content === null || ctx.signer_id === null || ctx.signer_method !== signer.kind) return null;
  return { signedContent: new TextEncoder().encode(ctx.signed_content), signerId: ctx.signer_id };
}

/** 거부 줄에도 어느 상자의 출력이었는지 남긴다(INV-P5 — 횟수는 상자마다, 카드 d30). */
async function logDenied(deps: CreatorLabelDeps, ctx: GiftContext, requesterId: string, reason: AccessDenyReason): Promise<void> {
  const { error } = await deps.db
    .from("decrypt_log")
    .insert({ order_id: ctx.order_id, box_id: ctx.box_id, requester_id: requesterId, result: "denied", deny_reason: reason });
  if (error) throw new Error("열람 기록을 남기지 못했다");
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

  const signature = storedSignature(ctx, deps.signer);
  const decision = authorizeDecrypt({
    requestedOrderNo: ctx.order_no,
    requesterUserId: requesterId,
    ownerUserId: deps.ownerUserId,
    storedPayload: ctx.stored_payload ?? "",
    signature,
    registeredSignerId: deps.signer ? deps.signer.registeredSignerIdOf(ctx.creator_profile_id) : "",
    orderStatus: orderStatusOf(ctx.order_status),
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

  const envelope = parseEnvelope(claim.data.envelope);
  if (!envelope) return { kind: "failed" };
  let plaintext: string;
  try {
    const dek = await deps.unwrapper.unwrap(envelope.wrappedKey);
    try {
      plaintext = await openEnvelope(envelope, dek);
    } finally {
      dek.fill(0);
    }
  } catch {
    return { kind: "failed" };
  }

  // INV-P14: 봉인 속 크리에이터가 그 주소 칸의 크리에이터와 다르면 쓰지 않는다 — 출력 단계로 넘기지 않는다.
  const opened = checkOpenedCreatorAddress({ slotCreatorId: claim.data.creator_id, plaintext });
  if (!opened.ok) {
    await logDenied(deps, ctx, requesterId, opened.reason);
    return { kind: "denied", reason: opened.reason };
  }

  // 첫 출력이면 새 송장번호로 송장 출력 단계로 넘기고, 재출력이면 DB 가 처음 번호를 돌려준다.
  const finish = await deps.db.rpc("invoice_finish_print", { p_qr: input.qr, p_waybill: deps.newWaybill() });
  if (finish.error || typeof finish.data !== "string" || finish.data === "") return { kind: "failed" };
  return { kind: "printed", waybill: finish.data, reprint: claim.data.print_no > 1, label: opened.label };
}
