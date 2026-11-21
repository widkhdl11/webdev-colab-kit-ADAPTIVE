import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
import { GiftListPage } from "./gift-list-page";

// 보낸 선물 목록의 선물 이름(together INV-F7) — 시안 v35-part1/gifts.html 의 선물 카드 제목(design-rules 22절).

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

const row = {
  order_no: "FC-W5N3T",
  creator_name: "하루",
  item_kind: "인형·굿즈",
  box_count: 1,
  has_electronics_or_metal: false,
  status: "registered",
  registered_at: "2026-10-12T02:00:00+00:00",
  approved_at: null,
  received_at: null,
  inspection_result: null,
  inspected_at: null,
  shipped_at: null,
  expected_arrival_date: null,
  delivery: null,
  fan_tracking_no: null,
  fan_send_ack_at: null,
  send_guide_shown: false,
};

describe("together INV-F7: 보낸 선물 목록의 선물 이름", () => {
  it("INV-F7 S7: 선물 이름이 있으면 카드 제목이 선물 이름, 없으면 고른 물품 종류 — 받는 사람은 둘 다 「하루님께」", () => {
    const gifts = parseFanGiftRows([{ ...row, memo_title: "생일 편지와 인형" }, { ...row, order_no: "FC-W5N3U", memo_title: null }], "x");
    act(() => root.render(<GiftListPage creators={[]} gifts={gifts} faceToneByName={{}} />));
    const cards = [...host.querySelectorAll("[data-gift-row]")];
    expect(cards.map((c) => c.querySelector("strong")?.textContent)).toEqual(["하루님께", "하루님께"]);
    expect(cards.map((c) => c.querySelector("h3")?.textContent)).toEqual(["생일 편지와 인형", "인형·굿즈"]);
    // 메모가 없는 카드에는 다른 카드의 선물 이름이 섞이지 않는다
    expect(cards[1]?.textContent).not.toContain("생일 편지와 인형");
  });
});

describe("보낸 선물 탭 셋 (흐름 시안 flow-S29-3 A안 — 상태별 수는 탭 이름에만)", () => {
  it("요약 줄 없이 탭이 「진행 중 · 완료된 선물 · 전달되지 않은 선물」이고, 각 탭의 수가 그 탭 카드 수와 같다", () => {
    const gifts = parseFanGiftRows(
      [
        { ...row, memo_title: null },
        { ...row, order_no: "FC-W5N3V", memo_title: null, status: "shipped", inspection_result: "passed", received_at: "2026-10-13T02:00:00+00:00", inspected_at: "2026-10-13T03:00:00+00:00", shipped_at: "2026-10-14T02:00:00+00:00", delivery: "delivered" },
        { ...row, order_no: "FC-W5N3X", memo_title: null, status: "shipped", inspection_result: "passed", received_at: "2026-10-13T02:00:00+00:00", inspected_at: "2026-10-13T03:00:00+00:00", shipped_at: "2026-10-14T02:00:00+00:00", delivery: "delivered" },
        { ...row, order_no: "FC-W5N3W", memo_title: null, status: "rejected" },
      ],
      "x",
    );
    act(() => root.render(<GiftListPage creators={[]} gifts={gifts} faceToneByName={{}} />));
    expect(host.querySelector("[data-gift-summary]")).toBeNull();
    const tabs = [...host.querySelectorAll('[role="tab"]')];
    // 수가 서로 달라야(1 · 2 · 1) 탭끼리 바뀐 것도 잡힌다
    expect(tabs.map((t) => t.textContent)).toEqual(["진행 중 1", "완료된 선물 2", "전달되지 않은 선물 1"]);
    const cardsIn = (tab: Element) => host.querySelector(`#${tab.getAttribute("aria-controls")}`)?.querySelectorAll("[data-gift-row]").length;
    expect(tabs.map(cardsIn)).toEqual([1, 2, 1]);
  });

  it("선물이 없는 탭은 빈 안내를 보인다", () => {
    act(() => root.render(<GiftListPage creators={[]} gifts={[]} faceToneByName={{}} />));
    expect([...host.querySelectorAll('[role="tabpanel"]')].map((p) => p.querySelector("p")?.textContent)).toEqual([
      "진행 중인 선물이 없습니다.",
      "완료된 선물이 없습니다.",
      "전달되지 않은 선물이 없습니다.",
    ]);
  });
});
