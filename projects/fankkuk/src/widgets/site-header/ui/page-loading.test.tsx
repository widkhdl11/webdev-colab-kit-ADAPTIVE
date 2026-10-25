import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/me/following";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { HeaderMemoryProvider } from "../model/header-memory";
import { PageLoading } from "./page-loading";
import { SiteHeader, type SiteHeaderProps } from "./site-header";

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

const fan: SiteHeaderProps = { role: "fan", current: "/me/following", nickname: "별빛", actionCount: 3 };

/** 페이지 하나(상단 바 + 본문) → 로딩 화면으로 바뀌는 흐름. Next 가 loading.tsx 로 페이지 자리를 바꾸는 것과 같은 모양이다. */
function show(screen: "page" | "loading", props: SiteHeaderProps = fan) {
  act(() =>
    root.render(
      <HeaderMemoryProvider>
        {screen === "page" ? (
          <>
            <SiteHeader {...props} />
            <main id="main">본문</main>
          </>
        ) : (
          <PageLoading />
        )}
      </HeaderMemoryProvider>,
    ),
  );
}

describe("페이지 이동 중 로딩 화면", () => {
  it("직전 페이지가 그린 사이드바를 그대로 보여 주고, 본문 자리만 뼈대로 바꾼다", () => {
    show("page");
    show("loading");
    expect(host.querySelector(".sidebar")?.textContent).toContain("별빛");
    expect(host.querySelector("main[data-loading]")).not.toBeNull();
    expect(host.textContent).not.toContain("본문");
  });

  it("사이드바 숫자는 직전 페이지가 넘긴 값 그대로다 — 로딩 화면이 따로 세지 않는다(action-center INV-J2)", () => {
    show("page", { ...fan, actionCount: 7 });
    show("loading");
    const badges = [...host.querySelectorAll(".sidebar .badge")].map((b) => b.textContent);
    expect(badges).toContain("7");
  });

  it("사이드바의 현재 칸은 지금 가는 주소로 바로 옮긴다", () => {
    show("page");
    pathname = "/me/actions";
    show("loading");
    expect(host.querySelector(".sidebar [aria-current='page']")?.getAttribute("href")).toBe("/me/actions");
    pathname = "/me/following";
  });

  it("기억한 상단 바가 없으면(처음 들어온 직후) 상단 바도 뼈대도 그리지 않는다 — 폭을 몰라 틀리게 그렸다 밀리지 않게", () => {
    show("loading");
    expect(host.querySelector(".sidebar, header.site-header, main")).toBeNull();
    expect(host.querySelector("[role='status']")).not.toBeNull();
  });

  it("「불러오는 중」 안내는 칸을 붙인 뒤 글자를 넣는다(화면 읽기 프로그램이 새 안내로 읽게)", () => {
    show("page");
    show("loading");
    expect(host.querySelector("[role='status']")?.textContent).toBe("불러오는 중");
  });

  it("로그인 전 상단 바도 같은 방식으로 남는다", () => {
    show("page", { role: "guest", current: "/terms" });
    show("loading");
    expect(host.querySelector("header.site-header")).not.toBeNull();
  });
});
