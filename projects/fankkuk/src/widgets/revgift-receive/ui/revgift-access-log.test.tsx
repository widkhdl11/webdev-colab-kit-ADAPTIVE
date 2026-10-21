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
  it("INV-R16 S16: 지운 줄·연 줄이 받은 순서대로 시각·결과·비고 세 칸 — 「누가」 칸(대표·직원 구분)은 없다(D12)", () => {
    render([
      { at: "2026-10-09T06:00:00.000Z", kind: "deleted", outcome: "shipped" },
      { at: "2026-10-09T05:32:00.000Z", kind: "opened", printNo: 1, released: false },
    ]);
    expect(host.querySelector("h2")?.textContent).toBe("내 주소 열람 기록");
    expect([...host.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["시각", "결과", "비고"]);
    expect(rowsOf()).toEqual([
      ["지움", "출고되어 주소를 지웠어요"],
      ["열림", "첫 출력"],
    ]);
    // 좁은 화면용 목록에도 같은 두 줄, 대표·직원 표시 없이
    expect(host.querySelectorAll("li").length).toBe(2);
    expect(host.textContent).not.toMatch(/대표 계정|권한이 없는 계정|거부/);
  });

  it("INV-R16: 재출력·돌려받은 줄·반송·취소 문구", () => {
    render([
      { at: "2026-10-09T08:00:00.000Z", kind: "deleted", outcome: "cancelled" },
      { at: "2026-10-09T07:30:00.000Z", kind: "deleted", outcome: "returned" },
      { at: "2026-10-09T06:00:00.000Z", kind: "opened", printNo: 2, released: true },
      { at: "2026-10-09T05:00:00.000Z", kind: "opened", printNo: 3, released: false },
    ]);
    expect(rowsOf().map((r) => r[1])).toEqual(["취소되어 주소를 지웠어요", "반송되어 주소를 지웠어요", "출력 실패", "재출력 3번째"]);
  });

  it("INV-R16 · INV-W15: 처분으로 지운 줄은 「처분」으로 적는다", () => {
    render([{ at: "2026-10-09T08:00:00.000Z", kind: "deleted", outcome: "disposed" }], true);
    expect(rowsOf()).toEqual([["지움", "처분되어 주소를 지웠어요"]]);
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
    expect(rowsOf()).toEqual([["지움", "반송되어 주소를 지웠어요"]]);
    expect(host.textContent).not.toContain("송장을 출력할 때마다");
  });

  it("INV-R16: 진행 중인 몫의 빈 목록은 「아직」 열린 적이 없다고 안내한다 — 끝난 몫의 「이 선물에서는」 문장이 아니다(빈 상태 뒷문장은 design-rules 22절에서 뺐다)", () => {
    render([], false);
    expect(host.textContent).toContain("아직 주소가 열린 적이 없어요.");
    expect(host.textContent).not.toContain("이 선물에서는");
    expect(host.querySelector("summary small")?.textContent).toBe("0번");
  });

  it("INV-R16 (실패경로): 기록을 읽지 못했으면(null) 빈 목록처럼 보이지 않고 읽지 못했다고 말한다", () => {
    render(null);
    expect(host.textContent).toContain("열람 기록을 지금 불러오지 못했어요");
    expect(host.textContent).not.toContain("아직 주소가 열린 적이 없어요");
    expect(host.querySelector("table")).toBeNull();
  });
});
