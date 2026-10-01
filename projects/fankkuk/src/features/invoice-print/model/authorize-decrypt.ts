import { checkApprovalSignature, type VerifiedSignature } from "@/entities/order/model/evaluate-approval";
import { isPrintable, type OrderStatus } from "@/entities/order/model/order-status";

/** INV-P5: 승인 1건당 복호화 상한 — 첫 출력 + 재출력 2회. */
export const MAX_DECRYPTS_PER_ORDER = 3;

export type DecryptRequest = {
  requestedOrderNo: string;
  /** 복호화 함수가 스스로 검증한 로그인 토큰의 사용자 ID */
  requesterUserId: string;
  /** 복호화 함수 자신의 설정에 적힌 대표 ID (DB 의 역할 컬럼이 아니다) */
  ownerUserId: string;
  storedPayload: string;
  /** 복호화 함수가 직접 다시 검증한 승인 서명. 없거나 검증 실패면 null */
  signature: VerifiedSignature | null;
  registeredSignerId: string;
  orderStatus: OrderStatus;
  fanBlocked: boolean;
  /** 이 주문에서 지금까지 성공한 복호화 횟수 */
  decryptCount: number;
  /** 도착 실측 차액 요청이 있고 아직 결제되지 않았는가 */
  differenceUnpaid: boolean;
};

export type DecryptDecision =
  | { ok: true; isReprint: boolean }
  | {
      ok: false;
      reason: "not_owner" | "no_valid_approval" | "order_mismatch" | "order_not_printable" | "difference_unpaid" | "decrypt_limit_reached";
    };

/** 복호화 함수 진입부 판정. 하나라도 어긋나면 열지 않는다. 동시 요청의 원자성은 저장소 쪽이 맡는다. */
export function authorizeDecrypt(req: DecryptRequest): DecryptDecision {
  // INV-P8: 대표 계정만. 판단 근거는 복호화 함수 설정의 대표 ID 하나.
  if (req.ownerUserId === "" || req.requesterUserId !== req.ownerUserId) return { ok: false, reason: "not_owner" };

  // INV-P4 (a): 서명을 직접 다시 검증한 결과로만 승인을 인정한다.
  if (!req.signature) return { ok: false, reason: "no_valid_approval" };
  const approval = checkApprovalSignature(req.storedPayload, req.signature, req.registeredSignerId);
  if (!approval.ok) return { ok: false, reason: "no_valid_approval" };

  // INV-P4 (b): 서명 원문의 주문번호가 요청한 주문번호와 같아야 한다.
  if (approval.orderNo !== req.requestedOrderNo) return { ok: false, reason: "order_mismatch" };

  // INV-P4 (c)·INV-P5: 검수 완료 ~ 출고 확정 전에만. 출고 확정되면 남은 횟수는 소멸. 차단된 팬의 주문도 거부.
  if (req.fanBlocked || !isPrintable(req.orderStatus)) return { ok: false, reason: "order_not_printable" };

  // INV-M12: 차액을 덜 낸 주문은 출고하지 않는다 — 송장 출력(=주소 열기)도 하지 않는다.
  if (req.differenceUnpaid) return { ok: false, reason: "difference_unpaid" };

  // INV-P5: 상한.
  if (req.decryptCount >= MAX_DECRYPTS_PER_ORDER) return { ok: false, reason: "decrypt_limit_reached" };

  return { ok: true, isReprint: req.decryptCount > 0 };
}
