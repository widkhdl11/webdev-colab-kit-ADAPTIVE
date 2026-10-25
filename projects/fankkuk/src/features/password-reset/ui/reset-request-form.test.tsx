import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResetRequestForm } from "./reset-request-form";

// 비밀번호 재설정 요청 칸(session-login INV-L10) — 응답 문장은 서버가 준 것 하나만, 상자 하나에.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPLY = "입력하신 정보가 맞으면 재설정 링크를 보냈어요.";
let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function submit() {
  act(() => root.render(<ResetRequestForm />));
  const form = host.querySelector("form");
  if (!form) throw new Error("폼이 없다");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  for (let i = 0; i < 5; i += 1) await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

describe("INV-L10: 재설정 요청 응답", () => {
  it("INV-L10: 응답이 오면 초록 상자(.okmsg) 하나에 서버 문장이 한 번만, 1:1 문의 안내가 그 바로 아래", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: REPLY }), { status: 200 }));
    await submit();
    const status = host.querySelectorAll('[role="status"]');
    expect(status).toHaveLength(1);
    expect(status[0].classList.contains("okmsg")).toBe(true);
    expect(status[0].textContent).toBe(REPLY);
    expect(host.textContent?.split(REPLY)).toHaveLength(2);
    const support = host.querySelector('a[href="/support"]');
    expect(support).not.toBeNull();
    expect(status[0].nextElementSibling?.contains(support)).toBe(true);
  });

  it("INV-L10 (실패경로): 실패면 같은 자리가 .err 이고 1:1 문의 안내가 없다", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "아이디를 적어 주세요." }), { status: 400 }));
    await submit();
    const status = host.querySelector('[role="status"]');
    expect(status?.classList.contains("err")).toBe(true);
    expect(status?.classList.contains("okmsg")).toBe(false);
    expect(status?.textContent).toBe("아이디를 적어 주세요.");
    expect(host.querySelector('a[href="/support"]')).toBeNull();
  });
});
