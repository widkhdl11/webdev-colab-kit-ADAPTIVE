import { describe, expect, it } from "vitest";
import { myInquiriesFromRows } from "./my-inquiry";

const ROW = {
  id: "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f",
  kind: "shipping",
  title: "선물이 안 왔어요",
  body: "언제 가나요?",
  order_no: "FC-7K3M9",
  status: "answered",
  answer: "오늘 출고돼요.",
  created_at: "2026-10-02T11:05:00+00:00",
  answered_at: "2026-10-03T01:00:00+00:00",
};

describe("내 문의 읽기 (INV-K11, 결정 d25)", () => {
  it("줄을 옮긴다 — 분류·주문번호·답 포함", () => {
    expect(myInquiriesFromRows([ROW])).toEqual([
      {
        id: ROW.id,
        kind: "shipping",
        title: "선물이 안 왔어요",
        body: "언제 가나요?",
        orderNo: "FC-7K3M9",
        status: "answered",
        answer: "오늘 출고돼요.",
        createdAt: ROW.created_at,
        answeredAt: ROW.answered_at,
      },
    ]);
  });

  it("(실패경로): 모르는 분류·상태, 꼴이 다른 줄이 있으면 null", () => {
    expect(myInquiriesFromRows(null)).toBeNull();
    expect(myInquiriesFromRows([{ ...ROW, kind: "refund" }])).toBeNull();
    expect(myInquiriesFromRows([{ ...ROW, status: "closed" }])).toBeNull();
    expect(myInquiriesFromRows([{ ...ROW, order_no: 7 }])).toBeNull();
  });
});
