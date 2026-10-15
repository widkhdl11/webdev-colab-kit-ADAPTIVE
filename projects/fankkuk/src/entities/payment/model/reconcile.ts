import type { TossLookup, TossPaymentView } from "@/shared/api/toss-payments/client";

// 결과를 모르는 결제 확정의 판정 (payment INV-M19).
// 승인 호출이 시간 초과·연결 끊김으로 끝나 「승인 중」에 남은 결제를 결제사 결제 조회(주문번호로) 결과로 정리한다.
// 「승인 중」이 된 지 10분이 지난 것만 확인 대상이 된다 — 그 조건은 DB 확인 대상 목록 함수가 지킨다(막 승인을 부르는 요청과 겹치지 않게).
// 판정만 한다. 반영은 기존 확정 흐름의 「승인 중인 줄만 바꾸기」 반영 함수가 한다(INV-M5).

/** 결제사에 그 결제가 없을 때, 「승인 중」이 된 지 이만큼 지나야 실패로 닫는다. */
export const NOT_FOUND_FAIL_AFTER_MINUTES = 30;

export type ReconcileRecord = {
  /** 결제사에 보낸 주문번호(우리 기록의 toss_order_id) */
  orderId: string;
  /** 서버가 계산해 저장한 금액(INV-M1) */
  amountKrw: number;
  /** 「승인 중」이 된 시각 */
  confirmingAt: Date;
};

/**
 * needs_review 에는 결제사 조회의 결제 키와 취소 가능 금액(남은 금액)이 실린다 — 대표의 전액 취소가 이 값으로 결제사를 부른다(payment INV-M20 ①).
 * 금액을 모르면 null(취소 버튼이 열리지 않는다 — 결제사 관리 화면에서 본다).
 */
export type ReconcileDecision =
  | { kind: "done"; paymentKey: string }
  | { kind: "failed" }
  | { kind: "keep" }
  | { kind: "needs_review"; paymentKey: string; balanceKrw: number | null };

/** 취소 가능 금액. 응답에 남은 금액이 있으면 그 값, 없으면 승인됨은 결제 금액(취소한 적이 없다), 부분 취소는 모름. 0 이하면 취소할 것이 없어 모름과 같다. */
function balanceOf(p: TossPaymentView): number | null {
  const v = p.balanceAmount ?? (p.status === "DONE" ? p.totalAmount : null);
  return v !== null && v > 0 ? v : null;
}

export function judgeReconcile(lookup: TossLookup, record: ReconcileRecord, now: Date): ReconcileDecision {
  if (lookup.kind === "error") return { kind: "keep" };
  if (lookup.kind === "not_found") {
    const elapsedMs = now.getTime() - record.confirmingAt.getTime();
    return elapsedMs > NOT_FOUND_FAIL_AFTER_MINUTES * 60_000 ? { kind: "failed" } : { kind: "keep" };
  }
  const p = lookup.payment;
  switch (p.status) {
    case "DONE":
      // INV-M3: 주문번호·금액이 기록과 같을 때만 완료. 다르면 완료도 실패도 하지 않고 사람이 본다.
      return p.orderId === record.orderId && p.totalAmount === record.amountKrw
        ? { kind: "done", paymentKey: p.paymentKey }
        : { kind: "needs_review", paymentKey: p.paymentKey, balanceKrw: balanceOf(p) };
    case "ABORTED":
    case "EXPIRED":
    case "CANCELED":
      return { kind: "failed" };
    case "PARTIAL_CANCELED":
      // 승인 뒤 누군가 결제사 쪽에서 일부를 취소했다 — 완료도 실패도 아니고 대표가 남은 금액을 전액 취소한다(INV-M20)
      return { kind: "needs_review", paymentKey: p.paymentKey, balanceKrw: balanceOf(p) };
    default:
      // 진행 중·입금 대기 — 다음 회차에 다시 본다
      return { kind: "keep" };
  }
}
