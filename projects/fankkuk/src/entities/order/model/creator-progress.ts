import type { FanStepKey } from "./fan-view";
import type { IncomingGiftView } from "./incoming-gift";

// 크리에이터 메인 「진행 중인 선물」 한 줄의 단계. 받은 선물 읽기(my_incoming_gifts, office-workflow INV-W9)의 단계 시각으로 칠한다.
// 등록은 늘 끝났다(결제가 끝난 주문만 온다). 검수는 통과면 끝났고, 반송이면 끝난 것으로 칠하지 않는다.
// 승인은 단계가 아니라 출고의 조건이다(팬 화면과 같은 모양). 승인 요청 목록에 있으면 아직 승인 전, 없으면 승인한 것이다 —
// 진행 중인 선물 중 승인 요청 목록에 없는 것은 승인을 마친 것뿐이다(거절·반려는 진행 중이 아니다).

export type CreatorStep = { key: FanStepKey; state: "done" | "current" | "todo" };

export type CreatorProgress = { steps: CreatorStep[]; doneCount: number; approval: "waiting" | "done" };

type ProgressInput = Pick<IncomingGiftView, "receivedAt" | "inspection" | "shippedAt" | "delivery">;

export function creatorProgressOf(gift: ProgressInput, approvalWaiting: boolean): CreatorProgress {
  const done: Record<FanStepKey, boolean> = {
    registered: true,
    received: gift.receivedAt !== null,
    inspected: gift.inspection === "passed",
    shipped: gift.shippedAt !== null,
    in_transit: gift.delivery !== null,
    delivered: gift.delivery === "delivered",
  };
  const order: readonly FanStepKey[] = ["registered", "received", "inspected", "shipped", "in_transit", "delivered"];
  const currentIndex = order.findIndex((key) => !done[key]);
  const steps = order.map((key, i): CreatorStep => ({ key, state: done[key] ? "done" : i === currentIndex ? "current" : "todo" }));
  return { steps, doneCount: steps.filter((s) => s.state === "done").length, approval: approvalWaiting ? "waiting" : "done" };
}
