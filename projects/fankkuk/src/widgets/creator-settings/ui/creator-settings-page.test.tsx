import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { CreatorSettingsPage } from "./creator-settings-page";

// 상세 설정 /creator/settings — 2026-11-13 재분류(UX 명세 creator-profile 「바뀌는 것」): 팬덤 구역(팬덤 이름·팬마크·테마 색)과
// 선물 링크 주소는 프로필 수정 「채널」 탭으로 옮겼다. 같은 날 이 화면 이름을 「계정 설정」으로 바꾸고 보안·회원 탈퇴를 선물 받기 설정들 뒤에 두었다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function render() {
  act(() =>
    root.render(
      <CreatorSettingsPage
        address={{ creatorId: "00000000-0000-4000-a000-000000000009", registered: false, label: null, updatedAt: null }}
        sealingKeyPem={null}
        blockedFans={[]}
        receiving={{ resumeOn: null, birthday: null, anniversaries: [] }}
        hardItems={null}
        today={{ year: 2026, month: 11, day: 13 }}
        signatureLink={{ linked: false, linkedAt: null }}
        security={<div data-x="security">보안 줄</div>}
        leave={<div data-x="leave">탈퇴 문의</div>}
      />,
    ),
  );
}

// 2026-11-14 재디자인: 칸 이름 앞에 동그라미 아이콘이 붙어 이름 칸은 [data-fold-name] 로 찾는다
const foldTitles = () => [...host.querySelectorAll("details > summary > [data-fold-name]")].map((el) => el.textContent?.trim());

describe("상세 설정 — 팬덤·선물 링크 구역이 빠진다 (2026-11-13 재분류)", () => {
  it("팬덤 구역(팬덤 이름·팬마크·테마 색)이 없다", () => {
    render();
    expect(host.querySelector("#fandom")).toBeNull();
    for (const id of ["fd-name", "fd-sym", "fd-rights"]) expect(host.querySelector(`#${id}`)).toBeNull();
    expect(host.textContent).not.toContain("팬덤 이름");
    expect(host.textContent).not.toContain("팬마크");
    expect(host.querySelector('input[name="fd-theme"]')).toBeNull();
  });

  it("선물 링크 주소 칸이 없다", () => {
    render();
    expect(host.querySelector("#link")).toBeNull();
    expect(host.querySelector("#link-handle")).toBeNull();
    expect(host.querySelector("#gift-link")).toBeNull();
    expect(foldTitles()).not.toContain("선물 링크");
  });

  it("묶음은 화면 전체 — 따로 제목(h2)을 두지 않고 h1 「계정 설정」으로 이름을 읽는다(2026-11-13 ux 리뷰)", () => {
    render();
    expect([...host.querySelectorAll("h2")].filter((h) => !h.closest("dialog"))).toHaveLength(0);
    expect(document.getElementById(host.querySelector("#more")!.getAttribute("aria-labelledby")!)).toBe(host.querySelector("h1"));
  });

  it("머리 설명 목록은 화면에 나오는 순서 — 맨 위 카카오톡 인증 알림 줄부터 회원 탈퇴까지", () => {
    render();
    expect(host.querySelector("header p")?.textContent).toBe("카카오톡 인증 알림·주소 설정·선물 받기·차단한 팬·보안·회원 탈퇴를 관리합니다.");
    // 설명의 첫 항목이 실제로 화면 맨 위 줄이다
    expect(host.querySelector("#more [data-signature-link]")?.textContent).toContain("카카오톡 인증 알림");
  });

  it("제목은 「계정 설정」(옛 상세 설정 — 2026-11-13 이름 바꿈)", () => {
    render();
    expect(host.querySelector("h1")?.textContent).toBe("계정 설정");
  });

  it("접힌 칸은 주소 설정 → 받기 설정 → 차단한 팬 → 보안 → 회원 탈퇴(X 공유 설정 칸은 없다) — 보안·탈퇴는 선물 받기 설정들 뒤, 같은 접힌 칸 모양", () => {
    render();
    expect(foldTitles()).toEqual(["주소 설정", "받기 설정", "차단한 팬", "보안", "회원 탈퇴"]);
    const security = host.querySelector<HTMLDetailsElement>("details#security")!;
    const leave = host.querySelector<HTMLDetailsElement>("details#leave")!;
    expect(security.className).toBe(host.querySelector("details#blocked")!.className);
    expect(leave.className).toBe(security.className);
    expect(security.querySelector("[data-x='security']")).not.toBeNull();
    expect(leave.querySelector("[data-x='leave']")).not.toBeNull();
  });

  it("받기 설정 칸에는 선물 받기 · 받기 어려운 선물만 — 생일·기념일(2026-11-14 프로필 탭으로)과 팬당 월 선물 한도(같은 날 없앰)는 없다", () => {
    render();
    const recv = host.querySelector<HTMLDetailsElement>("details#receiving")!;
    expect(recv.querySelector("#recv")).not.toBeNull();
    expect(recv.querySelector("#days")).toBeNull();
    expect(host.textContent).not.toContain("생일");
    expect(host.textContent).not.toContain("선물 한도");
    expect(host.querySelector("#recv-limit")).toBeNull();
  });
});
