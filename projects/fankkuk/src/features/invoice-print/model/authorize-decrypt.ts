import { MAX_DECRYPTS_PER_BOX, type AccessDenyReason } from "@/entities/address/model/access-log";
import { checkRecordedApproval, type RecordedApproval } from "@/entities/order/model/evaluate-approval";
import { isPrintable, type OrderStatus } from "@/entities/order/model/order-status";

export type DecryptRequest = {
  requestedOrderNo: string;
  /** 복호화 함수가 스스로 검증한 로그인 토큰의 사용자 ID */
  requesterUserId: string;
  /** 복호화 함수 자신의 설정에 적힌 대표 ID (DB 의 역할 컬럼이 아니다) */
  ownerUserId: string;
  /**
   * 그 주문의 승인 서명 기록을 다시 볼 재료(INV-P4 a — 서명자 식별값 없이). 서명 기록이 없거나, 서명값이 없거나,
   * 방식이 이 함수가 받는 방식이 아니면 null — 부르는 쪽이 정한다.
   */
  approval: RecordedApproval | null;
  orderStatus: OrderStatus;
  /** 이 상자의 사무실 단계(office_parcels.state) — 출고 확정 뒤 재출력을 가른다 */
  parcelState: string;
  fanBlocked: boolean;
  /** 이 상자에서 지금까지 주소를 연 횟수(상자마다 따로 — 카드 d30) */
  decryptCount: number;
  /** 도착 실측 차액 요청이 있고 아직 결제되지 않았는가 */
  differenceUnpaid: boolean;
};

export type DecryptDecision =
  | { ok: true; isReprint: boolean }
  | {
      ok: false;
      // 열람 기록이 같은 이름을 보여 준다 — 사유를 더하면 기록 화면 문구도 타입 오류로 함께 드러난다
      reason: AccessDenyReason;
    };

function beforeShipment(req: DecryptRequest): boolean {
  return isPrintable(req.orderStatus) && (req.parcelState === "inspected" || req.parcelState === "label_printed");
}

// 주문 단계는 가장 덜 나간 상자를 따른다 — 옆 상자가 출력 전이면 출고한 상자가 있어도 주문은 검수 완료다(S5g).
// 거절·반려·취소는 따로 있는 단계라 여기서 열리지 않는다.
function reprintAfterShipment(req: DecryptRequest): boolean {
  return req.parcelState === "shipped" && req.decryptCount > 0 && (isPrintable(req.orderStatus) || req.orderStatus === "shipped");
}

/** 복호화 함수 진입부 판정. 하나라도 어긋나면 열지 않는다. 동시 요청의 원자성은 저장소 쪽이 맡는다. */
export function authorizeDecrypt(req: DecryptRequest): DecryptDecision {
  // INV-P8: 대표 계정만. 판단 근거는 복호화 함수 설정의 대표 ID 하나.
  if (req.ownerUserId === "" || req.requesterUserId !== req.ownerUserId) return { ok: false, reason: "not_owner" };

  // INV-P4 (a): 서명 기록이 있고, 기록된 원문 해시가 그 주문 승인 원문의 해시와 같을 때만 승인을 인정한다(approval-signature INV-S12).
  if (!req.approval) return { ok: false, reason: "no_valid_approval" };
  const approval = checkRecordedApproval(req.approval);
  if (!approval.ok) return { ok: false, reason: "no_valid_approval" };

  // INV-P4 (b): 서명 원문의 주문번호가 요청한 주문번호와 같아야 한다.
  if (approval.orderNo !== req.requestedOrderNo) return { ok: false, reason: "order_mismatch" };

  // INV-P4 (c)·INV-P5: 검수 완료 ~ 출고 확정 전, 또는 출고 확정된 상자의 재출력(2026-10-10 — 택배사 집하 확인 전에는 남은 횟수 안에서).
  // 출고 확정된 상자의 첫 출력은 없다. 차단된 팬의 주문도 거부.
  if (req.fanBlocked || !(beforeShipment(req) || reprintAfterShipment(req))) return { ok: false, reason: "order_not_printable" };

  // INV-M12: 차액을 덜 낸 주문은 출고하지 않는다 — 송장 출력(=주소 열기)도 하지 않는다.
  if (req.differenceUnpaid) return { ok: false, reason: "difference_unpaid" };

  // INV-P5: 상한.
  if (req.decryptCount >= MAX_DECRYPTS_PER_BOX) return { ok: false, reason: "decrypt_limit_reached" };

  return { ok: true, isReprint: req.decryptCount > 0 };
}
