import type { OrderRecord } from "./order-record";

// 팬 상태 화면이 받는 모양. 주문 기록에서 팬이 봐도 되는 칸만 골라낸다.
// - 크리에이터에게 보내는 송장번호는 넣지 않는다(택배사 조회로 수령지 일부가 보인다).
// - 사무실 주소는 승인된 주문에만 넣는다(INV-S9). 운영에서는 서버의 주소 안내 조회가 같은 판정을 쓴다.
// - 거절과 7일 자동 반려는 같은 모습이다 — 거절 이유는 물론 거절했다는 사실도 드러내지 않는다.

export type FanStepKey = "registered" | "approved" | "received" | "inspected" | "shipped" | "in_transit" | "delivered";

/** stopped = 그 단계에서 끝났다(검수 반송). 시각은 멈춘 때. */
export type FanStep = { key: FanStepKey; at: string | null; state: "done" | "current" | "todo" | "stopped" };

export type FanGiftView = {
  orderNo: string;
  creatorName: string;
  itemKind: string;
  boxCount: number;
  registeredAt: string;
  outcome: "in_progress" | "not_accepted" | "returned" | "canceled";
  steps: FanStep[];
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
    { key: "approved", done: approved, at: approved ? r.approvedAt : null },
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

  return {
    orderNo: r.orderNo,
    creatorName: r.creatorName,
    itemKind: r.itemKind,
    boxCount: r.boxCount,
    registeredAt: r.registeredAt,
    outcome,
    steps,
    officeAddress: approved ? officeAddress : null,
    canEnterTrackingNo: approved && r.receivedAt === null,
    fanTrackingNo: r.fanTrackingNo,
    expectedArrivalDate: r.expectedArrivalDate,
  };
}
