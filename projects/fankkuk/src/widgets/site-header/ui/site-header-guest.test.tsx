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

describe("로그인 전 휴대폰 상단 바·메뉴의 로그인·회원가입", () => {
  function render() {
    act(() =>
      root.render(
        <HeaderMemoryProvider>
          <SiteHeader role="guest" />
        </HeaderMemoryProvider>,
      ),
    );
  }

  it("로그인은 상단 바(메뉴 밖)에 하늘 채움 버튼으로 있다", () => {
    render();
    const login = host.querySelector<HTMLAnchorElement>('.header-actions .auth a[href="/login"]');
    expect(login?.textContent).toBe("로그인");
    expect(login?.classList.contains("login-btn")).toBe(true);
  });

  it("펼친 메뉴에도 로그인(하늘 채움)과 회원가입(회색 테두리)이 하나씩 — 두 버튼 모양이 다르다(design-prompt 1-3)", () => {
    render();
    const login = host.querySelectorAll<HTMLAnchorElement>('.mobile-menu a[href="/login"]');
    const signup = host.querySelectorAll<HTMLAnchorElement>('.mobile-menu a[href="/signup"]');
    expect(login).toHaveLength(1);
    expect(signup).toHaveLength(1);
    expect(login[0].className).toBe("btn");
    expect(signup[0].className).toBe("btn btn--line");
  });
});
