import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 서버와 주고받는 세 호출만 가짜로 둔다 — 시험 대상은 화면이 언제 무엇을 보내는지다.
const api = vi.hoisted(() => ({
  requestPhoneChangeVerification: vi.fn(),
  checkPhoneChangeVerification: vi.fn(),
  sendPhoneChange: vi.fn(),
}));
vi.mock("../api/phone-change-client", () => api);

import { PhoneChangePanel } from "./phone-change-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (name: string) => {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent === name);
  if (!found) throw new Error(`버튼 없음: ${name}`);
  return found;
};

const typeInto = (label: string, value: string) => {
  const input = [...host.querySelectorAll("label")].find((l) => l.textContent === label);
  const el = input ? (document.getElementById(input.htmlFor) as HTMLInputElement | null) : null;
  if (!el) throw new Error(`칸 없음: ${label}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const click = async (name: string) => {
  await act(async () => {
    button(name).click();
  });
};

async function startVerified() {
  act(() => root.render(<PhoneChangePanel id="p" onLoginExpired={() => {}} onChanged={() => {}} />));
  api.requestPhoneChangeVerification.mockResolvedValue({ kind: "ok" });
  typeInto("새 휴대폰 번호", "01055502006");
  await click("카카오톡으로 인증 요청 보내기");
}

describe("번호 바꾸기 화면 — 카카오 인증 확인은 한 번만 (signup INV-U12)", () => {
  it("지금 비밀번호를 틀린 뒤 다시 누르면 인증 확인을 다시 보내지 않고 바꾸기만 다시 보낸다", async () => {
    await startVerified();
    api.checkPhoneChangeVerification.mockResolvedValue({ kind: "ok", verified: true });
    api.sendPhoneChange
      .mockResolvedValueOnce({ kind: "failed", field: "currentPassword", message: "지금 비밀번호가 맞지 않아요." })
      .mockResolvedValueOnce({ kind: "ok" });

    typeInto("지금 비밀번호", "WrongPass!2026");
    await click("인증했어요, 번호 바꾸기");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("지금 비밀번호가 맞지 않아요.");

    typeInto("지금 비밀번호", "RightPass!2026");
    await click("인증했어요, 번호 바꾸기");

    expect(api.checkPhoneChangeVerification).toHaveBeenCalledTimes(1);
    expect(api.sendPhoneChange).toHaveBeenCalledTimes(2);
    expect(api.sendPhoneChange).toHaveBeenLastCalledWith("01055502006", "RightPass!2026");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("휴대폰 번호를 바꿨어요.");
  });

  it("실패경로: 인증이 아직이면 바꾸기를 보내지 않고, 다음 누름에 확인부터 다시 한다", async () => {
    await startVerified();
    api.checkPhoneChangeVerification.mockResolvedValueOnce({ kind: "ok", verified: false }).mockResolvedValueOnce({ kind: "ok", verified: true });
    api.sendPhoneChange.mockResolvedValue({ kind: "ok" });

    typeInto("지금 비밀번호", "RightPass!2026");
    await click("인증했어요, 번호 바꾸기");
    expect(api.sendPhoneChange).not.toHaveBeenCalled();

    await click("인증했어요, 번호 바꾸기");
    expect(api.checkPhoneChangeVerification).toHaveBeenCalledTimes(2);
    expect(api.sendPhoneChange).toHaveBeenCalledTimes(1);
  });

  it("실패경로: 바꾸기가 본인 확인을 쓸 수 없다고 하면 다음 누름에 확인부터 다시 한다", async () => {
    await startVerified();
    api.checkPhoneChangeVerification.mockResolvedValue({ kind: "ok", verified: true });
    api.sendPhoneChange.mockResolvedValue({ kind: "failed", field: "verification", message: "본인 확인을 다시 해 주세요." });

    typeInto("지금 비밀번호", "RightPass!2026");
    await click("인증했어요, 번호 바꾸기");
    await click("인증했어요, 번호 바꾸기");

    expect(api.checkPhoneChangeVerification).toHaveBeenCalledTimes(2);
  });

  it("실패경로: 「번호 다시 적기」 뒤 새로 요청하면 확인부터 다시 한다", async () => {
    await startVerified();
    api.checkPhoneChangeVerification.mockResolvedValue({ kind: "ok", verified: true });
    api.sendPhoneChange.mockResolvedValueOnce({ kind: "failed", field: "currentPassword", message: "지금 비밀번호가 맞지 않아요." });

    typeInto("지금 비밀번호", "WrongPass!2026");
    await click("인증했어요, 번호 바꾸기");
    await click("번호 다시 적기");
    await click("카카오톡으로 인증 요청 보내기");
    api.sendPhoneChange.mockResolvedValueOnce({ kind: "ok" });
    typeInto("지금 비밀번호", "RightPass!2026");
    await click("인증했어요, 번호 바꾸기");

    expect(api.checkPhoneChangeVerification).toHaveBeenCalledTimes(2);
  });
});
