import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 서버와 주고받는 세 호출만 가짜로 둔다 — 시험 대상은 화면이 언제 무엇을 보내는지다.
const api = vi.hoisted(() => ({
  requestPhoneChangeCode: vi.fn(),
  checkPhoneChangeCode: vi.fn(),
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
  api.requestPhoneChangeCode.mockResolvedValue({ kind: "ok" });
  api.checkPhoneChangeCode.mockResolvedValue({ kind: "ok" });
  typeInto("새 휴대폰 번호", "01055502006");
  await click("인증번호 받기");
  typeInto("인증번호", "123456");
  await click("확인");
}

const alertText = () => host.querySelector('[role="alert"]')?.textContent;
const labels = () => [...host.querySelectorAll("label")].map((l) => l.textContent);

describe("번호 바꾸기 화면 — 문자 인증번호 (signup INV-U12)", () => {
  it("INV-U12: 인증번호 받기 → 확인 → 현재 비밀번호 → 변경 순서로만 칸이 열린다", async () => {
    act(() => root.render(<PhoneChangePanel id="p" onLoginExpired={() => {}} onChanged={() => {}} />));
    expect(labels()).toEqual(["새 휴대폰 번호"]);
    api.requestPhoneChangeCode.mockResolvedValue({ kind: "ok" });
    typeInto("새 휴대폰 번호", "01055502006");
    await click("인증번호 받기");
    expect(api.requestPhoneChangeCode).toHaveBeenCalledWith("01055502006");
    expect(labels()).toEqual(["새 휴대폰 번호", "인증번호"]);

    api.checkPhoneChangeCode.mockResolvedValue({ kind: "ok" });
    typeInto("인증번호", "12a3456");
    await click("확인");
    expect(api.checkPhoneChangeCode).toHaveBeenCalledWith("123456");
    expect(labels()).toEqual(["새 휴대폰 번호", "현재 비밀번호"]);

    api.sendPhoneChange.mockResolvedValue({ kind: "ok" });
    typeInto("현재 비밀번호", "RightPass!2026");
    await click("번호 변경");
    expect(api.sendPhoneChange).toHaveBeenCalledWith("01055502006", "RightPass!2026");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("휴대폰 번호가 변경되었습니다.");
  });

  it("INV-U10 (실패경로): 인증번호가 틀리면 서버 문구를 보여 주고 비밀번호 칸을 열지 않는다", async () => {
    act(() => root.render(<PhoneChangePanel id="p" onLoginExpired={() => {}} onChanged={() => {}} />));
    api.requestPhoneChangeCode.mockResolvedValue({ kind: "ok" });
    typeInto("새 휴대폰 번호", "01055502006");
    await click("인증번호 받기");
    api.checkPhoneChangeCode.mockResolvedValue({ kind: "failed", field: "code", message: "인증번호가 맞지 않습니다. 남은 횟수 4회" });
    typeInto("인증번호", "000000");
    await click("확인");
    expect(alertText()).toBe("인증번호가 맞지 않습니다. 남은 횟수 4회");
    expect(labels()).not.toContain("현재 비밀번호");
    expect(api.sendPhoneChange).not.toHaveBeenCalled();
  });

  it("현재 비밀번호를 틀린 뒤 다시 누르면 인증번호를 다시 묻지 않고 바꾸기만 다시 보낸다", async () => {
    await startVerified();
    api.sendPhoneChange
      .mockResolvedValueOnce({ kind: "failed", field: "currentPassword", message: "현재 비밀번호가 일치하지 않습니다." })
      .mockResolvedValueOnce({ kind: "ok" });
    typeInto("현재 비밀번호", "WrongPass!2026");
    await click("번호 변경");
    expect(alertText()).toBe("현재 비밀번호가 일치하지 않습니다.");
    typeInto("현재 비밀번호", "RightPass!2026");
    await click("번호 변경");
    expect(api.checkPhoneChangeCode).toHaveBeenCalledTimes(1);
    expect(api.sendPhoneChange).toHaveBeenCalledTimes(2);
  });

  it("INV-U2 (실패경로): 바꾸기가 확인을 쓸 수 없다고 하면(10분 지남 등) 인증번호 받기부터 다시", async () => {
    await startVerified();
    api.sendPhoneChange.mockResolvedValue({ kind: "failed", field: "verification", message: "휴대폰 번호를 다시 확인해 주세요." });
    typeInto("현재 비밀번호", "RightPass!2026");
    await click("번호 변경");
    expect(alertText()).toBe("휴대폰 번호를 다시 확인해 주세요.");
    expect(labels()).toEqual(["새 휴대폰 번호"]);
    expect(button("인증번호 받기")).toBeTruthy();
  });

  it("「번호 다시 입력」을 누르면 번호 칸만 남는다", async () => {
    await startVerified();
    await click("번호 다시 입력");
    expect(labels()).toEqual(["새 휴대폰 번호"]);
  });
});

describe("번호 바꾸기 화면 — 남은 시간 (signup INV-U15)", () => {
  it("INV-U15: 받은 뒤 3:00 부터 줄고, 3분이 지나면 서버에 묻지 않고 만료 문구를 보이고 「확인」을 끈다", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
      act(() => root.render(<PhoneChangePanel id="p" onLoginExpired={() => {}} onChanged={() => {}} />));
      api.requestPhoneChangeCode.mockResolvedValue({ kind: "ok" });
      typeInto("새 휴대폰 번호", "01055502006");
      await click("인증번호 받기");
      expect(host.querySelector('[role="timer"]')?.textContent).toBe("03:00");
      act(() => vi.advanceTimersByTime(61_000));
      expect(host.querySelector('[role="timer"]')?.textContent).toBe("01:59");
      act(() => vi.advanceTimersByTime(120_000));
      expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:00");
      expect(alertText()).toBe("인증 시간이 지났습니다. 인증번호를 다시 받아 주세요.");
      expect(button("확인").getAttribute("aria-disabled")).toBe("true");
      await click("확인");
      expect(api.checkPhoneChangeCode).not.toHaveBeenCalled();
      // 다시 받으면 시계가 처음부터
      await click("다시 받기");
      expect(host.querySelector('[role="timer"]')?.textContent).toBe("03:00");
    } finally {
      vi.useRealTimers();
    }
  });
});
