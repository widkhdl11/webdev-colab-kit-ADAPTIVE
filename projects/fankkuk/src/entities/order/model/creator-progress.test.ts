import { describe, expect, it } from "vitest";
import { creatorProgressOf } from "./creator-progress";
import { isIncomingInProgress, type IncomingGiftView } from "./incoming-gift";

type Input = Pick<IncomingGiftView, "receivedAt" | "inspection" | "shippedAt" | "delivery">;
const T = "2026-10-01T01:00:00.000Z";
const base: Input = { receivedAt: null, inspection: null, shippedAt: null, delivery: null };
const states = (g: Input) => creatorProgressOf(g, false).steps.map((s) => `${s.key}:${s.state}`);

describe("크리에이터 메인 — 진행 단계 (office-workflow INV-W9)", () => {
  it("INV-W9: 사무실에 오기 전이면 등록만 끝나고 입고를 기다린다", () => {
    expect(states(base)).toEqual([
      "registered:done",
      "received:current",
      "inspected:todo",
      "shipped:todo",
      "in_transit:todo",
      "delivered:todo",
    ]);
    expect(creatorProgressOf(base, true).doneCount).toBe(1);
  });

  it("INV-W9: 검수 통과 → 출고를 기다린다, 출고 → 배송중을 기다린다, 배송중 → 수령을 기다린다", () => {
    expect(states({ ...base, receivedAt: T, inspection: "passed" }).filter((s) => !s.endsWith(":todo"))).toEqual([
      "registered:done",
      "received:done",
      "inspected:done",
      "shipped:current",
    ]);
    expect(creatorProgressOf({ ...base, receivedAt: T, inspection: "passed", shippedAt: T }, false).doneCount).toBe(4);
    const moving = creatorProgressOf({ receivedAt: T, inspection: "passed", shippedAt: T, delivery: "in_transit" }, false);
    expect(moving.doneCount).toBe(5);
    expect(moving.steps.find((s) => s.state === "current")?.key).toBe("delivered");
  });

  it("INV-W9: 통과는 검수를 마친 것으로, 반송은 검수를 마친 것으로 칠하지 않는다", () => {
    expect(states({ ...base, receivedAt: T, inspection: "passed" })[2]).toBe("inspected:done");
    expect(states({ ...base, receivedAt: T, inspection: "returned" })[2]).toBe("inspected:current");
  });

  it("승인 요청 목록에 있으면 승인 대기, 없으면 승인 완료", () => {
    expect(creatorProgressOf(base, true).approval).toBe("waiting");
    expect(creatorProgressOf(base, false).approval).toBe("done");
  });

  it("진행 중인 선물 — 수령·반송·거절로 끝난 것은 빠진다", () => {
    for (const stage of ["paid", "received", "inspected", "shipped", "in_transit"] as const) expect(isIncomingInProgress({ stage })).toBe(true);
    for (const stage of ["delivered", "returned", "closed"] as const) expect(isIncomingInProgress({ stage })).toBe(false);
  });
});
