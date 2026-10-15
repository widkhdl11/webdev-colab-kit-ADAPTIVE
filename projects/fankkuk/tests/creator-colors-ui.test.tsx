import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";

// 팬이 보는 크리에이터 페이지의 색 (creator-link INV-E13·E14, design-rules 12절 「팬덤 색」, 시안 v21-addendum3/cre-public-page.html).
// 퍼스널 컬러 = 맨 위 띠·프로필 사진 테두리, 팬컬러 = 팬덤 뱃지 면. 버튼은 사이트 색 그대로. DOM 으로 자리를 본다.

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

const card: CreatorCard = {
  id: "00000000-0000-4000-b000-000000000001",
  name: "하루",
  platform: "유튜브",
  tags: [],
  channelTitle: "하루 채널",
  intro: "안녕하세요",
  alias: "",
  approvalMinutes: 60,
  faceTone: "var(--face-1)",
  following: true,
  handle: "haru",
  photoPath: null,
};
const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400 }, medium: { priceKrw: 8900, revgiftPriceKrw: 6900 }, large: { priceKrw: 10900, revgiftPriceKrw: 8400 } };

function renderPage(colors: CreatorCard["colors"], fanName: string | null = "달빛지기", followMode: "login" | "save" = "login") {
  act(() =>
    root.render(
      <CreatorProfilePage
        creator={{ ...card, colors, photoUrl: null }}
        others={[]}
        followMode={followMode}
        send="open"
        prices={prices}
        prohibited={[]}
        monthFans={0}
        today={{ year: 2026, month: 10, day: 14 }}
        fanName={fanName}
      />,
    ),
  );
}

const head = () => host.querySelector<HTMLElement>("[data-creator-colors]");
const badge = () => host.querySelector<HTMLElement>("[data-fandom-badge]");

describe("크리에이터 페이지 — 색이 쓰이는 자리 (INV-E13)", () => {
  it("INV-E13 S12: 퍼스널 컬러는 머리(띠·사진 테두리 변수)에, 팬컬러는 이름 옆 팬덤 뱃지 면에", () => {
    for (const mode of ["login", "save"] as const) {
      renderPage({ personal: "#1E3A8A", fan: "#FFF59D" }, "달빛지기", mode);
      expect(head()?.style.getPropertyValue("--personal"), mode).toBe("#1E3A8A");
      expect(head()?.style.getPropertyValue("--fan"), mode).toBe("");
      expect(badge()?.style.getPropertyValue("--fan"), mode).toBe("#FFF59D");
      expect(badge()?.textContent, mode).toBe("달빛지기");
      // 뱃지는 공개 이름 바로 옆 줄
      expect(badge()?.closest("[data-name-line]")?.querySelector("h1")?.textContent, mode).toBe("하루");
    }
  });

  it("INV-E13 S12: 버튼(선물 보내기)에는 색 변수가 붙지 않는다 — 하늘색 규칙 그대로", () => {
    renderPage({ personal: "#1E3A8A", fan: "#FFF59D" });
    const send = [...host.querySelectorAll<HTMLAnchorElement>("a.btn")].find((a) => a.textContent === "선물 보내기")!;
    expect(send).toBeTruthy();
    for (let el: HTMLElement | null = send; el && el !== head(); el = el.parentElement) {
      expect(el.style.getPropertyValue("--personal")).toBe("");
      expect(el.style.getPropertyValue("--fan")).toBe("");
    }
  });

  it("INV-E13 (실패경로): 꼴이 틀린 색은 스타일에 들어가지 않는다 — 기본 모양", () => {
    renderPage({ personal: "#123456; background:url(x)", fan: "red" });
    expect(host.innerHTML).not.toContain("url(x)");
    expect(head()?.style.getPropertyValue("--personal")).toBe("");
    expect(badge()?.style.getPropertyValue("--fan")).toBe("");
  });

  it("INV-E13: 색이 없으면 변수 없이 기본 모양 · 팬덤 이름이 없으면 뱃지가 없다", () => {
    renderPage(undefined);
    expect(head()?.style.getPropertyValue("--personal")).toBe("");
    renderPage({ personal: null, fan: "#FFF59D" }, null);
    expect(badge()).toBeNull();
  });
});

describe("크리에이터 페이지 — 뱃지 글자색은 그때 계산 (INV-E14)", () => {
  it("INV-E14 S13: #FFF59D → #111827, #1E3A8A → 흰색, 경계 #777777 → 흰색", () => {
    for (const [fan, on] of [
      ["#FFF59D", "#111827"],
      ["#1E3A8A", "#FFFFFF"],
      ["#777777", "#FFFFFF"],
    ] as const) {
      renderPage({ personal: null, fan });
      expect(badge()?.style.getPropertyValue("--on-fan"), fan).toBe(on);
    }
  });
});
