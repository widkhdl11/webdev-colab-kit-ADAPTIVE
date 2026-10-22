import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 광고 배너 — 실제 라우트 넷(로그인 전 첫 화면 · 팬 홈 · 크리에이터 홈 · 크리에이터 찾기)이 공개 읽기(list_banners)를 한 번 부르고
// 그 결과를 칸 ② 로 그리는지, 읽기가 실패해도 페이지는 뜨고 칸만 없는지 본다(docs/specs/banners.md INV-Y7·Y8).
// 배너 읽기는 실제 함수(entities/banner/api/read-banners)를 두고 DB 응답만 가짜로 준다. 나머지 읽기는 화면을 그릴 만큼만 채운다.

const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: nav.redirect,
  notFound: nav.notFound,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: vi.fn() }));

const db = vi.hoisted(() => ({
  viewer: null as null | { userId: string; role: "fan" | "creator"; nickname: string },
  banners: { data: [] as unknown, error: null as null | { code: string } },
  calls: [] as string[],
}));

vi.mock("@/widgets/site-header/api/session-header", async (orig) => ({
  ...(await orig<object>()),
  loadSession: vi.fn(async () => ({
    supabase: {
      rpc: vi.fn(async (fn: string) => {
        db.calls.push(fn);
        if (fn === "list_banners") return db.banners;
        return { data: null, error: { code: "XX000" } };
      }),
    },
    viewer: db.viewer,
  })),
}));
vi.mock("@/shared/api/supabase/detached", () => ({ readPublicStorageBase: () => "http://storage.test" }));
vi.mock("@/entities/action-item/api/read-action-items", () => ({
  readActionItemsOrNull: vi.fn(async () => []),
  readCreatorActionItemsOrNull: vi.fn(async () => []),
}));
vi.mock("@/entities/creator/api/creator-reads", async (orig) => ({
  ...(await orig<object>()),
  readCreatorCards: vi.fn(async () => []),
  readCreatorSearchLooks: vi.fn(async () => ({})),
  readCreatorLooks: vi.fn(async () => ({})),
  readOwnCreatorId: vi.fn(async () => null),
}));
vi.mock("@/entities/creator/api/creator-tag-reads", () => ({ readTagOptions: vi.fn(async () => []) }));
vi.mock("@/entities/fan/api/read-fan-profile", () => ({ readFanProfile: vi.fn(async () => null) }));
vi.mock("@/entities/revgift/api/revgift-reads", () => ({ readReceivedRevgiftsOrNull: vi.fn(async () => []) }));
vi.mock("@/entities/order/api/fan-gift-rows", async (orig) => ({ ...(await orig<object>()), readMyGiftViews: vi.fn(async () => []) }));
vi.mock("@/entities/payment/api/read-tier-prices", async (orig) => {
  const price = (priceKrw: number) => ({ priceKrw, revgiftPriceKrw: priceKrw, returnShippingKrw: 0 });
  return { ...(await orig<object>()), readPublicPrices: vi.fn(async () => ({ small: price(6900), medium: price(8900), large: price(10900) })) };
});
vi.mock("@/entities/notice/api/notice-reads", async (orig) => ({ ...(await orig<object>()), readNotices: vi.fn(async () => []) }));
vi.mock("@/entities/address/api/access-log-rows", async (orig) => ({ ...(await orig<object>()), readMyAccessLog: vi.fn(async () => []) }));
vi.mock("@/entities/creator/api/creator-link-reads", async (orig) => ({
  ...(await orig<object>()),
  readMyCreatorLink: vi.fn(async () => null),
  readMyCreatorLook: vi.fn(async () => null),
}));
vi.mock("@/entities/creator/api/my-creator-settings", async (orig) => ({ ...(await orig<object>()), readMyCreatorSettings: vi.fn(async () => null) }));
vi.mock("@/widgets/creator-gift-progress/api/read-gift-progress", () => ({ readMyGiftProgress: vi.fn(async () => null) }));

import LandingRoute from "@/app/(site)/page";
import CreatorHomeRoute from "@/app/(site)/creator/page";
import CreatorsRoute from "@/app/(site)/creators/page";
import HomeRoute from "@/app/(site)/home/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const FAN = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" as const, nickname: "별빛" };
const CREATOR = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" as const, nickname: "하루" };

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "하루님 생일 주간",
  description: "10월 20일까지 선물 받아요.",
  link: "https://youtube.com/@haru",
  is_ad: true,
  image_path: "b-0123456789abcdef0123456789abcdef.webp",
};

const ROUTES = [
  { name: "팬 홈 /home", viewer: FAN, route: () => HomeRoute() },
  { name: "크리에이터 홈 /creator", viewer: CREATOR, route: () => CreatorHomeRoute() },
  { name: "크리에이터 찾기 /creators", viewer: null, route: () => CreatorsRoute() },
];

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  db.calls = [];
  db.banners = { data: [ROW], error: null };
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function draw(page: Promise<React.ReactNode>) {
  const tree = await page;
  act(() => root.render(<>{tree}</>));
}

describe("INV-Y7·Y8: 실제 라우트 넷 — 공개 읽기 한 번, 칸 ②", () => {
  it("로그인 전 첫 화면은 사용자가 고른 소개 이미지만 표시하며 광고 목록은 읽지 않는다", async () => {
    db.viewer = null;
    await draw(LandingRoute());
    expect(db.calls.filter((c) => c === "list_banners")).toHaveLength(0);
    expect(host.querySelector('img[src="/images/banners/launch-01-introduction-no-button.png"]')).not.toBeNull();
    expect(host.querySelector("[data-banner-tag]")).toBeNull();
  });
  it.each(ROUTES)("INV-Y7 (S7): $name — 공개 읽기를 한 번 부르고, 켠 배너는 제목 앞 「광고」·그림은 공개 저장소 주소", async ({ viewer, route }) => {
    db.viewer = viewer;
    await draw(route());
    expect(db.calls.filter((c) => c === "list_banners")).toHaveLength(1);
    expect(host.querySelectorAll("[data-banner-slot]")).toHaveLength(1);
    const title = host.querySelector("[data-banner-title]")!;
    expect(title.textContent).toBe("하루님 생일 주간");
    expect(title.previousElementSibling?.textContent).toBe("광고");
    expect(title.closest("[data-banner-card]")?.querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe(
      "http://storage.test/storage/v1/object/public/banner-images/b-0123456789abcdef0123456789abcdef.webp",
    );
  });

  it.each(ROUTES)("INV-Y8 (S8b, 실패경로): $name — 보이는 배너 0장이면 칸이 없다", async ({ viewer, route }) => {
    db.viewer = viewer;
    db.banners = { data: [], error: null };
    await draw(route());
    expect(host.querySelector("main")).not.toBeNull();
    expect(host.querySelector("[data-banner-title]")).toBeNull();
    expect(host.querySelectorAll("[data-banner-card]")).toHaveLength(viewer ? 1 : 0);
  });

  it.each(ROUTES)("INV-Y8 (실패경로): $name — 배너 읽기가 실패하거나 꼴이 달라도 페이지는 뜨고 칸만 없다", async ({ viewer, route }) => {
    db.viewer = viewer;
    for (const result of [{ data: null, error: { code: "PGRST202" } }, { data: [{ id: 1 }], error: null }]) {
      db.banners = result;
      await draw(route());
      expect(host.querySelector("main")).not.toBeNull();
      expect(host.querySelector("[data-banner-title]")).toBeNull();
      expect(host.querySelectorAll("[data-banner-card]")).toHaveLength(viewer ? 1 : 0);
    }
  });
});
