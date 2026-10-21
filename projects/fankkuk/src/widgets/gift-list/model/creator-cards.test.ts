import { describe, expect, it } from "vitest";
import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
import { groupGiftsByCreator, type TogetherOfCreator } from "./gift-groups";

// 보낸 선물 크리에이터별 묶음 (action-center INV-J14). 묶음 머리 숫자는 함께한 시간 읽기의 값 그대로 — 묶음 안 줄 수로 세지 않는다.

const row = (orderNo: string, creatorName: string, status = "registered") => ({
  order_no: orderNo,
  creator_name: creatorName,
  item_kind: "인형·굿즈",
  box_count: 1,
  has_electronics_or_metal: false,
  status,
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

describe("INV-J14: 크리에이터별 묶음", () => {
  it("INV-J14: 주문은 함께한 시간이 센 주문번호로 묶이고, 머리 숫자는 함께한 시간 값 그대로다 — 이름이 같은 다른 크리에이터와 섞이지 않는다", () => {
    const gifts = parseFanGiftRows([row("FC-A1", "하루"), row("FC-B1", "하루"), row("FC-A2", "하루")], "x");
    const groups = groupGiftsByCreator(gifts, [t("a", "하루", 7, ["FC-A1", "FC-A2"]), t("b", "하루", 1, ["FC-B1"])]);
    expect(groups.map((g) => [g.key, g.gifts.map((x) => x.orderNo), g.together?.giftCount])).toEqual([
      ["a", ["FC-A1", "FC-A2"], 7],
      ["b", ["FC-B1"], 1],
    ]);
  });

  it("INV-J14: 함께한 시간에 세지 않는 주문(결제 취소)은 같은 크리에이터 묶음에 들어가고 머리 숫자는 함께한 시간 값 그대로다", () => {
    const gifts = parseFanGiftRows([row("FC-A9", "하루", "canceled"), row("FC-A1", "하루")], "x");
    const groups = groupGiftsByCreator(gifts, [t("a", "하루", 1, ["FC-A1"])]);
    expect(groups.map((g) => [g.creatorName, g.gifts.map((x) => x.orderNo), g.together?.giftCount ?? null])).toEqual([
      ["하루", ["FC-A9", "FC-A1"], 1],
    ]);
  });

  it("INV-J14 (실패경로): 세지 않는 주문의 크리에이터를 이름으로 하나로 정할 수 없거나(같은 이름 둘) 센 주문이 없으면 링크·숫자 없는 묶음으로 뒤에", () => {
    const gifts = parseFanGiftRows([row("FC-X9", "하루", "canceled"), row("FC-M9", "모모", "canceled"), row("FC-A1", "하루"), row("FC-B1", "하루")], "x");
    const groups = groupGiftsByCreator(gifts, [t("a", "하루", 1, ["FC-A1"]), t("b", "하루", 1, ["FC-B1"])]);
    expect(groups.map((g) => [g.creatorName, g.gifts.map((x) => x.orderNo), g.together?.giftCount ?? null])).toEqual([
      ["하루", ["FC-A1"], 1],
      ["하루", ["FC-B1"], 1],
      ["하루", ["FC-X9"], null],
      ["모모", ["FC-M9"], null],
    ]);
  });
});
