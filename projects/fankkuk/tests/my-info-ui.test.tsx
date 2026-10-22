import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import type { MyAccount } from "@/entities/fan/model/my-account";
import { FAN_PROFILE_EDIT } from "@/entities/session/model/home-path";
import { MyInfoPanel } from "@/widgets/my-info/ui/my-info-page";

// 계정 설정(팬) /me — 정돈 시범(design-rules 27절, 카드 d114, 시안 pilot-2026-10-22/me.html).
// 카드 없이 묶음 넷: 보안 → 받을 주소 → 개인정보 → 알림 → 저장 줄 → 회원 탈퇴. 동작은 그대로, 배치만 바뀌었다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const account: MyAccount = {
  loginId: "byeolbit_fan",
  nickname: "별빛",
  email: "fan@example.com",
  pendingEmail: null,
  phoneMasked: "010-****-5678",
  notifyKakao: true,
  notifyEmail: false,
};
const registered: MyFanAddressStatus = { registered: true, label: "home", updatedAt: "2026-10-22T03:00:00.000Z" };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(props: Partial<Parameters<typeof MyInfoPanel>[0]> = {}) {
  act(() => {
    root.render(<MyInfoPanel account={account} accountId="00000000-0000-4000-a000-000000000001" address={registered} sealingKeyPem={null} {...props} />);
  });
}

const sectionTitles = () => [...host.querySelectorAll("section")].map((sec) => sec.querySelector("h2")?.textContent?.trim());
const saveForm = () => host.querySelector("form") as HTMLFormElement;
const buttonByText = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

describe("계정 설정(팬) — 묶음 순서", () => {
  it("묶음은 보안 → 받을 주소 → 개인정보 → 알림 순이다", () => {
    render();
    expect(sectionTitles()).toEqual(["보안", "받을 주소", "개인정보", "알림"]);
  });

  it("저장 줄은 알림 바로 뒤, 그 위가 개인정보(이메일)다 — 저장하기가 보내는 칸이 저장 줄 바로 위에 있다", () => {
    render();
    const form = saveForm();
    expect(form.textContent).toContain("저장하기");
    const notify = form.previousElementSibling as HTMLElement;
    expect(notify.querySelector("h2")?.textContent?.trim()).toBe("알림");
    expect(notify.querySelectorAll('[role="switch"]')).toHaveLength(2);
    const personal = notify.previousElementSibling as HTMLElement;
    expect(personal.querySelector("h2")?.textContent?.trim()).toBe("개인정보");
    expect(personal.querySelector('input[name="email"]')).not.toBeNull();
  });

  it("회원 탈퇴는 저장 줄 뒤에 있고, 묶음 안에는 없다", () => {
    render();
    const after = saveForm().nextElementSibling as HTMLElement;
    expect(after).not.toBeNull();
    expect(after.textContent).toContain("회원 탈퇴");
    expect(after.querySelector("button")?.textContent?.trim()).toBe("탈퇴하기");
    for (const sec of host.querySelectorAll("section")) expect(sec.textContent).not.toContain("탈퇴하기");
  });

  it("탈퇴하기를 누르면 그 아래 탈퇴 문의 링크가 펼쳐진다", () => {
    render();
    const leave = buttonByText("탈퇴하기")!;
    expect(leave.getAttribute("aria-expanded")).toBe("false");
    act(() => leave.click());
    expect(leave.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector('a[href="/support"]')?.textContent?.trim()).toBe("탈퇴 문의");
  });
});

describe("계정 설정(팬) — 뺀 문장과 남은 칸", () => {
  it("「아이디는 바꿀 수 없어요 …」 문장과 그 안 프로필 수정 링크는 없고, 머리의 프로필 수정 버튼은 그대로다", () => {
    render();
    expect(host.textContent).not.toContain("아이디는 바꿀 수 없어요");
    const editLinks = host.querySelectorAll(`a[href="${FAN_PROFILE_EDIT}"]`);
    expect(editLinks).toHaveLength(1);
    expect(editLinks[0].closest("header")).not.toBeNull();
    expect(host.querySelector(".ph-desc")?.textContent).toBe("로그인·받을 주소·알림에 관한 설정이에요. 닉네임은 프로필 수정에서 바꿔요.");
  });

  it("아이디는 개인정보 묶음에 이름·값으로 보인다", () => {
    render();
    const dl = host.querySelector("dl")!;
    expect(dl.querySelector("dt")?.textContent).toBe("아이디");
    expect(dl.querySelector("dd")?.textContent).toBe("byeolbit_fan");
  });

  it("이메일 칸은 묶음 안에 있지만 form 속성으로 저장 폼에 붙어 저장하기가 함께 보낸다", () => {
    render();
    const input = host.querySelector('input[name="email"]') as HTMLInputElement;
    const form = saveForm();
    expect(form.contains(input)).toBe(false);
    expect(input.getAttribute("form")).toBe(form.id);
    expect(new FormData(form).get("email")).toBe("fan@example.com");
  });

  it("이메일 변경 대기 중이면 보조 글이 대기 안내로 바뀐다", () => {
    render({ account: { ...account, pendingEmail: "new@example.com" } });
    const input = host.querySelector('input[name="email"]') as HTMLInputElement;
    const help = document.getElementById(input.getAttribute("aria-describedby")!)!;
    expect(help.textContent).toBe("새 주소(new@example.com)로 확인 메일을 보냈어요. 메일의 링크를 누르면 그 주소로 바뀌어요.");
  });
});

describe("계정 설정(팬) — 받을 주소 상태", () => {
  it("등록돼 있으면 바꾸기·지우기, 지우기를 누르면 그 아래 확인 칸이 펼쳐진다", () => {
    render();
    expect(buttonByText("바꾸기") ?? null).not.toBeNull();
    const del = buttonByText("지우기")!;
    act(() => del.click());
    // 확인 칸은 지우기 버튼이 가리키는 자리에 펼쳐진다
    const panel = document.getElementById(del.getAttribute("aria-controls")!)!;
    expect(panel.textContent).toContain("이미 받기를 누른 선물은 그때 등록한 주소로 가요.");
    expect(buttonByText("주소 지우기")).toBeDefined();
  });

  it("없으면 「등록한 주소가 없어요」와 등록하기만", () => {
    render({ address: { registered: false, label: null, updatedAt: null } });
    expect(host.querySelector("[data-address-on-file]")?.textContent).toBe("등록한 주소가 없어요");
    expect(buttonByText("등록하기")).toBeDefined();
    expect(buttonByText("지우기")).toBeUndefined();
  });

  it("읽지 못했으면 안내만 있고 버튼이 없다", () => {
    render({ address: null });
    expect(host.querySelector("[data-address-on-file]")?.textContent).toBe("받을 주소를 읽지 못했어요");
    expect(host.querySelectorAll('[data-me-group="address"] button').length).toBe(0);
  });
});

describe("계정 설정(팬) — 알림", () => {
  it("스위치는 줄 전체가 버튼이다 — 이름·설명이 버튼 안에 있고 role·aria 는 그대로", () => {
    render();
    const [kakao, mail] = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    const label = document.getElementById(kakao.getAttribute("aria-labelledby")!)!;
    expect(kakao.contains(label)).toBe(true);
    expect(label.textContent).toContain("카카오 알림톡으로 받기");
    expect(label.textContent).toContain("승인·배송처럼 선물 소식을 카카오톡으로 받아요.");
    expect(kakao.getAttribute("aria-checked")).toBe("true");
    expect(mail.getAttribute("aria-checked")).toBe("false");
    act(() => mail.click());
    expect(mail.getAttribute("aria-checked")).toBe("true");
  });

  it("되돌리기를 누르면 스위치 둘과 이메일 칸(저장 폼 밖, form 속성으로 붙음)이 처음 값으로 돌아간다", () => {
    render();
    const [kakao, mail] = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    const email = host.querySelector<HTMLInputElement>('input[type="email"]')!;
    const first = email.value;
    act(() => kakao.click());
    act(() => mail.click());
    email.value = "changed@example.com";
    act(() => buttonByText("되돌리기")!.click());
    expect(kakao.getAttribute("aria-checked")).toBe("true");
    expect(mail.getAttribute("aria-checked")).toBe("false");
    expect(email.value).toBe(first);
  });

  it("끌 수 없는 알림은 접지 않고 알림 묶음 안에 제목과 목록 문장으로 늘 보인다", () => {
    render();
    const notify = saveForm().previousElementSibling as HTMLElement;
    const must = notify.querySelector("strong")!;
    expect(must.textContent).toBe("끌 수 없는 알림");
    expect(must.closest("details")).toBeNull();
    const body = must.nextElementSibling as HTMLElement;
    expect(body.textContent).toContain("꺼 두어도 가요.");
  });

  it("저장 결과 안내 자리(role=alert·status)는 저장 폼 안에 늘 있다", () => {
    render();
    const form = saveForm();
    expect(form.querySelector('[role="alert"]')).not.toBeNull();
    expect(form.querySelector('[role="status"]')).not.toBeNull();
  });
});
