import { describe, expect, it } from "vitest";
import type { GiftBox } from "@/entities/parcel/model/box-rows";
import { canCancelGift } from "./cancellable";

// 「취소하기」 버튼을 그릴 때 (payment INV-M16) — 진행 중 주문이고 상자가 하나도 도착하지 않았을 때만. 최종 판정은 DB.

const gift = (over: Partial<GiftBox>): GiftBox => ({
  boxId: "b1",
  label: "FC-7K3M9-1",
  tier: "small",
  waybillNo: null,
  state: "awaiting",
  addressCode: "K7M3XA",
  sendAckNeeded: false,
  ...over,
});

describe("INV-M16: 「취소하기」를 그리는 조건", () => {
  it("INV-M16 (S16): 진행 중이고 모든 상자가 도착 전이면 그린다", () => {
    expect(canCancelGift([gift({ boxId: "a", state: "awaiting" }), gift({ boxId: "b", state: "no_waybill" })], true)).toBe(true);
  });

  it("INV-M16 (S16b, 실패경로): 상자 하나라도 도착했으면 그리지 않는다", () => {
    expect(canCancelGift([gift({ boxId: "a", state: "awaiting" }), gift({ boxId: "b", state: "received" })], true)).toBe(false);
  });

  it("INV-M16 (실패경로): 진행 중이 아니거나 상자 줄이 없으면 그리지 않는다", () => {
    expect(canCancelGift([gift({})], false)).toBe(false);
    expect(canCancelGift([], true)).toBe(false);
  });
});
