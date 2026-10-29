import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCreatorActionItems } from "@/entities/action-item/model/creator-action-items";
import { parseGiftProgressRows } from "../model/gift-progress";

// 크리에이터 선물 현황 화면 (action-center INV-J9~J11, design-rules 13절, 시안 v21-addendum3/cre-progress.html · 배송 조회 창은 cre-action-center-c.html 창 A).
// 버튼은 배송 조회(늦은 입고 전 몫), 「내 상자 찾기」(입고 전 몫마다), 「처리할 일」(처리할 일 읽기 결과에 있는 줄)뿐 — 상태를 바꾸는 처리는 없다.
const postFind = vi.fn();
vi.mock("@/features/box-waybill/api/post-waybill-client", async (orig) => ({ ...(await orig<object>()), postFind: (...a: unknown[]) => postFind(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { GiftProgressPage } from "./gift-progress-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  // 브라우저처럼 열려 있던 창을 닫으면 close 이벤트를 낸다(BottomSheet 는 onClose 를 이 이벤트로만 부른다)
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

let host: HTMLDivElement;
let root: Root;
const fetchSpy = vi.fn();
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  postFind.mockReset();
  refresh.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const R = {
  board: "received", share_id: null, tier: null, reply_state: null, box_state: null, sent_at: null, before_inbound: null, late: null,
  item_kind: "인형·쿠션", box_count: 2, requested_at: "2026-10-15T05:00:00Z",
};
const S = { board: "sent", item_kind: null, box_count: null, stage: null, approval_waiting: null, requested_at: null, approved_at: null, tier: "small" };
const ROWS = [
  { ...R, order_no: "FC-A1", nickname: "하루", stage: "paid", approval_waiting: true, approved_at: null },
  { ...R, order_no: "FC-B1", nickname: "보리", stage: "paid", approval_waiting: false, approved_at: "2026-10-13T05:00:00Z", box_count: 1 },
  { ...R, order_no: "FC-C1", nickname: "소라", stage: "in_transit", approval_waiting: false, approved_at: "2026-10-10T05:00:00Z", box_count: 1 },
  { ...S, order_no: "RG-A0", share_id: S1, nickname: "모카", reply_state: "accepted", box_state: "no_waybill", sent_at: "2026-10-02T01:00:00Z", before_inbound: true, late: true },
  { ...S, order_no: "RG-A1", share_id: S2, nickname: "하루", reply_state: "accepted", box_state: "shipped", sent_at: "2026-10-02T01:00:00Z", before_inbound: false, late: false },
  { ...S, order_no: "RG-B0", share_id: S3, nickname: "꿀단지", reply_state: "waiting", box_state: "no_waybill", sent_at: "2026-10-09T01:00:00Z", before_inbound: true, late: false },
];
const EMPTY = {
  request_id: null, share_id: null, box_id: null, box_seq: null, box_count: null, box_label: null, item_kind: null, tier: null,
  measured_tier: null, amount_krw: null, has_electronics_or_metal: null, bluetooth: null, rf: null, choice: null, received_at: null,
  due_at: null, prior_gift_count: null, prior_passed_count: null, prior_returned_count: null,
};
const ITEMS = parseCreatorActionItems([
  {
    ...EMPTY, kind: "approval", board: "received", order_no: "FC-A1", request_id: "apr_FCA1", box_count: 2, nickname: "하루", item_kind: "인형·쿠션",
    has_electronics_or_metal: false, sent_at: "2026-10-15T05:00:00Z", due_at: "2026-10-22T05:00:00Z", prior_gift_count: 0, prior_passed_count: 0, prior_returned_count: 0,
  },
  { ...EMPTY, kind: "unconfirmed", board: "sent", order_no: "RG-A0", share_id: S1, nickname: "모카", tier: "small", sent_at: "2026-10-02T01:00:00Z" },
]);
const CANDIDATES = [
  { shareId: S1, nickname: "모카", tier: "small" },
  { shareId: S3, nickname: "꿀단지", tier: "small" },
];

function render(rows: unknown[] = ROWS, items = ITEMS) {
  act(() => root.render(<GiftProgressPage progress={parseGiftProgressRows(rows)} items={items} candidates={CANDIDATES} now="2026-10-16T03:00:00.000Z" />));
}
// 구간 머리는 「받는 선물2건」처럼 이름 + 건수 — 이름으로 찾는다
const rowOf = (name: string, board: "받는 선물" | "보내는 선물") =>
  [...host.querySelectorAll(`section[aria-labelledby] li`)].find((li) => li.closest("section")?.querySelector("h2")?.textContent?.startsWith(board) && li.querySelector("[data-title]")?.textContent?.startsWith(name))!;
// 승인 대기 하늘 판(v37 — 승인 대기 선물은 줄 대신 판 하나로 모은다)
const waitingPanel = () => host.querySelector("section[data-waiting]");
const buttonsIn = (li: Element) => [...li.querySelectorAll("a, button")].map((b) => b.textContent);
const step = (li: Element) => ({
  sr: li.querySelector("[data-step]")?.previousElementSibling?.classList.contains("sr-only") ? li.querySelector("[data-step]")!.previousElementSibling!.textContent : null,
  on: li.querySelectorAll("[data-bar] i[data-on]").length,
  all: li.querySelectorAll("[data-bar] i").length,
  label: li.querySelector("[data-step]")?.textContent,
  late: li.querySelector("[data-step]")?.hasAttribute("data-late") ?? false,
});

describe("INV-J9: 판 둘 — 받는 선물은 선물마다, 보내는 선물은 보낸 날별 소제목 아래 팬마다, 줄마다 다섯 칸 막대와 단계 이름", () => {
  it("INV-J9 S9: 제목 「진행 중 6건」, 승인 대기 판 1건 + 받는 선물 카드 2, 보내는 선물 소제목 둘(팬 2명·팬 1명)", () => {
    render();
    expect(host.querySelector("h1")?.textContent).toBe("선물 현황진행 중 6건");
    const heads = [...host.querySelectorAll("section h2")].map((h) => h.textContent);
    expect(heads).toEqual(["승인을 기다리는 선물", "받는 선물2건", "보내는 선물3건"]);
    expect(waitingPanel()?.querySelector(".num-big")?.textContent).toBe("1건");
    expect(waitingPanel()?.textContent).toContain("가장 가까운 기한 6일 남음 · 하루님의 선물");
    expect([...host.querySelectorAll("[data-subhead]")].map((p) => p.textContent)).toEqual(["10월 2일 오전 10:00 보낸 역조공팬 2명", "10월 9일 오전 10:00 보낸 역조공팬 1명"]);
    expect([...host.querySelectorAll("section ul")].slice(1).map((u) => u.getAttribute("aria-label"))).toEqual(["10월 2일 오전 10:00 보낸 역조공", "10월 9일 오전 10:00 보낸 역조공"]);
    // 승인 대기 선물은 받는 선물 카드에 다시 나오지 않는다 — 판에만
    expect(rowOf("하루님", "받는 선물")).toBeUndefined();
    expect(rowOf("보리님", "받는 선물").querySelector("[data-sub]")?.textContent).toBe("상자 1개 · 10월 13일 승인");
    expect(rowOf("모카님", "보내는 선물").querySelector("[data-sub]")?.textContent).toBe("소형 상자");
  });

  it("INV-J9: 막대는 다섯 칸, 칠한 칸 수와 단계 이름은 같은 단계에서", () => {
    render();
    expect(step(rowOf("보리님", "받는 선물"))).toEqual({ sr: "5단계 중 2단계, ", on: 2, all: 5, label: "사무실로 오는 중", late: false });
    expect(step(rowOf("소라님", "받는 선물"))).toEqual({ sr: "5단계 중 4단계, ", on: 4, all: 5, label: "배송 중", late: false });
    expect(step(rowOf("모카님", "보내는 선물"))).toEqual({ sr: "5단계 중 2단계, ", on: 2, all: 5, label: "아직 도착하지 않았어요", late: true });
    expect(step(rowOf("하루님", "보내는 선물"))).toEqual({ sr: "5단계 중 4단계, ", on: 4, all: 5, label: "출고", late: false });
    expect(step(rowOf("꿀단지님", "보내는 선물"))).toEqual({ sr: "5단계 중 1단계, ", on: 1, all: 5, label: "수락 대기", late: false });
  });

  it("카드 리뷰 K2: 같은 날 두 번 보내면 소제목이 보낸 시각으로 갈린다 — 같은 글자의 소제목 둘이 없다", () => {
    render([
      ...ROWS.slice(0, 4),
      { ...ROWS[4]!, sent_at: "2026-10-02T06:30:00Z" },
    ]);
    const heads = [...host.querySelectorAll("[data-subhead]")].map((p) => p.textContent);
    expect(heads).toEqual(["10월 2일 오전 10:00 보낸 역조공팬 1명", "10월 2일 오후 3:30 보낸 역조공팬 1명"]);
  });

  it("화면 리뷰 U1: 막대 묶음에는 role·aria-label 이 없다 — 단계는 보이는 이름 앞 숨은 글자로 읽힌다", () => {
    render();
    const prog = rowOf("보리님", "받는 선물").querySelector("[data-bar]")!.parentElement!;
    expect([prog.getAttribute("role"), prog.getAttribute("aria-label")]).toEqual([null, null]);
    // 카드 아래 「n/5」는 화면에만(숨은 글자가 이미 몇 단계인지 읽는다)
    expect(prog.textContent).toBe("5단계 중 2단계, 사무실로 오는 중2/5");
    expect(prog.querySelector("span[aria-hidden=true]:last-child")?.textContent).toBe("2/5");
  });

  it("구간 머리 오른쪽에 「받은 선물 전체 ›」·「보낸 내역 전체 ›」", () => {
    render();
    const more = [...host.querySelectorAll("section a")].filter((a) => a.textContent?.endsWith("전체 ›")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(more).toEqual([
      ["받은 선물 전체 ›", "/creator/boxes"],
      ["보낸 내역 전체 ›", "/creator/revgifts"],
    ]);
  });
});

describe("INV-J11·J10: 버튼은 필요한 줄에만", () => {
  it("INV-J11 S11: 「처리할 일」은 처리할 일 읽기에 있는 줄에만 — 승인 대기·늦은 몫에 있고, 오는 중·출고 줄에는 없다", () => {
    render();
    const go = (li: Element) => [...li.querySelectorAll("a")].filter((a) => a.textContent === "지금 할 일").map((a) => a.getAttribute("href"));
    // 승인 대기는 판 하나 — 그 판의 「지금 할 일」도 처리할 일 읽기에 그 주문이 있을 때만
    expect(go(waitingPanel()!)).toEqual(["/creator/actions"]);
    expect(go(rowOf("모카님", "보내는 선물"))).toEqual(["/creator/actions"]);
    expect(go(rowOf("보리님", "받는 선물"))).toEqual([]);
    expect(go(rowOf("꿀단지님", "보내는 선물"))).toEqual([]);
  });

  it("INV-J11 S11b (실패경로): 처리할 일 읽기가 비면 같은 줄에도 「처리할 일」이 없고 승인 대기 이름은 강조하지 않는다", () => {
    render(ROWS, []);
    expect(buttonsIn(waitingPanel()!)).toEqual([]);
    // 기한 줄도 처리할 일 읽기의 승인 요청에서만 — 읽기가 비면 없다
    expect(waitingPanel()!.textContent).not.toContain("가장 가까운 기한");
    // 늦은 몫은 처리할 일에 없어도 늦음 강조(J11 — 늦음은 DB 늦음 칸에서)
    expect(step(rowOf("모카님", "보내는 선물")).late).toBe(true);
    expect(step(rowOf("꿀단지님", "보내는 선물")).late).toBe(false);
  });

  it("INV-J11: 배송 조회는 보내는 선물의 늦은 입고 전 줄에만 — 받는 선물(배송 중이어도)·늦지 않은 줄에는 없다(카드 d93 ④)", () => {
    render();
    const track = (li: Element) => buttonsIn(li).filter((t) => t === "배송 조회").length;
    expect(track(rowOf("모카님", "보내는 선물"))).toBe(1);
    expect(track(rowOf("꿀단지님", "보내는 선물"))).toBe(0);
    expect(track(rowOf("소라님", "받는 선물"))).toBe(0);
    expect([...host.querySelectorAll("button")].filter((b) => b.textContent === "배송 조회")).toHaveLength(1);
  });

  it("INV-J10 (카드 d96 ①): 「내 상자 찾기」는 보내는 선물의 입고 전 줄마다 — 늦지 않아도 있고, 출고된 줄·받는 선물에는 없다", () => {
    render();
    const find = (li: Element) => buttonsIn(li).filter((t) => t === "내 상자 찾기").length;
    expect(find(rowOf("모카님", "보내는 선물"))).toBe(1);
    expect(find(rowOf("꿀단지님", "보내는 선물"))).toBe(1);
    expect(find(rowOf("하루님", "보내는 선물"))).toBe(0);
    expect(find(waitingPanel()!)).toBe(0);
  });

  it("INV-J10 (실패경로): 입고 전이 아닌데 후보에 있는 몫은 버튼이 없다 — 입고 전인데 후보에 없는 몫도 없다", () => {
    act(() =>
      root.render(
        <GiftProgressPage
          progress={parseGiftProgressRows([
            { ...ROWS[3]!, before_inbound: false, late: false, box_state: "labeled" },
            { ...ROWS[5]!, share_id: "44444444-4444-4444-8444-444444444444" },
          ])}
          items={[]}
          candidates={CANDIDATES}
          now="2026-10-16T03:00:00.000Z"
        />,
      ),
    );
    expect([...host.querySelectorAll("button")].filter((b) => b.textContent === "내 상자 찾기")).toHaveLength(0);
  });

  it("INV-C4 ②-나: 「내 상자 찾기」를 누르면 같은 창 — 그 줄의 팬이 골라져 있고, 두 값과 함께 한 번에 찾기를 부른다", async () => {
    postFind.mockResolvedValue({ kind: "ok", body: { matched: false, message: "맞는 상자를 못 찾았어요." } });
    render();
    const btn = [...rowOf("꿀단지님", "보내는 선물").querySelectorAll("button")].find((b) => b.textContent === "내 상자 찾기")!;
    act(() => btn.click());
    const d = host.querySelector("dialog[open]")!;
    expect(d.querySelector("h2")?.textContent).toBe("내 상자 찾기");
    expect([...d.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((r) => r.checked)?.closest("label")?.textContent).toContain("꿀단지");
    const select = d.querySelector("select")!;
    act(() => {
      select.value = "cj";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    d.querySelector<HTMLInputElement>("input[name=waybill]")!.value = "123456789012";
    await act(async () => d.querySelector("form")!.requestSubmit());
    expect(postFind).toHaveBeenCalledWith({ kind: "share", id: S3 }, "123456789012", "cj");
  });
});

describe("INV-C4 ②-나: 찾은 뒤", () => {
  it("찾으면 창에 「사무실에 도착했어요」가 남고, 목록은 창을 닫을 때 새로 읽는다 — 먼저 읽어 창이 사라지지 않게", async () => {
    postFind.mockResolvedValue({ kind: "ok", body: { matched: true } });
    render();
    act(() => [...rowOf("모카님", "보내는 선물").querySelectorAll("button")].find((b) => b.textContent === "내 상자 찾기")!.click());
    const d = host.querySelector("dialog[open]")!;
    const select = d.querySelector("select")!;
    act(() => {
      select.value = "cj";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    d.querySelector<HTMLInputElement>("input[name=waybill]")!.value = "123456789012";
    await act(async () => d.querySelector("form")!.requestSubmit());
    expect(d.textContent).toContain("사무실에 도착했어요");
    expect(refresh).not.toHaveBeenCalled();
    act(() => d.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!.click());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("INV-J10 S10b: 배송 조회 창은 택배사 조회 페이지 링크만 — 서버를 부르지 않는다", () => {
  it("INV-J10 S10b: 택배사·송장번호를 넣으면 그 택배사 조회 주소가 새 탭 링크로, 찾기·저장 요청은 없다", () => {
    render();
    const btn = [...rowOf("모카님", "보내는 선물").querySelectorAll("button")].find((b) => b.textContent === "배송 조회")!;
    act(() => btn.click());
    const d = host.querySelector("dialog[open]")!;
    expect(d.querySelector("h2")?.textContent).toBe("도착하지 않았어요");
    expect(d.querySelector("a[target=_blank]")).toBeNull();
    const select = d.querySelector("select")!;
    // 화면 리뷰 U3: 열리면 첫 초점은 택배사 칸
    expect(document.activeElement).toBe(select);
    expect([...select.options].map((o) => o.value)).not.toContain("etc");
    act(() => {
      select.value = "cj";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const input = d.querySelector<HTMLInputElement>("input")!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "5689 1234 0017");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const link = d.querySelector<HTMLAnchorElement>("a[target=_blank]")!;
    expect(link.href).toContain("cjlogistics.com");
    expect(link.href).toContain("568912340017");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.textContent).toBe("CJ대한통운에서 배송 조회(새 탭)");
    expect(link.querySelector("svg[aria-hidden=true]")).not.toBeNull();
    act(() => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(postFind).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("INV-J10 S10b (실패경로): 송장번호 꼴이 아니면 링크가 없다", () => {
    render();
    act(() => [...rowOf("모카님", "보내는 선물").querySelectorAll("button")].find((b) => b.textContent === "배송 조회")!.click());
    const d = host.querySelector("dialog[open]")!;
    const select = d.querySelector("select")!;
    act(() => {
      select.value = "cj";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const input = d.querySelector<HTMLInputElement>("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "1234");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(d.querySelector("a[target=_blank]")).toBeNull();
  });
});
