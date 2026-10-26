import { describe, expect, it } from "vitest";
import { boxSizeName, boxTierName, fanBoxStateTag, giftBoxName, tierCountText, hasArrived, isMissing, isWaybillEditable, parseGiftBoxRows, parseShareBoxRows } from "./box-rows";

const EXTRA = { address_code: null, reported_not_mine: false } as const;
// 팬 선물 상자 줄에만 있는 칸 — 「먼저 보내기」 전인가(approval-signature INV-S9)
const GIFT_EXTRA = { ...EXTRA, send_ack_needed: false, not_sent_at: null } as const;

const BOX = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

describe("상자 줄 경계 — 팬 선물 상자(my_gift_boxes)", () => {
  it("정해진 칸을 화면용 이름으로 바꾼다", () => {
    expect(parseGiftBoxRows([{ box_id: BOX, label: "FC-7K3M9-1", tier: "small", waybill_no: null, state: "awaiting", address_code: "K7M3XA", reported_not_mine: false, send_ack_needed: false, not_sent_at: null }])).toEqual([
      { boxId: BOX, label: "FC-7K3M9-1", tier: "small", waybillNo: null, state: "awaiting", addressCode: "K7M3XA", sendAckNeeded: false, notSentAt: null },
    ]);
  });

  it("INV-W7: 정해진 칸 밖의 값(출고 운송장 등)이 섞여 오면 목록 전체를 버린다", () => {
    expect(() =>
      parseGiftBoxRows([{ box_id: BOX, label: "FC-7K3M9", tier: "small", waybill_no: null, state: "shipped", outbound_waybill: "123", ...GIFT_EXTRA }]),
    ).toThrow();
  });

  it("모르는 상태 값이면 버린다", () => {
    expect(() => parseGiftBoxRows([{ box_id: BOX, label: "FC-7K3M9", tier: "small", waybill_no: null, state: "lost", ...GIFT_EXTRA }])).toThrow();
  });

  it("INV-C2: 받는 주소 칸이 6자리 꼴(20자 안의 글자)이 아니면 버린다", () => {
    expect(() => parseGiftBoxRows([{ box_id: BOX, label: "FC-7K3M9", tier: "small", waybill_no: null, state: "awaiting", address_code: "K7M3Q0", reported_not_mine: false }])).toThrow();
  });
});

describe("상자 줄 경계 — 역조공 몫(my_share_boxes)", () => {
  it("정해진 칸을 화면용 이름으로 바꾼다", () => {
    expect(
      parseShareBoxRows([{ share_id: BOX, order_no: "RG-R8N5W2", fan_nickname: "초코우유", tier: "medium", waybill_no: "640199882271", state: "awaiting", ...EXTRA }]),
    ).toEqual([{ shareId: BOX, orderNo: "RG-R8N5W2", fanNickname: "초코우유", tier: "medium", waybillNo: "640199882271", state: "awaiting", addressCode: null }]);
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

  it("INV-W10: 도착하지 않음으로 닫힌 상자는 입고된 것도, 송장번호를 고칠 것도 아니다", () => {
    const row = { box_id: BOX, label: "FC-7K3M9-2", tier: "small", waybill_no: null, state: "missing", ...GIFT_EXTRA };
    expect(parseGiftBoxRows([row])[0]!.state).toBe("missing");
    expect(isWaybillEditable("missing")).toBe(false);
    expect(hasArrived("missing")).toBe(false);
    expect(isMissing("missing")).toBe(true);
    expect(isMissing("awaiting")).toBe(false);
  });

  it("INV-S9: 「먼저 보내기」 전 표시를 받는다 — 칸이 빠지면 목록을 버린다", () => {
    const row = { box_id: BOX, label: "FC-7K3M9-1", tier: "small", waybill_no: null, state: "no_waybill", ...GIFT_EXTRA, send_ack_needed: true };
    expect(parseGiftBoxRows([row])[0]!.sendAckNeeded).toBe(true);
    const { send_ack_needed: _drop, ...without } = row;
    expect(() => parseGiftBoxRows([without])).toThrow();
  });

  it("INV-W10: 「아직 보내지 않음」을 누른 시각을 받는다 — 칸이 빠지면 목록을 버린다", () => {
    const row = { box_id: BOX, label: "FC-7K3M9-1", tier: "small", waybill_no: null, state: "awaiting", ...GIFT_EXTRA, not_sent_at: "2026-10-22T03:00:00+00:00" };
    expect(parseGiftBoxRows([row])[0]!.notSentAt).toBe("2026-10-22T03:00:00+00:00");
    const { not_sent_at: _drop, ...without } = row;
    expect(() => parseGiftBoxRows([without])).toThrow();
  });

  it("상자 구간 이름", () => {
    expect(boxTierName("small")).toBe("소형 상자");
    expect(boxTierName("large")).toBe("대형 상자");
    expect(boxTierName(null)).toBeNull();
  });
});

describe("fanBoxStateTag — 상자 칸 배지(office-workflow INV-W14·W15, 용어집 팬 열)", () => {
  it("INV-W14: 확인 중(checking)은 「확인 중」 — 추적기 보관·신고 보관·경찰 인계를 팬 읽기가 부르는 한 값", () => {
    expect(fanBoxStateTag("checking")).toEqual({ text: "확인 중", tone: "warn" });
  });
  it("INV-W15: 처분 대상은 「처분 예정」, 처분은 「처분」", () => {
    expect(fanBoxStateTag("dispose_due")).toEqual({ text: "처분 예정", tone: "warn" });
    expect(fanBoxStateTag("disposed")).toEqual({ text: "처분", tone: "plain" });
  });
  it("그 밖의 상태는 따로 배지가 없다(null — 입고됨·도착 전 칸이 그대로)", () => {
    for (const s of ["awaiting", "received", "inspected", "return_waiting", "shipped", "missing"] as const) expect(fanBoxStateTag(s)).toBeNull();
  });
});

describe("상자 이름·크기별 개수 — 선물 상세·선물 보내기가 같은 글자를 쓴다(design-rules 33절)", () => {
  it("상자 이름은 「상자 N」(0부터 센 순서 + 1), 크기는 짧은 이름", () => {
    expect(giftBoxName(0)).toBe("상자 1");
    expect(giftBoxName(2)).toBe("상자 3");
    expect(boxSizeName("medium")).toBe("중형");
    expect(boxSizeName(null)).toBeNull();
  });

  it("크기별 개수는 소형·중형·대형 순, 0개는 빼고, 단위를 뺄 수 있다", () => {
    expect(tierCountText({ small: 1, medium: 0, large: 2 })).toBe("소형 1개 · 대형 2개");
    expect(tierCountText({ small: 0, medium: 3, large: 0 }, "")).toBe("중형 3");
    expect(tierCountText({ small: 0, medium: 0, large: 0 })).toBe("");
  });
});
