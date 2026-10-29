import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatorActionItem } from "@/entities/action-item/model/creator-action-items";
import { CreatorHomePage, type CreatorHomeProfile } from "@/widgets/home/ui/creator-home-page";
import { HomePage } from "@/widgets/home/ui/home-page";
import { LandingPage } from "@/widgets/home/ui/landing-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 }, medium: { priceKrw: 8900, revgiftPriceKrw: 6900, returnShippingKrw: 5000 }, large: { priceKrw: 10900, revgiftPriceKrw: 8400, returnShippingKrw: 6500 } };
const profile: CreatorHomeProfile = { name: "하루", intro: "게임과 이야기", photoUrl: null, initial: "하", backgroundUrl: null, colors: { personal: null }, fanName: "하늘별", symbolUrl: null };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const draw = (node: React.ReactNode) => act(() => root.render(node));
const creator = (props: Partial<React.ComponentProps<typeof CreatorHomePage>> = {}) => <CreatorHomePage profile={profile} accountHref="/creator/account" notices={[]} actionCount={0} accessLog={[]} ongoingCount={0} sentGifts={[]} {...props} />;

describe("승인된 세 역할 홈", () => {
  it("세 역할 모두 히어로 다음 바로가기 네 개, 그다음 배너이며 역할별 링크가 유지된다", () => {
    const banner = <div data-example-banner="">소개 배너</div>;
    const views = [
      <LandingPage prices={prices} newest={[]} looks={{}} notices={[]} banner={banner} />,
      <HomePage nickname="별빛" gifts={[]} following={[]} looks={{}} faceToneByName={{}} notices={[]} prices={prices} actionCount={2} receivedCount={1} banner={banner} />,
      creator({ banner }),
    ];
    for (const view of views) {
      draw(view);
      const hero = host.querySelector('[aria-labelledby="hero-title"]')!;
      const tiles = host.querySelector('ul[aria-label="바로가기"],ul[aria-label="내 바로가기"]')!;
      const shownBanner = host.querySelector("[data-example-banner]")!;
      expect(tiles.children).toHaveLength(4);
      expect(hero.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(tiles.compareDocumentPosition(shownBanner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(host.querySelectorAll("h1")).toHaveLength(1);
    }
    expect(host.querySelector('a[href="/creator/actions"]')).not.toBeNull();
    expect(host.querySelector('a[href="/creator/log"]')).not.toBeNull();
  });

  it("크리에이터 홈에는 처리할 일 앞 세 줄만 보이지만 전체 건수와 모두 보기 링크를 유지한다", () => {
    const actions: CreatorActionItem[] = Array.from({ length: 4 }, (_, index) => ({ kind: "approval", orderNo: `FC-${index}`, requestId: `req-${index}`, boxCount: 1, nickname: `팬${index}`, itemKind: "손편지", hasElectronicsOrMetal: false, sentAt: "2026-10-20T00:00:00Z", receivedAt: null, dueAt: "2026-10-27T00:00:00Z", priorHistory: { gifts: 0, passed: 0, returned: 0 } }));
    draw(creator({ actions, actionCount: 4 }));
    const section = host.querySelector('[aria-labelledby="creator-actions-title"]')!;
    expect(section.querySelectorAll("li")).toHaveLength(3);
    expect(section.textContent).toContain("4건");
    expect(section.textContent).toContain("팬0님");
    expect(section.textContent).not.toContain("팬3님");
    expect(section.querySelector('a[href="/creator/actions"]')).not.toBeNull();
    expect(section.querySelector("button")).toBeNull();
  });

  it("읽기 실패는 0건·빈 목록으로 오해시키지 않고 공개 페이지가 없으면 내 페이지 링크를 숨긴다", () => {
    draw(creator({ actions: null, actionCount: null, ongoingCount: null, publicHref: null }));
    expect(host.querySelector('[aria-labelledby="creator-actions-title"]')!.textContent).toContain("불러오지 못했습니다");
    expect(host.querySelector('[aria-labelledby="creator-progress-title"]')!.textContent).toContain("불러오지 못했습니다");
    expect(host.querySelector('ul[aria-label="내 바로가기"]')!.children[0]!.textContent).not.toContain("0건");
    expect([...host.querySelectorAll("a")].some((a) => a.textContent === "내 페이지 보기")).toBe(false);
  });

  it("공개 페이지와 단계·출력 실패를 이미 읽은 값 그대로 표시한다", () => {
    draw(creator({ publicHref: "/haru", progressRows: [{ id: "FC-1", title: "별빛님이 보낸 선물", description: "목도리", status: "검수 완료" }], ongoingCount: 1, accessLog: [{ orderNo: "FC-1", at: "2026-10-20T00:00:00Z", printNo: 1, released: true }] }));
    expect(host.querySelector('a[href="/haru"]')?.textContent).toBe("내 페이지 보기");
    expect(host.querySelector('[aria-labelledby="creator-progress-title"]')!.textContent).toContain("검수 완료");
    expect(host.querySelector('[aria-labelledby="creator-log-title"]')!.textContent).toContain("출력 실패");
  });
});
