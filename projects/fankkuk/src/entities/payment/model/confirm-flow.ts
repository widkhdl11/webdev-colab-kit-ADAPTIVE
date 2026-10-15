import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";
import { checkSuccessReturn, evaluateConfirmResponse, evaluateDepositIssued, type DepositIssued, type PendingPayment, type SuccessReturn } from "./confirm";

// 결제 확정의 공통 흐름 — 팬 선물(features/checkout)과 역조공(features/revgift-send)이 같이 쓴다.
// 대조(INV-M2) → 승인 권리 한 번(INV-M5) → 승인 API → 응답 판정(INV-M3) → 기록.
// 결제마다 다른 것은 둘뿐이다: 누구의 결제인지(isOwner), 완료로 기록할 때 같이 넣을 것(settleDone).

export type ConfirmFailure = "no_pending_payment" | "amount_mismatch" | "order_mismatch" | "bad_input" | "in_progress" | "not_approved";

export type ConfirmFlowDeps<R extends PendingPayment> = {
  find(orderId: string): Promise<R | null>;
  /** 결제 대기 → 승인 중. 한 요청만 true. */
  claim(orderId: string): Promise<boolean>;
  /** 실패로 닫는다. 이미 끝난 결제면 false. */
  settleFailed(orderId: string): Promise<boolean>;
  /** 완료로 기록한다. 이번 호출이 기록을 바꿨는지 돌려준다. */
  settleDone(record: R, paymentKey: string): Promise<boolean>;
  /**
   * 입금 대기로 기록한다(무통장, payment INV-M21) — 승인 중인 줄만. 이 결제 종류가 무통장을 받지 않으면 비운다 —
   * 그러면 「입금 기다리는 중」 응답은 승인되지 않은 것(실패)으로 다룬다.
   */
  settleWaiting?: (record: R, issued: DepositIssued) => Promise<boolean>;
  toss: TossPaymentsClient;
};

export type ConfirmFlowResult<R> = { ok: true; record: R; awaitingDeposit: boolean } | { ok: false; reason: ConfirmFailure };

/** 요청한 사람이 이 결제의 주인일 때만 처리한다 — 남의 결제는 없는 결제와 같다. */
export async function runConfirmFlow<R extends PendingPayment>(
  deps: ConfirmFlowDeps<R>,
  isOwner: (record: R) => boolean,
  ret: SuccessReturn,
): Promise<ConfirmFlowResult<R>> {
  const found = await deps.find(ret.orderId);
  const record = found && isOwner(found) ? found : null;
  if (!record) return { ok: false, reason: "no_pending_payment" };

  // INV-M5: 이미 끝난 결제는 승인 API 를 다시 부르지 않고 처음 결과를 돌려준다.
  if (record.status === "done") return { ok: true, record, awaitingDeposit: false };
  // 무통장 입금 대기 — 승인은 이미 끝났고 입금을 기다린다(INV-M21). 다시 부르지 않는다
  if (record.status === "waiting_deposit") return { ok: true, record, awaitingDeposit: true };
  if (record.status === "confirming") return { ok: false, reason: "in_progress" };
  if (record.status === "failed") return { ok: false, reason: "not_approved" };

  // INV-M2: 승인 API 를 부르기 전에 대조한다. 금액이 다르면 결제 대기를 실패로 닫는다.
  // 꼴이 잘못된 입력(빈 결제 키 등)은 거부만 한다 — 잘못된 요청 한 번으로 정상 결제가 막히지 않게.
  const check = checkSuccessReturn(ret, record);
  if (!check.ok) {
    if (check.reason === "amount_mismatch") await deps.settleFailed(record.orderId);
    return { ok: false, reason: check.reason === "already_settled" ? "in_progress" : check.reason };
  }

  // INV-M5: 승인 API 를 부를 권리는 한 요청만 얻는다.
  if (!(await deps.claim(check.orderId))) return { ok: false, reason: "in_progress" };

  let response: unknown;
  try {
    response = await deps.toss.confirm({
      paymentKey: check.paymentKey,
      orderId: check.orderId,
      amount: check.amountKrw,
      idempotencyKey: `confirm-${check.orderId}`,
    });
  } catch {
    // 결과를 모른다(시간 초과·연결 끊김) — 토스에서는 승인됐을 수 있으므로 실패로 닫지 않고 승인 중으로 남긴다.
    // 승인 중이 된 지 10분이 지나면 결제 다시 확인(features/payment-reconcile, INV-M19 — 5분 예약 실행·「지금 돌리기」)이
    // 결제사 결제 조회로 완료·실패·확인 필요를 정한다. 그때 완료 반영은 여기와 같은 settleDone 이다.
    return { ok: false, reason: "in_progress" };
  }

  // INV-M21: 무통장 — 「입금 기다리는 중」·orderId·금액 일치면 입금 대기로. 승인 요청·받는 주소는 입금이 확인된 뒤에 생긴다.
  const issued = deps.settleWaiting ? evaluateDepositIssued(response, record) : null;
  if (deps.settleWaiting && issued) {
    if (await deps.settleWaiting(record, issued)) return { ok: true, record, awaitingDeposit: true };
    const now = await deps.find(check.orderId);
    return now?.status === "waiting_deposit" || now?.status === "done"
      ? { ok: true, record: now, awaitingDeposit: now.status === "waiting_deposit" }
      : { ok: false, reason: "in_progress" };
  }

  // INV-M3: DONE + orderId·금액 일치일 때만 완료.
  if (!evaluateConfirmResponse(response, record).done) {
    await deps.settleFailed(check.orderId);
    return { ok: false, reason: "not_approved" };
  }
  if (!(await deps.settleDone(record, check.paymentKey))) {
    // 다른 처리가 먼저 반영했다 — 기록을 다시 읽어 그 결과를 따른다.
    const now = await deps.find(check.orderId);
    return now?.status === "done" ? { ok: true, record: now, awaitingDeposit: false } : { ok: false, reason: "in_progress" };
  }
  return { ok: true, record, awaitingDeposit: false };
}
