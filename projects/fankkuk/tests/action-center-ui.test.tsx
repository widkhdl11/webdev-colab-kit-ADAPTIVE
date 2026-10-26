import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, useSearchParams: () => new URLSearchParams(), usePathname: () => "/gifts" }));
// 카드 버튼이 부르는 기존 처리 경로(INV-J4) — 브라우저 요청 대신 무엇을 무엇으로 불렀는지 본다
const api = vi.hoisted(() => ({ prepare: vi.fn(), find: vi.fn() }));
vi.mock("@/features/difference-pay/api/post-difference-client", () => ({ postDifferencePrepare: api.prepare }));
vi.mock("@/features/box-waybill/api/post-waybill-client", async (orig) => ({ ...(await orig<object>()), postFind: api.find }));
// 헤더 읽기 모듈이 서버 전용 세션 모듈을 함께 가져온다 — 이 시험은 그 경로를 부르지 않는다
vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: vi.fn() }));

import { readActionItems } from "@/entities/action-item/api/read-action-items";
import { actionItemsOfOrder, parseActionItems, type ActionItem } from "@/entities/action-item/model/action-items";
import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
import type { PublicPriceTable } from "@/entities/payment/model/price-table";
import { ActionCenterPage } from "@/widgets/action-center/ui/action-center-page";
import { GiftTodoBox } from "@/widgets/action-center/ui/gift-todo-box";
import { GiftStatusPage } from "@/widgets/gift-status/ui/gift-status-page";
import { HomePage } from "@/widgets/home/ui/home-page";
import { readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 지금 할 일 (action-center INV-J2·J13, design-rules 21절, 시안 v34-part1/todo.html·gift-detail.html — 2026-10-21 이름 「처리할 일」 → 「지금 할 일」).
// 사이드바 숫자·홈 바로가기 칸·지금 할 일 화면의 줄·선물 상세 맨 위 「지금 할 일」 칸이 모두 같은 읽기(my_action_items) 한 번의 결과에서 나오는지 본다.
// DB 는 이 시험의 대상이 아니라 가짜 client 로 줄을 준다 — 대상은 「한 결과를 화면 넷이 같은 수로 그리는가」다. 화면은 DOM 으로 본다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  nav.refresh.mockReset();
  api.prepare.mockReset();
  api.find.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const ORDER = "FC-W5N3T";
/** 화면을 그린 때 — 서울 10월 16일 낮 */
const NOW = "2026-10-16T03:00:00+00:00";

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

const tierPrice = (priceKrw: number) => ({ priceKrw, revgiftPriceKrw: priceKrw, returnShippingKrw: 0 });
const PRICES: PublicPriceTable = { small: tierPrice(6900), medium: tierPrice(8900), large: tierPrice(10900) };

/** 한 화면이 하는 그대로 — 한 번 읽어 사이드바와 본문에 함께 넘긴다 */
async function counts(rows: readonly unknown[]) {
  const { client, calls } = fakeClient(rows);
  const items = await readActionItems(client);
  const header = await readSiteHeader(client, viewer, "/me/actions", items);
  if (header.role !== "fan") throw new Error("팬 헤더가 아니다");

  act(() => root.render(<SiteHeader {...header} />));
  const badgeLink = host.querySelector('a[href="/me/actions"]');
  const badge = badgeLink?.querySelector(".badge")?.textContent ?? null;
  // 낭독기가 읽는 링크 이름 — aria-hidden 숫자를 뺀 글자
  const speech = badgeLink ? [...badgeLink.querySelectorAll("span:not([aria-hidden])")].map((e) => e.textContent).join("") : null;

  // 홈은 바로가기 「처리할 일」 칸의 작은 글이 그 수다(design-rules 16절 — 예전 홈 한 줄을 대신한다)
  act(() => root.render(<HomePage nickname="별빛" gifts={[]} following={[]} looks={{}} faceToneByName={{}} notices={[]} prices={PRICES} actionCount={items.length} receivedCount={0} />));
  const homeTile = [...host.querySelectorAll('ul[aria-label="내 바로가기"] a')].find((a) => a.getAttribute("href") === "/me/actions");
  const homeText = homeTile?.textContent ?? null;
  const homeHref = homeTile?.getAttribute("href") ?? null;

  act(() => root.render(<ActionCenterPage items={items} now={NOW} />));
  const cardsN = host.querySelectorAll("[data-action-row]").length;
  const titleCount = host.querySelector("h1 .ph-count")?.textContent ?? null;
  const empty = host.querySelector('[data-testid="action-empty"]');

  const mine = actionItemsOfOrder(items, ORDER);
  const todo = mine.length > 0 ? <GiftTodoBox items={mine} clientKey="" now={NOW} address={{ accountId: "a1", status: null, sealingKeyPem: null }} /> : null;
  act(() => root.render(<GiftStatusPage view={view!} boxes={[]} memo={null} todo={todo} />));
  const box = host.querySelector("main #todo");
  const detailTasks = box ? box.querySelectorAll("[data-kind]").length : null;
  const detailFirst = host.querySelector("main [data-detail-top]")?.firstElementChild === box;

  return { calls, badge, speech, homeText, homeHref, cardsN, titleCount, empty, detailTasks, detailFirst, items };
}

describe("INV-J2·J13: 숫자는 한 읽기 결과의 줄 수 — 사이드바·홈·페이지·선물 상세 칸이 같은 수", () => {
  it("INV-J2 S2: 줄 2 → 사이드바 뱃지 2 · 홈 「지금 할 일」 칸 2건 · 줄 2 · 제목 숫자 2, 읽기는 한 번", async () => {
    const r = await counts([ROWS.difference, ROWS.missing]);
    expect(r.calls.filter((c) => c === "my_action_items")).toHaveLength(1);
    expect(r.badge).toBe("2");
    // 칸 이름을 두 번 읽지 않는다 — 「지금 할 일, 2건」(시안 뱃지 aria-label="3건" 꼴)
    expect(r.speech).toBe("지금 할 일, 2건");
    expect(r.homeText).toBe("지금 할 일2건");
    expect(r.homeHref).toBe("/me/actions");
    expect(r.cardsN).toBe(2);
    expect(r.titleCount).toBe("2");
    expect(r.empty).toBeNull();
    // 선물 상세 맨 위 「지금 할 일」 칸은 그 주문의 줄 모두(둘 다 같은 주문, INV-J13)
    expect(r.detailTasks).toBe(2);
    expect(r.detailFirst).toBe(true);
  });

  it("INV-J2·J13 S2: 종류가 섞인 줄 3 → 셋 다 3 · 선물 상세 칸은 그 주문 것만 2", async () => {
    const r = await counts([ROWS.difference, ROWS.revgift, ROWS.missing]);
    expect(r.badge).toBe("3");
    expect(r.homeText).toBe("지금 할 일3건");
    expect(r.cardsN).toBe(3);
    expect(r.titleCount).toBe("3");
    expect(r.detailTasks).toBe(2);
  });

  it("INV-J2·J13 S2 (실패경로): 0건 → 뱃지 없음 · 홈 칸 「0건」 · 빈 상태 · 선물 상세 칸 없음", async () => {
    const r = await counts([]);
    expect(r.badge).toBeNull();
    expect(r.homeText).toBe("지금 할 일0건");
    expect(r.cardsN).toBe(0);
    expect(r.empty?.querySelector("h2")?.textContent).toBe("확인할 항목이 없습니다");
    expect(r.detailTasks).toBeNull();
  });

  it("INV-J2: 화면이 결과를 넘기지 않으면 헤더가 같은 읽기 함수를 스스로 한 번 부른다(따로 세는 함수가 없다)", async () => {
    const { client, calls } = fakeClient([ROWS.revgift]);
    const header = await readSiteHeader(client, viewer, "/home");
    expect(calls).toEqual(["my_action_items"]);
    expect(header.role === "fan" && header.actionCount).toBe(1);
  });

  it("INV-J2 (실패경로): 헤더가 스스로 읽다 실패하면 뱃지만 빠지고 헤더는 그려진다 — 처리할 일 화면의 읽기는 실패를 그대로 드러낸다", async () => {
    const rpc = vi.fn(async (fn: string) => (fn === "my_action_items" ? { data: null, error: { code: "57014", message: "timeout" } } : { data: [], error: null }));
    const failing = { rpc } as unknown as Parameters<typeof readActionItems>[0];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const header = await readSiteHeader(failing, viewer, "/home");
      expect(header.role === "fan" && header.actionCount).toBe(0);
      act(() => root.render(<SiteHeader {...header} />));
      const link = host.querySelector('a[href="/me/actions"]');
      expect(link).not.toBeNull();
      expect(link?.querySelector(".badge")).toBeNull();
      // 넘겨받은 결과가 실패(null)였어도 같다 — 다시 읽지 않는다
      const passed = await readSiteHeader(failing, viewer, "/home", null);
      expect(passed.role === "fan" && passed.actionCount).toBe(0);
      expect(rpc.mock.calls.filter(([fn]) => fn === "my_action_items")).toHaveLength(1);
    } finally {
      errors.mockRestore();
    }
    await expect(readActionItems(failing)).rejects.toThrow("처리할 일을 읽지 못했다");
  });

  it("INV-J2: 크리에이터 헤더는 처리할 일을 읽지 않는다(크리에이터 쪽은 아직 만들지 않음)", async () => {
    const { client, calls } = fakeClient([ROWS.difference]);
    await readSiteHeader(client, { ...viewer, role: "creator" }, "/creator");
    expect(calls).not.toContain("my_action_items");
  });
});

describe("INV-J1·J4·J13: 상세 「지금 할 일」 칸의 처리와 지금 할 일 줄", () => {
  const items: ActionItem[] = parseActionItems([ROWS.difference, ROWS.missing, ROWS.revgift]);

  /** 상세 칸 — 그 주문(FC-W5N3T)의 줄만(라우트가 거르는 그대로) */
  function card(kind: string): Element {
    act(() => root.render(<GiftTodoBox items={actionItemsOfOrder(items, ORDER)} clientKey="" now={NOW} address={{ accountId: "a1", status: null, sealingKeyPem: null }} />));
    const el = host.querySelector(`#todo [data-kind="${kind}"]`);
    if (!el) throw new Error(`${kind} 줄이 없다`);
    return el;
  }

  it("INV-J1·J13: 추가 결제 — 상자·기한(서울 날짜)·차액, 「2,000원 결제하기」 버튼(시안 gift-detail.html .tbox)", () => {
    const el = card("difference");
    expect(el.querySelector("h2")?.textContent).toBe("추가 결제");
    // 2026-10-18T14:59Z = 서울 10월 18일 — 16일에 보면 2일 남음
    expect(el.querySelector("h2")?.nextElementSibling?.textContent).toBe("상자 2 · 10월 18일까지 · 2일 남음");
    expect(el.querySelector(".num-big")?.textContent).toBe("2,000원");
    expect(el.querySelector("button")?.textContent).toBe("2,000원 결제하기");
  });

  it("INV-J4: 추가 결제 버튼을 누르면 기존 차액 결제 준비(postDifferencePrepare)를 그 상자로 부른다 — 거부면 화면을 다시 읽는다", async () => {
    api.prepare.mockResolvedValue({ ok: false, message: "차액을 낼 수 없는 상태예요." });
    const el = card("difference");
    await act(async () => {
      el.querySelector("button")!.click();
    });
    expect(api.prepare).toHaveBeenCalledTimes(1);
    expect(api.prepare).toHaveBeenCalledWith({ boxId: ROWS.difference.box_id });
    expect(host.querySelector('#todo [data-kind="difference"] [role="alert"]')?.textContent).toBe("차액을 낼 수 없는 상태예요.");
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("INV-J4: 결제 준비가 받아 주면 다시 읽지 않는다(결제창으로 넘어간다)", async () => {
    api.prepare.mockResolvedValue({ ok: true, checkout: { orderId: "diff_1", orderNo: ORDER, amountKrw: 2000 } });
    const el = card("difference");
    await act(async () => {
      el.querySelector("button")!.click();
    });
    expect(api.prepare).toHaveBeenCalledWith({ boxId: ROWS.difference.box_id });
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("INV-J4: 도착하지 않은 상자 — 찾기 양식이 그 상자로 정해져 붙는다(고르는 칸·위 안내 문단 없음, 송장번호·택배사 두 칸 — 이름 첫 글자 칸은 없다, inbound-address-code INV-C4 ②-가)", () => {
    const el = card("missing_box");
    expect(el.querySelector("h2")?.textContent).toBe("미도착 상자 확인");
    const form = el.querySelector('form[aria-label="주소 끝 6자리 없이 보낸 상자 찾기"]');
    expect(form).not.toBeNull();
    expect(form?.querySelectorAll("select")).toHaveLength(1); // 택배사만 — 「상자 선택」 없음
    expect(el.textContent).not.toContain("상자 선택");
    expect(el.textContent).not.toContain("팬꾹 주소를 쓰지 않고");
    expect([...(form?.querySelectorAll("label") ?? [])].map((l) => l.textContent)).toEqual([
      "택배사",
      "송장번호",
    ]);
    expect(form?.querySelector('input[name="initial"]')).toBeNull();
    expect(el.querySelector("h2")?.nextElementSibling?.textContent).toBe("상자 1 (소형) · 11월 1일까지 · 16일 남음");
  });

  it("INV-J4: 찾기를 보내면 기존 찾기 경로(postFind)를 카드의 그 상자로 부른다", async () => {
    api.find.mockResolvedValue({ kind: "ok", body: { matched: false, message: "맞는 상자를 못 찾았어요." } });
    const el = card("missing_box");
    const form = el.querySelector("form") as HTMLFormElement;
    (form.querySelector('input[name="waybill"]') as HTMLInputElement).value = "123456789012";
    const carrier = form.querySelector("select") as HTMLSelectElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(carrier, "cj");
      carrier.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      form.requestSubmit();
    });
    expect(api.find).toHaveBeenCalledTimes(1);
    expect(api.find).toHaveBeenCalledWith({ kind: "box", id: ROWS.missing.box_id }, "123456789012", "cj");
  });

  it("INV-J13: 지금 할 일 줄 — 역조공 받기는 그 몫의 선물 상세 칸(#todo)으로 가는 「확인하기」, 남은 날(서울 날짜)", () => {
    act(() => root.render(<ActionCenterPage items={items} now={NOW} />));
    const el = host.querySelector('[data-action-row][data-kind="revgift"]');
    expect(el?.textContent).toContain("모모님이 보낸 선물 받기");
    const go = el?.querySelector("a.btn");
    expect(go?.getAttribute("href")).toBe("/gifts/RG-T1ABCDE0#todo");
    expect(go?.textContent).toBe("확인하기");
    expect(el?.querySelector(".tag")?.textContent).toBe("4일 남음");
  });

  it("INV-J13: 가장 급한 줄(기한이 가장 이른 추가 결제) 하나만 강조 칸 — 나머지는 촘촘한 줄", () => {
    act(() => root.render(<ActionCenterPage items={items} now={NOW} />));
    const feat = host.querySelectorAll(".feat[data-action-row]");
    expect([...feat].map((f) => f.getAttribute("data-kind"))).toEqual(["difference"]);
    expect([...host.querySelectorAll("li[data-action-row]")].map((f) => f.getAttribute("data-kind"))).toEqual(["revgift", "missing_box"]);
  });

  it("C-1 (d113): 도착하지 않은 상자가 강조 칸이어도 태그 「송장번호 입력」이 없다 — 「아직 보내지 않음」을 누를 팬에게는 송장번호가 없다", () => {
    const missingOnly = items.filter((it) => it.kind === "missing_box");
    act(() => root.render(<ActionCenterPage items={missingOnly} now={NOW} />));
    const feat = host.querySelector('.feat[data-action-row][data-kind="missing_box"]');
    expect(feat?.querySelector("strong")?.textContent).toBe("미도착 상자 확인");
    expect(feat?.querySelector(".tag")).toBeNull();
    expect(host.textContent).not.toContain("송장번호 입력");
  });

  it("INV-J1 (실패경로): 꼴이 다른 줄(종류가 넷째 것)이 오면 읽기 자체가 실패한다 — 일부만 버려 숫자와 목록이 달라지지 않게", () => {
    expect(() => parseActionItems([ROWS.difference, { ...ROWS.revgift, kind: "approval" }])).toThrow();
    expect(() => parseActionItems([{ ...ROWS.difference, amount_krw: null }])).toThrow();
  });
});
