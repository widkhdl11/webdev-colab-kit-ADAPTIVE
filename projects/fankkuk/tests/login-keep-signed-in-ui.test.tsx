import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "@/widgets/login/ui/login-page";

// 로그인 화면의 「로그인 상태 유지」 확인칸이 고른 값을 요청 본문 keepSignedIn 으로 보내는지(session-login INV-L15).
// 화면의 글자·모양은 보지 않는다 — 보낸 본문만 본다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const bodies: Record<string, unknown>[] = [];

beforeEach(() => {
  bodies.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ message: "아이디 또는 비밀번호가 일치하지 않습니다." }), { status: 401 });
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function checkbox(): HTMLInputElement {
  const box = host.querySelector<HTMLInputElement>('form input[type="checkbox"]');
  if (!box) throw new Error("확인칸이 없다");
  return box;
}

async function submit() {
  const form = host.querySelector("form");
  if (!form) throw new Error("폼이 없다");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("INV-L15: 로그인 화면의 「로그인 상태 유지」", () => {
  it("INV-L15: 기본값은 꺼짐이고, 그대로 보내면 keepSignedIn: false", async () => {
    act(() => root.render(<LoginPage />));
    expect(checkbox().checked).toBe(false);
    await submit();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].keepSignedIn).toBe(false);
  });

  it("INV-L15: 체크하고 보내면 keepSignedIn: true, 다시 끄면 false", async () => {
    act(() => root.render(<LoginPage />));
    act(() => checkbox().click());
    expect(checkbox().checked).toBe(true);
    await submit();
    act(() => checkbox().click());
    await submit();
    expect(bodies.map((b) => b.keepSignedIn)).toEqual([true, false]);
  });
});
