import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { BoxListPage } from "./box-list-page";

// 선물함 만들기 버튼 — 채널이 없는 크리에이터(signup INV-U21 · UX 명세 signup.md 「가입 밖에서 바뀌는 것」)

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

describe("선물함 만들기 버튼 (signup INV-U21)", () => {
  it("INV-U21: 채널이 없으면 만들기 버튼 자리가 「채널 만들기」(가입 4단계) 링크 — 「선물함 만들기」 버튼이 없고, /new 로 와도 만들기 창을 열지 않는다", () => {
    act(() => root.render(<BoxListPage rows={[]} manage={[]} price={null} hasChannel={false} initial={{ kind: "create" }} />));
    const links = [...host.querySelectorAll("a")].filter((a) => a.textContent === "채널 만들기");
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((a) => a.getAttribute("href") === "/signup/creator")).toBe(true);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("선물함 만들기");
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  it("INV-U21 (실패경로): 채널이 있으면 지금처럼 「선물함 만들기」 버튼 — 「채널 만들기」 링크가 없다", () => {
    act(() => root.render(<BoxListPage rows={[]} manage={[]} price={null} />));
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain("선물함 만들기");
    expect([...host.querySelectorAll("a")].map((a) => a.textContent)).not.toContain("채널 만들기");
  });
});
