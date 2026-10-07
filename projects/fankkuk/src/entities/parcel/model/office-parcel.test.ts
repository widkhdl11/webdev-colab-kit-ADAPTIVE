import { describe, expect, it } from "vitest";
import { officeParcelsFromRows, parcelDetailFromData, parcelDetailFromReply, parcelTabOf } from "./office-parcel";

const ROW = {
  qr: "Q-000123",
  kind: "gift",
  order_no: "FC-261003-0041",
  sender_nickname: "별빛",
  receiver_name: "하루",
  tier: "small",
  state: "labeled",
  received_at: "2026-10-03T05:32:00+00:00",
  next_step: "inspect",
};

const DETAIL = {
  qr: "Q-000123",
  kind: "revgift",
  order_no: "RG-261003-0009",
  sender_nickname: "하루",
  receiver_name: "모카",
  tier: "medium",
  state: "return_printed",
  next_step: "confirm_return",
  envelope_no: "Q-000123",
  outbound_waybill_no: null,
  return_waybill_no: "123456789012",
};

describe("들어온 상자 읽기 (office-workflow INV-W1·W7)", () => {
  it("INV-W7: 줄을 옮긴다 — 사람은 닉네임·이름만, 모르는 칸(주소 등)은 버린다", () => {
    expect(officeParcelsFromRows([{ ...ROW, receiver_address: "서울시" }])).toEqual([
      {
        qr: "Q-000123",
        kind: "gift",
        orderNo: "FC-261003-0041",
        senderNickname: "별빛",
        receiverName: "하루",
        tier: "small",
        state: "labeled",
        receivedAt: "2026-10-03T05:32:00+00:00",
        nextStep: "inspect",
      },
    ]);
  });

  it("INV-W1: 송장 전 상자는 QR·입고 시각이 비어 있어도 받는다", () => {
    const parsed = officeParcelsFromRows([{ ...ROW, qr: null, state: "no_waybill", received_at: null, next_step: "wait_waybill" }]);
    expect(parsed?.[0]).toMatchObject({ qr: null, state: "no_waybill", receivedAt: null, nextStep: "wait_waybill" });
  });

  it("INV-C5·C8: 출고를 멈춘 보류 상자는 다음 단계 on_hold — 하나 때문에 목록 읽기가 깨지지 않는다", () => {
    const parsed = officeParcelsFromRows([ROW, { ...ROW, state: "inspected", next_step: "on_hold" }]);
    expect(parsed?.[1]).toMatchObject({ state: "inspected", nextStep: "on_hold" });
  });

  it("INV-W1 (실패경로): 모르는 상태·다음 단계·종류가 하나라도 있으면 null — 화면이 짐작하지 않는다", () => {
    expect(officeParcelsFromRows(null)).toBeNull();
    expect(officeParcelsFromRows([{ ...ROW, state: "teleported" }])).toBeNull();
    expect(officeParcelsFromRows([{ ...ROW, next_step: "pick_state" }])).toBeNull();
    expect(officeParcelsFromRows([{ ...ROW, kind: "other" }])).toBeNull();
    expect(officeParcelsFromRows([{ ...ROW, order_no: 7 }])).toBeNull();
  });

  it("INV-W1: QR 한 상자 — 배열 한 줄이든 객체든 받고, 봉투 번호·송장 번호를 옮긴다", () => {
    const expected = {
      qr: "Q-000123",
      kind: "revgift",
      orderNo: "RG-261003-0009",
      senderNickname: "하루",
      receiverName: "모카",
      tier: "medium",
      state: "return_printed",
      nextStep: "confirm_return",
      envelopeNo: "Q-000123",
      outboundWaybillNo: null,
      returnWaybillNo: "123456789012",
    };
    expect(parcelDetailFromData([DETAIL])).toEqual(expected);
    expect(parcelDetailFromData(DETAIL)).toEqual(expected);
  });

  it("INV-W1 (실패경로): 0줄·두 줄·꼴이 다른 줄이면 null", () => {
    expect(parcelDetailFromData([])).toBeNull();
    expect(parcelDetailFromData([DETAIL, DETAIL])).toBeNull();
    expect(parcelDetailFromData({ ...DETAIL, qr: null })).toBeNull();
    expect(parcelDetailFromData({ ...DETAIL, state: "nope" })).toBeNull();
  });

  it("INV-W1: 상태 → 목록 탭. 승인·받기 대기도 출고 대기 탭에 둔다", () => {
    expect(parcelTabOf("no_waybill")).toBe("inbound");
    expect(parcelTabOf("awaiting")).toBe("inbound");
    expect(parcelTabOf("received")).toBe("inspect");
    expect(parcelTabOf("labeled")).toBe("inspect");
    expect(parcelTabOf("inspected")).toBe("outbound");
    expect(parcelTabOf("label_printed")).toBe("outbound");
    expect(parcelTabOf("shipped")).toBe("shipped");
    expect(parcelTabOf("held")).toBe("held");
    expect(parcelTabOf("return_waiting")).toBe("return");
    expect(parcelTabOf("return_printed")).toBe("return");
    expect(parcelTabOf("returned")).toBe("return");
  });
});

describe("응답 속 상자 다시 읽기 (office-workflow INV-W1)", () => {
  it("INV-W1: 서버가 옮긴 상자는 그대로 받고, 꼴이 다르면 null", () => {
    const parcel = parcelDetailFromData(DETAIL);
    expect(parcelDetailFromReply(JSON.parse(JSON.stringify(parcel)))).toEqual(parcel);
    expect(parcelDetailFromReply({ ...parcel, nextStep: "teleport" })).toBeNull();
    expect(parcelDetailFromReply(null)).toBeNull();
  });
});
