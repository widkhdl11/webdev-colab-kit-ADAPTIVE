import { describe, expect, it } from "vitest";
import { creatorProgressOf } from "./creator-progress";

const states = (receivedAt: string | null) => creatorProgressOf({ receivedAt }).steps.map((s) => `${s.key}:${s.state}`);

describe("크리에이터 메인 — 진행 단계", () => {
  it("사무실에 오기 전이면 등록만 끝나고 입고를 기다린다", () => {
    expect(states(null)).toEqual([
      "registered:done",
      "received:current",
      "inspected:todo",
      "shipped:todo",
      "in_transit:todo",
      "delivered:todo",
    ]);
    expect(creatorProgressOf({ receivedAt: null }).doneCount).toBe(1);
  });

  it("도착했으면 입고까지 끝난 것으로 — 알 수 없는 검수는 끝났다고 칠하지 않는다", () => {
    const p = creatorProgressOf({ receivedAt: "2026-10-01T01:00:00.000Z" });
    expect(p.doneCount).toBe(2);
    expect(p.steps.find((s) => s.key === "inspected")?.state).toBe("todo");
    expect(p.steps.some((s) => s.state === "current")).toBe(false);
  });

  it("승인 요청 목록에서 온 줄이라 승인은 늘 기다리는 중이다", () => {
    expect(creatorProgressOf({ receivedAt: null }).approval).toBe("waiting");
  });
});
