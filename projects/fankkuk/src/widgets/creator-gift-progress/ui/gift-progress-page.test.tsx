import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCreatorActionItems } from "@/entities/action-item/model/creator-action-items";
import { parseGiftProgressRows } from "../model/gift-progress";

// 크리에이터 선물 현황 화면 (action-center INV-J9~J11, design-rules 13절, 시안 v21-addendum3/cre-progress.html).
// 버튼은 「내 상자 찾기」(입고 전 몫마다), 「처리할 일」(처리할 일 읽기 결과에 있는 줄)뿐 — 상태를 바꾸는 처리는 없다. 배송 조회(외부 택배사 링크)는 2026-11-09 결정 ③으로 뺐다.
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
    expect(host.querySelector("h1")?.textContent).toBe("선물 현황· 진행 중 6건");
    const heads = [...host.querySelectorAll("section h2")].map((h) => h.textContent);
    expect(heads).toEqual(["승인 대기 선물", "받는 선물2건", "보내는 선물3건"]);
    expect(waitingPanel()?.querySelector(".num-big")?.textContent).toBe("1건");
    expect(waitingPanel()?.textContent).toContain("가장 빠른 승인 기한: 6일 남음 · 하루님의 선물");
    expect([...host.querySelectorAll("[data-subhead]")].map((p) => p.textContent)).toEqual(["10월 2일 오전 10:00 결제 완료 · 팬 2명", "10월 9일 오전 10:00 결제 완료 · 팬 1명"]);
    expect([...host.querySelectorAll("section ul")].slice(1).map((u) => u.getAttribute("aria-label"))).toEqual(["10월 2일 오전 10:00 결제 완료", "10월 9일 오전 10:00 결제 완료"]);
    // 승인 대기 선물은 받는 선물 카드에 다시 나오지 않는다 — 판에만
    expect(rowOf("하루님", "받는 선물")).toBeUndefined();
    expect(rowOf("보리님", "받는 선물").querySelector("[data-sub]")?.textContent).toBe("상자 1개 · 10월 13일 승인");
    expect(rowOf("모카님", "보내는 선물").querySelector("[data-sub]")?.textContent).toBe("소형 상자");
  });

  it("INV-J9: 막대는 다섯 칸, 칠한 칸 수와 단계 이름은 같은 단계에서", () => {
    render();
    expect(step(rowOf("보리님", "받는 선물"))).toEqual({ sr: "5단계 중 2단계, ", on: 2, all: 5, label: "팬꾹 도착 대기", late: false });
    expect(step(rowOf("소라님", "받는 선물"))).toEqual({ sr: "5단계 중 4단계, ", on: 4, all: 5, label: "배송 중", late: false });
    expect(step(rowOf("모카님", "보내는 선물"))).toEqual({ sr: "5단계 중 2단계, ", on: 2, all: 5, label: "미도착", late: true });
    expect(step(rowOf("하루님", "보내는 선물"))).toEqual({ sr: "5단계 중 4단계, ", on: 4, all: 5, label: "출고", late: false });
    expect(step(rowOf("꿀단지님", "보내는 선물"))).toEqual({ sr: "5단계 중 1단계, ", on: 1, all: 5, label: "수락 대기", late: false });
  });

  it("카드 리뷰 K2: 같은 날 두 번 보내면 소제목이 보낸 시각으로 갈린다 — 같은 글자의 소제목 둘이 없다", () => {
    render([
      ...ROWS.slice(0, 4),
      { ...ROWS[4]!, sent_at: "2026-10-02T06:30:00Z" },
    ]);
    const heads = [...host.querySelectorAll("[data-subhead]")].map((p) => p.textContent);
    expect(heads).toEqual(["10월 2일 오전 10:00 결제 완료 · 팬 1명", "10월 2일 오후 3:30 결제 완료 · 팬 1명"]);
  });

  it("화면 리뷰 U1: 막대 묶음에는 role·aria-label 이 없다 — 단계는 보이는 이름 앞 숨은 글자로 읽힌다", () => {
    render();
    const prog = rowOf("보리님", "받는 선물").querySelector("[data-bar]")!.parentElement!;
    expect([prog.getAttribute("role"), prog.getAttribute("aria-label")]).toEqual([null, null]);
    // 카드 아래 「n/5」는 화면에만(숨은 글자가 이미 몇 단계인지 읽는다)
    expect(prog.textContent).toBe("5단계 중 2단계, 팬꾹 도착 대기2/5");
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

  it("INV-DS3 (INV-J10 고침): 배송 조회 버튼·외부 택배사 조회 링크는 어느 줄에도 없다 — 늦은 입고 전 줄에도", () => {
    render();
    expect([...host.querySelectorAll("button")].filter((b) => b.textContent === "배송 조회")).toHaveLength(0);
    expect(host.querySelector("a[target=_blank]")).toBeNull();
    // 같은 줄의 「내 상자 찾기」는 그대로 있다 — 줄을 제대로 그린 상태에서 본 것이다
    expect(buttonsIn(rowOf("모카님", "보내는 선물"))).toContain("내 상자 찾기");
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
  it("찾으면 창에 「상자 확인 완료」가 남고, 목록은 창을 닫을 때 새로 읽는다 — 먼저 읽어 창이 사라지지 않게", async () => {
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
    expect(d.textContent).toContain("상자 확인 완료");
    expect(refresh).not.toHaveBeenCalled();
    act(() => d.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!.click());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("approval-cancel INV-AC4: 받는 선물 카드의 「승인 취소」 — 서버가 취소 가능하다고 준 주문에만, 「지금 할 일」 왼쪽", () => {
  const T = (orderNo: string, cancelable: boolean) => ({
    requestId: `apr_${orderNo.replace("-", "")}`,
    orderNo,
    cancelable,
    arrivedBoxCount: 0,
    approvalDeadlineAt: "2026-10-20T05:00:00.000Z",
  });
  const renderWith = (targets: ReturnType<typeof T>[], items = ITEMS) =>
    act(() =>
      root.render(<GiftProgressPage progress={parseGiftProgressRows(ROWS)} items={items} candidates={CANDIDATES} cancelTargets={targets} now="2026-10-16T03:00:00.000Z" />),
    );

  it("INV-AC4: cancelable 카드에만 글자 버튼 — 송장 출력 뒤(cancelable 거짓) 카드에는 없다", () => {
    renderWith([T("FC-B1", true), T("FC-C1", false)]);
    const btn = rowOf("보리님", "받는 선물").querySelector<HTMLButtonElement>("button[data-cancel-approval]");
    expect(btn?.textContent).toBe("승인 취소");
    expect(btn?.className).toContain("btn--text");
    expect(rowOf("소라님", "받는 선물").querySelector("button[data-cancel-approval]")).toBeNull();
    // 대상이 없으면(읽기 실패 포함) 버튼도 없다
    renderWith([]);
    expect(host.querySelector("button[data-cancel-approval]")).toBeNull();
  });

  it("INV-AC4: 「지금 할 일」이 있는 카드에서는 그 왼쪽", () => {
    const approvalItem = ITEMS.find((it) => it.kind === "approval")!;
    renderWith([T("FC-B1", true)], [...ITEMS, { ...approvalItem, orderNo: "FC-B1" }]);
    expect(buttonsIn(rowOf("보리님", "받는 선물"))).toEqual(["승인 취소", "지금 할 일"]);
  });

  it("INV-AC1 confirm-before: 카드의 버튼도 같은 확인 창 — 성공하면 창을 닫고 목록만 새로 읽는다", async () => {
    renderWith([T("FC-B1", true)]);
    act(() => rowOf("보리님", "받는 선물").querySelector<HTMLButtonElement>("button[data-cancel-approval]")!.click());
    const d = host.querySelector("dialog[open]")!;
    expect(d.textContent).toContain("승인을 취소할까요?");
    expect(d.querySelector("[data-sentence]")?.textContent).toMatch(/^승인 대기로 돌아갑니다|^승인 기한이 지나/);
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ phase: "before_inbound" }) });
    act(() => [...d.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "승인 취소")!.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
