import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 팬 메뉴 재구성 (action-center 「팬 메뉴 재구성」 절 — INV-J12·J13·J14, S12~S14b).
// 실제 라우트(선물 상세 하나 · 옛 받은 선물 상세 주소 · 지금 할 일 · 보낸 선물)와 함께한 시간 읽기를 불러 DOM 으로 본다.
// DB 는 대상이 아니라 읽기 함수만 가짜로 둔다 — 가짜 읽기는 DB 처럼 「로그인한 사람 것만」 돌려준다(남의 주문번호는 없는 것과 같다).
// 대상: 상세가 주문번호 앞머리로 읽기를 고르고 소유 판정 결과를 그대로 따르는가(J12), 맨 위 「지금 할 일」 칸이 처리할 일 읽기 결과에서만 나오는가(J13),
// 보낸 선물 크리에이터 카드 숫자가 함께한 시간과 같은 읽기에서 나오는가(J14).

const nav = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`permanentRedirect ${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: nav.redirect,
  permanentRedirect: nav.permanentRedirect,
  notFound: nav.notFound,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: vi.fn() }));

type Viewer = { userId: string; role: "fan" | "creator"; nickname: string };
const FAN: Viewer = { userId: "00000000-0000-4000-a000-000000000001", role: "fan", nickname: "별빛" };
const HARU_CREATOR: Viewer = { userId: "00000000-0000-4000-a000-0000000000a1", role: "creator", nickname: "하루" };

type TogetherRow = { creatorId: string; name: string; handle: string; giftCount: number; replyCount: number; orders: string[] };

const state = vi.hoisted(() => ({
  viewer: null as unknown as Viewer,
  actions: [] as unknown[],
  gifts: [] as unknown[],
  revgifts: [] as Array<Record<string, unknown>>,
  together: [] as TogetherRow[],
  actionReads: 0,
}));

// 차액 결제 준비(기존 처리 길) — 화면을 그리기만 해서는 불리지 않아야 한다(INV-J13)
const api = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/features/difference-pay/api/post-difference-client", () => ({ postDifferencePrepare: api.prepare }));

vi.mock("@/entities/action-item/api/read-action-items", async () => {
  const { parseActionItems } = await import("@/entities/action-item/model/action-items");
  const read = async () => {
    state.actionReads += 1;
    // 처리할 일 읽기는 로그인한 팬 것만(INV-J3) — 크리에이터·남에게는 0줄
    return state.viewer.role === "fan" ? parseActionItems(state.actions) : [];
  };
  return { readActionItems: vi.fn(read), readActionItemsOrNull: vi.fn(read) };
});

vi.mock("@/widgets/site-header/api/session-header", async (orig) => ({
  ...(await orig<object>()),
  loadSession: vi.fn(async () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) }, viewer: state.viewer })),
}));

vi.mock("@/entities/order/api/fan-gift-rows", async (orig) => {
  const real = await orig<typeof import("@/entities/order/api/fan-gift-rows")>();
  return { ...real, readMyGiftViews: vi.fn(async () => real.parseFanGiftRows(state.gifts, "사무실 주소")) };
});
vi.mock("@/entities/revgift/api/revgift-reads", async (orig) => ({
  ...(await orig<object>()),
  readReceivedRevgifts: vi.fn(async () => state.revgifts),
  // 받는 팬 본인 몫만 — 가짜는 계정을 가르지 않는다(크리에이터가 열어도 준다). 크리에이터를 막는 것은 라우트의 몫이다
  readReceivedRevgift: vi.fn(async (_c: unknown, orderNo: string) => state.revgifts.find((r) => r.orderNo === orderNo) ?? null),
  readMyRevgiftAccessLog: vi.fn(async () => []),
}));
vi.mock("@/entities/address/api/my-fan-address-status", () => ({
  readMyFanAddressStatus: vi.fn(async () => ({ registered: true, label: "home", updatedAt: "2026-10-03T05:00:00Z" })),
}));
vi.mock("@/entities/together/api/together-reads", async (orig) => {
  const real = await orig<typeof import("@/entities/together/api/together-reads")>();
  const summary = (t: TogetherRow) => ({
    creatorId: t.creatorId,
    creatorName: t.name,
    creatorHandle: t.handle,
    creatorPhotoPath: null,
    giftCount: t.giftCount,
    replyCount: t.replyCount,
    firstGiftOn: "2026-10-01",
    dayCount: 21,
  });
  return {
    ...real,
    readMyTogether: vi.fn(async (_c: unknown, creatorId: string | null = null) =>
      state.together.filter((t) => creatorId === null || t.creatorId === creatorId).map(summary),
    ),
    readMyTogetherGifts: vi.fn(async (_c: unknown, creatorId: string) =>
      (state.together.find((t) => t.creatorId === creatorId)?.orders ?? []).map((orderNo, i, all) => ({
        orderNo,
        giftNo: all.length - i,
        registeredOn: "2026-10-01",
        itemKind: "인형·굿즈",
        itemCategory: null,
        anniversaryName: null,
        boxCount: 1,
        outcome: "in_progress" as const,
        stage: "registered" as const,
        approved: false,
        shippedOn: null,
        photo: null,
      })),
    ),
  };
});
vi.mock("@/entities/creator/api/creator-reads", async (orig) => ({
  ...(await orig<object>()),
  readCreatorCards: vi.fn(async () => []),
  readFollowsCreator: vi.fn(async () => false),
  readOwnCreatorId: vi.fn(async () => null),
}));
vi.mock("@/entities/creator/api/creator-link-reads", async (orig) => ({ ...(await orig<object>()), readCreatorLinkExtras: vi.fn(async () => ({ channel: null })) }));
vi.mock("@/entities/creator/api/receiving-reads", async (orig) => ({ ...(await orig<object>()), readCreatorReceiving: vi.fn(async () => new Map()) }));
vi.mock("@/entities/fan/api/read-fan-profile", () => ({ readFanProfile: vi.fn(async () => null) }));
vi.mock("@/shared/api/supabase/detached", () => ({ readPublicStorageBase: () => "http://storage.test", createPublicReadSupabase: () => ({ rpc: vi.fn() }) }));
vi.mock("@/entities/parcel/api/box-reads", () => ({ readMyGiftBoxes: vi.fn(async () => []) }));
vi.mock("@/entities/payment/api/read-my-differences", () => ({ readMyDifferences: vi.fn(async () => []) }));
vi.mock("@/entities/payment/api/read-my-gift-payment", () => ({ readMyGiftPayment: vi.fn(async () => null) }));
vi.mock("@/entities/gift-reply/api/gift-reply-reads", async (orig) => ({ ...(await orig<object>()), readMyGiftReplies: vi.fn(async () => []) }));
vi.mock("@/entities/order/api/my-gift-memo", async (orig) => ({ ...(await orig<object>()), readMyGiftMemo: vi.fn(async () => null) }));

import { readMyGiftBoxes } from "@/entities/parcel/api/box-reads";
import ActionsRoute from "@/app/(site)/me/actions/page";
import OldRevgiftRoute from "@/app/(site)/me/revgifts/[orderNo]/page";
import GiftRoute from "@/app/(site)/gifts/[orderNo]/page";
import GiftsRoute from "@/app/(site)/gifts/page";
import { loadTogetherPage } from "@/widgets/together/api/load-together";
import { TogetherPage } from "@/widgets/together/ui/together-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  state.viewer = FAN;
  state.actions = [];
  state.gifts = [];
  state.revgifts = [];
  state.together = [];
  state.actionReads = 0;
  api.prepare.mockReset();
  nav.notFound.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** my_gifts 한 줄 — status·시각만 바꿔 쓴다 */
function giftRow(orderNo: string, creatorName: string, over: Record<string, unknown> = {}) {
  return {
    order_no: orderNo,
    creator_name: creatorName,
    item_kind: "인형·굿즈",
    box_count: 1,
    has_electronics_or_metal: false,
    status: "registered",
    registered_at: "2026-10-01T02:00:00+00:00",
    approved_at: null,
    received_at: null,
    inspection_result: null,
    inspected_at: null,
    shipped_at: null,
    expected_arrival_date: null,
    delivery: null,
    fan_tracking_no: null,
    fan_send_ack_at: null,
    ...over,
  };
}

function revgift(orderNo: string, creatorName: string) {
  return {
    orderNo,
    creatorName,
    tier: "small",
    reply: "waiting",
    deadline: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    shipped: false,
    returned: false,
    disposed: false,
    cancelled: false,
  };
}

const difference = (orderNo: string) => ({
  kind: "difference",
  order_no: orderNo,
  box_id: "11111111-1111-4111-8111-111111111111",
  box_label: `${orderNo}-2`,
  box_seq: 2,
  creator_name: "하루",
  tier: "small",
  measured_tier: "medium",
  amount_krw: 3000,
  due_at: "2026-10-30T14:59:00+00:00",
});

const detail = (orderNo: string) => GiftRoute({ params: Promise.resolve({ orderNo }), searchParams: Promise.resolve({}) });

async function draw(page: Promise<React.ReactNode> | React.ReactNode) {
  const tree = await page;
  act(() => root.render(<>{tree}</>));
  return {
    badge: host.querySelector('a[href="/me/actions"] .badge')?.textContent ?? null,
    todo: host.querySelector("main #todo"),
    h1: host.querySelector("main h1")?.textContent ?? null,
  };
}

describe("INV-J12: 선물 상세 하나 — /gifts/{주문번호}", () => {
  beforeEach(() => {
    state.gifts = [giftRow("FC-7K3M9", "하루")];
    state.revgifts = [revgift("RG-4F8K2A", "하루")];
  });

  it("INV-J12 S12: 별빛이 보낸 FC-7K3M9 와 별빛이 받는 팬인 RG-4F8K2A 가 같은 상세 주소로 둘 다 열린다", async () => {
    const fc = await draw(detail("FC-7K3M9"));
    expect(fc.h1).toBe("하루님께 보내는 선물");
    const rg = await draw(detail("RG-4F8K2A"));
    expect(rg.h1).toBe("하루님이 보낸 선물");
    // 받은 역조공 상세의 칸은 지금 받기 화면이 주는 칸을 넘지 않는다 — 보낸 크리에이터의 다른 몫·주소는 없다
    expect(host.querySelector("main")?.textContent).toContain("RG-4F8K2A");
    expect(nav.notFound).not.toHaveBeenCalled();
  });

  it("INV-J12 S12: 옛 받은 선물 상세 /me/revgifts/RG-4F8K2A 는 같은 주문번호의 /gifts/RG-4F8K2A 로 영구 넘긴다(이미 나간 알림 링크)", async () => {
    await expect(OldRevgiftRoute({ params: Promise.resolve({ orderNo: "RG-4F8K2A" }) })).rejects.toThrow("permanentRedirect /gifts/RG-4F8K2A");
    expect(nav.permanentRedirect).toHaveBeenCalledWith("/gifts/RG-4F8K2A");
  });

  it("INV-J12 S12b (실패경로): 남의 FC·RG, 없는 주문번호, 형식이 틀린 주문번호는 모두 똑같이 「페이지를 찾을 수 없어요」(notFound)", async () => {
    // 달토끼가 보낸 FC-DAL7T, 모카가 받는 팬인 RG-MOCA01 — 별빛의 읽기에는 없다
    for (const orderNo of ["FC-DAL7T", "RG-MOCA01", "FC-NONE99", "RG-NONE99", "XX-123", "fc-7k3m9", "RG-4F8K2A-1", "FC-7K3M9#todo"]) {
      await expect(detail(orderNo), orderNo).rejects.toThrow(/^notFound$/);
    }
  });

  it("INV-J12 S12b (실패경로): 그 역조공을 보낸 크리에이터(하루)가 /gifts/RG-4F8K2A 를 열면 팬 상세가 아니다 — 받는 팬이 아니다", async () => {
    state.viewer = HARU_CREATOR;
    await expect(detail("RG-4F8K2A")).rejects.toThrow(/^notFound$/);
  });
});

describe("INV-J13: 상세 맨 위 「지금 할 일」 칸은 처리할 일 읽기 결과에서만", () => {
  beforeEach(() => {
    state.gifts = [giftRow("FC-R2D8Q", "하루"), giftRow("FC-7K3M9", "하루")];
    state.actions = [difference("FC-R2D8Q")];
  });

  it("INV-J13 S13: FC-R2D8Q 에만 칸 — 뱃지 1 · 지금 할 일 줄 1 · 칸 있는 상세 1, 읽기는 화면마다 한 번", async () => {
    const withTodo = await draw(detail("FC-R2D8Q"));
    expect(state.actionReads).toBe(1);
    expect(withTodo.badge).toBe("1");
    expect(withTodo.todo?.textContent).toContain("지금 할 일");
    expect(withTodo.todo?.textContent).toContain("추가 결제");
    // 칸은 상세 본문의 맨 위(보낸 선물로 돌아가기 다음)
    expect(host.querySelector("main [data-detail-top]")?.firstElementChild?.id).toBe("todo");

    state.actionReads = 0;
    const without = await draw(detail("FC-7K3M9"));
    expect(state.actionReads).toBe(1);
    expect(without.badge).toBe("1");
    expect(without.todo).toBeNull();

    state.actionReads = 0;
    const list = await draw(ActionsRoute());
    expect(state.actionReads).toBe(1);
    expect(list.badge).toBe("1");
    expect(host.querySelectorAll("main [data-action-row]")).toHaveLength(1);
    expect(host.querySelector("main h1 .ph-count")?.textContent).toBe("1");
  });

  it("INV-J13 S13b: 「바로 하기」는 그 상세의 #todo 로 가고, 칸이 펼쳐진 채 열려도 결제는 칸의 버튼을 눌러야 시작된다", async () => {
    await draw(ActionsRoute());
    const go = [...host.querySelectorAll("main a")].find((a) => a.textContent === "바로 하기");
    expect(go?.getAttribute("href")).toBe("/gifts/FC-R2D8Q#todo");

    const r = await draw(detail("FC-R2D8Q"));
    const pay = r.todo?.querySelector("button");
    expect(pay?.textContent).toBe("3,000원 결제하기");
    // 펼쳐진 상태 — 접힌 칸(details·hidden) 안에 있지 않다
    expect(pay?.closest("details:not([open]), [hidden]")).toBeNull();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it("INV-J13 S13b: 받은 역조공(RG)도 받기·받지 않기는 칸 안에 있고, 열기만으로는 아무것도 처리하지 않는다", async () => {
    state.revgifts = [revgift("RG-4F8K2A", "하루")];
    state.actions = [{ kind: "revgift", order_no: "RG-4F8K2A", box_id: null, box_label: null, box_seq: null, creator_name: "하루", tier: "small", measured_tier: null, amount_krw: null, due_at: "2026-10-26T03:00:00+00:00" }];
    const r = await draw(detail("RG-4F8K2A"));
    expect(r.badge).toBe("1");
    const labels = [...(r.todo?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(labels).toEqual(["받기", "받지 않기"]);
    // 칸 밖에는 받기 버튼이 없다
    expect([...host.querySelectorAll("main button")].filter((b) => b.textContent === "받기" && !r.todo?.contains(b))).toHaveLength(0);
  });

  it("INV-J13 S13c (실패경로): 추가 결제를 마친 뒤(읽기 결과에 없음) 상세를 다시 열면 칸이 없고 뱃지가 없다", async () => {
    state.actions = [];
    const r = await draw(detail("FC-R2D8Q"));
    expect(r.todo).toBeNull();
    expect(r.badge).toBeNull();
  });

  it("INV-J13 S13c (실패경로): 받은 역조공 몫이 읽기 결과에 없으면 받기 칸도 받기 버튼도 없다 — 상세가 따로 계산하지 않는다", async () => {
    state.revgifts = [revgift("RG-4F8K2A", "하루")];
    state.actions = [];
    const r = await draw(detail("RG-4F8K2A"));
    expect(r.todo).toBeNull();
    expect([...host.querySelectorAll("main button")].map((b) => b.textContent)).not.toContain("받기");
  });

  it("INV-J13 (실패경로): 칸의 「도착이 늦어요」 상자는 아래 「팬꾹 주소 없이 보냈어요」에서 고를 수 없고, 칸에 없는 상자는 아래에서 찾는다", async () => {
    const B1 = "22222222-2222-4222-8222-222222222222";
    const B2 = "44444444-4444-4444-8444-444444444444";
    const giftBox = (boxId: string, seq: number) => ({ boxId, label: `FC-7K3M9-${seq}`, tier: "small" as const, waybillNo: null, state: "no_waybill" as const, addressCode: null, sendAckNeeded: false });
    vi.mocked(readMyGiftBoxes).mockResolvedValueOnce([giftBox(B1, 1), giftBox(B2, 2)]);
    state.actions = [{ ...difference("FC-7K3M9"), kind: "missing_box", box_id: B1, box_label: "FC-7K3M9-1", box_seq: 1, measured_tier: null, amount_krw: null }];
    const r = await draw(detail("FC-7K3M9"));
    expect(r.todo?.querySelector("form")).not.toBeNull();
    const below = [...host.querySelectorAll("main summary")].find((h) => h.textContent === "팬꾹 주소 없이 보냈다면")?.closest("[data-sec]");
    expect(below?.querySelector("form")).not.toBeNull();
    expect(below?.textContent).not.toContain("FC-7K3M9-1");
  });

  it("INV-J13 S13c (실패경로): 지금 할 일 페이지의 카드 안에는 결제·찾기·주소 입력 칸이 없다 — 상세로 가는 줄뿐", async () => {
    state.actions = [
      difference("FC-R2D8Q"),
      { ...difference("FC-7K3M9"), kind: "missing_box", box_id: "22222222-2222-4222-8222-222222222222", measured_tier: null, amount_krw: null },
      { ...difference("FC-7K3M9"), kind: "return_address", box_id: "33333333-3333-4333-8333-333333333333", measured_tier: null, amount_krw: null },
      { kind: "revgift", order_no: "RG-4F8K2A", box_id: null, box_label: null, box_seq: null, creator_name: "하루", tier: "small", measured_tier: null, amount_krw: null, due_at: "2026-10-26T03:00:00+00:00" },
    ];
    await draw(ActionsRoute());
    const main = host.querySelector("main")!;
    expect(main.querySelectorAll("[data-action-row]")).toHaveLength(4);
    expect(main.querySelectorAll("form, input, select, textarea, button, dialog")).toHaveLength(0);
    const hrefs = [...main.querySelectorAll("a")].filter((a) => a.textContent === "바로 하기").map((a) => a.getAttribute("href"));
    expect(hrefs.sort()).toEqual(["/gifts/FC-7K3M9#todo", "/gifts/FC-7K3M9#todo", "/gifts/FC-R2D8Q#todo", "/gifts/RG-4F8K2A#todo"]);
  });
});

describe("INV-J14: 보낸 선물 — 위 크리에이터 카드 줄 + 아래 묶지 않은 선물 격자", () => {
  const HARU = { creatorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "하루", handle: "haru" };
  const MOMO = { creatorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "모모", handle: "momo" };

  function panel(label: RegExp): Element {
    const tab = [...host.querySelectorAll('main [role="tab"]')].find((t) => label.test(t.textContent ?? ""));
    if (!tab) throw new Error(`탭 ${label} 이 없다`);
    act(() => (tab as HTMLButtonElement).click());
    return host.querySelector(`#${tab.getAttribute("aria-controls")}`)!;
  }
  // 크리에이터 카드 줄은 탭 패널 밖(탭과 상관없이 전부)
  const creatorCards = () => [...host.querySelectorAll("main [data-creator-card]")];
  const creatorCard = (name: string) => creatorCards().find((c) => c.getAttribute("data-creator-card") === name);
  const rowHrefs = (p: Element) => [...p.querySelectorAll("[data-gift-row]")].map((r) => r.querySelector("a")?.getAttribute("href"));

  it("INV-J14 S14: 하루 3개·모모 2개 → 크리에이터 카드 둘(하루 「선물 3개」 = 하루 함께한 시간 「함께한 선물 3」), 아래 선물 카드는 묶이지 않고 최근 순", async () => {
    state.gifts = [
      giftRow("FC-HARU3", "하루", { registered_at: "2026-10-12T02:00:00+00:00" }),
      giftRow("FC-HARU2", "하루", { registered_at: "2026-10-05T02:00:00+00:00", received_at: "2026-10-15T02:00:00+00:00" }),
      giftRow("FC-HARU1", "하루", { status: "rejected", registered_at: "2026-10-01T02:00:00+00:00" }),
      giftRow("FC-MOMO2", "모모", { registered_at: "2026-10-10T02:00:00+00:00" }),
      giftRow("FC-MOMO1", "모모", { registered_at: "2026-10-02T02:00:00+00:00" }),
    ];
    state.together = [
      { ...HARU, giftCount: 3, replyCount: 0, orders: ["FC-HARU3", "FC-HARU2", "FC-HARU1"] },
      { ...MOMO, giftCount: 2, replyCount: 1, orders: ["FC-MOMO2", "FC-MOMO1"] },
    ];
    // 모모 FC-MOMO2 에만 지금 할 일(추가 결제) 줄
    state.actions = [difference("FC-MOMO2")];
    await draw(GiftsRoute());
    expect(nav.redirect).not.toHaveBeenCalledWith(expect.stringContaining("/gifts/with/"));
    // 크리에이터 카드 — 함께한 시간 읽기 순서, 숫자는 함께한 시간 값 그대로(끝난·받지 않은 것 포함 3)
    expect(creatorCards().map((c) => c.getAttribute("data-creator-card"))).toEqual(["하루", "모모"]);
    const haru = creatorCard("하루")!;
    expect(haru.querySelector("[data-creator-count]")?.textContent).toBe("선물 3개 · 답장 0통");
    expect(creatorCard("모모")?.querySelector("[data-creator-count]")?.textContent).toBe("선물 2개 · 답장 1통");
    // 최근 선물 상태 — 하루에게 가장 최근에 보낸 FC-HARU3 의 꼬리표(아래 격자의 그 카드와 같은 글자)
    const lastTag = haru.querySelector("[data-creator-last] .tag")?.textContent;
    expect(lastTag).toBeTruthy();
    // 카드를 누르면 그 크리에이터의 함께한 시간
    const cardLinks = haru.querySelectorAll("a");
    expect(cardLinks).toHaveLength(1);
    expect(cardLinks[0]?.getAttribute("href")).toBe("/gifts/with/haru");
    // 카드는 탭 패널 밖
    expect(haru.closest('[role="tabpanel"]')).toBeNull();

    // 아래 격자 — 크리에이터로 묶지 않고 최근 순(하루·모모가 섞인다), 카드는 선물 상세로
    const ing = panel(/^진행 중/);
    expect(ing.querySelectorAll("[data-gift-group]")).toHaveLength(0);
    // 할 일이 있는 카드만 칸(#todo)으로 바로 간다(진단 A-1)
    expect(rowHrefs(ing)).toEqual(["/gifts/FC-HARU3", "/gifts/FC-MOMO2#todo", "/gifts/FC-HARU2", "/gifts/FC-MOMO1"]);
    const haru3 = [...ing.querySelectorAll("[data-gift-row]")].find((r) => r.querySelector("a")?.getAttribute("href") === "/gifts/FC-HARU3");
    expect(haru3?.querySelector(".tag")?.textContent).toBe(lastTag);
    // 할 일이 있는 카드만 강조(design-rules 22절) — 사이드바 숫자와 같은 지금 할 일 읽기 결과의 주문(모모 FC-MOMO2)
    const hi = [...ing.querySelectorAll("[data-gift-row][data-hi]")];
    expect(hi.map((r) => r.querySelector("a")?.getAttribute("href"))).toEqual(["/gifts/FC-MOMO2#todo"]);
    expect(rowHrefs(panel(/^완료/))).toEqual(["/gifts/FC-HARU1"]);

    // 함께한 시간 화면 — 같은 읽기(my_together)의 개인 기록 두 칸
    const data = await loadTogetherPage({ client: { rpc: vi.fn() }, viewer: FAN, creatorId: HARU.creatorId, photoBase: "" });
    act(() => root.render(<TogetherPage {...data!} />));
    const dd = [...host.querySelectorAll("dt")].find((dt) => dt.textContent === "함께한 선물")?.nextElementSibling;
    expect(dd?.textContent?.replace(/\D/g, "")).toBe("3");
    expect(host.querySelector("main a")?.textContent?.trim()).toBe("‹ 보낸 선물로");
    expect(host.querySelector("main a")?.getAttribute("href")).toBe("/gifts");
  });

  it("INV-J14 S14 (실패경로): 카드 숫자는 목록 줄 수가 아니라 함께한 시간 값 — 둘이 다르면 함께한 시간 값이 보인다", async () => {
    state.gifts = [giftRow("FC-HARU1", "하루")];
    state.together = [{ ...HARU, giftCount: 4, replyCount: 2, orders: ["FC-HARU1"] }];
    await draw(GiftsRoute());
    expect(creatorCard("하루")?.querySelector("[data-creator-count]")?.textContent).toBe("선물 4개 · 답장 2통");
  });

  it("INV-J14 S14b: 하루에게 보낸 것이 모두 끝나면 「진행 중」 격자에 하루 선물이 없지만 하루 크리에이터 카드는 있다 — 「완료」 격자에는 있다", async () => {
    state.gifts = [
      giftRow("FC-HARU2", "하루", { status: "expired", registered_at: "2026-10-05T02:00:00+00:00" }),
      giftRow("FC-HARU1", "하루", { status: "rejected", registered_at: "2026-10-01T02:00:00+00:00" }),
      giftRow("FC-MOMO1", "모모", { registered_at: "2026-10-02T02:00:00+00:00" }),
    ];
    state.together = [
      { ...HARU, giftCount: 2, replyCount: 0, orders: ["FC-HARU2", "FC-HARU1"] },
      { ...MOMO, giftCount: 1, replyCount: 0, orders: ["FC-MOMO1"] },
    ];
    await draw(GiftsRoute());
    const tabs = [...host.querySelectorAll('main [role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["진행 중 1", "완료 2"]);
    expect(rowHrefs(panel(/^진행 중/))).toEqual(["/gifts/FC-MOMO1"]);
    expect(creatorCards().map((c) => c.getAttribute("data-creator-card"))).toEqual(["하루", "모모"]);
    expect(creatorCard("하루")?.querySelector("[data-creator-count]")?.textContent).toBe("선물 2개 · 답장 0통");
    expect(rowHrefs(panel(/^완료/))).toEqual(["/gifts/FC-HARU2", "/gifts/FC-HARU1"]);
    // 탭을 바꿔도 크리에이터 카드 줄은 그대로
    expect(creatorCards().map((c) => c.getAttribute("data-creator-card"))).toEqual(["하루", "모모"]);
  });

  it("INV-J14 S14b: 선물한 크리에이터가 하루 한 명이어도 함께한 시간으로 넘기지 않고 크리에이터 카드 하나와 선물 격자가 보인다", async () => {
    state.gifts = [giftRow("FC-HARU1", "하루")];
    state.together = [{ ...HARU, giftCount: 1, replyCount: 0, orders: ["FC-HARU1"] }];
    await draw(GiftsRoute());
    expect(nav.redirect).not.toHaveBeenCalled();
    expect(creatorCards().map((c) => c.getAttribute("data-creator-card"))).toEqual(["하루"]);
    expect(rowHrefs(panel(/^진행 중/))).toEqual(["/gifts/FC-HARU1"]);
  });
  it("INV-J14 S14c: 결제를 마치지 않은 선물은 「진행 중」 맨 위 카드 한 장 — 지금 할 일 읽기의 결제 미완료 줄로 그리고 칸(#todo)으로 간다", async () => {
    state.gifts = [giftRow("FC-HARU1", "하루")];
    state.together = [{ ...HARU, giftCount: 1, replyCount: 0, orders: ["FC-HARU1"] }];
    state.actions = [{ kind: "unpaid", order_no: "FC-U8P2K", box_id: null, box_label: null, box_seq: null, creator_name: "하루", tier: null, measured_tier: null, amount_krw: 5900, due_at: "2026-10-23T05:00:00+00:00" }];
    await draw(GiftsRoute());
    const ing = panel(/^진행 중/);
    const first = ing.querySelectorAll("li")[0]!;
    expect(first.hasAttribute("data-unpaid-row")).toBe(true);
    expect(first.querySelector("a")?.textContent).toBe("결제를 마치지 않은 선물");
    expect(first.querySelector("a")?.getAttribute("href")).toBe("/gifts/FC-U8P2K#todo");
    expect(first.textContent).toContain("하루님께 보낼 선물");
    expect(first.textContent).toContain("10월 23일까지");
    expect(first.textContent).toContain("결제하기 ›");
    // 격자는 결제가 끝난 주문 그대로 — 결제 대기 주문은 선물 카드로 그리지 않는다
    expect(rowHrefs(ing)).toEqual(["/gifts/FC-HARU1"]);
    expect(ing.querySelectorAll("[data-unpaid-row]")).toHaveLength(1);
  });

  it("INV-J14 S14c (실패경로): 결제 미완료 줄이 없으면 카드도 없다 — 다른 종류의 줄은 결제하기 카드가 되지 않는다", async () => {
    state.gifts = [giftRow("FC-HARU1", "하루")];
    state.together = [{ ...HARU, giftCount: 1, replyCount: 0, orders: ["FC-HARU1"] }];
    state.actions = [difference("FC-HARU1")];
    await draw(GiftsRoute());
    const ing = panel(/^진행 중/);
    expect(ing.querySelectorAll("[data-unpaid-row]")).toHaveLength(0);
    expect(ing.textContent).not.toContain("결제를 마치지 않은 선물");
  });

  it("INV-J14 S14c: 진행 중인 결제된 선물이 없어도 결제 미완료 카드는 빈 안내 대신 보인다", async () => {
    state.actions = [{ kind: "unpaid", order_no: "FC-U8P2K", box_id: null, box_label: null, box_seq: null, creator_name: "하루", tier: null, measured_tier: null, amount_krw: 5900, due_at: "2026-10-23T05:00:00+00:00" }];
    await draw(GiftsRoute());
    const ing = panel(/^진행 중/);
    expect(ing.querySelectorAll("[data-unpaid-row]")).toHaveLength(1);
    expect(ing.textContent).not.toContain("지금 진행 중인 선물이 없어요.");
  });
});

describe("보낸 선물 카드의 하늘 면 — 지금 할 일 줄이 있는 카드에만(진단 A-1·A-2, INV-J2)", () => {
  function ongoingPanel(): Element {
    const tab = [...host.querySelectorAll('main [role="tab"]')].find((t) => /^진행 중/.test(t.textContent ?? ""))!;
    act(() => (tab as HTMLButtonElement).click());
    return host.querySelector(`#${tab.getAttribute("aria-controls")}`)!;
  }
  const row = (p: Element, no: string) => [...p.querySelectorAll("[data-gift-row]")].find((r) => r.querySelector("a")?.getAttribute("href")?.startsWith(`/gifts/${no}`));

  it("A-2 (실패경로): 「보내 주세요」 카드라도 지금 할 일 줄이 없으면 하늘 면이 아니다 — 사이드바 숫자와 하늘 면 수가 같다", async () => {
    state.gifts = [giftRow("FC-SEND1", "하루", { approved_at: "2026-10-01T05:00:00+00:00" }), giftRow("FC-R2D8Q", "하루", { registered_at: "2026-09-30T02:00:00+00:00" })];
    state.actions = [difference("FC-R2D8Q")];
    const r = await draw(GiftsRoute());
    const p = ongoingPanel();
    const send = row(p, "FC-SEND1")!;
    expect(send.querySelector(".tag")?.textContent).toBe("보내 주세요");
    expect(send.hasAttribute("data-hi")).toBe(false);
    expect(send.querySelector("a")?.getAttribute("href")).toBe("/gifts/FC-SEND1");
    expect(send.querySelector("[data-todo-line]")).toBeNull();
    expect(String(p.querySelectorAll("[data-gift-row][data-hi]").length)).toBe(r.badge);
  });

  it("A-1: 하늘 면 카드에는 지금 할 일 줄의 제목과 기한이 한 줄로 붙는다", async () => {
    state.gifts = [giftRow("FC-R2D8Q", "하루")];
    state.actions = [difference("FC-R2D8Q")];
    await draw(GiftsRoute());
    const card = row(ongoingPanel(), "FC-R2D8Q")!;
    expect(card.hasAttribute("data-hi")).toBe(true);
    const line = card.querySelector("[data-todo-line]");
    expect([...(line?.children ?? [])].map((c) => c.textContent)).toEqual(["추가 결제", "10월 30일까지"]);
  });

  it("A-1: 한 주문에 줄이 여럿이면 기한이 가장 이른 줄을 붙이고, 기한이 없는 줄은 제목만", async () => {
    state.gifts = [giftRow("FC-7K3M9", "하루"), giftRow("FC-R2D8Q", "하루", { registered_at: "2026-09-30T02:00:00+00:00" })];
    state.actions = [
      difference("FC-7K3M9"),
      { ...difference("FC-7K3M9"), kind: "missing_box", box_id: "22222222-2222-4222-8222-222222222222", measured_tier: null, amount_krw: null, due_at: "2026-10-27T14:59:00+00:00" },
      { ...difference("FC-R2D8Q"), due_at: null },
    ];
    await draw(GiftsRoute());
    const p = ongoingPanel();
    const lineOf = (no: string) => [...(row(p, no)?.querySelector("[data-todo-line]")?.children ?? [])].map((c) => c.textContent);
    expect(lineOf("FC-7K3M9")).toEqual(["도착이 늦어요", "10월 27일까지"]);
    expect(lineOf("FC-R2D8Q")).toEqual(["추가 결제"]);
  });
});

describe("보낸 선물 상세 — 결제 직후 안내(진단 B-1)", () => {
  beforeEach(() => {
    state.gifts = [giftRow("FC-7K3M9", "하루")];
  });
  const paidLine = () => host.querySelector("main [data-paid-line]");

  it("B-1: 결제 성공 뒤 돌아온 주소(?paid=1)로 열면 상태 판 위에 「결제가 끝났어요.」", async () => {
    await draw(GiftRoute({ params: Promise.resolve({ orderNo: "FC-7K3M9" }), searchParams: Promise.resolve({ paid: "1" }) }));
    expect(paidLine()?.textContent).toMatch(/^결제가 끝났어요\./);
  });

  it("B-1 (실패경로): 물음표 값 없이 다시 열면 안내 줄이 없다", async () => {
    await draw(detail("FC-7K3M9"));
    expect(paidLine()).toBeNull();
    await draw(GiftRoute({ params: Promise.resolve({ orderNo: "FC-7K3M9" }), searchParams: Promise.resolve({ paid: "0" }) }));
    expect(paidLine()).toBeNull();
  });
});
