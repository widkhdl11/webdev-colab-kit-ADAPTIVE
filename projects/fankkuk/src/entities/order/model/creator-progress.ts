import type { FanStepKey } from "./fan-view";
import type { ApprovalRequestView } from "./creator-view";

// 크리에이터 메인 「진행 중인 선물」 한 줄의 단계. 지금 크리에이터가 읽을 수 있는 것은 승인 요청(my_approval_requests)
// 뿐이라 확실히 아는 것만 칠한다: 등록은 늘 끝났고, 입고는 사무실 도착 시각이 있으면 끝났다.
// 검수·출고·배송은 이 읽기에 칸이 없다 — 끝났는지 모르는 단계는 끝난 것으로 칠하지 않는다.
// 승인은 단계가 아니라 출고의 조건이다(팬 화면과 같은 모양). 승인 요청 목록에 있다 = 아직 승인 전.

export type CreatorStep = { key: FanStepKey; state: "done" | "current" | "todo" };

export type CreatorProgress = { steps: CreatorStep[]; doneCount: number; approval: "waiting" };

const ORDER: readonly FanStepKey[] = ["registered", "received", "inspected", "shipped", "in_transit", "delivered"];

export function creatorProgressOf(request: Pick<ApprovalRequestView, "receivedAt">): CreatorProgress {
  const arrived = request.receivedAt !== null;
  const steps = ORDER.map((key): CreatorStep => {
    if (key === "registered") return { key, state: "done" };
    if (key === "received") return { key, state: arrived ? "done" : "current" };
    return { key, state: "todo" };
  });
  return { steps, doneCount: steps.filter((s) => s.state === "done").length, approval: "waiting" };
}
