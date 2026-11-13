import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { CreatorSettingsPage } from "./creator-settings-page";

// 상세 설정 /creator/settings — 2026-11-13 재분류(UX 명세 creator-profile 「바뀌는 것」): 팬덤 구역(팬덤 이름·팬마크·테마 색)과
// 선물 링크 주소는 프로필 수정 「채널」 탭으로 옮겼다. 이 화면에는 승인 서명·받는 주소·받기 설정·차단한 팬·감사 답장만 남는다.

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
        receiving={{ resumeOn: null, monthlyLimit: null, birthday: null, anniversaries: [] }}
        hardItems={null}
        today={{ year: 2026, month: 11, day: 13 }}
        replySettings={{ wallVisible: false, xHandle: null, xTagAllowed: false }}
        signatureLink={{ linked: false, linkedAt: null }}
      />,
    ),
  );
}

const foldTitles = () => [...host.querySelectorAll("details > summary > span:first-child")].map((el) => el.textContent?.trim());

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

  it("묶음 이름 「주소와 설정」은 낭독용(sr-only)만 — h1 아래 보이는 제목을 한 번 더 두지 않는다(2026-11-13 ui 리뷰)", () => {
    render();
    const h2s = [...host.querySelectorAll("h2")].filter((h) => !h.closest("dialog"));
    expect(h2s.map((h) => [h.textContent?.trim(), h.className])).toEqual([["주소와 설정", "sr-only"]]);
    expect(document.getElementById(host.querySelector("#more")!.getAttribute("aria-labelledby")!)).toBe(h2s[0]);
  });

  it("남는 접힌 칸은 받는 주소 → 받기 설정 → 차단한 팬 → 감사 답장", () => {
    render();
    expect(foldTitles()).toEqual(["받는 주소", "받기 설정", "차단한 팬", "감사 답장"]);
    expect(host.querySelector("h1")?.textContent).toBe("상세 설정");
  });
});
