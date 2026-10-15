import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
import { GiftListPage } from "./gift-list-page";

// 보낸 선물 목록의 선물 이름(together INV-F7) — 시안 v21-addendum3/fan-home.html 의 「하루님께 · 생일 편지와 인형」 줄.

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
};

describe("together INV-F7: 보낸 선물 목록의 선물 이름", () => {
  it("INV-F7 S7: 선물 이름이 있으면 「하루님께 · 선물 이름」, 없으면 「하루님께」만", () => {
    const gifts = parseFanGiftRows([{ ...row, memo_title: "생일 편지와 인형" }, { ...row, order_no: "FC-W5N3U", memo_title: null }], "x");
    act(() => root.render(<GiftListPage gifts={gifts} faceToneByName={{}} />));
    const whos = [...host.querySelectorAll(".gcard .t-strong")].map((p) => p.textContent);
    expect(whos).toEqual(["하루님께 · 생일 편지와 인형", "하루님께"]);
  });
});
