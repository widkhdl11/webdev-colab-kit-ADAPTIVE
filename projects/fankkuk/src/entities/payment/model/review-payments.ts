import { z } from "zod";

// 「확인 필요」 결제 목록 (payment INV-M19·M20). 결제사는 승인됐다는데 금액이 기록과 다르거나 부분 취소된 결제 — 대표가 전액 취소로 정리한다.
// DB 함수 admin_review_payments 가 준 줄을 화면 이름으로 옮긴다. 칸 모양이 다르면 지어내지 않고 null.

export const REVIEW_SOURCES = ["initial", "difference", "revgift"] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];
export const REVIEW_CANCEL_STATUSES = ["none", "requesting", "done", "failed"] as const;
export type ReviewCancelStatus = (typeof REVIEW_CANCEL_STATUSES)[number];

export type ReviewPayment = {
  source: ReviewSource;
  tossOrderId: string;
  /** 역조공은 그 보내기에 든 몫들의 주문번호를 쉼표로 이은 것 */
  orderNo: string;
  payerNickname: string;
  /** 우리가 기록한 결제 금액(서버가 계산한 값) */
  amountKrw: number;
  /** 결제사 조회가 알려 준 취소 가능 금액. 모르면 null — 취소 버튼을 열지 않는다(결제사 관리 화면에서 본다) */
  balanceKrw: number | null;
  reviewAt: string;
  cancelStatus: ReviewCancelStatus;
  cancelError: string | null;
  cancelAttempts: number;
  /** 마지막으로 취소를 잡은 시각. 취소 기록이 없으면 null */
  cancelRequestedAt: string | null;
};

/** 「처리 중」 기록을 다시 잡을 수 있게 되는 시간 — DB 잡기 함수의 2분과 같다(INV-M20 ②) */
export const STALE_REQUEST_MS = 2 * 60_000;

const rowShape = z.object({
  source: z.enum(REVIEW_SOURCES),
  toss_order_id: z.string(),
  order_no: z.string(),
  payer_nickname: z.string(),
  amount_krw: z.number().int(),
  balance_krw: z.number().int().positive().nullable(),
  review_at: z.string(),
  cancel_status: z.enum(REVIEW_CANCEL_STATUSES),
  cancel_error: z.string().nullable(),
  cancel_attempts: z.number().int().nonnegative(),
  cancel_requested_at: z.string().nullable(),
});

export function reviewPaymentsFrom(data: unknown): ReviewPayment[] | null {
  const parsed = z.array(rowShape).safeParse(data);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    source: r.source,
    tossOrderId: r.toss_order_id,
    orderNo: r.order_no,
    payerNickname: r.payer_nickname,
    amountKrw: r.amount_krw,
    balanceKrw: r.balance_krw,
    reviewAt: r.review_at,
    cancelStatus: r.cancel_status,
    cancelError: r.cancel_error,
    cancelAttempts: r.cancel_attempts,
    cancelRequestedAt: r.cancel_requested_at,
  }));
}

/**
 * 대표가 지금 「전액 취소」를 누를 수 있는 줄인가(INV-M20 ②) — 금액을 알고, 취소가 끝나지 않았고, 처리 중이면 2분이 지났다
 * (결제사 결과를 모르거나 기록하지 못해 처리 중으로 남은 기록 — 같은 멱등 키로 다시 확인한다).
 * 화면은 이것으로 버튼을 그릴지만 정한다. 최종 판정은 DB 잡기 함수가 다시 한다.
 */
export function canCancelReview(row: Pick<ReviewPayment, "balanceKrw" | "cancelStatus" | "cancelRequestedAt">, now: Date): boolean {
  if (row.balanceKrw === null) return false;
  if (row.cancelStatus === "none" || row.cancelStatus === "failed") return true;
  if (row.cancelStatus !== "requesting" || row.cancelRequestedAt === null) return false;
  return now.getTime() - Date.parse(row.cancelRequestedAt) > STALE_REQUEST_MS;
}
