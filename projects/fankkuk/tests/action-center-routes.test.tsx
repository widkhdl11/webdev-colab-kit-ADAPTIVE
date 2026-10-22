import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 지금 할 일 (action-center INV-J2·J13) — 실제 라우트(홈·지금 할 일·선물 상세·그 안의 헤더)를 불러, 한 화면의 숫자들이 같은 읽기 결과에서 나오는지 본다.
// 연결을 시험 안에서 다시 짜지 않는다: 라우트가 처리할 일을 몇 번 읽는지, 그 결과를 헤더와 본문에 그대로 넘기는지가 대상이다.
// 처리할 일 읽기만 가짜로 둔다 — 첫 읽기는 N 줄, 두 번째부터는 다른 수(N+5)를 준다. 라우트가 헤더에 결과를 안 넘겨 다시 읽거나,
// 본문 숫자를 다른 데서 세면 숫자가 어긋나 잡힌다. 나머지 읽기(선물 목록·프로필 등)는 화면을 그릴 만큼만 채운다.

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
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: vi.fn() }));

const reads = vi.hoisted(() => ({ calls: 0, rows: [] as unknown[] }));
const EXTRA = vi.hoisted(() => ({
  kind: "revgift",
  order_no: "RG-EXTRA000",
  box_id: null,
  box_label: null,
  box_seq: null,
  creator_name: "모모",
  tier: "small",
  measured_tier: null,
  amount_krw: null,
  due_at: "2026-10-20T03:00:00+00:00",
}));
vi.mock("@/entities/action-item/api/read-action-items", async () => {
  const { parseActionItems } = await import("@/entities/action-item/model/action-items");
  const next = async () => {
    reads.calls += 1;
    // 두 번째 읽기부터는 다른 수 — 같은 화면에서 다시 읽으면 숫자가 어긋난다
    const extra = Array.from({ length: 5 }, (_, i) => ({ ...EXTRA, order_no: `RG-EXTRA${i}00` }));
    const rows = reads.calls === 1 ? reads.rows : [...reads.rows, ...extra];
    return parseActionItems(rows);
  };
  return { readActionItems: vi.fn(next), readActionItemsOrNull: vi.fn(next) };
});

const ORDER = "FC-W5N3T";
const VIEWER = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" as const, nickname: "별빛" };

vi.mock("@/widgets/site-header/api/session-header", async (orig) => ({
  ...(await orig<object>()),
  loadSession: vi.fn(async () => ({ supabase: { rpc: vi.fn() }, viewer: VIEWER })),
}));

const giftRow = {
  order_no: ORDER,
  creator_name: "하루",
  item_kind: "인형·굿즈",
  box_count: 2,
  has_electronics_or_metal: false,
  status: "registered",
  registered_at: "2026-10-01T02:00:00+00:00",
  approved_at: "2026-10-01T05:00:00+00:00",
  received_at: null,
  inspection_result: null,
  inspected_at: null,
  shipped_at: null,
  expected_arrival_date: null,
  delivery: null,
  fan_tracking_no: null,
  fan_send_ack_at: null,
};
vi.mock("@/entities/order/api/fan-gift-rows", async (orig) => {
  const real = await orig<typeof import("@/entities/order/api/fan-gift-rows")>();
  return { ...real, readMyGiftViews: vi.fn(async () => real.parseFanGiftRows([giftRow], "사무실 주소")) };
});
vi.mock("@/entities/creator/api/creator-reads", async (orig) => ({ ...(await orig<object>()), readCreatorCards: vi.fn(async () => []) }));
vi.mock("@/entities/fan/api/read-fan-profile", () => ({ readFanProfile: vi.fn(async () => null) }));
vi.mock("@/entities/revgift/api/revgift-reads", async (orig) => ({ ...(await orig<object>()), readReceivedRevgifts: vi.fn(async () => []) }));
vi.mock("@/entities/payment/api/read-tier-prices", async (orig) => {
  const price = (priceKrw: number) => ({ priceKrw, revgiftPriceKrw: priceKrw, returnShippingKrw: 0 });
  return { ...(await orig<object>()), readPublicPrices: vi.fn(async () => ({ small: price(6900), medium: price(8900), large: price(10900) })) };
});
// 홈 칸 ② 광고 배너 공개 읽기(banners) — 이 시험의 대상이 아니라 빈 목록으로 둔다
vi.mock("@/entities/banner/api/read-banners", () => ({ readPublicBannersOrNull: vi.fn(async () => []) }));
vi.mock("@/entities/notice/api/notice-reads", async (orig) => ({ ...(await orig<object>()), readNotices: vi.fn(async () => []) }));
vi.mock("@/shared/api/supabase/detached", () => ({ readPublicStorageBase: () => "http://storage.test" }));
vi.mock("@/entities/parcel/api/box-reads", () => ({ readMyGiftBoxes: vi.fn(async () => []) }));
vi.mock("@/entities/payment/api/read-my-differences", () => ({ readMyDifferences: vi.fn(async () => []) }));
vi.mock("@/entities/payment/api/read-my-gift-payment", () => ({ readMyGiftPayment: vi.fn(async () => null) }));
vi.mock("@/entities/gift-reply/api/gift-reply-reads", async (orig) => ({ ...(await orig<object>()), readMyGiftReplies: vi.fn(async () => []) }));
vi.mock("@/entities/order/api/my-gift-memo", async (orig) => ({ ...(await orig<object>()), readMyGiftMemo: vi.fn(async () => null) }));

import ActionsRoute from "@/app/(site)/me/actions/page";
import GiftRoute from "@/app/(site)/gifts/[orderNo]/page";
import HomeRoute from "@/app/(site)/home/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const card = (kind: string, orderNo: string, seq: number | null) => ({
  kind,
  order_no: orderNo,
  box_id: seq === null ? null : `1111111${seq}-1111-4111-8111-111111111111`,
  box_label: seq === null ? null : `${orderNo}-${seq}`,
  box_seq: seq,
  creator_name: "하루",
  tier: "small",
  measured_tier: kind === "difference" ? "medium" : null,
  amount_krw: kind === "difference" ? 2000 : null,
  due_at: "2026-10-20T03:00:00+00:00",
});

/** 이 주문 카드 2 + 다른 역조공 카드 1 = 3 */
const THREE = [card("difference", ORDER, 2), card("missing_box", ORDER, 1), card("revgift", "RG-T1ABCDE0", null)];

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  reads.calls = 0;
  reads.rows = THREE;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function draw(page: Promise<React.ReactNode>) {
  const tree = await page;
  act(() => root.render(<>{tree}</>));
  const badge = host.querySelector('a[href="/me/actions"] .badge')?.textContent ?? null;
  // 선물 상세는 맨 위 「지금 할 일」 칸의 줄 수(INV-J13 — 전에는 한 줄)
  const box = host.querySelector("main #todo");
  const line = box ? box.querySelectorAll("[data-kind]").length : null;
  // 홈은 바로가기 「지금 할 일」 칸의 작은 글(design-rules 16절)
  const tile = [...host.querySelectorAll('ul[aria-label="내 바로가기"] a')].find((a) => a.getAttribute("href") === "/me/actions")?.textContent ?? null;
  return { badge, line, tile };
}

describe("INV-J2: 실제 라우트 — 한 화면의 숫자는 한 번 읽은 결과의 줄 수", () => {
  it("INV-J2: 홈(/home) — 처리할 일은 한 번 읽고, 사이드바 뱃지 3 · 홈 바로가기 「지금 할 일」 칸 3건", async () => {
    const r = await draw(HomeRoute());
    expect(reads.calls).toBe(1);
    expect(r.badge).toBe("3");
    expect(r.tile).toBe("지금 할 일3건");
  });

  it("INV-J2: 지금 할 일(/me/actions) — 한 번 읽고, 사이드바 뱃지 3 · 제목 숫자 3 · 줄 3", async () => {
    const r = await draw(ActionsRoute());
    expect(reads.calls).toBe(1);
    expect(r.badge).toBe("3");
    expect(host.querySelector("h1 .ph-count")?.textContent).toBe("3");
    expect(host.querySelectorAll("main [data-action-row]")).toHaveLength(3);
  });

  it("INV-J2·J13: 선물 상세(/gifts/[orderNo]) — 한 번 읽고, 사이드바 뱃지 3 · 맨 위 「지금 할 일」 칸은 그 주문 줄 2", async () => {
    const r = await draw(GiftRoute({ params: Promise.resolve({ orderNo: ORDER }), searchParams: Promise.resolve({}) }));
    expect(reads.calls).toBe(1);
    expect(r.badge).toBe("3");
    expect(r.line).toBe(2);
  });

  it("INV-J2·J13 (실패경로): 0건이면 세 라우트 모두 뱃지·상세 칸이 없고, 홈 칸은 0건", async () => {
    reads.rows = [];
    const routes = [() => HomeRoute(), () => ActionsRoute(), () => GiftRoute({ params: Promise.resolve({ orderNo: ORDER }), searchParams: Promise.resolve({}) })];
    for (const route of routes) {
      reads.calls = 0;
      const r = await draw(route());
      expect(reads.calls).toBe(1);
      expect(r.badge).toBeNull();
      expect(r.line).toBeNull();
      expect(r.tile).toBe(route === routes[0] ? "지금 할 일0건" : null);
    }
    expect(host.querySelector("main #todo")).toBeNull();
  });
});
