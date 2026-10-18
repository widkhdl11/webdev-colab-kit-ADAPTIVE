import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/" }));
vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: vi.fn() }));
// 운영자 표의 순서 바꾸기 — 브라우저 요청 대신 응답을 시험이 정한다
const api = vi.hoisted(() => ({ order: vi.fn() }));
vi.mock("@/features/admin-banner-edit/api/banner-client", async (orig) => ({ ...(await orig<object>()), postBannerOrder: api.order }));

import type { BannerView } from "@/entities/banner/model/banner";
import { BannerSlide } from "@/entities/banner/ui/banner-slide";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import { BannerForm } from "@/features/admin-banner-edit/ui/banner-form";
import type { AdminBanner } from "@/entities/banner/model/banner";
import { BannersPanel } from "@/widgets/admin-banners/ui/banners-panel";
import { BANNER_INTERVAL_MS, BannerCarousel } from "@/widgets/banner-carousel/ui/banner-carousel";
import { bannerSlot } from "@/widgets/banner-carousel/ui/banner-slot";
import { CreatorSearchPage } from "@/widgets/creator-search/ui/creator-search-page";
import { CreatorHomePage } from "@/widgets/home/ui/creator-home-page";
import { HomePage } from "@/widgets/home/ui/home-page";
import { LandingPage } from "@/widgets/home/ui/landing-page";

// 광고 배너 화면 (docs/specs/banners.md INV-Y3·Y6·Y7·Y8·Y9, S3·S6·S7·S7b·S8b·S9·S9b).
// 배너 한 장을 그리는 부품(entities/banner/ui/banner-slide)과 넘김 부품(widgets/banner-carousel)을 실제로 그려 DOM 으로 본다.
// 다섯 자리(첫 화면·팬 홈·크리에이터 홈·크리에이터 찾기·관리자 미리보기)는 각 화면 부품에 실제 배너 칸을 넣어 그린다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let reduced = false;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  reduced = false;
  // jsdom 에는 matchMedia 가 없다 — 움직임 줄이기 설정만 시험이 정한다
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const banner = (over: Partial<BannerView> = {}): BannerView => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "하루님 생일 주간",
  description: "10월 20일까지 선물 받아요.",
  link: "/about",
  isAd: false,
  imageUrl: "http://storage.test/storage/v1/object/public/banner-images/b-0123456789abcdef0123456789abcdef.webp",
  ...over,
});

const draw = (node: React.ReactNode) => act(() => root.render(<>{node}</>));
const goLink = (scope: ParentNode = host) => scope.querySelector<HTMLAnchorElement>("a[data-banner-go]");
const titles = () => [...host.querySelectorAll<HTMLElement>("[data-banner-title]")];
/** 지금 보이는 장의 제목 */
const currentTitle = () => host.querySelector('[data-banner-current="true"] [data-banner-title]')?.textContent ?? null;

describe("배너 한 장 (INV-Y3·Y6·Y7)", () => {
  it("INV-Y3 (S3): /about·/#price 는 같은 탭, https://youtube.com/@haru 는 새 탭 + noopener noreferrer", () => {
    for (const link of ["/about", "/#price"]) {
      draw(<BannerSlide banner={banner({ link })} tone="#FDE2E4" />);
      const a = goLink()!;
      expect(a.getAttribute("href")).toBe(link);
      expect(a.hasAttribute("target")).toBe(false);
      expect(a.getAttribute("rel")).toBeNull();
    }
    draw(<BannerSlide banner={banner({ link: "https://youtube.com/@haru" })} tone="#FDE2E4" />);
    const ext = goLink()!;
    expect(ext.getAttribute("href")).toBe("https://youtube.com/@haru");
    expect(ext.getAttribute("target")).toBe("_blank");
    expect(ext.getAttribute("rel")).toBe("noopener noreferrer");
    expect(ext.textContent).toContain("보러 가기");
  });

  it("INV-Y3 (실패경로): 규칙 밖 주소(javascript:·//다른곳)가 와도 링크를 그리지 않는다 — 그리는 부품이 다시 가른다", () => {
    for (const link of ["javascript:alert(1)", "//evil.com", "http://a.com"]) {
      draw(<BannerSlide banner={banner({ link })} tone="#FDE2E4" />);
      expect(host.querySelector("a")).toBeNull();
      expect(titles()[0]?.textContent).toBe("하루님 생일 주간");
    }
  });

  it("INV-Y6 (S6): 제목 「<b>x</b>」 는 글자 그대로 보이고 태그로 해석되지 않는다", () => {
    draw(<BannerSlide banner={banner({ title: "<b>x</b>", description: "<img src=x onerror=alert(1)>" })} tone="#FDE2E4" />);
    expect(titles()[0]!.textContent).toBe("<b>x</b>");
    expect(host.querySelector("b")).toBeNull();
    expect(host.querySelector('img[src="x"]')).toBeNull();
  });

  it("INV-Y7 (S7·S7b): 켠 배너는 제목 바로 앞에 「광고」, 끈 배너는 꼬리표 없음", () => {
    draw(<BannerSlide banner={banner({ isAd: true })} tone="#FDE2E4" />);
    const title = titles()[0]!;
    expect(title.previousElementSibling?.textContent).toBe("광고");
    expect(title.previousElementSibling?.hasAttribute("data-banner-tag")).toBe(true);
    draw(<BannerSlide banner={banner({ isAd: false })} tone="#FDE2E4" />);
    expect(host.querySelector("[data-banner-tag]")).toBeNull();
    expect(host.textContent).not.toContain("광고");
  });
});

const PRICE = (priceKrw: number) => ({ priceKrw, revgiftPriceKrw: priceKrw, returnShippingKrw: 0 });
const PRICES: PublicPriceTable = { small: PRICE(6900), medium: PRICE(8900), large: PRICE(10900) };
const PROFILE = {
  name: "하루",
  intro: "",
  photoUrl: null,
  initial: "하",
  backgroundUrl: null,
  colors: { personal: null, fan: null },
  fanName: "",
  symbolUrl: null,
};

/** 다섯 자리 — 각 화면에 배너 칸을 넣어 그린다. before: 배너 칸이 본문 맨 위(앞에 아무것도 없음)이고 바로 뒤에 그 화면의 첫 구역이 오는지
 *  (2026-10-18 사용자 「위치는 제일 상단에」 — design-rules 16절) */
const first = (slot: Element) => slot.previousElementSibling === null;
const PLACES: { name: string; render: (slot: React.ReactNode) => React.ReactNode; before: (slot: Element) => boolean }[] = [
  {
    name: "로그인 전 첫 화면 맨 위",
    render: (slot) => <LandingPage prices={PRICES} newest={[]} looks={{}} notices={[]} banner={slot} />,
    before: (slot) => first(slot) && slot.nextElementSibling?.getAttribute("aria-labelledby") === "hero-title",
  },
  {
    name: "팬 홈 맨 위",
    render: (slot) => (
      <HomePage nickname="별빛" gifts={[]} following={[]} looks={{}} faceToneByName={{}} notices={[]} prices={PRICES} actionCount={0} receivedCount={0} banner={slot} />
    ),
    before: (slot) => first(slot) && slot.nextElementSibling?.getAttribute("aria-labelledby") === "hero-title",
  },
  {
    name: "크리에이터 홈 맨 위",
    render: (slot) => (
      <CreatorHomePage profile={PROFILE} accountHref="/creator/account" notices={[]} actionCount={0} accessLog={[]} ongoingCount={0} sentGifts={[]} banner={slot} />
    ),
    before: (slot) => first(slot) && slot.nextElementSibling?.querySelector("h1")?.textContent === PROFILE.name,
  },
  {
    name: "크리에이터 찾기 맨 위",
    render: (slot) => <CreatorSearchPage creators={[]} tagOptions={[]} followMode="login" banner={slot} />,
    before: (slot) => first(slot) && slot.nextElementSibling?.classList.contains("page-head") === true,
  },
];

describe("보이는 자리 (INV-Y7·Y8)", () => {
  it.each(PLACES)("INV-Y7 (S7): $name — 켠 배너는 제목 앞 「광고」, 정해진 자리에 칸 하나", ({ render, before }) => {
    draw(render(bannerSlot([banner({ isAd: true })])));
    const slots = host.querySelectorAll("[data-banner-slot]");
    expect(slots).toHaveLength(1);
    expect(before(slots[0]!)).toBe(true);
    const title = titles()[0]!;
    expect(title.textContent).toBe("하루님 생일 주간");
    expect(title.previousElementSibling?.textContent).toBe("광고");
  });

  it.each(PLACES)("INV-Y7 (S7b): $name — 끈 배너는 「광고」 꼬리표 없음", ({ render }) => {
    draw(render(bannerSlot([banner({ isAd: false })])));
    expect(titles()).toHaveLength(1);
    expect(host.querySelector("[data-banner-tag]")).toBeNull();
  });

  it.each(PLACES)("INV-Y8 (S8b, 실패경로): $name — 보이는 배너 0장(또는 읽지 못함)이면 칸 ② 가 없다", ({ render }) => {
    for (const rows of [[], null]) {
      draw(render(bannerSlot(rows)));
      expect(host.querySelector("[data-banner-slot]")).toBeNull();
      expect(host.querySelector('[aria-roledescription="carousel"]')).toBeNull();
    }
    draw(<BannerCarousel banners={[]} />);
    expect(host.innerHTML).toBe("");
  });

  it("INV-Y7 (S7·S7b): 관리자 미리보기 — 「크리에이터 광고」 표시를 켜면 제목 앞 「광고」, 끄면 없음", () => {
    const draft = {
      id: banner().id,
      title: "하루님 생일 주간",
      description: "10월 20일까지 선물 받아요.",
      link: "https://youtube.com/@haru",
      isAd: true,
      startsOn: "2026-10-14",
      endsOn: "2026-10-20",
      imageUrl: banner().imageUrl,
    };
    draw(<BannerForm editing={draft} onStopEditing={() => {}} onSubmitStart={() => {}} onSaved={() => {}} />);
    const preview = host.querySelector("[data-banner-preview]")!;
    const title = preview.querySelector("[data-banner-title]")!;
    expect(title.textContent).toBe("하루님 생일 주간");
    expect(title.previousElementSibling?.textContent).toBe("광고");
    const box = host.querySelector<HTMLInputElement>("#banner-ad")!;
    act(() => box.click());
    expect(box.checked).toBe(false);
    expect(preview.querySelector("[data-banner-tag]")).toBeNull();
  });
});

describe("넘김 (INV-Y9)", () => {
  const two = () => [banner({ id: "a1111111-1111-4111-8111-111111111111", title: "첫째 배너" }), banner({ id: "b2222222-2222-4222-8222-222222222222", title: "둘째 배너" })];

  it("INV-Y9: 멈추지 않으면 넘김 간격이 지나 다음 장으로 간다(대조군)", () => {
    vi.useFakeTimers();
    draw(<BannerCarousel banners={two()} />);
    expect(currentTitle()).toBe("첫째 배너");
    act(() => vi.advanceTimersByTime(BANNER_INTERVAL_MS + 100));
    expect(currentTitle()).toBe("둘째 배너");
    expect(host.querySelector("[data-banner-count]")?.textContent).toBe("2 / 2");
  });

  it("INV-Y9 (S9): 멈춤 버튼은 늘 보이고, 누르고 시간이 지나도 장이 바뀌지 않는다", () => {
    vi.useFakeTimers();
    draw(<BannerCarousel banners={two()} />);
    const pause = host.querySelector<HTMLButtonElement>("button[data-banner-pause]")!;
    expect(pause).not.toBeNull();
    expect(pause.hidden).toBe(false);
    expect(pause.getAttribute("aria-pressed")).toBe("false");
    act(() => pause.click());
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    act(() => vi.advanceTimersByTime(BANNER_INTERVAL_MS * 5));
    expect(currentTitle()).toBe("첫째 배너");
    // 다시 누르면 넘어간다
    act(() => pause.click());
    act(() => vi.advanceTimersByTime(BANNER_INTERVAL_MS + 100));
    expect(currentTitle()).toBe("둘째 배너");
  });

  it("INV-Y9 (S9b, 실패경로): 움직임 줄이기를 켜면 넘김 간격보다 오래 기다려도 첫 장 그대로", () => {
    reduced = true;
    vi.useFakeTimers();
    draw(<BannerCarousel banners={two()} />);
    act(() => vi.advanceTimersByTime(BANNER_INTERVAL_MS * 5));
    expect(currentTitle()).toBe("첫째 배너");
    // 멈춤 버튼은 그때도 보인다(멈춘 상태로)
    expect(host.querySelector("button[data-banner-pause]")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("INV-Y9 (실패경로): 마우스가 올라가 있거나 키보드 초점이 배너 안에 있으면 넘어가지 않는다", () => {
    vi.useFakeTimers();
    draw(<BannerCarousel banners={two()} />);
    const region = host.querySelector<HTMLElement>('[aria-roledescription="carousel"]')!;
    act(() => {
      region.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    });
    act(() => vi.advanceTimersByTime(BANNER_INTERVAL_MS * 3));
    expect(currentTitle()).toBe("첫째 배너");
    act(() => {
      region.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body }));
    });
    // 초점이 안에 있는 동안
    act(() => goLink(host.querySelector('[data-banner-current="true"]')!)!.focus());
    act(() => vi.advanceTimersByTime(BANNER_INTERVAL_MS * 3));
    expect(currentTitle()).toBe("첫째 배너");
    act(() => (document.activeElement as HTMLElement).blur());
    act(() => vi.advanceTimersByTime(BANNER_INTERVAL_MS + 100));
    expect(currentTitle()).toBe("둘째 배너");
  });

  it("INV-Y9: 이전·다음·점으로 장을 고른다. 한 장이면 넘김 단추 줄이 없다", () => {
    draw(<BannerCarousel banners={[...two(), banner({ id: "c3333333-3333-4333-8333-333333333333", title: "셋째 배너" })]} />);
    const btn = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    act(() => btn("다음 배너").click());
    expect(currentTitle()).toBe("둘째 배너");
    act(() => btn("이전 배너").click());
    act(() => btn("이전 배너").click());
    expect(currentTitle()).toBe("셋째 배너");
    act(() => btn("1번 배너").click());
    expect(currentTitle()).toBe("첫째 배너");
    expect(btn("1번 배너").getAttribute("aria-current")).toBe("true");
    // 보이지 않는 장의 링크는 키보드로 닿지 않는다
    expect(host.querySelectorAll('[data-banner-current="false"][inert]')).toHaveLength(2);
    draw(<BannerCarousel banners={[banner()]} />);
    expect(host.querySelector("button[data-banner-pause]")).toBeNull();
    expect(currentTitle()).toBe("하루님 생일 주간");
  });

  it("INV-Y8: 보이는 순서는 받은 순서 그대로 — 장 바탕은 파스텔 여덟 색을 그 순서로 돌려 쓴다", () => {
    const many = Array.from({ length: 9 }, (_, i) => banner({ id: `${i}0000000-0000-4000-8000-000000000000`, title: `배너 ${i + 1}` }));
    draw(<BannerCarousel banners={many} />);
    expect(titles().map((t) => t.textContent)).toEqual(many.map((b) => b.title));
    const tones = [...host.querySelectorAll<HTMLElement>("[data-banner-card]")].map((el) => el.style.getPropertyValue("--tone"));
    expect(tones[0]).toBe("#FDE2E4");
    expect(tones[7]).toBe("#F6DFF0");
    expect(tones[8]).toBe("#FDE2E4");
  });
});

describe("리뷰 반영 — 넘김 칸 (INV-Y8·Y9)", () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => banner({ id: `${i + 1}0000000-0000-4000-8000-000000000000`, title: `배너 ${i + 1}` }));
  const offsetOfTitle = (title: string) =>
    [...host.querySelectorAll<HTMLElement>("[data-banner-current]")].find((el) => el.querySelector("[data-banner-title]")?.textContent === title)?.style.getPropertyValue("--d");

  it("INV-Y9 (실패경로): 휴대폰에서 손가락으로 한 번 누른 것(마우스가 아닌 포인터)은 넘김을 멈추지 않는다", () => {
    vi.useFakeTimers();
    draw(<BannerCarousel banners={make(2)} />);
    const region = host.querySelector<HTMLElement>('[aria-roledescription="carousel"]')!;
    act(() => {
      region.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    });
    act(() => vi.advanceTimersByTime(BANNER_INTERVAL_MS + 100));
    expect(currentTitle()).toBe("배너 2");
  });

  it("INV-Y9: 저절로 넘어가는 동안 장 묶음은 읽기 프로그램에 알리지 않고(off), 멈추면 알린다(polite)", () => {
    draw(<BannerCarousel banners={make(2)} />);
    const track = () => host.querySelector("[data-banner-track]")!;
    expect(track().getAttribute("aria-live")).toBe("off");
    act(() => host.querySelector<HTMLButtonElement>("button[data-banner-pause]")!.click());
    expect(track().getAttribute("aria-live")).toBe("polite");
  });

  it("INV-Y8: 장 수가 줄면(5장 중 다섯째 → 3장) 보이는 장과 가운데 자리가 같은 장이다", () => {
    draw(<BannerCarousel banners={make(5)} />);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="5번 배너"]')!.click());
    draw(<BannerCarousel banners={make(3)} />);
    const all = [...host.querySelectorAll<HTMLElement>("[data-banner-current]")];
    const current = all.filter((el) => el.dataset.bannerCurrent === "true");
    expect(current).toHaveLength(1);
    expect(current[0]!.style.getPropertyValue("--d")).toBe("0");
    expect(host.querySelector('button[aria-current="true"]')?.getAttribute("aria-label")).toBe(`${all.indexOf(current[0]!) + 1}번 배너`);
  });

  it("두 장: 반대쪽 장식 복사본은 링크·id 가 없고 읽기에서 빠진다", () => {
    draw(<BannerCarousel banners={make(2)} />);
    const mirror = host.querySelector<HTMLElement>("[data-banner-mirror]")!;
    expect(mirror).not.toBeNull();
    expect(mirror.getAttribute("aria-hidden")).toBe("true");
    expect(mirror.querySelector("a")).toBeNull();
    expect(mirror.querySelector("[id]")).toBeNull();
    const ids = [...host.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("두 장: 「다음」은 세 장 이상처럼 오른쪽에서 들어오고, 「이전」은 왼쪽에서 들어온다", async () => {
    draw(<BannerCarousel banners={make(2)} />);
    expect(offsetOfTitle("배너 2")).toBe("1");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="다음 배너"]')!.click());
    expect(currentTitle()).toBe("배너 2");
    expect(offsetOfTitle("배너 1")).toBe("-1"); // 나간 장은 왼쪽으로
    // 「이전」을 누르면 들어올 장이 먼저 왼쪽(-1)에 서고, 다음 그림 때 가운데로
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="이전 배너"]')!.click();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(currentTitle()).toBe("배너 1");
    expect(offsetOfTitle("배너 2")).toBe("1"); // 나간 장은 오른쪽으로
  });
});

describe("리뷰 반영 — 운영자 화면 (INV-Y6·Y7·Y8)", () => {
  const admin = (over: Partial<AdminBanner>): AdminBanner => ({
    id: "a1111111-1111-4111-8111-111111111111",
    title: "가",
    description: "",
    link: "/about",
    isAd: false,
    imagePath: "b-0123456789abcdef0123456789abcdef.webp",
    sortOrder: 1,
    startsOn: "2026-10-01",
    endsOn: null,
    state: "live",
    ...over,
  });

  it("INV-Y6: 제목 글자 수 표시는 DB 와 같은 방식 — 가족 이모지 하나(👨‍👩‍👧)는 5글자", () => {
    draw(<BannerForm editing={null} onStopEditing={() => {}} onSubmitStart={() => {}} onSaved={() => {}} />);
    const input = host.querySelector<HTMLInputElement>("#banner-title")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(input, "👨‍👩‍👧");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector("#banner-title-count")?.textContent).toBe("5 / 30");
  });

  it("미리보기: 그림이 없으면 같은 자리에 빈 칸(안내 글 없음)", () => {
    draw(<BannerForm editing={null} onStopEditing={() => {}} onSubmitStart={() => {}} onSaved={() => {}} />);
    const preview = host.querySelector("[data-banner-preview]")!;
    expect(preview.querySelector("[data-banner-image-empty]")).not.toBeNull();
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.textContent).toBe("");
  });

  it("INV-Y8: 미리보기 바탕은 공개 화면 순서(보이는 중끼리)로 — 앞에 끝난 배너가 있어도 첫 장 색", () => {
    const ended = admin({ id: "e1111111-1111-4111-8111-111111111111", title: "끝난 배너", state: "ended" });
    const live = admin({ id: "b2222222-2222-4222-8222-222222222222", title: "보이는 배너", state: "live" });
    draw(<BannersPanel banners={[ended, live]} imageUrls={{}} />);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="「보이는 배너」 고치기"]')!.click());
    const card = host.querySelector<HTMLElement>("[data-banner-preview] [data-banner-card]")!;
    expect(card.style.getPropertyValue("--tone")).toBe("#FDE2E4");
  });

  it("순서 바꾸기: 성공해도 새 목록이 올 때까지 순서 단추를 막아 둔다", async () => {
    api.order.mockResolvedValue({ kind: "ok", body: {} });
    const a = admin({ id: "a1111111-1111-4111-8111-111111111111", title: "가" });
    const b = admin({ id: "b2222222-2222-4222-8222-222222222222", title: "나" });
    draw(<BannersPanel banners={[a, b]} imageUrls={{}} />);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="「나」 위로 옮기기"]')!.click();
    });
    expect(api.order).toHaveBeenCalledTimes(1);
    expect(host.querySelector('button[aria-label="「가」 아래로 옮기기"]')?.getAttribute("aria-disabled")).toBe("true");
    // 새 목록(바뀐 순서)이 오면 풀린다
    draw(<BannersPanel banners={[b, a]} imageUrls={{}} />);
    expect(host.querySelector('button[aria-label="「나」 아래로 옮기기"]')?.getAttribute("aria-disabled")).toBe("false");
  });
});
