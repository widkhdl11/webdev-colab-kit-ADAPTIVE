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
const who = vi.hoisted(() => ({ viewer: null as null | { userId: string; role: "fan" | "creator"; nickname: string } }));
vi.mock("@/widgets/site-header/api/session-header", async (orig) => ({
  ...(await orig<object>()),
  loadSession: vi.fn(async () => ({ supabase: { rpc: vi.fn() }, viewer: who.viewer === null ? VIEWER : who.viewer })),
}));
vi.mock("@/entities/address/api/access-log-rows", async (orig) => ({ ...(await orig<object>()), readMyAccessLog: vi.fn(async () => []) }));
vi.mock("@/entities/creator/api/creator-link-reads", async (orig) => ({
  ...(await orig<object>()),
  readMyCreatorLink: vi.fn(async () => null),
  readMyCreatorLook: vi.fn(async () => null),
  resolveCreatorHandle: vi.fn(async () => null),
}));
vi.mock("@/entities/creator/api/creator-reads", async (orig) => ({ ...(await orig<object>()), readOwnCreatorId: vi.fn(async () => null), readCreatorCards: vi.fn(async () => []) }));
vi.mock("@/entities/creator/api/my-creator-settings", async (orig) => ({ ...(await orig<object>()), readMyCreatorSettings: vi.fn(async () => null) }));
vi.mock("@/entities/notice/api/notice-reads", async (orig) => ({ ...(await orig<object>()), readNotices: vi.fn(async () => []) }));
vi.mock("@/entities/order/api/fan-gift-rows", async (orig) => ({ ...(await orig<object>()), readMyGiftViews: vi.fn(async () => []) }));
vi.mock("@/entities/order/api/incoming-gift-rows", async (orig) => ({ ...(await orig<object>()), readMyIncomingGifts: vi.fn(async () => []) }));
vi.mock("@/shared/api/supabase/detached", () => ({ readPublicStorageBase: () => "http://storage.test" }));
vi.mock("@/features/box-waybill/api/read-sent-box-candidates", () => ({ readSentBoxCandidates: vi.fn(async () => []) }));
vi.mock("@/entities/address/api/my-address-status", async (orig) => ({ ...(await orig<object>()), readMyAddressStatus: vi.fn(async () => null) }));
// 선물 현황 읽기 — 처리할 일 줄에 든 주문(FC-AP1)·몫(RG-UN1)과 들지 않은 주문(FC-NO1) 하나씩
vi.mock("@/widgets/creator-gift-progress/api/read-gift-progress", async () => {
  const { parseGiftProgressRows } = await import("@/widgets/creator-gift-progress/model/gift-progress");
  const r = { board: "received", share_id: null, tier: null, reply_state: null, box_state: null, sent_at: null, before_inbound: null, late: null, item_kind: "문구", box_count: 1, requested_at: "2026-10-12T05:20:00Z" };
  const rows = [
    { ...r, order_no: "FC-AP1", nickname: "다온", stage: "paid", approval_waiting: true, approved_at: null },
    { ...r, order_no: "FC-NO1", nickname: "보리", stage: "paid", approval_waiting: false, approved_at: "2026-10-13T05:00:00Z" },
    {
      board: "sent", order_no: "RG-UN1", share_id: "11111111-1111-4111-8111-111111111111", nickname: "모카", item_kind: null, box_count: null, tier: "small", stage: null,
      approval_waiting: null, requested_at: null, approved_at: null, reply_state: "accepted", box_state: "no_waybill", sent_at: "2026-10-02T01:00:00Z", before_inbound: true, late: true,
    },
  ];
  return { readMyGiftProgress: vi.fn(async () => parseGiftProgressRows(rows)) };
});

import CreatorActionsRoute from "@/app/(site)/creator/actions/page";
import CreatorHomeRoute from "@/app/(site)/creator/page";
import CreatorProgressRoute from "@/app/(site)/creator/progress/page";
import { readMyCreatorLink, resolveCreatorHandle } from "@/entities/creator/api/creator-link-reads";
import { readCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readMyGiftProgress } from "@/widgets/creator-gift-progress/api/read-gift-progress";

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
  who.viewer = null;
  nav.redirect.mockClear();
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
    const row = [...host.querySelectorAll("main a")].find((a) => a.textContent?.startsWith("지금 할 일"));
    expect(row?.textContent).toBe("지금 할 일3건");
  });

  it("INV-J6 S6: 처리할 일 — 한 번 읽고, 사이드바 3 · 제목 「3건」 · 줄 3", async () => {
    const r = await draw(CreatorActionsRoute({ searchParams: Promise.resolve({}) }));
    expect(reads.calls).toBe(1);
    expect(r.badge).toBe("3");
    expect(host.querySelector("h1 .ph-count")?.textContent).toBe("3건");
    expect(host.querySelectorAll("[data-row]")).toHaveLength(3);
  });

  it("INV-J6 S6 (실패경로): 0건이면 사이드바 숫자가 없고 홈은 「0건」, 처리할 일은 빈 상태", async () => {
    reads.rows = [];
    expect((await draw(CreatorHomeRoute())).badge).toBeNull();
    expect([...host.querySelectorAll("main a")].find((a) => a.textContent?.startsWith("지금 할 일"))?.textContent).toBe("지금 할 일0건");
    reads.calls = 0;
    expect((await draw(CreatorActionsRoute({ searchParams: Promise.resolve({}) }))).badge).toBeNull();
    expect(host.textContent).toContain("현재 처리할 일이 없습니다");
  });
});

describe("INV-J6·J11: 선물 현황 라우트 — 「처리할 일」 버튼은 사이드바 숫자와 같은 한 번의 읽기에서", () => {
  it("INV-J11 S6: 한 번 읽고, 사이드바 3 · 「처리할 일」 버튼은 처리할 일 줄에 든 주문·몫에만(2개)", async () => {
    const r = await draw(CreatorProgressRoute());
    expect(reads.calls).toBe(1);
    expect(r.badge).toBe("3");
    expect(host.querySelector("h1")?.textContent).toBe("선물 현황· 진행 중 3건");
    // v37: 승인 대기(다온)는 하늘 판 하나로 모이고 그 판의 버튼, 보내는 선물은 줄의 버튼
    const go = [...host.querySelectorAll("main a")].filter((a) => a.textContent === "지금 할 일" && a.closest("section[data-waiting], li"));
    expect(go.map((a) => (a.closest("li") ? a.closest("li")?.querySelector("[data-title]")?.textContent : "승인 대기 판"))).toEqual(["승인 대기 판", "모카님"]);
  });

  it("INV-J11 S11b (실패경로): 처리할 일 읽기가 비면 같은 현황에도 「처리할 일」 버튼이 없다", async () => {
    reads.rows = [];
    await draw(CreatorProgressRoute());
    expect([...host.querySelectorAll("main a")].filter((a) => a.textContent === "지금 할 일" && a.closest("section[data-waiting], li"))).toHaveLength(0);
    // 승인 대기 1건은 판에, 나머지 둘은 카드·줄로 그대로 보인다
    expect(host.querySelector("main section[data-waiting] .num-big")?.textContent).toBe("1건");
    expect(host.querySelectorAll("main li [data-title]").length).toBe(2);
  });

  it("크리에이터 홈 「진행 중인 선물」 줄은 선물 현황으로 가고, 숫자는 선물 현황 머리와 같은 값·같은 단위(3건)", async () => {
    await draw(CreatorHomeRoute());
    const row = [...host.querySelectorAll('ul[aria-label="내 바로가기"] a')].find((a) => a.textContent?.startsWith("선물 현황"));
    expect(row?.getAttribute("href")).toBe("/creator/progress");
    expect(row?.textContent).toBe("선물 현황진행 중 3건");
    const actions = [...host.querySelectorAll("main a")].find((a) => a.textContent?.startsWith("지금 할 일"));
    expect(actions?.getAttribute("href")).toBe("/creator/actions");
    const summary = host.querySelector('[aria-labelledby="creator-progress-title"]')!;
    expect(summary.querySelectorAll("li")).toHaveLength(3);
    expect(summary.textContent).toContain("다온님이 보낸 선물");
    expect(summary.textContent).toContain("승인 대기");
    expect(summary.textContent).toContain("보리님이 보낸 선물");
    expect(summary.textContent).toContain("팬꾹 도착 대기");
    expect(summary.textContent).toContain("모카님께 보낸 선물");
    expect(summary.textContent).toContain("미도착");
    expect([...summary.querySelectorAll("li a")].every((a) => a.getAttribute("href") === "/creator/progress")).toBe(true);
  });

  it("선물 현황 읽기 실패는 실제 홈 본문에도 실패 안내로 표시하고 건수를 비운다", async () => {
    vi.mocked(readMyGiftProgress).mockRejectedValueOnce(new Error("read failed"));
    await draw(CreatorHomeRoute());
    expect(host.querySelector('[aria-labelledby="creator-progress-title"]')!.textContent).toContain("불러오지 못했습니다");
    const tile = [...host.querySelectorAll('ul[aria-label="내 바로가기"] a')].find((a) => a.getAttribute("href") === "/creator/progress");
    expect(tile?.textContent).toBe("선물 현황");
  });

  it("INV-E5: 공개 아이디가 있으면 실제 홈의 내 페이지 버튼은 그 주소로 간다", async () => {
    vi.mocked(readMyCreatorLink).mockResolvedValueOnce({ handle: "haru", lockedDays: 0, photoPath: null });
    vi.mocked(resolveCreatorHandle).mockResolvedValueOnce({ creatorId: "00000000-0000-4000-b000-000000000001", handle: "haru" });
    await draw(CreatorHomeRoute());
    expect([...host.querySelectorAll("main a")].find((a) => a.textContent === "내 페이지 보기")?.getAttribute("href")).toBe("/haru");
  });

  it("INV-E5: 아이디가 없어도 공개 카드가 있으면 기존 ID 주소로 가고, 공개 카드가 없으면 숨긴다", async () => {
    const id = "00000000-0000-4000-b000-000000000001";
    vi.mocked(readOwnCreatorId).mockResolvedValueOnce(id);
    vi.mocked(readCreatorCards).mockResolvedValueOnce([{ id, name: "하루", platform: "치지직", tags: [], channelTitle: "하루", intro: "", alias: "", approvalMinutes: null, faceTone: "var(--face-1)", following: false, handle: null, photoPath: null }]);
    await draw(CreatorHomeRoute());
    expect([...host.querySelectorAll("main a")].find((a) => a.textContent === "내 페이지 보기")?.getAttribute("href")).toBe(`/creators/${id}`);
    expect(readCreatorCards).toHaveBeenCalledWith(expect.anything(), { onlyId: id, signedIn: false });
    vi.mocked(readOwnCreatorId).mockResolvedValueOnce(id);
    vi.mocked(readCreatorCards).mockResolvedValueOnce([]);
    await draw(CreatorHomeRoute());
    expect([...host.querySelectorAll("main a")].find((a) => a.textContent === "내 페이지 보기")).toBeUndefined();
  });
});

describe("선물 현황 라우트 — 크리에이터만", () => {
  it("팬은 팬 홈으로, 로그인하지 않았거나 크리에이터가 아니면 로그인으로 — 현황을 읽지 않는다", async () => {
    who.viewer = { userId: "00000000-0000-4000-a000-000000000001", role: "fan", nickname: "별빛" };
    await expect(CreatorProgressRoute()).rejects.toThrow("redirect /home");
    who.viewer = { userId: "x", role: "staff" as "fan", nickname: "직원" };
    await expect(CreatorProgressRoute()).rejects.toThrow("redirect /login");
    expect(reads.calls).toBe(0);
    who.viewer = null;
    await draw(CreatorProgressRoute());
    expect(host.querySelector("h1")?.textContent).toContain("선물 현황");
  });
});

