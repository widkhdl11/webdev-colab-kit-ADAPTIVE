import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { HardItemsSection } from "./hard-items-section";

// 받기 어려운 품목 설정 칸 (hard-items INV-H4) — 고르는 칸만 있고, 아무것도 고르지 않은 첫 저장은 막는다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const today = { year: 2026, month: 10, day: 11 };
let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("누를 요소가 없다");
  await act(async () => (el as HTMLElement).click());
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

describe("INV-H4: 받기 어려운 품목 설정 칸", () => {
  it("INV-H4 (실패경로): 저장된 설정이 없는데 품목 없이 저장하면 보내지 않고 「골라 주세요」", async () => {
    act(() => root.render(<HardItemsSection initial={null} today={today} />));
    await click(button("받기 어려운 선물 저장"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.querySelector("[role=alert]")?.textContent).toContain("받기 어려운 선물을 하나 이상 선택해 주세요.");
  });

  it("INV-H4: 품목을 고르면 고른 값 넷만 보내고 「저장했어요」", async () => {
    act(() => root.render(<HardItemsSection initial={null} today={today} />));
    await click([...host.querySelectorAll("label")].find((l) => l.textContent?.trim() === "꽃")?.querySelector("input"));
    await click(button("받기 어려운 선물 저장"));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ categories: ["flower"], reason: "many", period: "week1", action: "notice" });
    expect(host.textContent).toContain("받기 어려운 선물이 설정되었습니다.");
  });

  it("INV-H4: 문장을 쓰는 칸이 없다(글 입력 칸·글 상자 0개)", () => {
    act(() => root.render(<HardItemsSection initial={null} today={today} />));
    expect(host.querySelectorAll("textarea, input[type=text], input:not([type])").length).toBe(0);
  });
});
