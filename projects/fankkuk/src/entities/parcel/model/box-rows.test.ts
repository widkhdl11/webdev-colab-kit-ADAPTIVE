import { describe, expect, it } from "vitest";
import { boxTierName, canReportNotMine, hasArrived, isWaybillEditable, parseGiftBoxRows, parseShareBoxRows } from "./box-rows";

const EXTRA = { address_code: null, reported_not_mine: false } as const;

const BOX = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

describe("상자 줄 경계 — 팬 선물 상자(my_gift_boxes)", () => {
  it("정해진 칸을 화면용 이름으로 바꾼다", () => {
    expect(parseGiftBoxRows([{ box_id: BOX, label: "FC-7K3M9-1", tier: "small", waybill_no: null, state: "awaiting", address_code: "K7M3XA", reported_not_mine: false }])).toEqual([
      { boxId: BOX, label: "FC-7K3M9-1", tier: "small", waybillNo: null, state: "awaiting", addressCode: "K7M3XA", reportedNotMine: false },
    ]);
  });

  it("INV-W7: 정해진 칸 밖의 값(출고 운송장 등)이 섞여 오면 목록 전체를 버린다", () => {
    expect(() =>
      parseGiftBoxRows([{ box_id: BOX, label: "FC-7K3M9", tier: "small", waybill_no: null, state: "shipped", outbound_waybill: "123", ...EXTRA }]),
    ).toThrow();
  });

  it("모르는 상태 값이면 버린다", () => {
    expect(() => parseGiftBoxRows([{ box_id: BOX, label: "FC-7K3M9", tier: "small", waybill_no: null, state: "lost", ...EXTRA }])).toThrow();
  });

  it("INV-C2: 받는 주소 칸이 6자리 꼴(20자 안의 글자)이 아니면 버린다", () => {
    expect(() => parseGiftBoxRows([{ box_id: BOX, label: "FC-7K3M9", tier: "small", waybill_no: null, state: "awaiting", address_code: "K7M3Q0", reported_not_mine: false }])).toThrow();
  });
});

describe("상자 줄 경계 — 역조공 몫(my_share_boxes)", () => {
  it("정해진 칸을 화면용 이름으로 바꾼다", () => {
    expect(
      parseShareBoxRows([{ share_id: BOX, order_no: "RG-R8N5W2", fan_nickname: "초코우유", tier: "medium", waybill_no: "640199882271", state: "awaiting", ...EXTRA }]),
    ).toEqual([{ shareId: BOX, orderNo: "RG-R8N5W2", fanNickname: "초코우유", tier: "medium", waybillNo: "640199882271", state: "awaiting", addressCode: null, reportedNotMine: false }]);
  });

  it("INV-W7: 팬 주소 같은 칸이 섞여 오면 버린다", () => {
    expect(() =>
      parseShareBoxRows([
        { share_id: BOX, order_no: "RG-R8N5W2", fan_nickname: "초코우유", tier: "medium", waybill_no: null, state: "awaiting", address: "서울", ...EXTRA },
      ]),
    ).toThrow();
  });
});

describe("송장번호를 고칠 수 있는 때 — 입고 전까지만", () => {
  it("송장 없음·도착 기다림은 고친다", () => {
    expect(isWaybillEditable("no_waybill")).toBe(true);
    expect(isWaybillEditable("awaiting")).toBe(true);
  });

  it("입고된 뒤의 상태는 전부 잠긴다", () => {
    for (const st of ["received", "labeled", "inspected", "held", "return_waiting", "return_printed", "returned", "label_printed", "shipped"] as const) {
      expect(isWaybillEditable(st)).toBe(false);
      expect(hasArrived(st)).toBe(true);
    }
    expect(hasArrived("awaiting")).toBe(false);
  });

  it("INV-C8: 「제가 보낸 게 아니에요」는 입고된 뒤 출고·반송 확정 전에만", () => {
    expect(canReportNotMine("awaiting")).toBe(false);
    expect(canReportNotMine("no_waybill")).toBe(false);
    for (const st of ["received", "labeled", "inspected", "held", "label_printed"] as const) expect(canReportNotMine(st)).toBe(true);
    expect(canReportNotMine("shipped")).toBe(false);
    expect(canReportNotMine("returned")).toBe(false);
  });

  it("상자 구간 이름", () => {
    expect(boxTierName("small")).toBe("소형 상자");
    expect(boxTierName("large")).toBe("대형 상자");
    expect(boxTierName(null)).toBeNull();
  });
});
