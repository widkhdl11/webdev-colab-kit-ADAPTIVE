import { describe, expect, it } from "vitest";
import { differenceState, parseDifferenceRows, visibleDifferences, type GiftDifference } from "./difference-rows";

describe("팬이 보는 차액 상태 (payment INV-M13)", () => {
  it("INV-M13: 낸 것·결제 중은 기한과 상관없고, 대기·실패는 기한이 지나면 더는 낼 수 없다", () => {
    expect(differenceState("done", true)).toBe("paid");
    expect(differenceState("confirming", true)).toBe("paying");
    expect(differenceState("pending", false)).toBe("due");
    expect(differenceState("failed", false)).toBe("due");
    expect(differenceState("pending", true)).toBe("closed");
    expect(differenceState("failed", true)).toBe("closed");
  });

  it("(실패경로): 금액이 0 이거나 꼴이 다른 줄은 받지 않는다", () => {
    const row = { box_id: "00000000-0000-4000-a000-0000000000c1", box_seq: 1, declared_tier: "small", measured_tier: "medium", amount_krw: 2000, status: "pending", due_at: "2026-10-13T00:00:00+00:00", expired: false };
    expect(parseDifferenceRows([row])).toEqual([
      { boxId: row.box_id, boxSeq: 1, declaredTier: "small", measuredTier: "medium", amountKrw: 2000, dueAt: row.due_at, state: "due" },
    ]);
    expect(() => parseDifferenceRows([{ ...row, amount_krw: 0 }])).toThrow();
    expect(() => parseDifferenceRows([{ ...row, status: "refunded" }])).toThrow();
  });
});

describe("선물 상세에 보일 차액 줄 (payment INV-M11·M13)", () => {
  const base: GiftDifference = { boxId: "b1", boxSeq: 1, declaredTier: "small", measuredTier: "medium", amountKrw: 2000, dueAt: "2026-10-13T00:00:00+00:00", state: "due" };
  const rows: GiftDifference[] = [
    base,
    { ...base, boxId: "b2", boxSeq: 2, state: "paid" },
    { ...base, boxId: "b3", boxSeq: 3, state: "closed" },
  ];

  it("INV-M13: 진행 중인 주문은 낼 것·낸 것·기한 지남을 모두 보인다", () => {
    expect(visibleDifferences(rows, true).map((d) => d.boxId)).toEqual(["b1", "b2", "b3"]);
  });

  it("INV-M13 (실패경로): 끝난 주문은 낸 기록만 — 낼 차액이 하나도 없으면 빈 목록(섹션을 그리지 않는다)", () => {
    expect(visibleDifferences(rows, false).map((d) => d.boxId)).toEqual(["b2"]);
    expect(visibleDifferences([base, { ...base, boxId: "b3", state: "closed" }], false)).toEqual([]);
  });
});
