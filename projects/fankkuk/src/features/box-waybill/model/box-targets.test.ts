import { describe, expect, it } from "vitest";
import type { GiftBox, ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";
import { giftAddressCode, giftFinderBoxes, shareAddressCode, shareFinderBoxes } from "./box-targets";

const gift = (over: Partial<GiftBox>): GiftBox => ({
  boxId: "b1",
  label: "FC-7K3M9-1",
  tier: "small",
  waybillNo: null,
  state: "awaiting",
  addressCode: "K7M3XA",
  reportedNotMine: false,
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
  reportedNotMine: false,
  ...over,
});

const sent = (over: Partial<SentRevgift>): SentRevgift => ({
  orderNo: "RV-AAAA1",
  sentAt: "2026-10-07T00:00:00Z",
  fanLoginId: "choco",
  fanNickname: "초코우유",
  tier: "small",
  state: "waiting",
  shipToOffice: true,
  ...over,
});

describe("INV-C4 ② 찾기 대상 — 팬 선물", () => {
  it("진행 중 주문의 입고 전 상자만 고를 수 있고, 이름에 구간이 붙는다", () => {
    const boxes = [gift({ boxId: "a", state: "no_waybill" }), gift({ boxId: "b", state: "awaiting", tier: null }), gift({ boxId: "c", state: "received" })];
    expect(giftFinderBoxes(boxes, true)).toEqual([
      { target: { kind: "box", id: "a" }, label: "FC-7K3M9-1", name: "FC-7K3M9-1 · 소형 상자" },
      { target: { kind: "box", id: "b" }, label: "FC-7K3M9-1", name: "FC-7K3M9-1" },
    ]);
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

describe("INV-C4 ② 찾기 대상 — 역조공", () => {
  it("입고 전이고 팬이 받지 않은 것이 아닌 몫만, 이름은 팬 닉네임 · 주문번호", () => {
    const rows = [sent({ orderNo: "RV-1", state: "waiting" }), sent({ orderNo: "RV-2", state: "accepted" }), sent({ orderNo: "RV-3", state: "not_received" }), sent({ orderNo: "RV-4" })];
    const boxes = [share({ shareId: "s1", orderNo: "RV-1" }), share({ shareId: "s2", orderNo: "RV-2", state: "received" }), share({ shareId: "s3", orderNo: "RV-3" })];
    expect(shareFinderBoxes(rows, boxes)).toEqual([{ target: { kind: "share", id: "s1" }, label: "초코우유님 상자", name: "초코우유님 상자 · RV-1" }]);
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
