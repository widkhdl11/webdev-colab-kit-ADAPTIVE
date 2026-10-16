import { describe, expect, it } from "vitest";
import { isCreatorCheckDeadlinePassed } from "./creator-check";

// 블루투스 상자 고를 기한 (office-workflow INV-W6·W13). 기한(dueAt)은 DB 가 검수 완료 + 168시간으로 넘긴다 —
// DB(choose_creator_check·cancel_creator_check·office_process_creator_check)는 그 시각부터 받지 않으므로, 화면도 그 시각부터 버튼을 감춘다.

describe("크리에이터 확인 기한", () => {
  const due = "2026-10-19T03:00:00.000Z";
  it("INV-W6: 기한 1초 전이면 아직 답할 수 있다", () => {
    expect(isCreatorCheckDeadlinePassed(due, "2026-10-19T02:59:59.000Z")).toBe(false);
  });
  it("INV-W6 (실패경로): 기한 시각 정각부터는 지났다(DB 의 now() >= 기한과 같다)", () => {
    expect(isCreatorCheckDeadlinePassed(due, due)).toBe(true);
    expect(isCreatorCheckDeadlinePassed(due, "2026-10-19T03:00:01.000Z")).toBe(true);
  });
});
