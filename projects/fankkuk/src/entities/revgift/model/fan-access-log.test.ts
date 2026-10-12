import { describe, expect, it } from "vitest";
import { parseFanAccessLogRows } from "./fan-access-log";

// INV-R16: 팬 주소 열람 기록 응답 — 연 줄과 지운 줄만(2026-10-12 문제집 D12). 거부 줄·대표 여부는 팬에게 오지 않는다.

const opened = { at: "2026-10-09T05:32:00+00:00", kind: "opened", print_no: 1, outcome: null, released: false };
const deleted = { at: "2026-10-09T06:00:00+00:00", kind: "deleted", print_no: null, outcome: "shipped", released: false };

describe("INV-R16: 팬 주소 열람 기록 응답", () => {
  it("INV-R16: 연 줄·지운 줄을 화면 모양으로. 시각은 ISO(Z), 순서는 DB 가 준 그대로", () => {
    expect(parseFanAccessLogRows([deleted, opened])).toEqual([
      { at: "2026-10-09T06:00:00.000Z", kind: "deleted", outcome: "shipped" },
      { at: "2026-10-09T05:32:00.000Z", kind: "opened", printNo: 1, released: false },
    ]);
  });

  it("INV-R16: 빈 목록은 빈 목록, 돌려받은 연 줄은 released 로", () => {
    expect(parseFanAccessLogRows([])).toEqual([]);
    expect(parseFanAccessLogRows([{ ...opened, print_no: 2, released: true }])).toEqual([
      { at: "2026-10-09T05:32:00.000Z", kind: "opened", printNo: 2, released: true },
    ]);
  });

  it.each([
    ["요청자 계정 id 칸이 섞여 옴", [{ ...opened, requester_id: "00000000-0000-4000-a000-000000000021" }]],
    ["대표·직원 구분 칸이 섞여 옴(D12)", [{ ...opened, requester: "owner" }]],
    ["거부 사유 칸이 섞여 옴(D12)", [{ ...opened, deny_reason: null }]],
    ["거부 줄이 옴(D12)", [{ at: "2026-10-09T05:40:00+00:00", kind: "denied", print_no: null, outcome: null, released: false }]],
    ["주소 칸이 섞여 옴", [{ ...deleted, address1: "서울시" }]],
    ["운송장 칸이 섞여 옴", [{ ...opened, waybill: "123456789012" }]],
    ["연 줄에 순번이 없음", [{ ...opened, print_no: null }]],
    ["순번이 상한(3)을 넘음", [{ ...opened, print_no: 4 }]],
    ["모르는 지운 까닭", [{ ...deleted, outcome: "declined" }]],
    ["지운 줄이 돌려받음으로 옴", [{ ...deleted, released: true }]],
    ["배열이 아님", { rows: [] }],
  ])("INV-R16 (실패경로): %s → null(목록 전체를 버린다)", (_name, rows) => {
    expect(parseFanAccessLogRows(rows)).toBeNull();
  });
});
