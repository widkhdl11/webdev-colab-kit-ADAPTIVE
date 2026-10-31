import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINK_LOGIN_EXPIRED_MESSAGE } from "@/entities/session/model/login-link";
import { SESSION_END_LINK_HINT, SESSION_END_MESSAGE } from "@/entities/session/model/session-end-notice";
import { LoginPage } from "@/widgets/login/ui/login-page";

// 로그인 화면의 안내(기간으로 끝남·링크 만료)와 오류는 다른 상태다 (session-login INV-L17 · link-login INV-K4, UX 리뷰 2026-10-31 중간 5).
// 안내는 알림(role=status)이고 칸을 틀렸다고 표시하지 않는다(aria-invalid 없음). 틀린 비밀번호의 오류는 그대로 role=alert + aria-invalid.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "아이디 또는 비밀번호가 일치하지 않습니다." }), { status: 401 }));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const fields = () => [...host.querySelectorAll<HTMLInputElement>('form input:not([type="checkbox"])')];

describe("INV-L17 · link-login INV-K4: 안내는 오류가 아니다", () => {
  for (const notice of [SESSION_END_MESSAGE, `${SESSION_END_MESSAGE} ${SESSION_END_LINK_HINT}`, LINK_LOGIN_EXPIRED_MESSAGE]) {
    it(`INV-L17: 「${notice.slice(0, 12)}…」 안내는 role=status 이고 칸에 aria-invalid 가 없다`, () => {
      act(() => root.render(<LoginPage notice={notice} />));
      const status = host.querySelector('[role="status"]');
      expect(status?.textContent?.replace(/\s+/g, " ").trim()).toBe(notice);
      expect(host.querySelector('[role="alert"]')).toBeNull();
      for (const f of fields()) {
        expect(f.getAttribute("aria-invalid")).toBeNull();
        expect(f.getAttribute("aria-describedby")).toBeNull();
      }
    });
  }

  it("INV-L5 (실패경로): 안내가 있던 화면에서 틀리면 안내는 사라지고 오류(role=alert + aria-invalid)로 바뀐다", async () => {
    act(() => root.render(<LoginPage notice={SESSION_END_MESSAGE} />));
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("일치하지 않습니다");
    for (const f of fields()) expect(f.getAttribute("aria-invalid")).toBe("true");
  });
});
