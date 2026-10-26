import { isApprovalDeadlinePassed } from "./approval-time-left";
import type { OrderRecord } from "./order-record";

// 팬 상태 화면이 받는 모양. 주문 기록에서 팬이 봐도 되는 칸만 골라낸다.
// - 크리에이터에게 보내는 송장번호는 넣지 않는다(택배사 조회로 수령지 일부가 보인다).
// - 사무실 주소는 결제가 끝난 진행 중 주문에 넣는다 — 6자리는 승인 전이면 「먼저 보내기」 뒤에만 DB 가 준다(INV-S9, 2026-10-08 개정).
//   거절·반려·취소·검수 반송된 주문에는 넣지 않는다. 운영에서는 서버의 주소 안내 조회가 같은 판정을 쓴다.
// - 거절(직접·차단)과 7일 자동 반려는 나눠 보인다(decline-block INV-D5) — 차단은 거절과 같은 모습이고, 거절 이유는 드러내지 않는다.

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
  /** declined = 크리에이터 거절(직접·차단 모두 — 차단은 구분하지 않는다), expired = 7일 자동 반려 (decline-block INV-D5) */
  outcome: "in_progress" | "declined" | "expired" | "returned" | "canceled";
  steps: FanStep[];
  approval: FanApproval;
  officeAddress: string | null;
  canEnterTrackingNo: boolean;
  fanTrackingNo: string | null;
  expectedArrivalDate: string | null;
  /** 승인 전 진행 중 주문인데 「먼저 보내기」를 아직 누르지 않았다 — 받는 주소가 아직 없으니 「보내 주세요」라고 하지 않는다(INV-S9) */
  earlySendPending: boolean;
  /** 나만 보는 메모의 선물 이름(together INV-F7) — 보낸 사람 본인 목록 읽기(my_gifts)만 채운다. 없으면 null·없음 */
  memoTitle?: string | null;
  /** 추적기 보관·신고 보관·경찰 인계 상자가 있는 주문(검수 결과 checking — office-workflow INV-W14). 팬에게는 「확인 중」으로만 보이고
   *  무엇이 나왔는지는 어디에도 없다. 목록 읽기처럼 이 칸을 채우지 않는 곳은 없음(false)과 같다 */
  inspectionChecking?: boolean;
};

/** 팬 화면이 읽는 칸만. 크리에이터행 송장번호·팬 닉네임·크리에이터 id 는 이 모양에 없다 — DB 읽기 함수도 이 칸만 돌려준다. */
export type FanOrderRecord = Omit<OrderRecord, "creatorId" | "fanNickname" | "outboundWaybillNo">;

function outcomeOf(r: FanOrderRecord): FanGiftView["outcome"] {
  if (r.status === "rejected") return "declined";
  if (r.status === "expired") return "expired";
  if (r.status === "canceled") return "canceled";
  if (r.inspection?.result === "returned") return "returned";
  return "in_progress";
}

export function toFanView(r: FanOrderRecord, officeAddress: string): FanGiftView {
  const outcome = outcomeOf(r);
  const approved = r.approvedAt !== null && outcome !== "declined" && outcome !== "expired" && outcome !== "canceled";

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
    earlySendPending: outcome === "in_progress" && r.approvedAt === null && r.fanSendAckAt === null,
    inspectionChecking: outcome === "in_progress" && r.inspection?.result === "checking",
  };
}

/**
 * 승인 기한이 지났는데 자동 처리가 아직 돌지 않은 승인 전 주문(approval-signature INV-S6 S6c — 「기한 지남」으로 답하고 승인하지 않는다).
 * 주문 기록은 아직 진행 중이지만 화면은 자동 반려(expired)와 같게 보인다 — 승인 대기 배지·지난 기한·「먼저 보내기」·팬꾹 주소가 남지 않게.
 * 기준 시각(now)은 화면을 그리는 서버가 넘긴다. 승인된 주문·이미 끝난 주문은 그대로.
 */
export function withApprovalDeadline(view: FanGiftView, now: string): FanGiftView {
  if (view.outcome !== "in_progress" || view.approval.state === "done") return view;
  if (!isApprovalDeadlinePassed(view.registeredAt, now)) return view;
  return {
    ...view,
    outcome: "expired",
    steps: view.steps.map((st) => (st.state === "current" ? { ...st, state: "todo" } : st)),
    approval: { state: "todo", at: null },
    officeAddress: null,
    canEnterTrackingNo: false,
    earlySendPending: false,
    inspectionChecking: false,
  };
}
