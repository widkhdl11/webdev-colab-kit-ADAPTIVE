import { describe, expect, it } from "vitest";
import { lastMovedAt, mostRecentlyMoved } from "./last-moved";

// 보낸 선물 목록의 강조 줄 하나(design-rules 21절) — 가장 최근 움직인 줄.
const v = (orderNo: string, registeredAt: string, ats: (string | null)[] = []) => ({
  orderNo,
  registeredAt,
  steps: ats.map((at, i) => ({ key: "received" as const, at, state: i === 0 ? ("done" as const) : ("todo" as const) })),
});

describe("가장 최근 움직인 줄", () => {
  it("등록보다 늦은 단계 시각이 있으면 그 시각, 없으면 등록 시각", () => {
    expect(lastMovedAt(v("FC-A", "2026-10-01T00:00:00Z", ["2026-10-05T00:00:00Z", null]))).toBe(Date.parse("2026-10-05T00:00:00Z"));
    expect(lastMovedAt(v("FC-B", "2026-10-03T00:00:00Z"))).toBe(Date.parse("2026-10-03T00:00:00Z"));
  });

  it("늦게 등록했어도 먼저 등록한 줄이 그 뒤에 움직였으면 그 줄 하나 — 줄이 없으면 null", () => {
    expect(mostRecentlyMoved([v("FC-NEW", "2026-10-10T00:00:00Z"), v("FC-OLD", "2026-10-01T00:00:00Z", ["2026-10-15T00:00:00Z"])])).toBe("FC-OLD");
    expect(mostRecentlyMoved([])).toBeNull();
  });
});
