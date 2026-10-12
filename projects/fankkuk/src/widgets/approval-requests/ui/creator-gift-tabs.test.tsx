import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreatorGiftTabs, type CreatorGiftTab } from "./creator-gift-tabs";

// 승인·받은 선물 탭 — 확인할 선물의 마지막 상자에 답하면 새로 읽기에서 그 탭이 빠지는데, 방금 고른 결과가 남아 있어야 한다(2026-10-12 (2) D3 ②).

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

const tab = (id: CreatorGiftTab["id"], count: number, text: string): CreatorGiftTab => ({ id, label: id, count, panel: <p>{text}</p> });
const labels = () => [...host.querySelectorAll("[role=tab]")].map((t) => t.textContent);

describe("승인·받은 선물 탭", () => {
  it("INV-W4: 보던 탭이 새로 읽기에서 빠져도 그 자리에 수 0 으로 남고 내용도 남는다", () => {
    act(() => root.render(<CreatorGiftTabs initial="checks" tabs={[tab("requests", 3, "요청"), tab("checks", 1, "답한 결과"), tab("received", 0, "받음")]} />));
    expect(labels()).toEqual(["requests3", "checks1", "received0"]);
    act(() => root.render(<CreatorGiftTabs initial="requests" tabs={[tab("requests", 2, "요청"), tab("received", 0, "받음")]} />));
    expect(labels()).toEqual(["requests2", "checks0", "received0"]);
    const selected = host.querySelector('[role=tab][aria-selected="true"]');
    expect(selected?.textContent).toBe("checks0");
    expect(host.querySelector("#gift-panel-checks")?.textContent).toBe("답한 결과");
  });

  it("INV-W4: 처음부터 없던 탭은 만들지 않고, 새로 생긴 탭은 받은 순서대로 들어간다", () => {
    act(() => root.render(<CreatorGiftTabs initial="requests" tabs={[tab("requests", 1, "요청"), tab("received", 0, "받음")]} />));
    expect(labels()).toEqual(["requests1", "received0"]);
    act(() => root.render(<CreatorGiftTabs initial="requests" tabs={[tab("requests", 1, "요청"), tab("checks", 1, "새"), tab("received", 0, "받음")]} />));
    expect(labels()).toEqual(["requests1", "checks1", "received0"]);
  });
});
