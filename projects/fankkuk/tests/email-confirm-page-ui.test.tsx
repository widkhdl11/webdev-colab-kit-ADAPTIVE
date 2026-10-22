import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 이메일 확인 /me/email/confirm — 정돈(design-rules 27절 「4파트 나머지 다섯 화면」, 카드 d115, 시안 pilot-2026-10-22/email-confirm.html).
// 상자 없이 h1 하나 + 문장 + 버튼. 예전에는 팬 화면에 h1 이 없고(h2 만), 크리에이터 화면에는 같은 제목이 h1·h2 로 두 번 보였다.
// 세션·헤더는 바깥(서버)에 붙으므로 가짜로 바꾸고, 라우트가 실제로 그리는 본문만 본다.

const session = vi.hoisted(() => ({ viewer: null as null | { role: "fan" | "creator"; userId: string } }));

vi.mock("@/widgets/site-header/api/session-header", () => ({
  loadSession: async () => ({ supabase: {}, viewer: session.viewer }),
  readSiteHeader: async () => ({}),
}));
vi.mock("@/widgets/site-header/ui/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/widgets/site-footer/ui/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/features/email-confirm/api/confirm-email-client", () => ({ postEmailConfirm: vi.fn() }));

import Page from "@/app/(site)/me/email/confirm/page";

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
  session.viewer = null;
});

async function renderAs(viewer: typeof session.viewer) {
  session.viewer = viewer;
  const tree = (await Page({ searchParams: Promise.resolve({ token: "t" }) })) as ReactNode;
  act(() => root.render(tree));
}

const headings = (sel: string) => [...host.querySelectorAll(sel)].map((h) => h.textContent?.trim());

describe("이메일 확인 — 화면마다 제목 h1 하나", () => {
  it("팬: h1 「이메일 확인」 하나, 같은 제목의 h2 는 없다", async () => {
    await renderAs({ role: "fan", userId: "u1" });
    expect(headings("h1")).toEqual(["이메일 확인"]);
    expect(headings("h2")).toEqual([]);
    expect(host.querySelector("button")?.textContent?.trim()).toBe("이 주소 확인하기");
  });

  it("크리에이터: h1 「이메일 확인」 하나 — 제목이 두 번 보이지 않는다", async () => {
    await renderAs({ role: "creator", userId: "u2" });
    expect(headings("h1")).toEqual(["이메일 확인"]);
    expect(headings("h2")).toEqual([]);
    expect(host.querySelector("button")?.textContent?.trim()).toBe("이 주소 확인하기");
  });

  it("팬·크리에이터 모두 다른 설정 화면과 같은 880 틀(목록형 본문 틀)에 들어간다", async () => {
    for (const role of ["fan", "creator"] as const) {
      await renderAs({ role, userId: "u" });
      const main = host.querySelector("main") as HTMLElement;
      expect(main.classList.contains("page-pane")).toBe(true);
      expect(main.classList.contains("pane-form")).toBe(false);
    }
  });

  it("로그인 전: h1 하나 + 로그인 안내, 판(상자) 없이", async () => {
    await renderAs(null);
    expect(headings("h1")).toEqual(["이메일 확인"]);
    expect(host.querySelector('a[href="/login"]')?.textContent?.trim()).toBe("로그인");
    expect(host.querySelector(".part")).toBeNull();
  });

  it("본문에 판(.part) 상자가 없다 — 문장과 버튼이 제목 바로 아래", async () => {
    await renderAs({ role: "fan", userId: "u1" });
    expect(host.querySelector(".part")).toBeNull();
    const h1 = host.querySelector("h1") as HTMLElement;
    const btn = host.querySelector("button") as HTMLButtonElement;
    expect(h1.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
