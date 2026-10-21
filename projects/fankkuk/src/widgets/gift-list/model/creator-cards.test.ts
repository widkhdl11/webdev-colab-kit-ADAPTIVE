import { describe, expect, it } from "vitest";
import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
import { buildCreatorCards, recentFirst, type TogetherOfCreator } from "./creator-cards";

// 보낸 선물 위 「크리에이터별로 보기」 카드 + 아래 묶지 않은 선물 격자 (action-center INV-J14).
// 카드 숫자는 함께한 시간 읽기의 값 그대로 — 목록이 선물 수를 따로 세지 않는다.

const row = (orderNo: string, creatorName: string, registeredAt: string, status = "registered") => ({
  order_no: orderNo,
  creator_name: creatorName,
  item_kind: "인형·굿즈",
  box_count: 1,
  has_electronics_or_metal: false,
  status,
  registered_at: registeredAt,
  approved_at: null,
  received_at: null,
  inspection_result: null,
  inspected_at: null,
  shipped_at: null,
  expected_arrival_date: null,
  delivery: null,
  fan_tracking_no: null,
  fan_send_ack_at: null,
});

const t = (creatorId: string, creatorName: string, giftCount: number, orderNos: string[]): TogetherOfCreator => ({
  creatorId,
  creatorName,
  href: `/gifts/with/${creatorId}`,
  photoUrl: null,
  giftCount,
  replyCount: 0,
  orderNos,
});

const D = (day: number) => `2026-10-${String(day).padStart(2, "0")}T02:00:00+00:00`;

describe("INV-J14: 크리에이터 카드", () => {
  it("INV-J14: 카드 숫자는 함께한 시간 값 그대로이고 최근 선물은 함께한 시간이 센 주문에서 고른다 — 이름이 같은 다른 크리에이터와 섞이지 않는다", () => {
    // 같은 이름 「하루」 둘 — b 의 FC-B1 이 가장 최근이지만 a 카드의 최근 선물이 되면 안 된다
    const gifts = parseFanGiftRows([row("FC-A2", "하루", D(1)), row("FC-B1", "하루", D(14)), row("FC-A1", "하루", D(12))], "x");
    const cards = buildCreatorCards(gifts, [t("a", "하루", 7, ["FC-A1", "FC-A2"]), t("b", "하루", 1, ["FC-B1"])]);
    expect(cards.map((c) => [c.key, c.giftCount, c.latest?.orderNo ?? null])).toEqual([
      ["a", 7, "FC-A1"],
      ["b", 1, "FC-B1"],
    ]);
  });

  it("INV-J14: 함께한 시간에 세지 않는 주문(결제 취소)은 같은 크리에이터 카드의 최근 선물이 될 수 있고, 카드 숫자는 함께한 시간 값 그대로다", () => {
    const gifts = parseFanGiftRows([row("FC-A1", "하루", D(1)), row("FC-A9", "하루", D(9), "canceled")], "x");
    const cards = buildCreatorCards(gifts, [t("a", "하루", 1, ["FC-A1"])]);
    expect(cards.map((c) => [c.creatorName, c.giftCount, c.latest?.orderNo ?? null])).toEqual([["하루", 1, "FC-A9"]]);
  });

  it("INV-J14 (실패경로): 세지 않는 주문의 크리에이터를 이름으로 하나로 정할 수 없거나(같은 이름 둘) 센 주문이 없는 크리에이터는 카드를 만들지 않는다 — 숫자를 지어내지 않는다", () => {
    const gifts = parseFanGiftRows(
      [row("FC-A1", "하루", D(1)), row("FC-B1", "하루", D(2)), row("FC-X9", "하루", D(9), "canceled"), row("FC-M9", "모모", D(8), "canceled")],
      "x",
    );
    const cards = buildCreatorCards(gifts, [t("a", "하루", 1, ["FC-A1"]), t("b", "하루", 1, ["FC-B1"])]);
    expect(cards.map((c) => [c.key, c.giftCount, c.latest?.orderNo ?? null])).toEqual([
      ["a", 1, "FC-A1"],
      ["b", 1, "FC-B1"],
    ]);
  });

  it("INV-J14: 카드 순서는 함께한 시간 읽기 순서 그대로, 선물이 목록에 없으면 최근 선물은 비어 있다", () => {
    const cards = buildCreatorCards([], [t("m", "모모", 2, ["FC-M1", "FC-M2"]), t("h", "하루", 3, ["FC-H1"])]);
    expect(cards.map((c) => [c.key, c.giftCount, c.latest])).toEqual([
      ["m", 2, null],
      ["h", 3, null],
    ]);
  });
});

describe("INV-J14: 선물 격자", () => {
  it("INV-J14: 크리에이터로 묶지 않고 최근 등록 순 — 등록 시각이 같으면 읽은 순서 그대로", () => {
    const gifts = parseFanGiftRows(
      [row("FC-H1", "하루", D(1)), row("FC-M2", "모모", D(10)), row("FC-H3", "하루", D(12)), row("FC-M1", "모모", D(2)), row("FC-H2", "하루", D(5)), row("FC-M3", "모모", D(5))],
      "x",
    );
    expect(recentFirst(gifts).map((g) => g.orderNo)).toEqual(["FC-H3", "FC-M2", "FC-H2", "FC-M3", "FC-M1", "FC-H1"]);
    // 입력은 그대로 둔다
    expect(gifts[0]?.orderNo).toBe("FC-H1");
  });
});
