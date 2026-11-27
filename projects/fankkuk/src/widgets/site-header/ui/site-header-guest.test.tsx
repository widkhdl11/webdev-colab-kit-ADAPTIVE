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

  it("로그인은 상단 바(메뉴 밖)에 글자 링크로 있고, 메뉴 안에는 없다 — 같은 일 버튼을 둘 두지 않는다(design-prompt 13-1)", () => {
    render();
    expect(host.querySelector('.header-actions .auth a[href="/login"]')?.textContent).toBe("로그인");
    expect(host.querySelector('.mobile-menu a[href="/login"]')).toBeNull();
  });

  it("메뉴 안 회원가입은 테두리 버튼 하나", () => {
    render();
    const signups = host.querySelectorAll<HTMLAnchorElement>('.mobile-menu a[href="/signup"]');
    expect(signups).toHaveLength(1);
    expect(signups[0].className).toBe("btn btn--line");
  });
});
