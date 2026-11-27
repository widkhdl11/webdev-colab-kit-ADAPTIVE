import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { HeaderMemoryProvider } from "../model/header-memory";
import { SiteHeader } from "./site-header";

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

describe("로그인 전 휴대폰 메뉴의 로그인·회원가입", () => {
  it("두 버튼은 모양이 다르다 — 회원가입은 테두리, 로그인은 글자 버튼(design-prompt 1-3)", () => {
    act(() =>
      root.render(
        <HeaderMemoryProvider>
          <SiteHeader role="guest" />
        </HeaderMemoryProvider>,
      ),
    );
    const menu = host.querySelector(".mobile-menu");
    const login = menu?.querySelector<HTMLAnchorElement>('.btn-row a[href="/login"]');
    const signup = menu?.querySelector<HTMLAnchorElement>('.btn-row a[href="/signup"]');
    expect(signup?.className).toBe("btn btn--line");
    expect(login?.className).toBe("btn btn--text");
  });
});
