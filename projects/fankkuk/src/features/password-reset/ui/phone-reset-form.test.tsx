import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESET_CLOSED, RESET_CODE_SENT_MESSAGE, RESET_TICKET_EXPIRED } from "../model/reset-messages";
import { PhoneResetForm } from "./phone-reset-form";

const TEST_PW = "new-pass-1234!";

// 휴대폰 비밀번호 찾기 카드(session-login INV-L10·L11, UX 명세 docs/ux/pages/password-forgot.md) — 세 단계가 한 카드에서 바뀐다.
// 서버 응답은 fetch 를 바꿔 준다. 판정은 서버가 하고 이 화면은 받은 문장과 단계만 그린다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const onDone = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  onDone.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  act(() => root.render(<PhoneResetForm onDone={onDone} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

function type(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error("칸이 없다");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent === label);
  if (!b) throw new Error(`버튼 없음: ${label}`);
  return b;
}

async function press(label: string) {
  act(() => button(label).click());
  await settle();
}

const phoneInput = () => host.querySelector<HTMLInputElement>('input[type="tel"]');
const codeInput = () => host.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]');
const pwInputs = () => host.querySelectorAll<HTMLInputElement>('input[type="password"]');

async function reachCode() {
  fetchMock.mockImplementationOnce(() => reply(200, { message: RESET_CODE_SENT_MESSAGE }));
  type(phoneInput(), "010-5555-6666");
  await press("인증번호 받기");
}

async function reachPassword() {
  await reachCode();
  fetchMock.mockImplementationOnce(() => reply(200, { status: "verified" }));
  type(codeInput(), "123456");
  await press("확인");
}

describe("INV-L10: 인증번호 받기 단계", () => {
  it("INV-L10: 처음에는 번호 칸과 「인증번호 받기」만 — 인증번호·새 비밀번호 칸이 없다", () => {
    expect(phoneInput()).not.toBeNull();
    expect(codeInput()).toBeNull();
    expect(pwInputs()).toHaveLength(0);
    expect(host.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("INV-L10: 받기 응답이 오면 서버 문장 하나를 초록 상자에, 인증번호 칸·다시 받기·고객센터 이메일 안내", async () => {
    await reachCode();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/password/reset/code");
    const ok = host.querySelector(".okmsg");
    expect(ok?.textContent).toBe(RESET_CODE_SENT_MESSAGE);
    expect(codeInput()).not.toBeNull();
    expect(button("인증번호 다시 받기")).toBeTruthy();
    expect(host.querySelector('a[href="mailto:support@fankkuk.com"]')).not.toBeNull();
  });

  it("INV-L10 (실패경로): 번호 꼴 오류(400)면 번호 칸 아래 한 줄, 인증번호 칸은 열리지 않는다", async () => {
    fetchMock.mockImplementationOnce(() => reply(400, { reason: "phone", message: "휴대폰 번호를 확인해 주세요." }));
    type(phoneInput(), "02-123");
    await press("인증번호 받기");
    expect(codeInput()).toBeNull();
    expect(phoneInput()?.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("휴대폰 번호를 확인해 주세요.");
  });

  it("INV-L10 (실패경로): 틀린 인증번호는 인증번호 칸 아래에 서버 문장, 단계는 그대로", async () => {
    await reachCode();
    fetchMock.mockImplementationOnce(() => reply(400, { reason: "wrong", remaining: 4, message: "인증번호가 맞지 않습니다. 남은 횟수 4회" }));
    type(codeInput(), "000000");
    await press("확인");
    expect(host.textContent).toContain("인증번호가 맞지 않습니다. 남은 횟수 4회");
    expect(codeInput()?.getAttribute("aria-invalid")).toBe("true");
    expect(pwInputs()).toHaveLength(0);
  });

  it("INV-TS2 (실패경로, UX closed): 받기 응답이 닫힘(503 closed)이면 그 문장과 고객센터 메일 링크만 — 번호 칸·받기 버튼이 사라진다", async () => {
    fetchMock.mockImplementationOnce(() => reply(503, { reason: "closed", message: RESET_CLOSED }));
    type(phoneInput(), "010-5555-6666");
    await press("인증번호 받기");
    expect(host.textContent).toContain(RESET_CLOSED);
    expect(phoneInput()).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.querySelector('a[href^="mailto:"]')).not.toBeNull();
  });

  it("INV-TS2 (실패경로, UX closed): 인증번호 확인 중에 닫힘이 와도 같은 이용 불가 화면 — 인증번호 칸·다시 받기가 사라진다", async () => {
    await reachCode();
    fetchMock.mockImplementationOnce(() => reply(503, { reason: "closed", message: RESET_CLOSED }));
    type(codeInput(), "123456");
    await press("확인");
    expect(host.textContent).toContain(RESET_CLOSED);
    expect(codeInput()).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.querySelector('a[href^="mailto:"]')).not.toBeNull();
  });

  it("INV-L10: 인증번호 단계에서 번호를 고치면 처음 단계로 — 인증번호 칸이 사라진다", async () => {
    await reachCode();
    type(phoneInput(), "010-5555-7777");
    expect(codeInput()).toBeNull();
  });
});

describe("INV-L11: 새 비밀번호 단계", () => {
  it("INV-L11: 인증번호가 맞으면 번호·인증번호 칸은 지우고 「휴대폰 번호를 확인했습니다.」와 새 비밀번호 두 칸", async () => {
    await reachPassword();
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/auth/password/reset/code/check");
    expect(JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body))).toEqual({ phone: "010-5555-6666", code: "123456" });
    expect(phoneInput()).toBeNull();
    expect(codeInput()).toBeNull();
    expect(pwInputs()).toHaveLength(2);
    expect(host.textContent).toContain("휴대폰 번호를 확인했습니다.");
    expect(host.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("INV-L11: 저장 요청 본문에는 새 비밀번호 두 칸뿐 — 표·번호를 싣지 않는다(표는 쿠키)", async () => {
    await reachPassword();
    fetchMock.mockImplementationOnce(() => reply(200, { ok: true }));
    type(pwInputs()[0]!, TEST_PW);
    type(pwInputs()[1]!, TEST_PW);
    await press("비밀번호 바꾸기");
    expect(fetchMock.mock.calls[2]![0]).toBe("/api/auth/password/reset");
    expect(JSON.parse(String((fetchMock.mock.calls[2]![1] as RequestInit).body))).toEqual({ password: TEST_PW, passwordConfirm: TEST_PW });
    expect(host.textContent).toContain("비밀번호를 바꿨습니다.");
    expect(host.textContent).toContain("모든 기기에서 로그아웃됐습니다.");
    expect(host.querySelector('a[href="/login"]')?.textContent).toBe("로그인");
    expect(pwInputs()).toHaveLength(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("INV-L11 (실패경로): 비밀번호 규칙 위반은 그 칸 아래 한 줄, 단계는 그대로", async () => {
    await reachPassword();
    fetchMock.mockImplementationOnce(() => reply(400, { field: "passwordConfirm", message: "비밀번호가 일치하지 않습니다." }));
    type(pwInputs()[0]!, TEST_PW);
    type(pwInputs()[1]!, "other-pass-1234!");
    await press("비밀번호 바꾸기");
    expect(pwInputs()[1]!.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("비밀번호가 일치하지 않습니다.");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("INV-L11 S9b (실패경로): 표가 만료됐으면 빨간 상자와 「처음부터」 — 누르면 빈 번호 칸으로", async () => {
    await reachPassword();
    fetchMock.mockImplementationOnce(() => reply(400, { field: "ticket", message: RESET_TICKET_EXPIRED }));
    type(pwInputs()[0]!, TEST_PW);
    type(pwInputs()[1]!, TEST_PW);
    await press("비밀번호 바꾸기");
    expect(host.querySelector(".err")?.textContent).toBe(RESET_TICKET_EXPIRED);
    expect(pwInputs()).toHaveLength(0);
    await press("처음부터");
    expect(phoneInput()?.value).toBe("");
    expect(host.querySelector(".err")).toBeNull();
  });
});
