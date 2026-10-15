import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// 헤더 읽기 모듈이 서버 전용 세션 모듈을 함께 가져온다 — 이 시험은 그 경로를 부르지 않는다
vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: vi.fn() }));

import { readActionItems } from "@/entities/action-item/api/read-action-items";
import { actionItemsOfOrder, parseActionItems, type ActionItem } from "@/entities/action-item/model/action-items";
import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
import { ActionCenterPage } from "@/widgets/action-center/ui/action-center-page";
import { GiftStatusPage } from "@/widgets/gift-status/ui/gift-status-page";
import { HomePage } from "@/widgets/home/ui/home-page";
import { readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 처리할 일 (action-center INV-J2, design-rules 12절, 시안 v21-addendum3/fan-action-center.html·fan-home.html·fan-gift-status.html).
// 사이드바 숫자·홈 한 줄·처리할 일 화면의 카드·선물 상세 맨 위 한 줄이 모두 같은 읽기(my_action_items) 한 번의 결과에서 나오는지 본다.
// DB 는 이 시험의 대상이 아니라 가짜 client 로 줄을 준다 — 대상은 「한 결과를 화면 넷이 같은 수로 그리는가」다. 화면은 DOM 으로 본다.

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

const ORDER = "FC-W5N3T";

const ROWS = {
  difference: {
    kind: "difference",
    order_no: ORDER,
    box_id: "11111111-1111-4111-8111-111111111111",
    box_label: `${ORDER}-2`,
    box_seq: 2,
    creator_name: "하루",
    tier: "small",
    measured_tier: "medium",
    amount_krw: 2000,
    due_at: "2026-10-18T14:59:00+00:00",
  },
  missing: {
    kind: "missing_box",
    order_no: ORDER,
    box_id: "22222222-2222-4222-8222-222222222222",
    box_label: `${ORDER}-1`,
    box_seq: 1,
    creator_name: "하루",
    tier: "small",
    measured_tier: null,
    amount_krw: null,
    due_at: "2026-11-01T03:00:00+00:00",
  },
  revgift: {
    kind: "revgift",
    order_no: "RG-T1ABCDE0",
    box_id: null,
    box_label: null,
    box_seq: null,
    creator_name: "모모",
    tier: "small",
    measured_tier: null,
    amount_krw: null,
    due_at: "2026-10-20T03:00:00+00:00",
  },
} as const;

/** my_action_items 만 줄을 주는 가짜 client — 몇 번 불렸는지 센다 */
function fakeClient(rows: readonly unknown[]) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      rpc: vi.fn(async (fn: string) => {
        calls.push(fn);
        if (fn === "my_action_items") return { data: rows, error: null };
        return { data: [], error: null };
      }),
    } as unknown as Parameters<typeof readActionItems>[0],
  };
}

const viewer = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" as const, nickname: "별빛" };

const [view] = parseFanGiftRows(
  [
    {
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
    },
  ],
  "사무실 주소",
);

const profile = { photoUrl: null, bgUrl: null, intro: "" };

/** 한 화면이 하는 그대로 — 한 번 읽어 사이드바와 본문에 함께 넘긴다 */
async function counts(rows: readonly unknown[]) {
  const { client, calls } = fakeClient(rows);
  const items = await readActionItems(client);
  const header = await readSiteHeader(client, viewer, "/me/actions", [], items);
  if (header.role !== "fan") throw new Error("팬 헤더가 아니다");

  act(() => root.render(<SiteHeader {...header} />));
  const badgeLink = host.querySelector('a[href="/me/actions"]');
  const badge = badgeLink?.querySelector(".badge")?.textContent ?? null;

  act(() => root.render(<HomePage nickname="별빛" profile={profile} gifts={[]} following={[]} faceToneByName={{}} notices={[]} actionCount={items.length} />));
  const homeLine = host.querySelector('[data-testid="action-line"]');
  const homeText = homeLine?.textContent ?? null;
  const homeHref = homeLine?.querySelector("a")?.getAttribute("href") ?? null;

  act(() => root.render(<ActionCenterPage items={items} clientKey="" />));
  const cardsN = host.querySelectorAll("section.action-card").length;
  const titleCount = host.querySelector("h1 .ph-count")?.textContent ?? null;
  const empty = host.querySelector('[data-testid="action-empty"]');

  act(() => root.render(<GiftStatusPage view={view!} boxes={[]} memo={null} actionCount={actionItemsOfOrder(items, ORDER).length} />));
  const detailLine = host.querySelector('[data-testid="action-line"]');
  const detailFirst = host.querySelector("main")?.querySelector('[data-testid="action-line"]') === detailLine;

  return { calls, badge, homeText, homeHref, cardsN, titleCount, empty, detailText: detailLine?.textContent ?? null, detailFirst, items };
}

describe("INV-J2: 숫자는 한 읽기 결과의 줄 수 — 사이드바·홈·페이지·선물 상세가 같은 수", () => {
  it("INV-J2 S2: 카드 2 → 사이드바 뱃지 2 · 홈 「처리할 일 2건」 · 카드 2 · 제목 숫자 2, 읽기는 한 번", async () => {
    const r = await counts([ROWS.difference, ROWS.missing]);
    expect(r.calls.filter((c) => c === "my_action_items")).toHaveLength(1);
    expect(r.badge).toBe("2");
    expect(r.homeText).toContain("처리할 일 2건");
    expect(r.homeHref).toBe("/me/actions");
    expect(r.cardsN).toBe(2);
    expect(r.titleCount).toBe("2");
    expect(r.empty).toBeNull();
    // 선물 상세 맨 위 한 줄은 그 주문의 카드 수(둘 다 같은 주문)
    expect(r.detailText).toContain("처리할 일 2건");
    expect(r.detailFirst).toBe(true);
  });

  it("INV-J2 S2: 종류가 섞인 카드 3 → 셋 다 3 · 선물 상세는 그 주문 것만 2", async () => {
    const r = await counts([ROWS.difference, ROWS.revgift, ROWS.missing]);
    expect(r.badge).toBe("3");
    expect(r.homeText).toContain("처리할 일 3건");
    expect(r.cardsN).toBe(3);
    expect(r.titleCount).toBe("3");
    expect(r.detailText).toContain("처리할 일 2건");
  });

  it("INV-J2 S2 (실패경로): 0건 → 뱃지 없음 · 홈 줄 없음 · 빈 상태 · 선물 상세 줄 없음", async () => {
    const r = await counts([]);
    expect(r.badge).toBeNull();
    expect(r.homeText).toBeNull();
    expect(r.cardsN).toBe(0);
    expect(r.empty?.querySelector("h2")?.textContent).toBe("지금 처리할 일이 없어요");
    expect(r.detailText).toBeNull();
  });

  it("INV-J2: 화면이 결과를 넘기지 않으면 헤더가 같은 읽기 함수를 스스로 한 번 부른다(따로 세는 함수가 없다)", async () => {
    const { client, calls } = fakeClient([ROWS.revgift]);
    const header = await readSiteHeader(client, viewer, "/home", []);
    expect(calls).toEqual(["my_action_items"]);
    expect(header.role === "fan" && header.actionCount).toBe(1);
  });

  it("INV-J2: 크리에이터 헤더는 처리할 일을 읽지 않는다(크리에이터 쪽은 아직 만들지 않음)", async () => {
    const { client, calls } = fakeClient([ROWS.difference]);
    await readSiteHeader(client, { ...viewer, role: "creator" }, "/creator");
    expect(calls).not.toContain("my_action_items");
  });
});

describe("INV-J1·J4: 카드 세 종류의 내용과 버튼", () => {
  const items: ActionItem[] = parseActionItems([ROWS.difference, ROWS.missing, ROWS.revgift]);

  function card(kind: string): Element {
    act(() => root.render(<ActionCenterPage items={items} clientKey="" />));
    const el = host.querySelector(`section.action-card[data-kind="${kind}"]`);
    if (!el) throw new Error(`${kind} 카드가 없다`);
    return el;
  }

  it("INV-J1: 추가 결제 — 신고한 크기·실제 크기·차액, 기한(서울 시간), 「2,000원 결제하기」 버튼", () => {
    const el = card("difference");
    expect(el.querySelector("h2")?.textContent).toBe("추가 결제");
    expect(el.textContent).toContain("하루님께 보낸 선물 · 상자 2");
    expect(el.textContent).toContain("소형");
    expect(el.textContent).toContain("중형");
    expect(el.querySelector(".pay-total")?.textContent).toContain("2,000원");
    // 2026-10-18T14:59Z = 서울 10월 18일 오후 11시 59분
    expect(el.querySelector(".action-due")?.textContent).toContain("10월 18일 오후 11시 59분까지");
    expect(el.querySelector("button")?.textContent).toBe("2,000원 결제하기");
  });

  it("INV-J4: 도착하지 않은 상자 — 「받는 주소 없이 보냈어요」 찾기 양식이 그 상자 하나로 붙는다", () => {
    const el = card("missing_box");
    expect(el.querySelector("h2")?.textContent).toBe("도착이 늦어요");
    const form = el.querySelector('form[aria-label="받는 주소 없이 보낸 상자 찾기"]');
    expect(form).not.toBeNull();
    const options = [...(form?.querySelectorAll("select option") ?? [])].map((o) => (o as HTMLOptionElement).value);
    expect(options[0]).toBe(ROWS.missing.box_id);
    expect(el.querySelector(".action-due")?.textContent).toContain("11월 1일 오후 12시까지");
  });

  it("INV-J4: 역조공 받기 — 기존 받기 화면으로 가는 「받기」", () => {
    const el = card("revgift");
    expect(el.textContent).toContain("모모님이 보낸 선물");
    const go = el.querySelector("a.btn");
    expect(go?.getAttribute("href")).toBe("/me/revgifts/RG-T1ABCDE0");
    expect(go?.textContent).toBe("받기");
    expect(el.querySelector(".action-due")?.textContent).toContain("10월 20일 오후 12시까지");
  });

  it("INV-J1 (실패경로): 꼴이 다른 줄(종류가 넷째 것)이 오면 읽기 자체가 실패한다 — 일부만 버려 숫자와 목록이 달라지지 않게", () => {
    expect(() => parseActionItems([ROWS.difference, { ...ROWS.revgift, kind: "approval" }])).toThrow();
    expect(() => parseActionItems([{ ...ROWS.difference, amount_krw: null }])).toThrow();
  });
});
