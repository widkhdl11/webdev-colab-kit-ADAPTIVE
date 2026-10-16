import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 크리에이터 처리할 일 (action-center INV-J6 S6·S6b) — 실제 라우트(크리에이터 홈·처리할 일, 그 안의 헤더)를 불러,
// 사이드바 숫자·홈 「처리할 일 N건」·목록 줄 수가 같은 읽기 한 번의 결과에서 나오는지 본다.
// 처리할 일 읽기만 가짜로 둔다 — 첫 읽기는 N 줄, 두 번째부터는 다른 수(N+5)를 준다. 라우트가 다시 읽거나 숫자를 다른 데서 세면
// (예: 홈이 승인 요청만 따로 세면) 숫자가 어긋나 잡힌다. 나머지 읽기는 화면을 그릴 만큼만 채운다.

const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: nav.redirect,
  notFound: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: vi.fn() }));

const reads = vi.hoisted(() => ({ calls: 0, rows: [] as unknown[] }));
vi.mock("@/entities/action-item/api/read-action-items", async (orig) => {
  const real = await orig<object>();
  const { parseCreatorActionItems } = await import("@/entities/action-item/model/creator-action-items");
  const next = async () => {
    reads.calls += 1;
    const base = reads.rows as Record<string, unknown>[];
    const extra = Array.from({ length: 5 }, (_, i) => ({ ...base[0], order_no: `FC-EXTRA${i}` }));
    return parseCreatorActionItems(reads.calls === 1 || base.length === 0 ? base : [...base, ...extra]);
  };
  return { ...real, readCreatorActionItems: vi.fn(next), readCreatorActionItemsOrNull: vi.fn(next) };
});

const VIEWER = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" as const, nickname: "하루" };
vi.mock("@/widgets/site-header/api/session-header", async (orig) => ({
  ...(await orig<object>()),
  loadSession: vi.fn(async () => ({ supabase: { rpc: vi.fn() }, viewer: VIEWER })),
}));
vi.mock("@/entities/address/api/access-log-rows", async (orig) => ({ ...(await orig<object>()), readMyAccessLog: vi.fn(async () => []) }));
vi.mock("@/entities/creator/api/creator-link-reads", async (orig) => ({
  ...(await orig<object>()),
  readMyCreatorLink: vi.fn(async () => null),
  readMyCreatorLook: vi.fn(async () => null),
}));
vi.mock("@/entities/creator/api/my-creator-settings", async (orig) => ({ ...(await orig<object>()), readMyCreatorSettings: vi.fn(async () => null) }));
vi.mock("@/entities/notice/api/notice-reads", async (orig) => ({ ...(await orig<object>()), readNotices: vi.fn(async () => []) }));
vi.mock("@/entities/order/api/fan-gift-rows", async (orig) => ({ ...(await orig<object>()), readMyGiftViews: vi.fn(async () => []) }));
vi.mock("@/entities/order/api/incoming-gift-rows", async (orig) => ({ ...(await orig<object>()), readMyIncomingGifts: vi.fn(async () => []) }));
vi.mock("@/shared/api/supabase/detached", () => ({ readPublicStorageBase: () => "http://storage.test" }));
vi.mock("@/features/box-waybill/api/read-sent-box-candidates", () => ({ readSentBoxCandidates: vi.fn(async () => []) }));
vi.mock("@/entities/address/api/my-address-status", async (orig) => ({ ...(await orig<object>()), readMyAddressStatus: vi.fn(async () => null) }));

import CreatorActionsRoute from "@/app/creator/actions/page";
import CreatorHomeRoute from "@/app/creator/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}

const EMPTY = {
  request_id: null, share_id: null, box_id: null, box_seq: null, box_count: null, box_label: null, item_kind: null, tier: null,
  measured_tier: null, amount_krw: null, has_electronics_or_metal: null, bluetooth: null, rf: null, choice: null, received_at: null,
  due_at: null, prior_gift_count: null, prior_passed_count: null, prior_returned_count: null,
};
const approval = (orderNo: string) => ({
  ...EMPTY, kind: "approval", board: "received", order_no: orderNo, request_id: `apr_${orderNo}`, box_count: 1, nickname: "다온", item_kind: "문구",
  has_electronics_or_metal: false, sent_at: "2026-10-12T05:20:00Z", due_at: "2026-10-19T05:20:00Z", prior_gift_count: 0, prior_passed_count: 0, prior_returned_count: 0,
});
const bluetooth = {
  ...EMPTY, kind: "bluetooth", board: "received", order_no: "FC-BT1", box_seq: 1, box_count: 1, nickname: "별사탕", item_kind: "인형", tier: "small",
  bluetooth: true, rf: false, sent_at: "2026-10-12T01:00:00Z", received_at: "2026-10-13T01:00:00Z", due_at: "2026-10-20T14:59:00Z",
  prior_gift_count: 0, prior_passed_count: 0, prior_returned_count: 0,
};
const unconfirmed = { ...EMPTY, kind: "unconfirmed", board: "sent", order_no: "RG-UN1", share_id: "11111111-1111-4111-8111-111111111111", nickname: "모카", tier: "small", sent_at: "2026-10-02T01:00:00Z" };
/** 승인 요청 1 + 블루투스 1 + 미확인 1 = 3 — 승인 요청만 세면 1 이라 어긋난다 */
const THREE = [approval("FC-AP1"), bluetooth, unconfirmed];

let host: HTMLDivElement;
let root: Root;
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
  const badge = host.querySelector('a[href="/creator/actions"] .badge')?.textContent ?? null;
  return { badge };
}

describe("INV-J6: 실제 라우트 — 사이드바 숫자·홈 「처리할 일 N건」·목록 줄 수는 한 번 읽은 결과의 줄 수", () => {
  it("INV-J6 S6: 크리에이터 홈 — 한 번 읽고, 사이드바 3 · 바로가기 「처리할 일 3건」", async () => {
    const r = await draw(CreatorHomeRoute());
    expect(reads.calls).toBe(1);
    expect(r.badge).toBe("3");
    const row = [...host.querySelectorAll("main a")].find((a) => a.textContent?.startsWith("처리할 일"));
    expect(row?.textContent).toBe("처리할 일3건");
  });

  it("INV-J6 S6: 처리할 일 — 한 번 읽고, 사이드바 3 · 제목 「3건」 · 줄 3", async () => {
    const r = await draw(CreatorActionsRoute());
    expect(reads.calls).toBe(1);
    expect(r.badge).toBe("3");
    expect(host.querySelector("h1 .ph-count")?.textContent).toBe("3건");
    expect(host.querySelectorAll("[data-row]")).toHaveLength(3);
  });

  it("INV-J6 S6 (실패경로): 0건이면 사이드바 숫자가 없고 홈은 「0건」, 처리할 일은 빈 상태", async () => {
    reads.rows = [];
    expect((await draw(CreatorHomeRoute())).badge).toBeNull();
    expect([...host.querySelectorAll("main a")].find((a) => a.textContent?.startsWith("처리할 일"))?.textContent).toBe("처리할 일0건");
    reads.calls = 0;
    expect((await draw(CreatorActionsRoute())).badge).toBeNull();
    expect(host.textContent).toContain("지금 처리할 일이 없어요");
  });
});
