import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FanAccessEntry } from "@/entities/revgift/model/fan-access-log";
import { RevgiftAccessLog } from "./revgift-access-log";

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

function render(entries: readonly FanAccessEntry[] | null, finished = false) {
  act(() => root.render(<RevgiftAccessLog entries={entries} finished={finished} />));
}

const rowsOf = () => [...host.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].slice(1).map((td) => td.textContent));

describe("INV-R16: 받은 역조공 상세의 「내 주소 열람 기록」", () => {
  it("INV-R16 S16: 지운 줄·거부 줄·연 줄이 받은 순서대로, 누가는 대표인지 아닌지만, 사유와 까닭은 사람 말로", () => {
    render([
      { at: "2026-10-09T06:00:00.000Z", kind: "deleted", outcome: "shipped" },
      { at: "2026-10-09T05:40:00.000Z", kind: "denied", reason: "not_owner", requester: "other" },
      { at: "2026-10-09T05:32:00.000Z", kind: "opened", printNo: 1, released: false, requester: "owner" },
    ]);
    expect(host.querySelector("h2")?.textContent).toBe("내 주소 열람 기록");
    expect(rowsOf()).toEqual([
      ["없음", "지움", "출고되어 주소를 지웠어요"],
      ["팬꾹 대표가 아닌 계정", "거부", "팬꾹 대표 계정이 아니라 열리지 않았어요"],
      ["팬꾹 대표 계정", "열림", "첫 출력"],
    ]);
    // 좁은 화면용 목록에도 같은 세 줄
    expect(host.querySelectorAll("li").length).toBe(3);
  });

  it("INV-R16: 재출력·돌려받은 줄·반송·취소·역조공 거부 사유 문구", () => {
    render([
      { at: "2026-10-09T08:00:00.000Z", kind: "deleted", outcome: "cancelled" },
      { at: "2026-10-09T07:30:00.000Z", kind: "deleted", outcome: "returned" },
      { at: "2026-10-09T07:00:00.000Z", kind: "denied", reason: "no_valid_approval", requester: "owner" },
      { at: "2026-10-09T06:30:00.000Z", kind: "denied", reason: "order_mismatch", requester: "owner" },
      { at: "2026-10-09T06:00:00.000Z", kind: "opened", printNo: 2, released: true, requester: "owner" },
      { at: "2026-10-09T05:00:00.000Z", kind: "opened", printNo: 3, released: false, requester: "owner" },
    ]);
    expect(rowsOf().map((r) => r[2])).toEqual([
      "취소되어 주소를 지웠어요",
      "반송되어 주소를 지웠어요",
      "받기로 하며 입력한 주소가 없어 열리지 않았어요",
      "다른 선물의 주소라 열리지 않았어요",
      "출력 실패",
      "재출력 3번째",
    ]);
  });

  it("INV-R16: 빈 목록이면 아직 열린 적이 없다는 안내, 표는 없다", () => {
    render([]);
    expect(host.textContent).toContain("아직 주소가 열린 적이 없어요");
    expect(host.querySelector("table")).toBeNull();
  });

  it("INV-R16: 끝난 몫(받지 않음·기한 지남·출고·반송·취소)은 「출력할 때마다 남는다」는 안내를 하지 않는다 — 기록이 있으면 표는 그대로", () => {
    render([], true);
    expect(host.textContent).toContain("이 선물에서는 주소가 열린 적이 없어요");
    expect(host.textContent).not.toContain("송장을 출력할 때마다");
    render([{ at: "2026-10-09T06:00:00.000Z", kind: "deleted", outcome: "returned" }], true);
    expect(rowsOf()).toEqual([["없음", "지움", "반송되어 주소를 지웠어요"]]);
    expect(host.textContent).not.toContain("송장을 출력할 때마다");
  });

  it("INV-R16: 진행 중인 몫의 빈 목록은 출력할 때마다 남는다고 안내한다", () => {
    render([], false);
    expect(host.textContent).toContain("송장을 출력할 때마다 여기에 남아요");
  });

  it("INV-R16 (실패경로): 기록을 읽지 못했으면(null) 빈 목록처럼 보이지 않고 읽지 못했다고 말한다", () => {
    render(null);
    expect(host.textContent).toContain("열람 기록을 지금 불러오지 못했어요");
    expect(host.textContent).not.toContain("아직 주소가 열린 적이 없어요");
    expect(host.querySelector("table")).toBeNull();
  });
});
