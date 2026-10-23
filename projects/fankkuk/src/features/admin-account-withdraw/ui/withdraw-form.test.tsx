import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 대표의 「회원 탈퇴」 칸 (my-account INV-A15, UX 명세 docs/ux/pages/admin-inquiries.md 상태표).
// 서버 호출(postWithdraw)만 가짜로 둔다 — 시험 대상은 상태마다 무엇이 보이고 무엇을 보내는지다.
const api = vi.hoisted(() => ({ postWithdraw: vi.fn() }));
vi.mock("../api/post-withdraw-client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { WithdrawForm } from "./withdraw-form";

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

const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent);
const button = (name: string) => {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent === name);
  if (!found) throw new Error(`버튼 없음: ${name} (있는 버튼: ${buttons().join(", ")})`);
  return found;
};
const click = async (name: string) => {
  await act(async () => {
    button(name).click();
  });
};
const input = () => host.querySelector<HTMLInputElement>("#account-withdraw-id");
function type(value: string) {
  const el = input()!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("대표의 회원 탈퇴 칸 (INV-A15)", () => {
  it("INV-A15 closed: 칸 제목 「회원 탈퇴」와 「회원 탈퇴 처리하기」 버튼만 — 아이디 칸·확인 문장은 없다", () => {
    act(() => root.render(<WithdrawForm />));
    expect(host.querySelector("h2")?.textContent).toBe("회원 탈퇴");
    expect(buttons()).toEqual(["회원 탈퇴 처리하기"]);
    expect(input()).toBeNull();
    expect(host.textContent).not.toContain("되돌릴 수 없어요");
  });

  it("INV-A15 open → confirm → done: 아이디를 적고 「탈퇴 처리」를 누르면 바로 보내지 않고 되돌릴 수 없다고 한 번 더 묻는다. 확정하면 소문자 아이디를 보내고 처리했다고 알린다", async () => {
    act(() => root.render(<WithdrawForm />));
    await click("회원 탈퇴 처리하기");
    expect(buttons()).toEqual(["탈퇴 처리", "닫기"]);
    expect(document.activeElement).toBe(input());
    type("  Byeolbit_Fan ");
    await click("탈퇴 처리");
    expect(api.postWithdraw).not.toHaveBeenCalled();
    expect(host.textContent).toContain("byeolbit_fan 계정을 탈퇴 처리할까요? 되돌릴 수 없어요.");
    expect(buttons()).toEqual(["탈퇴 처리", "취소"]);
    expect(input()).toBeNull();
    api.postWithdraw.mockResolvedValueOnce({ kind: "ok", body: { ok: true } });
    await click("탈퇴 처리");
    expect(api.postWithdraw).toHaveBeenCalledTimes(1);
    expect(api.postWithdraw).toHaveBeenCalledWith({ loginId: "byeolbit_fan" });
    expect(host.textContent).toContain("byeolbit_fan 계정을 탈퇴 처리했어요.");
    expect(buttons()).toEqual(["회원 탈퇴 처리하기"]);
    expect(document.activeElement).toBe(button("회원 탈퇴 처리하기"));
  });

  it("INV-A15 confirm → 취소: 보내지 않고 아이디를 적은 채 열린 칸으로 돌아간다", async () => {
    act(() => root.render(<WithdrawForm />));
    await click("회원 탈퇴 처리하기");
    type("byeolbit_fan");
    await click("탈퇴 처리");
    await click("취소");
    expect(api.postWithdraw).not.toHaveBeenCalled();
    expect(input()?.value).toBe("byeolbit_fan");
    expect(buttons()).toEqual(["탈퇴 처리", "닫기"]);
  });

  it("INV-A15 (실패경로) error: 서버가 거절하면 열린 칸에 거절 문장 한 줄과 함께 돌아가고, 처리했다는 문장은 없다", async () => {
    act(() => root.render(<WithdrawForm />));
    await click("회원 탈퇴 처리하기");
    type("haru_creator");
    await click("탈퇴 처리");
    api.postWithdraw.mockResolvedValueOnce({ kind: "failed", status: 409, message: "진행 중인 선물이나 역조공이 있어 탈퇴할 수 없어요. 먼저 끝내 주세요.", field: null });
    await click("탈퇴 처리");
    expect(host.textContent).toContain("진행 중인 선물이나 역조공이 있어 탈퇴할 수 없어요. 먼저 끝내 주세요.");
    expect(host.textContent).not.toContain("탈퇴 처리했어요");
    expect(input()?.value).toBe("haru_creator");
    expect(input()?.getAttribute("aria-invalid")).toBe("true");
    expect(buttons()).toEqual(["탈퇴 처리", "닫기"]);
  });

  it("INV-A15 (실패경로): 아이디 꼴이 틀리면(비었거나 짧음) 확인을 묻지 않고 아이디 안내를 띄운다", async () => {
    act(() => root.render(<WithdrawForm />));
    await click("회원 탈퇴 처리하기");
    await click("탈퇴 처리");
    expect(host.textContent).toContain("아이디를 영문 소문자·숫자·밑줄 4~30자로 적어 주세요.");
    expect(host.textContent).not.toContain("되돌릴 수 없어요");
    type("ab");
    await click("탈퇴 처리");
    expect(host.textContent).not.toContain("되돌릴 수 없어요");
    expect(api.postWithdraw).not.toHaveBeenCalled();
  });

  it("INV-A15: 처리됐지만 사진을 지우지 못했다는 답이면 처리 문장과 그 안내를 같이 보인다", async () => {
    act(() => root.render(<WithdrawForm />));
    await click("회원 탈퇴 처리하기");
    type("byeolbit_fan");
    await click("탈퇴 처리");
    api.postWithdraw.mockResolvedValueOnce({ kind: "ok", body: { ok: true, message: "탈퇴는 처리됐지만 사진을 지우지 못했어요. 개발 담당에게 알려 주세요." } });
    await click("탈퇴 처리");
    expect(host.textContent).toContain("byeolbit_fan 계정을 탈퇴 처리했어요.");
    expect(host.textContent).toContain("사진을 지우지 못했어요");
  });

  it("INV-A15: 「닫기」를 누르면 적던 아이디를 지우고 닫힌 칸으로, 포커스는 「회원 탈퇴 처리하기」로 돌아간다", async () => {
    act(() => root.render(<WithdrawForm />));
    await click("회원 탈퇴 처리하기");
    type("byeolbit_fan");
    await click("닫기");
    expect(input()).toBeNull();
    expect(document.activeElement).toBe(button("회원 탈퇴 처리하기"));
    await click("회원 탈퇴 처리하기");
    expect(input()?.value).toBe("");
  });
});
