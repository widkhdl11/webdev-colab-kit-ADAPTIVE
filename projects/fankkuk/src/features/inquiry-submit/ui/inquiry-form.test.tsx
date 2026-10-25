import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { InquiryForm } from "./inquiry-form";

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

describe("1:1 문의 양식 — 로그인 전 (design-rules 28절 · session-login INV-L13)", () => {
  it("로그인 전에는 입력 칸을 그리지 않고, 로그인 뒤 고객센터로 돌아오는 링크 하나만 있다", () => {
    act(() => root.render(<InquiryForm signedIn={false} />));
    expect(host.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(host.querySelector("form")).toBeNull();
    const links = [...host.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/login?next=/support");
  });
});

describe("1:1 문의 양식 — 문의 제한 (INV-K12)", () => {
  it("INV-K12: 제한된 계정에는 양식 대신 「지금은 1:1 문의를 남길 수 없어요」만 보인다", () => {
    act(() => root.render(<InquiryForm signedIn restricted />));
    expect(host.textContent).toContain("지금은 1:1 문의를 남길 수 없어요.");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("INV-K12: 제한되지 않은 계정에는 양식이 그대로 있고 안내는 없다", () => {
    act(() => root.render(<InquiryForm signedIn restricted={false} />));
    expect(host.querySelector("form")).not.toBeNull();
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain("문의 남기기");
    expect(host.textContent).not.toContain("지금은 1:1 문의를 남길 수 없어요.");
  });
});
