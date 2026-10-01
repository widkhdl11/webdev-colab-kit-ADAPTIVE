import type { OrderRecord } from "./order-record";

// 팬 상태 화면이 받는 모양. 주문 기록에서 팬이 봐도 되는 칸만 골라낸다.
// - 크리에이터에게 보내는 송장번호는 넣지 않는다(택배사 조회로 수령지 일부가 보인다).
// - 사무실 주소는 결제가 끝난 진행 중 주문에 넣는다 — 승인을 기다리지 않는다(INV-S9, 2026-10-02 개정).
//   거절·반려·취소·검수 반송된 주문에는 넣지 않는다. 운영에서는 서버의 주소 안내 조회가 같은 판정을 쓴다.
// - 거절과 7일 자동 반려는 같은 모습이다 — 거절 이유는 물론 거절했다는 사실도 드러내지 않는다.

export type FanStepKey = "registered" | "received" | "inspected" | "shipped" | "in_transit" | "delivered";

/** stopped = 그 단계에서 끝났다(검수 반송). 시각은 멈춘 때. */
export type FanStep = { key: FanStepKey; at: string | null; state: "done" | "current" | "todo" | "stopped" };

/** 크리에이터 승인 — 줄 세운 단계가 아니라 출고의 조건이라 따로 둔다(언제 끝나도 된다, 출고 전에만 있으면 된다).
 *  waiting = 검수가 끝나 출고가 승인만 기다린다 / todo = 아직 기다릴 때가 아니다(검수 전) */
export type FanApproval = { state: "done" | "waiting" | "todo"; at: string | null };

export type FanGiftView = {
  orderNo: string;
  creatorName: string;
  itemKind: string;
  boxCount: number;
  registeredAt: string;
  outcome: "in_progress" | "not_accepted" | "returned" | "canceled";
  steps: FanStep[];
  approval: FanApproval;
  officeAddress: string | null;
  canEnterTrackingNo: boolean;
  fanTrackingNo: string | null;
  expectedArrivalDate: string | null;
};

function outcomeOf(r: OrderRecord): FanGiftView["outcome"] {
  if (r.status === "rejected" || r.status === "expired") return "not_accepted";
  if (r.status === "canceled") return "canceled";
  if (r.inspection?.result === "returned") return "returned";
  return "in_progress";
}

export function toFanView(r: OrderRecord, officeAddress: string): FanGiftView {
  const outcome = outcomeOf(r);
  const approved = r.approvedAt !== null && outcome !== "not_accepted" && outcome !== "canceled";

  const raw: Array<{ key: FanStepKey; done: boolean; at: string | null }> = [
    { key: "registered", done: true, at: r.registeredAt },
    { key: "received", done: r.receivedAt !== null, at: r.receivedAt },
    { key: "inspected", done: r.inspection?.result === "passed", at: r.inspection?.at ?? null },
    { key: "shipped", done: r.shippedAt !== null, at: r.shippedAt },
    { key: "in_transit", done: r.delivery !== null, at: null },
    { key: "delivered", done: r.delivery === "delivered", at: null },
  ];
  const currentIndex = outcome === "in_progress" ? raw.findIndex((s) => !s.done) : -1;
  const steps: FanStep[] = raw.map((s, i) => ({
    key: s.key,
    at: s.at,
    state: s.done ? "done" : i === currentIndex ? "current" : s.key === "inspected" && outcome === "returned" ? "stopped" : "todo",
  }));
  const inspectedPassed = r.inspection?.result === "passed";
  const approval: FanApproval = approved
    ? { state: "done", at: r.approvedAt }
    : { state: outcome === "in_progress" && inspectedPassed ? "waiting" : "todo", at: null };

  return {
    orderNo: r.orderNo,
    creatorName: r.creatorName,
    itemKind: r.itemKind,
    boxCount: r.boxCount,
    registeredAt: r.registeredAt,
    outcome,
    steps,
    approval,
    officeAddress: outcome === "in_progress" ? officeAddress : null,
    canEnterTrackingNo: outcome === "in_progress" && r.receivedAt === null,
    fanTrackingNo: r.fanTrackingNo,
    expectedArrivalDate: r.expectedArrivalDate,
  };
}
