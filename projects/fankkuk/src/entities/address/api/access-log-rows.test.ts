import { describe, expect, it } from "vitest";
import { parseAccessLogRows, parseAccessMonthSummary } from "./access-log-rows";

const opened = {
  at: "2026-10-03T05:32:00+00:00",
  order_no: "FC-4T7NX",
  result: "opened",
  print_no: 2,
  deny_reason: null,
  requester: "owner",
};
const denied = {
  at: "2026-10-03T06:00:00+00:00",
  order_no: "FC-4T7NX",
  result: "denied",
  print_no: null,
  deny_reason: "not_owner",
  requester: "other",
};

describe("열람 기록 응답", () => {
  it("열림·거부 줄을 화면 모양으로. 시각은 ISO(Z)", () => {
    expect(parseAccessLogRows([opened, denied])).toEqual([
      { at: "2026-10-03T05:32:00.000Z", orderNo: "FC-4T7NX", requester: "owner", result: { kind: "opened", printNo: 2 } },
      { at: "2026-10-03T06:00:00.000Z", orderNo: "FC-4T7NX", requester: "other", result: { kind: "denied", reason: "not_owner" } },
    ]);
  });

  it("열림인데 출력 순번이 없거나 거부인데 사유가 없으면 받지 않는다", () => {
    expect(() => parseAccessLogRows([{ ...opened, print_no: null }])).toThrow();
    expect(() => parseAccessLogRows([{ ...denied, deny_reason: null }])).toThrow();
  });

  it("요청자 계정 id 같은 다른 칸이 섞여 와도 화면 모양에 넣지 않는다", () => {
    const [view] = parseAccessLogRows([{ ...opened, requester_id: "00000000-0000-4000-a000-000000000021" }]);
    expect(JSON.stringify(view)).not.toContain("00000000-0000-4000-a000-000000000021");
  });

  it("빈 기록은 빈 목록", () => {
    expect(parseAccessLogRows([])).toEqual([]);
  });
});

describe("열람 기록 응답 (실패경로): 값 목록 밖이면 받지 않는다", () => {
  it.each([
    ["출력 순번 4 — 출력 상한 밖", { ...opened, print_no: 4 }],
    ["출력 순번 0", { ...opened, print_no: 0 }],
    ["모르는 거부 사유", { ...denied, deny_reason: "too_late" }],
    ["모르는 요청자 값", { ...opened, requester: "staff" }],
    ["시각이 아닌 값", { ...opened, at: "어제" }],
    ["시간대가 없는 시각", { ...opened, at: "2026-10-03T05:32:00" }],
  ])("%s → 거부", (_label, row) => {
    expect(() => parseAccessLogRows([row])).toThrow();
  });
});

describe("이번 달 숫자 응답", () => {
  it("한 줄을 화면 모양으로", () => {
    expect(parseAccessMonthSummary([{ approved_count: 2, opened_count: 5, reprint_count: 1, denied_count: 3 }])).toEqual({
      approvedCount: 2,
      openedCount: 5,
      reprintCount: 1,
      deniedCount: 3,
    });
  });

  it("(실패경로): 줄이 없거나 둘이거나 음수면 받지 않는다", () => {
    const row = { approved_count: 0, opened_count: 0, reprint_count: 0, denied_count: 0 };
    expect(() => parseAccessMonthSummary([])).toThrow();
    expect(() => parseAccessMonthSummary([row, row])).toThrow();
    expect(() => parseAccessMonthSummary([{ ...row, denied_count: -1 }])).toThrow();
  });
});
