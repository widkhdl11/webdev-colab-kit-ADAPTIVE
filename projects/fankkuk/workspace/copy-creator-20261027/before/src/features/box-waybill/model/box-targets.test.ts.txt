import { describe, expect, it } from "vitest";
import type { GiftBox, ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";
import { giftAddressCode, giftFinderBoxes, shareAddressCode } from "./box-targets";

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

const share = (over: Partial<ShareBox>): ShareBox => ({
  shareId: "s1",
  orderNo: "RV-AAAA1",
  fanNickname: "초코우유",
  tier: "small",
  waybillNo: null,
  state: "awaiting",
  addressCode: "K7M3XA",
  ...over,
});

const sent = (over: Partial<SentRevgift>): SentRevgift => ({
  orderNo: "RV-AAAA1",
  sentAt: "2026-10-07T00:00:00Z",
  fanNickname: "초코우유",
  tier: "small",
  state: "waiting",
  shipToOffice: true,
  ...over,
});

describe("INV-C4 ② 찾기 대상 — 팬 선물", () => {
  it("진행 중 주문의 입고 전 상자만 고를 수 있고, 이름은 상세 상자 줄과 같은 「상자 N · 크기」 — 주문번호가 없다", () => {
    const boxes = [gift({ boxId: "a", state: "no_waybill" }), gift({ boxId: "b", state: "awaiting", tier: null }), gift({ boxId: "c", state: "received" })];
    expect(giftFinderBoxes(boxes, true)).toEqual([
      { target: { kind: "box", id: "a" }, label: "상자 1", name: "상자 1 · 소형" },
      { target: { kind: "box", id: "b" }, label: "상자 2", name: "상자 2" },
    ]);
  });

  it("번호는 거르기 전 목록 순서 — 앞 상자가 이미 입고돼 빠져도 뒤 상자는 「상자 2」 그대로", () => {
    const boxes = [gift({ boxId: "a", state: "received" }), gift({ boxId: "b", state: "no_waybill", tier: "medium" })];
    expect(giftFinderBoxes(boxes, true).map((b) => b.name)).toEqual(["상자 2 · 중형"]);
  });

  it("(실패경로) 끝난 주문(거절·반려 등)은 입고 전 상자가 있어도 대상이 없다", () => {
    expect(giftFinderBoxes([gift({})], false)).toEqual([]);
  });
});

describe("INV-C2·C3 받는 주소 — 팬 선물", () => {
  it("진행 중이고 사무실 주소가 있으면 DB 가 준 6자리", () => {
    expect(giftAddressCode(gift({}), "서울 사무실", true)).toBe("K7M3XA");
  });

  it("(실패경로) 진행 중이 아니거나 사무실 주소가 없거나 DB 가 6자리를 주지 않으면 null", () => {
    expect(giftAddressCode(gift({}), "서울 사무실", false)).toBeNull();
    expect(giftAddressCode(gift({}), null, true)).toBeNull();
    expect(giftAddressCode(gift({ addressCode: null }), "서울 사무실", true)).toBeNull();
  });
});

describe("INV-C2·C3 받는 주소 — 역조공", () => {
  it("묶음에 사무실 주소가 있고 받지 않은 몫이 아니면 DB 가 준 6자리", () => {
    expect(shareAddressCode(share({}), "서울 사무실", "waiting")).toBe("K7M3XA");
    expect(shareAddressCode(share({}), "서울 사무실", "accepted")).toBe("K7M3XA");
  });

  it("(실패경로) 받지 않은 몫·사무실 주소 없음·상자 줄 없음이면 null", () => {
    expect(shareAddressCode(share({}), "서울 사무실", "not_received")).toBeNull();
    expect(shareAddressCode(share({}), null, "waiting")).toBeNull();
    expect(shareAddressCode(undefined, "서울 사무실", "waiting")).toBeNull();
  });
});
