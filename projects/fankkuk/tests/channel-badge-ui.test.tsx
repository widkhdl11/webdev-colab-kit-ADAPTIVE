import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import type { ChannelBadge } from "@/entities/creator/model/channel-badge";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { GiftRegisterPage } from "@/widgets/gift-register/ui/gift-register-page";
import { TogetherPage } from "@/widgets/together/ui/together-page";
import type { TogetherPageProps } from "@/widgets/together/api/load-together";

// 추가분 4-1·4-3·4-4·4-5 — 화면에 실제로 그려지는 자리를 DOM 으로 본다.
// 링크 페이지: 감사 문장(팬덤 이름) · 닉네임 아래 채널 아이콘(새 탭, 풀이) · 「채널 소유 확인」 뱃지 풀이.
// 선물 보내기: 미리 고른 크리에이터의 맨 위 한 줄. 함께한 시간: 제목 옆 확인 표시.

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
const channel: ChannelBadge = { platform: "youtube", channelKey: "haru_ch", channelUrl: "https://www.youtube.com/@haru_ch", verifiedOn: "2026-10-14" };
const TITLE = "@haru_ch · 2026.10.14 확인";

function renderLink(extra: { fanName?: string | null; channel?: ChannelBadge | null }) {
  act(() =>
    root.render(
      <CreatorProfilePage
        creator={{ ...card, photoUrl: null }}
        others={[]}
        followMode="login"
        send="open"
        prices={prices}
        prohibited={[]}
        monthFans={0}
        today={{ year: 2026, month: 10, day: 14 }}
        {...extra}
      />,
    ),
  );
}

describe("링크 페이지 — 팬덤 이름 감사 문장 (추가분 4-1)", () => {
  it("팬덤 이름이 있으면 「{팬덤 이름} 여러분의 마음 늘 감사해요」", () => {
    renderLink({ fanName: "꿀벌단" });
    expect(host.textContent).toContain("꿀벌단 여러분의 마음 늘 감사해요");
    expect(host.textContent).not.toContain("보내주시는 마음 늘 감사해요");
  });

  it("(실패경로) 없으면 기본 문장", () => {
    renderLink({ fanName: null });
    expect(host.textContent).toContain("보내주시는 마음 늘 감사해요");
    expect(host.textContent).not.toContain("여러분의 마음");
  });
});

describe("링크 페이지 — 채널 아이콘 링크 (추가분 4-3)", () => {
  it("닉네임 바로 아래 채널 아이콘 하나가 새 탭으로 채널을 열고, 올리면 「@핸들 · 날짜 확인」", () => {
    renderLink({ channel });
    // 공개 이름은 팬덤 뱃지와 한 줄(design-rules 12절) — 그 줄 바로 아래가 채널 아이콘 줄
    const name = host.querySelector("h1#creator-name");
    const row = name?.closest("[data-name-line]")?.nextElementSibling;
    const links = row?.querySelectorAll("a") ?? [];
    expect(links).toHaveLength(1);
    const a = links[0] as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe(channel.channelUrl);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.getAttribute("title")).toBe(TITLE);
    expect(a.getAttribute("aria-label")).toContain(TITLE);
  });

  it("「채널 소유 확인」 뱃지에도 같은 풀이", () => {
    renderLink({ channel });
    const badge = [...host.querySelectorAll("span")].find((el) => el.textContent?.trim() === "채널 소유 확인");
    expect(badge?.getAttribute("title")).toBe(TITLE);
  });

  it("(실패경로) 확인된 채널 값이 없으면 아이콘도 뱃지 풀이도 없다", () => {
    renderLink({ channel: null });
    expect(host.querySelector('a[target="_blank"]')).toBeNull();
    const badge = [...host.querySelectorAll("span")].find((el) => el.textContent?.trim() === "채널 소유 확인");
    expect(badge?.hasAttribute("title")).toBe(false);
  });
});

function renderSend(opts: { initialCreatorId?: string; followFirst?: { id: string; name: string; platform: string } | null; creators?: CreatorCard[] }) {
  act(() =>
    root.render(
      <GiftRegisterPage
        creators={opts.creators ?? [card]}
        prices={prices}
        initialCreatorId={opts.initialCreatorId}
        clientKey=""
        followFirst={opts.followFirst ?? null}
        today={{ year: 2026, month: 10, day: 14 }}
      />,
    ),
  );
}

describe("선물 보내기 맨 위 한 줄 (추가분 4-4)", () => {
  const LINE = "하루님의 유튜브 채널 주인이 확인된 페이지예요";

  it("크리에이터 페이지에서 미리 고르고 왔으면 머리말 안에 한 줄", () => {
    renderSend({ initialCreatorId: card.id });
    const line = [...host.querySelectorAll("header p")].find((p) => p.textContent === LINE);
    expect(line).toBeDefined();
  });

  it("팔로우하지 않아 따로 보여 주는 크리에이터도 같은 한 줄", () => {
    renderSend({ creators: [], followFirst: { id: card.id, name: "하루", platform: "유튜브" } });
    expect(host.textContent).toContain(LINE);
  });

  it("(실패경로) 미리 고른 사람이 없거나 플랫폼 값이 없으면 줄을 그리지 않는다", () => {
    renderSend({});
    expect(host.textContent).not.toContain("채널 주인이 확인된 페이지예요");
    act(() => root.unmount());
    root = createRoot(host);
    renderSend({ initialCreatorId: card.id, creators: [{ ...card, platform: "" }] });
    expect(host.textContent).not.toContain("채널 주인이 확인된 페이지예요");
  });
});

function togetherProps(ch: ChannelBadge | null): TogetherPageProps {
  return {
    summary: {
      creatorId: card.id,
      creatorName: "하루",
      creatorHandle: "haru",
      creatorPhotoPath: null,
      giftCount: 0,
      replyCount: 0,
      firstGiftOn: "2026-10-01",
      dayCount: 14,
    },
    creatorPhotoUrl: null,
    path: "/gifts/with/haru",
    anniversary: null,
    send: "open",
    signedIn: true,
    recent: [],
    older: [],
    first: null,
    photoBase: "http://photo.test",
    channel: ch,
  };
}

describe("함께한 시간 확인 아이콘 (추가분 4-5)", () => {
  it("제목 옆에 채널 소유 확인 표시, 올리면 「@핸들 · 날짜 확인」", () => {
    act(() => root.render(<TogetherPage {...togetherProps(channel)} />));
    const h1 = host.querySelector("h1");
    const mark = h1?.nextElementSibling;
    expect(mark?.getAttribute("role")).toBe("img");
    expect(mark?.getAttribute("title")).toBe(TITLE);
    expect(mark?.getAttribute("aria-label")).toContain("채널 소유 확인");
  });

  it("(실패경로) 확인된 채널 값이 없으면 표시가 없다", () => {
    act(() => root.render(<TogetherPage {...togetherProps(null)} />));
    expect(host.querySelector("h1")?.nextElementSibling).toBeNull();
    expect(host.querySelector('[role="img"]')).toBeNull();
  });
});
