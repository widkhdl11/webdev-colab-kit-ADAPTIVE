import { describe, expect, it } from "vitest";
import { disposeDueText, parseActionItems } from "./action-items";

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

describe("처분 예정 날짜 문장 (office-workflow INV-W15, 용어집 dispose_due 행)", () => {
  it("INV-W15: 기한(반송 대기 + 30일)을 서울 날짜로 — 「○월 ○일까지 확인하지 않으면 상자를 처분해요」", () => {
    // 서울 11월 16일 0시 30분 = UTC 11월 15일 15시 30분 — UTC 날짜로 쓰면 하루 이르게 나온다
    expect(disposeDueText("2026-11-15T15:30:00.000Z")).toBe("11월 16일까지 확인하지 않으면 상자를 처분해요");
  });
});

describe("추가 결제 카드의 기한 (action-center INV-J1 · payment INV-M13, 2026-10-21)", () => {
  const diffRow = {
    ...base,
    kind: "difference",
    box_id: "55555555-5555-4555-8555-555555555555",
    box_label: "FC-R1",
    box_seq: 1,
    measured_tier: "medium",
    amount_krw: 2000,
  };

  it("INV-J1·M13: 기한은 검수 완료 스캔 + 168시간 — 스캔 전(실측만 있음)이면 기한이 비어 있는 카드", () => {
    expect(parseActionItems([{ ...diffRow, due_at: null }])[0]).toMatchObject({ kind: "difference", dueAt: null });
    expect(parseActionItems([{ ...diffRow, due_at: "2026-11-01T00:00:00Z" }])[0]).toMatchObject({ dueAt: "2026-11-01T00:00:00Z" });
  });

  it("INV-J1 (실패경로): 기한이 비어 있어도 되는 것은 추가 결제뿐 — 다른 카드의 빈 기한은 거부한다", () => {
    expect(() => parseActionItems([{ ...returnRow, due_at: null }])).toThrow();
  });
});

describe("결제 미완료 줄 (action-center INV-J1 표 · payment INV-M22)", () => {
  const unpaidRow = { ...base, kind: "unpaid", tier: null, box_id: null, box_label: null, box_seq: null, amount_krw: 6900, due_at: "2026-10-22T03:00:00Z" };

  it("INV-J1 (결제 미완료): 주문 하나의 줄 — 처음 저장한 금액·기한(처음 결제 대기 + 24시간)을 옮긴다", () => {
    expect(parseActionItems([unpaidRow])).toEqual([{ kind: "unpaid", orderNo: "FC-R1", creatorName: "하루", amountKrw: 6900, dueAt: "2026-10-22T03:00:00Z" }]);
  });

  it("INV-J1 (결제 미완료, 실패경로): 금액·기한이 없는 결제 미완료 줄이 하나라도 있으면 전체를 거부한다", () => {
    expect(() => parseActionItems([{ ...unpaidRow, amount_krw: null }])).toThrow();
    expect(() => parseActionItems([{ ...unpaidRow, amount_krw: 0 }])).toThrow();
    expect(() => parseActionItems([{ ...unpaidRow, due_at: null }])).toThrow();
  });
});
