import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { DaysSection } from "./days-section";

// 생일과 기념일 판(프로필 수정 「프로필」 탭, creator-receiving INV-B1·B7) — 저장 버튼은 바꾼 값이 있을 때만 누를 수 있다(2026-11-14 재디자인).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const today = { year: 2026, month: 11, day: 14 };
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

const saveBtn = () => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "생일·기념일 저장")!;
async function click(el: HTMLElement) {
  await act(async () => el.click());
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}
function pick(id: string, value: string) {
  const sel = host.querySelector<HTMLSelectElement>(`#${id}`)!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(sel, value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("생일과 기념일 — 저장 버튼", () => {
  it("저장된 값 그대로면 회색·누를 수 없고 보내지 않는다 → 생일을 고르면 보낸다 → 저장 뒤 다시 누를 수 없다", async () => {
    act(() => root.render(<DaysSection initial={{ birthday: null, anniversaries: [] }} today={today} />));
    expect(saveBtn().getAttribute("aria-disabled")).toBe("true");
    await click(saveBtn());
    expect(fetchMock).not.toHaveBeenCalled();

    const monthId = host.querySelector("select")!.id;
    pick(monthId, "5");
    pick(monthId.replace(/-m$/, "-d"), "17");
    expect(saveBtn().getAttribute("aria-disabled")).toBe("false");
    await click(saveBtn());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ birthday: { month: 5, day: 17 }, anniversaries: [] });
    expect(host.querySelector("#days-msg")?.textContent).toBe("생일과 기념일이 저장되었습니다.");
    expect(saveBtn().getAttribute("aria-disabled")).toBe("true");
  });
});
