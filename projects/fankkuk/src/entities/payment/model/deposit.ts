import type { TossLookup } from "@/shared/api/toss-payments/client";

// 무통장 입금(토스 가상계좌) 판정 (payment INV-M22~M24). 입금 알림 입구와 예약 작업이 같이 쓴다.
// 믿는 것은 서버가 부른 결제사 조회 결과뿐이다 — 알림 본문의 상태 값은 여기 들어오지 않는다(INV-M22).
// 판정만 한다. 반영은 DB 의 「입금 대기인 줄만 바꾸기」 함수들이 한다 — 겹쳐도 하나만 반영된다.

export type DepositRecord = {
  /** 결제사에 보낸 주문번호(toss_order_id) */
  orderId: string;
  /** 서버가 계산해 저장한 금액(INV-M1) */
  amountKrw: number;
  /** 우리 기록의 결제 상태 */
  status: "waiting_deposit" | "done" | "other";
  /** 입금 기한(발급 + 24시간, INV-M23). 입금 대기가 아니면 null 일 수 있다 */
  dueAt: Date | null;
};

export type DepositDecision =
  /** 입금 확인 — 결제 완료로(주문 등록·승인 요청·6자리) */
  | { kind: "done"; paymentKey: string }
  /** 기한이 지났는데 아직 「입금 기다리는 중」 — 결제사에서 먼저 취소한 뒤 닫는다(예약 작업만) */
  | { kind: "expire" }
  /** 결제사에서 이미 취소·만료됨 — 닫는다 */
  | { kind: "close" }
  /** 완료 뒤 「입금 기다리는 중」으로 되돌아감(INV-M24) */
  | { kind: "reverted" }
  /** 금액·주문번호가 다른 완료, 부분 취소 — 사람이 본다 */
  | { kind: "review" }
  /** 바꿀 것 없음 */
  | { kind: "keep" }
  /** 조회 실패 — 다시 본다 */
  | { kind: "error" };

export function judgeDeposit(lookup: TossLookup, record: DepositRecord, now: Date): DepositDecision {
  if (lookup.kind === "error") return { kind: "error" };
  if (lookup.kind === "not_found") return { kind: "keep" };
  const p = lookup.payment;
  const matches = p.orderId === record.orderId && p.totalAmount === record.amountKrw;
  switch (p.status) {
    case "DONE":
      if (record.status !== "waiting_deposit") return { kind: "keep" };
      return matches ? { kind: "done", paymentKey: p.paymentKey } : { kind: "review" };
    case "WAITING_FOR_DEPOSIT":
      if (record.status === "done") return { kind: "reverted" };
      if (record.status === "waiting_deposit" && record.dueAt !== null && now.getTime() >= record.dueAt.getTime()) return { kind: "expire" };
      return { kind: "keep" };
    case "CANCELED":
    case "EXPIRED":
    case "ABORTED":
      return record.status === "waiting_deposit" ? { kind: "close" } : { kind: "keep" };
    case "PARTIAL_CANCELED":
      return record.status === "waiting_deposit" ? { kind: "review" } : { kind: "keep" };
    default:
      return { kind: "keep" };
  }
}
