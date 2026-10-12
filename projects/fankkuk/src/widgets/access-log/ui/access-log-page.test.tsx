import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressAccessEntry } from "@/entities/address/model/access-log";
import { AccessLogPage } from "./access-log-page";

// 크리에이터 「주소 열람 기록」 화면 — INV-P7: 주소가 열린 줄만, 대표·직원 구분 없이(2026-10-12 문제집 D12).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const SUMMARY = { approvedCount: 4, openedCount: 3, reprintCount: 1 };

function render(entries: readonly AddressAccessEntry[]) {
  act(() => root.render(<AccessLogPage monthLabel="2026년 10월" summary={SUMMARY} entries={entries} />));
}

const ENTRIES: AddressAccessEntry[] = [
  { at: "2026-10-12T06:00:00.000Z", orderNo: "FC-4T7NX", printNo: 2, released: false },
  { at: "2026-10-12T05:30:00.000Z", orderNo: "FC-4T7NX", printNo: 1, released: true },
  { at: "2026-10-12T05:00:00.000Z", orderNo: "FC-9QW2E", printNo: 1, released: false },
];

describe("INV-P7: 크리에이터 열람 기록 화면", () => {
  it("INV-P7 (D12): 표 칸은 시각·주문번호·비고 셋 — 늘 「열림」인 결과 칸·배지와 「누가」 칸은 없고, 비고에 몇 번째 출력·출력 실패", () => {
    render(ENTRIES);
    expect([...host.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["시각", "주문번호", "비고"]);
    const rows = [...host.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].slice(1).map((td) => td.textContent));
    expect(rows).toEqual([
      ["FC-4T7NX", "재출력 2번째"],
      ["FC-4T7NX", "출력 실패"],
      ["FC-9QW2E", "첫 출력"],
    ]);
    // 좁은 화면 목록도 같은 세 줄, 「열림」 배지 없이 비고만
    const items = [...host.querySelectorAll("li")];
    expect(items.length).toBe(3);
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("재출력 2번째"),
      expect.stringContaining("출력 실패"),
      expect.stringContaining("첫 출력"),
    ]);
    for (const li of items) expect(li.textContent).not.toContain("열림");
    expect(host.querySelectorAll("table .tag--info, li .tag--info").length).toBe(0);
    expect(host.textContent).not.toMatch(/대표 계정|권한이 없는 계정|거부/);
  });

  it("INV-P7 (D12): 이번 달 숫자는 승인·주소 열림·재출력 셋 — 거부 숫자는 없다", () => {
    render(ENTRIES);
    expect([...host.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["승인", "주소 열림", "재출력"]);
    expect([...host.querySelectorAll("dd")].map((dd) => dd.textContent)).toEqual(["4건", "3번", "1번"]);
  });

  it("INV-P7: 기록이 없으면 아직 열린 적이 없다는 안내, 표는 없다", () => {
    render([]);
    expect(host.textContent).toContain("아직 주소가 열린 적이 없어요");
    expect(host.querySelector("table")).toBeNull();
  });
});
