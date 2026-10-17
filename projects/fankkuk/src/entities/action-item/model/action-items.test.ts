import { describe, expect, it } from "vitest";
import { parseActionItems } from "./action-items";

// 팬 처리할 일 줄 꼴 (action-center INV-J1·J2). 반송 주소 확인 카드(office-workflow INV-W15) — 상자 하나가 카드 하나.

const base = { order_no: "FC-R1", creator_name: "하루", tier: "small", measured_tier: null, amount_krw: null };
const returnRow = { ...base, kind: "return_address", box_id: "44444444-4444-4444-8444-444444444444", box_label: "FC-R1-2", box_seq: 2, due_at: "2026-11-16T01:00:00Z" };

describe("반송 주소 확인 카드 (action-center INV-J1)", () => {
  it("INV-J1 (S1d): 반송 주소 확인 줄은 상자 하나의 카드 — 상자 칸·기한(반송 대기 + 30일)을 옮긴다", () => {
    expect(parseActionItems([returnRow])).toEqual([
      { kind: "return_address", orderNo: "FC-R1", boxId: returnRow.box_id, boxLabel: "FC-R1-2", boxSeq: 2, creatorName: "하루", declaredTier: "small", dueAt: "2026-11-16T01:00:00Z" },
    ]);
  });

  it("INV-J1 (실패경로): 상자 칸이 없는 반송 주소 줄이 하나라도 있으면 전체를 거부한다 — 숫자와 목록이 다른 수를 말하지 않게", () => {
    expect(() => parseActionItems([{ ...returnRow, box_id: null }])).toThrow();
    expect(() => parseActionItems([{ ...returnRow, box_seq: null }])).toThrow();
  });
});
