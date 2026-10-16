import { describe, expect, it } from "vitest";
import { parseDecidedRequestRows } from "./creator-request-rows";

describe("크리에이터 처리한 요청 응답", () => {
  it("처리한 요청: 승인·받지 않음·차단·자동 반려를 화면 말로", () => {
    const rows = [
      { order_no: "FC-A1B2C", fan_nickname: "솜사탕", item_kind: "엽서", box_count: 1, outcome: "approved", decided_at: "2026-09-25T04:30:00+00:00" },
      { order_no: "FC-H8J2W", fan_nickname: "별빛", item_kind: "향초", box_count: 1, outcome: "declined", decided_at: "2026-09-29T05:00:00+00:00" },
      { order_no: "FC-X", fan_nickname: "하늘", item_kind: "컵", box_count: 1, outcome: "expired", decided_at: "2026-09-30T05:00:00+00:00" },
      { order_no: "FC-Y", fan_nickname: "하늘", item_kind: "컵", box_count: 1, outcome: "blocked", decided_at: "2026-09-30T06:00:00+00:00" },
    ];
    expect(parseDecidedRequestRows(rows).map((d) => d.outcome)).toEqual(["approved", "declined", "expired", "blocked"]);
  });

  it("형식이 다르면 받지 않는다 — 열린 요청이 처리 목록에 섞이는 것도", () => {
    expect(() =>
      parseDecidedRequestRows([{ order_no: "FC-1", fan_nickname: "a", item_kind: "b", box_count: 1, outcome: "waiting", decided_at: null }]),
    ).toThrow();
  });
});
