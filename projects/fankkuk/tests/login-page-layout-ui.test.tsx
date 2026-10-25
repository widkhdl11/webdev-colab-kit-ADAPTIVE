import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "@/widgets/login/ui/login-page";

// 로그인 화면 구조(design-rules 29절 · UX 명세 login.md 「바꿀 것」): 머리는 카드 밖 위, 카드 안에는 로그인 양식 하나,
// 카드 아래 「비밀번호를 잊으셨나요?」 링크(/password/forgot)와 가입 줄. 잠김 안내는 문장마다 줄.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOCKED = "비밀번호를 여러 번 틀려 잠시 확인할 수 없어요. 15분 뒤 다시 하거나 비밀번호를 재설정해 주세요.";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: LOCKED }), { status: 429 }));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("로그인 화면 구조", () => {
  it("머리는 카드 밖, 카드 안에는 양식 하나뿐이고 재설정 칸·선물 그림이 없다", () => {
    act(() => root.render(<LoginPage />));
    const card = host.querySelector(".card");
    const h1 = host.querySelector("h1");
    expect(h1?.textContent).toBe("로그인");
    expect(card?.contains(h1)).toBe(false);
    expect(card?.querySelectorAll("form")).toHaveLength(1);
    expect(host.querySelector("details")).toBeNull();
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelectorAll("form")).toHaveLength(1);
  });

  it("카드 아래에 /password/forgot 링크와 가입 줄이 있다", () => {
    act(() => root.render(<LoginPage />));
    const card = host.querySelector(".card");
    const forgot = Array.from(host.querySelectorAll("a")).find((a) => a.textContent === "비밀번호를 잊으셨나요?");
    expect(forgot?.getAttribute("href")).toBe("/password/forgot");
    expect(card?.contains(forgot ?? null)).toBe(false);
    expect(host.querySelector('.foot-line a[href="/signup"]')).not.toBeNull();
  });

  it("잠김 안내는 두 문장을 각각 한 줄로 보여 준다", async () => {
    act(() => root.render(<LoginPage />));
    const form = host.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const err = host.querySelector('[role="alert"]');
    expect(err?.textContent).toBe(LOCKED);
    const lines = err?.querySelectorAll(".brk");
    expect(lines).toHaveLength(1);
    expect(lines?.[0].textContent?.trim()).toBe("15분 뒤 다시 하거나 비밀번호를 재설정해 주세요.");
  });
});
