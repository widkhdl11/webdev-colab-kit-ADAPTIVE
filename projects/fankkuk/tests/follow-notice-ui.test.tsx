import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import {
  FOLLOW_NICKNAME_NOTICE,
  FOLLOW_NICKNAME_NOTICE_SHORT,
  FOLLOWING_NICKNAME_NOTICE,
  NEEDS_FOLLOW_TO_SEND,
} from "@/features/creator-follow/model/follow-notice";
import type { FollowMode } from "@/features/creator-follow/ui/follow-button";
import type { LinkPageSend } from "@/features/gift-register/model/sender-rule";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { CreatorSearchPage } from "@/widgets/creator-search/ui/creator-search-page";
import { MyFollowingPanel } from "@/widgets/my-following/ui/my-following-page";

// reverse-gift INV-R2: 팔로우하면 크리에이터가 내 닉네임을 본다 — 팬은 팔로우하는 자리에서, 이미 팔로우한 팬은 「팔로우한 크리에이터」에서 안내를 본다.
// 로그인하지 않은 사람·보낼 수 있는 사람에게는 띄우지 않는다(DECISIONS 「E4 반영 때 정한 세부」).

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

const paragraphs = () => [...host.querySelectorAll("p")].map((p) => p.textContent ?? "");

function renderProfile(send: LinkPageSend, followMode: FollowMode) {
  act(() =>
    root.render(
      <CreatorProfilePage
        creator={{ ...card, photoUrl: null }}
        others={[]}
        followMode={followMode}
        send={send}
        prices={prices}
        prohibited={[]}
        monthFans={0}
        today={{ year: 2026, month: 10, day: 12 }}
      />,
    ),
  );
}

describe("팔로우 닉네임 안내 — 크리에이터 페이지 (INV-R2)", () => {
  it("팔로우하지 않은 로그인 팬에게는 「보낼 수 있어요」와 닉네임 안내를 한 줄로 보인다", () => {
    renderProfile("needs_follow", "save");
    const lines = paragraphs().filter((t) => t.includes(NEEDS_FOLLOW_TO_SEND));
    expect(lines).toEqual([`${NEEDS_FOLLOW_TO_SEND} ${FOLLOW_NICKNAME_NOTICE_SHORT}`]);
  });

  it("(실패경로) 로그인하지 않은 사람에게는 닉네임 안내가 없다", () => {
    renderProfile("needs_follow", "login");
    expect(paragraphs().filter((t) => t.includes(NEEDS_FOLLOW_TO_SEND))).toEqual([NEEDS_FOLLOW_TO_SEND]);
    expect(host.textContent).not.toContain(FOLLOW_NICKNAME_NOTICE_SHORT);
  });

  it("(실패경로) 이미 팔로우해 보낼 수 있으면 두 문장 다 없다", () => {
    renderProfile("open", "save");
    expect(host.textContent).not.toContain(NEEDS_FOLLOW_TO_SEND);
    expect(host.textContent).not.toContain(FOLLOW_NICKNAME_NOTICE_SHORT);
  });
});

describe("팔로우 닉네임 안내 — 크리에이터 찾기 (INV-R2)", () => {
  const render = (followMode: FollowMode) => act(() => root.render(<CreatorSearchPage creators={[card]} tagOptions={[]} followMode={followMode} />));

  it("로그인한 사람은 목록 위에서 안내를 본다", () => {
    render("save");
    expect(paragraphs()).toContain(FOLLOW_NICKNAME_NOTICE);
  });

  it("(실패경로) 로그인하지 않은 사람·운영자는 안내를 보지 않는다", () => {
    render("login");
    expect(host.textContent).not.toContain(FOLLOW_NICKNAME_NOTICE);
    render("hidden");
    expect(host.textContent).not.toContain(FOLLOW_NICKNAME_NOTICE);
  });
});

describe("팔로우 닉네임 안내 — 팔로우한 크리에이터 (INV-R2)", () => {
  it("팔로우한 크리에이터가 있어도 없어도 이미 팔로우한 사람용 안내가 보인다", () => {
    act(() => root.render(<MyFollowingPanel creators={[{ ...card, following: true }]} />));
    expect(paragraphs()).toContain(FOLLOWING_NICKNAME_NOTICE);
    expect(host.textContent).not.toContain(FOLLOW_NICKNAME_NOTICE);
    act(() => root.render(<MyFollowingPanel creators={[]} />));
    expect(paragraphs()).toContain(FOLLOWING_NICKNAME_NOTICE);
  });
});
