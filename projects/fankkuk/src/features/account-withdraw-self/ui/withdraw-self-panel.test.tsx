import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("../api/withdraw-self-client", () => ({ sendWithdrawSelf: (...args: unknown[]) => send(...args) }));

import { CURRENT_PASSWORD_EMPTY } from "@/entities/session/model/password-rule";
import { WithdrawSelfPanel } from "./withdraw-self-panel";

// 계정 설정의 본인 탈퇴 칸(my-account INV-A17) — 화면은 판정하지 않는다. 비밀번호 → 확인 질문 → 서버, 막히면 서버의 이유와 링크, 끝나면 첫 화면.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

let host: HTMLDivElement;
let root: Root;
const assign = vi.fn();
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  send.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => {});
const input = () => host.querySelector<HTMLInputElement>('input[type="password"]')!;
const form = () => host.querySelector("form")!;
const dialog = () => host.querySelector("dialog")!;
const dialogButton = (text: string) => [...dialog().querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

function typePassword(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = () => act(() => form().requestSubmit());

function render(role: "fan" | "creator" = "fan", onLoginExpired = vi.fn()) {
  act(() => root.render(<WithdrawSelfPanel role={role} onLoginExpired={onLoginExpired} />));
  return onLoginExpired;
}

describe("INV-A17: 본인 탈퇴 칸", () => {
  it("INV-A17: 지워지는 것·남는 것 두 줄, 라벨이 붙은 현재 비밀번호 칸, 「탈퇴」 버튼 — 확인 창은 닫혀 있다", () => {
    render();
    expect([...host.querySelectorAll("li")].map((l) => l.textContent)).toEqual([
      "닉네임·연락처·주소·프로필(사진·배경 사진·소개)은 바로 삭제됩니다.",
      "주문·결제 기록은 주문번호만 남겨 정해진 기간 동안 보관합니다.",
    ]);
    const label = host.querySelector("label")!;
    expect(label.textContent).toBe("현재 비밀번호");
    expect(label.htmlFor).toBe(input().id);
    expect(form().querySelector('button[type="submit"]')?.textContent?.trim()).toBe("탈퇴");
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("INV-A17: 크리에이터 칸은 채널 정보도 지워진다고 적는다", () => {
    render("creator");
    expect(host.querySelector("li")?.textContent).toContain("채널 정보");
  });

  it("INV-A17 S17b (실패경로): 비밀번호를 비운 채 누르면 확인 창 없이 안내하고 서버에 보내지 않는다", () => {
    render();
    submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(CURRENT_PASSWORD_EMPTY);
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(dialog().hasAttribute("open")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("INV-A17 S17: 비밀번호를 넣고 누르면 되돌릴 수 없다는 확인 질문 — 「닫기」면 보내지 않는다", () => {
    render();
    typePassword("pw-1234");
    submit();
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(dialog().textContent).toContain("탈퇴할까요?");
    expect(dialog().textContent).toContain("되돌릴 수 없습니다");
    act(() => dialogButton("닫기").click());
    expect(dialog().hasAttribute("open")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("INV-A17 S17: 확인 창의 「탈퇴」를 누르면 지금 비밀번호만 보내고, 끝나면 첫 화면을 새로 연다", async () => {
    send.mockResolvedValue({ kind: "ok" });
    render();
    typePassword("pw-1234");
    submit();
    act(() => dialogButton("탈퇴").click());
    await flush();
    expect(send).toHaveBeenCalledWith("pw-1234");
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("INV-A17 S17c (실패경로): 막히면 서버의 이유와 링크를 보여 주고 첫 화면으로 가지 않는다", async () => {
    send.mockResolvedValue({ kind: "failed", message: "진행 중인 선물이 있어 탈퇴할 수 없습니다.", field: null, links: [{ href: "/gifts", label: "보낸 선물" }] });
    render();
    typePassword("pw-1234");
    submit();
    act(() => dialogButton("탈퇴").click());
    await flush();
    const alert = host.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("진행 중인 선물이 있어 탈퇴할 수 없습니다.");
    expect([...alert.querySelectorAll("a")].map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual([["보낸 선물", "/gifts"]]);
    expect(dialog().hasAttribute("open")).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("INV-A17 S17b (실패경로): 비밀번호가 틀리면 칸을 비우고 칸에 오류 표시, 로그인이 끝났으면 로그인으로", async () => {
    send.mockResolvedValue({ kind: "failed", message: "현재 비밀번호가 올바르지 않습니다.", field: "currentPassword", links: [] });
    const toLogin = render();
    typePassword("wrong");
    submit();
    act(() => dialogButton("탈퇴").click());
    await flush();
    expect(input().value).toBe("");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector('[role="alert"] a')).toBeNull();

    send.mockResolvedValue({ kind: "login" });
    typePassword("pw-1234");
    submit();
    act(() => dialogButton("탈퇴").click());
    await flush();
    expect(toLogin).toHaveBeenCalled();
  });
});
