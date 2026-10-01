import type { ChargeBreakdown } from "../model/charge";
import type { PendingPayment } from "../model/confirm";

export type StoredPayment = PendingPayment & {
  orderNo: string;
  charge: ChargeBreakdown;
  paymentKey: string | null;
};

/**
 * 결제 기록 저장소의 경계. 지금은 메모리 구현만 있고, DB 가 생기면 같은 계약으로 바꾼다.
 * claim 은 "결제 대기 → 승인 중" 전환을 한 번만 허용한다 — 승인 API 를 두 번 부르지 않는 장치(INV-M5).
 * DB 구현에서는 조건부 갱신(`where status = 'pending'`) 한 문장이 이 역할을 한다.
 */
export interface PaymentStore {
  create(input: { orderId: string; orderNo: string; charge: ChargeBreakdown }): Promise<StoredPayment>;
  find(orderId: string): Promise<StoredPayment | null>;
  claim(orderId: string): Promise<boolean>;
  settle(orderId: string, outcome: { status: "done"; paymentKey: string } | { status: "failed" }): Promise<void>;
}
