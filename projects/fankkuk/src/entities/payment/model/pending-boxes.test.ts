import { describe, expect, it } from "vitest";
import { pendingBoxesFrom } from "./pending-boxes";

// 거절·반려 때 아직 안 온 상자 목록 (payment INV-M18). DB 가 준 칸 모양이 다르면 지어내지 않고 실패(null)한다.

const row = {
  box_id: "6f1c2b0e-8a4d-4c1e-9b7a-1d2e3f4a5b6c",
  label: "FC-ABC123-2",
  order_no: "FC-ABC123",
  fan_nickname: "별빛",
  tier: "small",
  amount_krw: 6900,
  ended_at: "2026-10-08T10:00:00+00:00",
  tracking_no: null,
};

describe("INV-M18: 대표가 닫을 수 있는 상자 목록", () => {
  it("INV-M18: 칸을 화면 이름으로 옮긴다 — 금액은 그 상자 금액 그대로", () => {
    expect(pendingBoxesFrom([row])).toEqual([
      { boxId: row.box_id, label: "FC-ABC123-2", orderNo: "FC-ABC123", fanNickname: "별빛", tier: "small", amountKrw: 6900, endedAt: row.ended_at, trackingNo: null },
    ]);
    expect(pendingBoxesFrom([{ ...row, tracking_no: "123456789012" }])?.[0]?.trackingNo).toBe("123456789012");
    expect(pendingBoxesFrom([])).toEqual([]);
  });

  it("INV-M18 (실패경로): 칸이 빠지거나 꼴이 다르면 null", () => {
    const { box_id: _drop, ...missing } = row;
    expect(pendingBoxesFrom([missing])).toBeNull();
    expect(pendingBoxesFrom([{ ...row, amount_krw: "6900" }])).toBeNull();
    expect(pendingBoxesFrom([{ ...row, box_id: "not-a-uuid" }])).toBeNull();
    expect(pendingBoxesFrom(null)).toBeNull();
  });
});
