import { describe, expect, it } from "vitest";
import { daysLeft, isOngoingStage, receivedStage } from "./received-stage";
import type { ReceivedRevgift } from "./revgift-rows";

// 팬 본인 화면의 단계 판정. 우선순위: 거절·기한 지남 > 취소 > 반송 > 출고 > 기한 지난 기다림 → 기한 지남 > 답한 그대로.

const DEADLINE = "2026-10-10T06:00:00.000Z";
const DEADLINE_MS = Date.parse(DEADLINE);
const HOUR = 60 * 60 * 1000;

type StageInput = Pick<ReceivedRevgift, "reply" | "shipped" | "returned" | "cancelled" | "deadline">;

function row(over: Partial<StageInput>): StageInput {
  return { reply: "waiting", deadline: DEADLINE, shipped: false, returned: false, cancelled: false, ...over };
}

describe("receivedStage", () => {
  it("거절·기한 지남은 다른 표시보다 앞선다", () => {
    expect(receivedStage(row({ reply: "declined", cancelled: true, returned: true }), 0)).toBe("declined");
    expect(receivedStage(row({ reply: "expired", cancelled: true, shipped: true }), 0)).toBe("expired");
  });

  it("취소는 반송·출고보다 앞선다", () => {
    expect(receivedStage(row({ reply: "accepted", cancelled: true, returned: true, shipped: true }), 0)).toBe("cancelled");
    expect(receivedStage(row({ cancelled: true }), DEADLINE_MS + HOUR)).toBe("cancelled");
  });

  it("반송은 반송 표시가 있을 때만, 출고보다 앞선다", () => {
    expect(receivedStage(row({ reply: "accepted", returned: true, shipped: true }), 0)).toBe("returned");
    expect(receivedStage(row({ reply: "accepted" }), 0)).toBe("accepted");
  });

  it("출고됐으면 출고", () => {
    expect(receivedStage(row({ reply: "accepted", shipped: true }), 0)).toBe("shipped");
  });

  it("기한이 지난 기다림은 기한 지남 — 기한 시각과 같을 때도", () => {
    expect(receivedStage(row({}), DEADLINE_MS)).toBe("expired");
    expect(receivedStage(row({}), DEADLINE_MS + 1)).toBe("expired");
    expect(receivedStage(row({}), DEADLINE_MS - 1)).toBe("waiting");
  });

  it("받았으면 기한이 지나도 받음", () => {
    expect(receivedStage(row({ reply: "accepted" }), DEADLINE_MS + HOUR)).toBe("accepted");
  });
});

describe("daysLeft", () => {
  it("남은 날을 올림하고, 하루가 안 남았으면 1", () => {
    expect(daysLeft(DEADLINE, DEADLINE_MS - 48 * HOUR)).toBe(2);
    expect(daysLeft(DEADLINE, DEADLINE_MS - 25 * HOUR)).toBe(2);
    expect(daysLeft(DEADLINE, DEADLINE_MS - HOUR)).toBe(1);
    expect(daysLeft(DEADLINE, DEADLINE_MS + HOUR)).toBe(1);
  });
});

describe("isOngoingStage", () => {
  it("기다림·받음·출고만 진행 중", () => {
    expect(isOngoingStage("waiting")).toBe(true);
    expect(isOngoingStage("accepted")).toBe(true);
    expect(isOngoingStage("shipped")).toBe(true);
    expect(isOngoingStage("declined")).toBe(false);
    expect(isOngoingStage("expired")).toBe(false);
    expect(isOngoingStage("returned")).toBe(false);
    expect(isOngoingStage("cancelled")).toBe(false);
  });
});
