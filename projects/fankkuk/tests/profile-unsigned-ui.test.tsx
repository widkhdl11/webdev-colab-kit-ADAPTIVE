import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import type { CreatorReceiving } from "@/entities/creator/model/receiving";
import type { FollowMode } from "@/features/creator-follow/model/follow-mode";
import { sendOnLinkPage, type LinkPageSend } from "@/features/gift-register/model/sender-rule";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";

// 링크 페이지 `unsigned` (creator-link INV-E15 · UX 명세 handle.md 「2026-10-29 승인 서명 연결 전」, 시안 v43-signup/link-page-unconnected).
// 「팔로우」/「팔로우 중」은 그대로, 「선물 보내기」 대신 누를 수 없는 회색 배지 「승인 수단 등록 전」. 쉬는 중이 먼저 이긴다. 본인 화면에는 배지가 없다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card: CreatorCard = {
  id: "00000000-0000-4000-b000-000000000001",
  name: "하루",
  platform: "치지직",
  tags: [],
  channelTitle: "하루 채널",
  intro: "안녕하세요",
  alias: "",
  approvalMinutes: 60,
  faceTone: "var(--face-1)",
  following: false,
  handle: "haru",
  photoPath: null,
};
const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 }, medium: { priceKrw: 8900, revgiftPriceKrw: 6900, returnShippingKrw: 5000 }, large: { priceKrw: 10900, revgiftPriceKrw: 8400, returnShippingKrw: 6500 } };
const TODAY = { year: 2026, month: 10, day: 12 };
const resting: CreatorReceiving = { resumeOn: "2026-11-03", birthday: null, anniversaries: [] };
const BADGE = "승인 수단 등록 전";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function renderProfile(send: LinkPageSend, followMode: FollowMode, following = false, receiving: CreatorReceiving | null = null) {
  act(() =>
    root.render(
      <CreatorProfilePage creator={{ ...card, following, photoUrl: null }} others={[]} followMode={followMode} send={send} prices={prices} prohibited={[]} monthFans={0} today={TODAY} receiving={receiving} />,
    ),
  );
}

const actionsText = () => [...host.querySelectorAll<HTMLElement>("a.btn, button.btn")].filter((el) => !el.closest("dialog")).map((el) => el.textContent?.trim());
const sendLinks = () => [...host.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => a.getAttribute("href")?.startsWith("/gifts/new"));
const badges = () => [...host.querySelectorAll<HTMLElement>("span")].filter((el) => el.textContent?.trim() === BADGE && el.children.length === 0);

describe("INV-E15: 승인 서명 연결 전 링크 페이지", () => {
  it("INV-E15 S15 (실패경로): 팔로우하지 않은 팬 — 「팔로우」와 배지, 선물 보내기 링크 없음", () => {
    renderProfile("unsigned", "save");
    expect(actionsText()).toEqual(["팔로우"]);
    expect(badges()).toHaveLength(1);
    expect(sendLinks()).toEqual([]);
    expect(host.textContent).not.toContain("선물 보내기");
  });

  it("INV-E15 S15 (실패경로): 팔로우한 팬 — 배지와 「팔로우 중」, 선물 보내기 링크 없음", () => {
    renderProfile("unsigned", "save", true);
    expect(actionsText()).toEqual(["팔로우 중"]);
    expect(badges()).toHaveLength(1);
    expect(sendLinks()).toEqual([]);
  });

  it("INV-E15 S15 (실패경로): 로그인 전 — 「팔로우」(로그인 링크)와 배지", () => {
    renderProfile("unsigned", "login");
    expect(actionsText()).toEqual(["팔로우"]);
    expect(host.querySelector("a.btn")?.getAttribute("href")).toBe("/login");
    expect(badges()).toHaveLength(1);
  });

  it("INV-E15 S15: 연결하면(open) 선물 보내기가 보이고 배지가 없다", () => {
    renderProfile("open", "save", true);
    expect(actionsText()).toEqual(["선물 보내기", "팔로우 중"]);
    expect(sendLinks()).toHaveLength(1);
    expect(badges()).toEqual([]);
  });

  it("INV-E15: 쉬는 중이 먼저 이긴다 — 연결 전이어도 쉬는 기간 한 줄만, 배지 없음", () => {
    const send = sendOnLinkPage("open", true, false);
    renderProfile(send, "save", true, resting);
    expect(badges()).toEqual([]);
    expect(sendLinks()).toEqual([]);
    expect(host.textContent).toContain("선물 받기 일시 중단");
  });

  it("INV-E15: 본인 화면(self)에는 배지가 없다", () => {
    const send = sendOnLinkPage("self", false, false);
    renderProfile(send, "hidden");
    expect(badges()).toEqual([]);
  });
});
