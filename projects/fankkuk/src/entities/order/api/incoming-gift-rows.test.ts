import { describe, expect, it } from "vitest";
import { parseIncomingGiftRows } from "./incoming-gift-rows";

const row = {
  order_no: "FC-7K3M9",
  sender_nickname: "별빛",
  box_count: 1,
  stage: "in_transit",
  paid_at: "2026-10-01T01:10:00+00:00",
  received_at: "2026-10-02T00:30:00+00:00",
  inspected_at: "2026-10-02T01:20:00+00:00",
  shipped_at: "2026-10-02T06:00:00+00:00",
  inspection_result: "passed",
  delivery: "in_transit",
};

describe("받은 선물 읽기 응답 (office-workflow INV-W9)", () => {
  it("INV-W9: 정해진 칸을 화면 모양으로 바꾼다", () => {
    expect(parseIncomingGiftRows([row])).toEqual([
      {
        orderNo: "FC-7K3M9",
        senderNickname: "별빛",
        boxCount: 1,
        stage: "in_transit",
        paidAt: "2026-10-01T01:10:00.000Z",
        receivedAt: "2026-10-02T00:30:00.000Z",
        inspectedAt: "2026-10-02T01:20:00.000Z",
        shippedAt: "2026-10-02T06:00:00.000Z",
        inspection: "passed",
        delivery: "in_transit",
      },
    ]);
  });

  it("INV-W9 (실패경로): 정해지지 않은 칸(원 송장번호·보낸 사람 계정)이 섞여 오면 받지 않는다", () => {
    expect(() => parseIncomingGiftRows([{ ...row, fan_tracking_no: "584012376655" }])).toThrow();
    expect(() => parseIncomingGiftRows([{ ...row, fan_id: "00000000-0000-4000-a000-000000000001" }])).toThrow();
  });

  it("모르는 단계 값이면 받지 않는다", () => {
    expect(() => parseIncomingGiftRows([{ ...row, stage: "approved" }])).toThrow();
  });
});
