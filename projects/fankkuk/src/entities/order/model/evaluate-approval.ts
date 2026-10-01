import { isApprovable, type OrderStatus } from "./order-status";
import { parseSigningPayload } from "./signing-payload";

/**
 * 서명 값 검증(INV-S3: 인증서 체인·알고리즘·유효 기간·폐기)을 통과한 결과.
 * 이 값을 만드는 검증기는 딜러사 계약 후 붙는다 — 여기서는 검증이 끝난 결과만 받는다.
 */
export type VerifiedSignature = {
  /** 서명자가 실제로 서명한 원문 바이트 */
  signedContent: Uint8Array;
  /** 인증서에서 나온 본인 식별값 */
  signerId: string;
};

export type ApprovalInput = {
  /** 서버가 승인 요청을 만들 때 저장해 둔 원문 */
  storedPayload: string;
  signature: VerifiedSignature;
  /** 크리에이터가 가입 때 카카오 인증으로 등록한 본인 식별값 */
  registeredSignerId: string;
  orderStatus: OrderStatus;
  fanBlocked: boolean;
};

export type ApprovalResult =
  | { ok: true; orderNo: string }
  | { ok: false; reason: "payload_mismatch" | "signer_mismatch" | "order_not_approvable" | "fan_blocked" };

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export type SignatureCheck =
  | { ok: true; orderNo: string }
  | { ok: false; reason: "payload_mismatch" | "signer_mismatch" };

/**
 * 검증된 서명이 저장된 원문에 대한 크리에이터 본인의 서명인가.
 * 승인 처리와 복호화 함수(INV-P4 a)가 같은 판정을 쓴다.
 */
export function checkApprovalSignature(
  storedPayload: string,
  signature: VerifiedSignature,
  registeredSignerId: string,
): SignatureCheck {
  // INV-S2: 서명된 원문이 저장한 원문과 바이트 단위로 같아야 한다.
  const stored = new TextEncoder().encode(storedPayload);
  if (!sameBytes(stored, signature.signedContent)) return { ok: false, reason: "payload_mismatch" };

  const fields = parseSigningPayload(storedPayload);
  if (!fields) return { ok: false, reason: "payload_mismatch" };

  // INV-S4: 서명자가 그 주문의 크리에이터 본인이어야 한다. 등록값이 비어 있으면 아무도 통과하지 못한다.
  if (registeredSignerId === "" || signature.signerId !== registeredSignerId) {
    return { ok: false, reason: "signer_mismatch" };
  }
  return { ok: true, orderNo: fields.orderNo };
}

/** 승인 처리: 서명이 유효하고 주문이 승인을 받을 수 있는 상태인가. */
export function evaluateApproval(input: ApprovalInput): ApprovalResult {
  const check = checkApprovalSignature(input.storedPayload, input.signature, input.registeredSignerId);
  if (!check.ok) return check;

  // INV-S6: 거절·반려·취소된 주문, 차단된 팬의 주문은 승인하지 않는다.
  if (input.fanBlocked) return { ok: false, reason: "fan_blocked" };
  if (!isApprovable(input.orderStatus)) return { ok: false, reason: "order_not_approvable" };

  return { ok: true, orderNo: check.orderNo };
}
