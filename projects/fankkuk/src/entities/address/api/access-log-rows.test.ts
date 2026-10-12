import { describe, expect, it } from "vitest";
import { parseAccessLogRows, parseAccessMonthSummary } from "./access-log-rows";

// 크리에이터 열람 기록 응답 — INV-P7: 주소가 열린 줄만(2026-10-12 문제집 D12). 거부 줄·대표 여부는 크리에이터에게 오지 않는다.

const opened = {
  at: "2026-10-03T05:32:00+00:00",
  order_no: "FC-4T7NX",
  print_no: 2,
  released: false,
};

describe("INV-P7: 열람 기록 응답", () => {
  it("INV-P7: 연 줄을 화면 모양으로. 시각은 ISO(Z)", () => {
    expect(parseAccessLogRows([opened, { ...opened, at: "2026-10-03T05:00:00+00:00", print_no: 1 }])).toEqual([
      { at: "2026-10-03T05:32:00.000Z", orderNo: "FC-4T7NX", printNo: 2, released: false },
      { at: "2026-10-03T05:00:00.000Z", orderNo: "FC-4T7NX", printNo: 1, released: false },
    ]);
  });

  it("INV-P15 (S15): 돌려준 연 줄은 released 로 온다 — 화면이 「출력 실패」로 그린다", () => {
    expect(parseAccessLogRows([{ ...opened, print_no: 1, released: true }])[0]).toMatchObject({ printNo: 1, released: true });
  });

  it("INV-P15 (실패경로): 돌려줌 칸이 없으면 받지 않는다", () => {
    const { released: _omit, ...noFlag } = opened;
    expect(() => parseAccessLogRows([noFlag])).toThrow();
  });

  it("INV-P7 (D12, 실패경로): 출력 순번이 없는 줄(거부 줄 꼴)은 받지 않는다", () => {
    expect(() => parseAccessLogRows([{ ...opened, print_no: null }])).toThrow();
  });

  it("INV-P7 (D12): 요청자·거부 사유·계정 id 같은 다른 칸이 섞여 와도 화면 모양에 넣지 않는다", () => {
    const [view] = parseAccessLogRows([{ ...opened, requester: "other", deny_reason: "not_owner", requester_id: "00000000-0000-4000-a000-000000000021" }]);
    expect(Object.keys(view ?? {}).sort()).toEqual(["at", "orderNo", "printNo", "released"]);
    expect(JSON.stringify(view)).not.toMatch(/other|not_owner|00000000-0000-4000-a000-000000000021/);
  });

  it("빈 기록은 빈 목록", () => {
    expect(parseAccessLogRows([])).toEqual([]);
  });
});

describe("열람 기록 응답 (실패경로): 값 목록 밖이면 받지 않는다", () => {
  it.each([
    ["출력 순번 4 — 출력 상한 밖", { ...opened, print_no: 4 }],
    ["출력 순번 0", { ...opened, print_no: 0 }],
    ["주문번호 빈칸", { ...opened, order_no: "" }],
    ["시각이 아닌 값", { ...opened, at: "어제" }],
    ["시간대가 없는 시각", { ...opened, at: "2026-10-03T05:32:00" }],
  ])("%s → 거부", (_label, row) => {
    expect(() => parseAccessLogRows([row])).toThrow();
  });
});

describe("이번 달 숫자 응답", () => {
  it("INV-P7 (D12): 한 줄을 화면 모양으로 — 승인·열림·재출력 셋, 거부 숫자는 없다", () => {
    expect(parseAccessMonthSummary([{ approved_count: 2, opened_count: 5, reprint_count: 1, denied_count: 3 }])).toEqual({
      approvedCount: 2,
      openedCount: 5,
      reprintCount: 1,
    });
  });

  it("(실패경로): 줄이 없거나 둘이거나 음수면 받지 않는다", () => {
    const row = { approved_count: 0, opened_count: 0, reprint_count: 0 };
    expect(() => parseAccessMonthSummary([])).toThrow();
    expect(() => parseAccessMonthSummary([row, row])).toThrow();
    expect(() => parseAccessMonthSummary([{ ...row, reprint_count: -1 }])).toThrow();
  });
});
