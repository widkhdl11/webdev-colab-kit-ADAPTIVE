import { describe, expect, it } from "vitest";
import { adminInquiriesFromRows } from "./admin-inquiry";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

const OPEN = {
  id: ID,
  kind: "account",
  title: "주소를 바꾸고 싶어요",
  body: "어떻게 하나요?",
  order_no: null,
  status: "open",
  answer: null,
  created_at: "2026-10-02T11:05:00+00:00",
  answered_at: null,
  author_login_id: "dal_tokki",
  author_nickname: "달토끼",
  answered_by_nickname: null,
};

describe("관리자 1:1 문의 읽기 (INV-K11·K8)", () => {
  it("INV-K11: 줄을 옮긴다 — 사람은 아이디·닉네임만, 다른 칸은 버린다", () => {
    expect(adminInquiriesFromRows([{ ...OPEN, author_phone: "010" }])).toEqual([
      {
        id: ID,
        kind: "account",
        title: "주소를 바꾸고 싶어요",
        body: "어떻게 하나요?",
        orderNo: null,
        status: "open",
        answer: null,
        createdAt: "2026-10-02T11:05:00+00:00",
        answeredAt: null,
        authorLoginId: "dal_tokki",
        authorNickname: "달토끼",
        answeredByNickname: null,
      },
    ]);
  });

  it("INV-K11: 답이 달린 줄 — 답·답한 시각·답한 사람 닉네임을 옮긴다", () => {
    const row = { ...OPEN, status: "answered", answer: "바꿔 드렸어요.", answered_at: "2026-10-03T01:00:00+00:00", answered_by_nickname: "라임" };
    expect(adminInquiriesFromRows([row])?.[0]).toMatchObject({ status: "answered", answer: "바꿔 드렸어요.", answeredAt: "2026-10-03T01:00:00+00:00", answeredByNickname: "라임" });
  });

  it("INV-K11 (실패경로): 모르는 상태·꼴이 다른 줄이 있으면 null", () => {
    expect(adminInquiriesFromRows(null)).toBeNull();
    expect(adminInquiriesFromRows([{ ...OPEN, status: "closed" }])).toBeNull();
    expect(adminInquiriesFromRows([{ ...OPEN, title: 1 }])).toBeNull();
    expect(adminInquiriesFromRows([{ ...OPEN, kind: "refund" }])).toBeNull();
  });

  it("결정 d25: 분류·주문번호를 옮긴다", () => {
    expect(adminInquiriesFromRows([{ ...OPEN, kind: "shipping", order_no: "FC-7K3M9" }])?.[0]).toMatchObject({ kind: "shipping", orderNo: "FC-7K3M9" });
  });
});
