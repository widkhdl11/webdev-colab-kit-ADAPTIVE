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

  it("팬 홈 첫 화면에는 「선물 보내기」「크리에이터 찾기」 버튼이 없고 검색 하나만 둔다(design-rules 35절 — 바로 아래 바로가기·검색과 같은 일이라 2026-11-01 승인으로 뺐다)", () => {
    draw(<HomePage nickname="별빛" gifts={[]} following={[]} looks={{}} faceToneByName={{}} notices={[]} prices={prices} actionCount={0} receivedCount={0} />);
    const hero = host.querySelector('[aria-labelledby="hero-title"]')!;
    expect(hero.querySelector('form[role="search"][action="/creators"]')).not.toBeNull();
    expect(hero.querySelectorAll("a")).toHaveLength(0);
    expect(host.querySelector('ul[aria-label="내 바로가기"] a[href="/gifts/new"]')).not.toBeNull();
  });

  it("진행 상태는 색 갈래가 붙은 뱃지, 빈 상태는 같은 문구 그대로(35절)", () => {
    draw(creator({ progressRows: [{ id: "FC-1", title: "별빛님이 보낸 선물", description: "목도리", status: "배송 중", tone: "info" }], ongoingCount: 1 }));
    expect(host.querySelector('[aria-labelledby="creator-progress-title"] [data-tone="info"]')?.textContent).toBe("배송 중");
    expect(host.querySelector('[aria-labelledby="creator-actions-title"]')!.textContent).toContain("현재 처리할 일이 없습니다.");
    expect(host.querySelector('[aria-labelledby="creator-log-title"]')!.textContent).toContain("주소 열람 기록이 없습니다.");
  });

  it("공지 0건: 두 역할 홈은 같은 문구를 흰 카드 안에(35절), 로그인 전 메인은 기존 빈 판 그대로(34절)", () => {
    const emptyNotice = () => [...host.querySelectorAll('[aria-labelledby="notice-title"] *')].find((el) => el.childElementCount === 0 && el.textContent === "등록된 공지사항이 없습니다.");
    for (const page of [
      <HomePage key="fan" nickname="별빛" gifts={[]} following={[]} looks={{}} faceToneByName={{}} notices={[]} prices={prices} actionCount={0} receivedCount={0} />,
      creator(),
    ]) {
      draw(page);
      expect(emptyNotice()).toBeDefined();
      expect(emptyNotice()!.closest("p.empty")).toBeNull();
    }
    draw(<LandingPage prices={prices} newest={[]} looks={{}} notices={[]} banner={null} />);
    expect(emptyNotice()?.matches("p.empty")).toBe(true);
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

  it("단계·출력 실패를 이미 읽은 값 그대로 표시한다", () => {
    draw(creator({ publicHref: "/haru", progressRows: [{ id: "FC-1", title: "별빛님이 보낸 선물", description: "목도리", status: "검수 완료" }], ongoingCount: 1, accessLog: [{ orderNo: "FC-1", at: "2026-10-20T00:00:00Z", printNo: 1, released: true }] }));
    expect(host.querySelector('[aria-labelledby="creator-progress-title"]')!.textContent).toContain("검수 완료");
    expect(host.querySelector('[aria-labelledby="creator-log-title"]')!.textContent).toContain("출력 실패");
  });

  it("새 크리에이터 인사 영역은 이름을 한 번 표시하고 팬덤을 별도로 소개한다", () => {
    draw(creator());
    const hero = host.querySelector('[aria-labelledby="hero-title"]')!;
    expect(hero.textContent?.match(/하루/g)).toHaveLength(1);
    expect(hero.querySelector("dd")?.textContent).toBe("하늘별");
    expect(hero.textContent).toContain("지금은 처리할 일이 없어요");
    expect(hero.textContent).not.toContain("프로필 수정");
    draw(creator({ profile: { ...profile, fanName: "" } }));
    expect(host.querySelector('[aria-labelledby="hero-title"] dl')).toBeNull();
  });

  it("처리할 일이 있으면 실제 건수로 이동하고, 읽기 실패에는 완료 안내를 표시하지 않는다", () => {
    draw(creator({ actionCount: 4 }));
    const hero = () => host.querySelector('[aria-labelledby="hero-title"]')!;
    expect(hero().querySelector('a[href="/creator/actions"]')?.textContent).toContain("4건");
    expect(hero().textContent).not.toContain("처리할 일이 없어요");
    draw(creator({ actionCount: null }));
    expect(hero().textContent).not.toContain("처리할 일이 없어요");
    expect(hero().textContent).not.toContain("0건");
  });
});
