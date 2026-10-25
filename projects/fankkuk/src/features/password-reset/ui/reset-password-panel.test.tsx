import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORGOT_PATH, RESET_LINK_INVALID, RESET_NO_TOKEN } from "../model/reset-messages";
import { ResetPasswordPanel } from "./reset-password-panel";

// 새 비밀번호 화면(session-login INV-L11) — 링크가 죽으면 비밀번호 찾기로, 칸이 틀리면 그 칸 바로 아래 줄.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const reply = (status: number, body: unknown) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

async function submitWith(token = "tok-1") {
  act(() => root.render(<ResetPasswordPanel token={token} />));
  const form = host.querySelector("form");
  if (!form) throw new Error("폼이 없다");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  for (let i = 0; i < 5; i += 1) await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

const fields = () => [...host.querySelectorAll<HTMLInputElement>('input[type="password"]')];

describe("INV-L11: 링크가 없거나 죽었을 때", () => {
  it("INV-L11 (실패경로): 링크 값이 없으면 폼 없이 상자 + 비밀번호 찾기로 가는 버튼", () => {
    act(() => root.render(<ResetPasswordPanel token="" />));
    expect(host.querySelector("form")).toBeNull();
    const box = host.querySelector(".err");
    expect(box?.textContent).toBe(RESET_NO_TOKEN);
    const btn = host.querySelector<HTMLAnchorElement>("a.btn");
    expect(btn?.getAttribute("href")).toBe(FORGOT_PATH);
    expect(box?.nextElementSibling).toBe(btn);
  });

  it("INV-L11 (실패경로): 저장했는데 서버가 링크를 죽었다고 하면 폼이 빠지고 비밀번호 찾기 버튼", async () => {
    reply(400, { field: "link", message: RESET_LINK_INVALID });
    await submitWith();
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".err")?.textContent).toBe(RESET_LINK_INVALID);
    const btn = host.querySelector<HTMLAnchorElement>("a.btn");
    expect(btn?.getAttribute("href")).toBe(FORGOT_PATH);
    expect(document.activeElement).toBe(btn);
  });
});

describe("INV-L11: 칸이 틀렸을 때 그 칸 바로 아래 줄", () => {
  it("INV-L11 (실패경로): 새 비밀번호가 틀리면 그 칸 바로 다음에 줄이 붙고, 칸이 그 줄을 가리킨다", async () => {
    reply(400, { field: "password", message: "8자 이상으로 적어 주세요." });
    await submitWith();
    const [pw, pw2] = fields();
    const line = pw.nextElementSibling;
    expect(line?.getAttribute("role")).toBe("alert");
    expect(line?.textContent).toBe("8자 이상으로 적어 주세요.");
    expect(pw.getAttribute("aria-describedby")?.split(" ")).toContain(line?.id);
    expect(pw.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(pw);
    expect(pw2.nextElementSibling).toBeNull();
    expect(host.querySelector(".err")?.textContent).toBe("");
  });

  it("INV-L11 (실패경로): 확인 칸이 틀리면 줄은 확인 칸 아래에만", async () => {
    reply(400, { field: "passwordConfirm", message: "두 칸이 같지 않아요." });
    await submitWith();
    const [pw, pw2] = fields();
    expect(pw2.nextElementSibling?.textContent).toBe("두 칸이 같지 않아요.");
    expect(pw2.getAttribute("aria-describedby")?.split(" ")).toContain(pw2.nextElementSibling?.id);
    expect(pw.nextElementSibling?.getAttribute("role")).not.toBe("alert");
    expect(document.activeElement).toBe(pw2);
  });

  it("INV-L11 (실패경로): 칸을 모르는 실패는 칸 아래 줄 없이 버튼 위 상자에", async () => {
    reply(500, { message: "잠시 문제가 생겼어요." });
    await submitWith();
    const [pw, pw2] = fields();
    expect(pw.nextElementSibling?.getAttribute("role")).not.toBe("alert");
    expect(pw2.nextElementSibling).toBeNull();
    const box = host.querySelector(".err");
    expect(box?.textContent).toBe("잠시 문제가 생겼어요.");
    expect(box?.nextElementSibling?.tagName).toBe("BUTTON");
  });
});
