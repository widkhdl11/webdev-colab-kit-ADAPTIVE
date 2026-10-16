import { describe, expect, it } from "vitest";
import { checkInquiryInput, normalizeOrderNo } from "./inquiry-input";

const OK = { kind: "shipping", title: "선물이 안 왔어요", body: "언제 가나요?", orderNo: "FC-7K3M9" };

describe("1:1 문의 입력 검사 (결정 d25 — DB create_inquiry 와 같은 경계)", () => {
  it("여섯 분류는 모두 받는다", () => {
    for (const kind of ["gift", "fee", "shipping", "creator", "account", "etc"]) {
      expect(checkInquiryInput({ ...OK, kind }).ok).toBe(true);
    }
  });

  it("제목·본문 앞뒤 공백을 지우고, 주문번호는 공백을 지우고 대문자로 바꾼다", () => {
    expect(checkInquiryInput({ ...OK, title: "  제목 ", body: "\n본문\n", orderNo: " fc-7k3m9-2 " })).toEqual({
      ok: true,
      value: { kind: "shipping", title: "제목", body: "본문", orderNo: "FC-7K3M9-2" },
    });
  });

  it("주문번호는 없어도 된다 — 칸 없음·null·빈칸·공백만이면 null", () => {
    const { orderNo: _omit, ...noOrder } = OK;
    for (const input of [noOrder, { ...OK, orderNo: null }, { ...OK, orderNo: "" }, { ...OK, orderNo: "   " }]) {
      const r = checkInquiryInput(input);
      expect(r.ok && r.value.orderNo).toBeNull();
    }
  });

  it("제목 100자·본문 4000자(이모지는 한 글자)까지 받는다", () => {
    expect(checkInquiryInput({ ...OK, title: "가".repeat(100), body: "😀".repeat(4000) }).ok).toBe(true);
  });

  it.each([
    ["여섯 밖 분류", { ...OK, kind: "refund" }, "kind", "분류를 골라 주세요."],
    ["화면 라벨을 보낸 분류", { ...OK, kind: "배송" }, "kind", "분류를 골라 주세요."],
    ["빈 분류", { ...OK, kind: "" }, "kind", "분류를 골라 주세요."],
    ["대문자 분류", { ...OK, kind: "GIFT" }, "kind", "분류를 골라 주세요."],
    ["접두어가 다른 주문번호", { ...OK, orderNo: "AB-7K3M9" }, "orderNo", "주문번호는 FC-7K3M9 형식으로 적어 주세요."],
    ["너무 짧은 주문번호", { ...OK, orderNo: "FC-7K" }, "orderNo", "주문번호는 FC-7K3M9 형식으로 적어 주세요."],
    ["너무 긴 주문번호", { ...OK, orderNo: "FC-12345678901" }, "orderNo", "주문번호는 FC-7K3M9 형식으로 적어 주세요."],
    ["뒷번호 세 자리", { ...OK, orderNo: "FC-7K3M9-123" }, "orderNo", "주문번호는 FC-7K3M9 형식으로 적어 주세요."],
    ["가운데 공백", { ...OK, orderNo: "FC-7K 3M9" }, "orderNo", "주문번호는 FC-7K3M9 형식으로 적어 주세요."],
    ["빈 제목", { ...OK, title: "   " }, "title", "제목은 1~100자로 적어 주세요."],
    ["101자 제목", { ...OK, title: "가".repeat(101) }, "title", "제목은 1~100자로 적어 주세요."],
    ["빈 본문", { ...OK, body: "\n\n" }, "body", "내용은 1~4000자로 적어 주세요."],
    ["4001자 본문", { ...OK, body: "나".repeat(4001) }, "body", "내용은 1~4000자로 적어 주세요."],
  ])("(실패경로): %s → 그 칸과 사람 말 문구", (_label, input, field, message) => {
    expect(checkInquiryInput(input)).toEqual({ ok: false, field, message });
  });

  it("(실패경로): 몸통 꼴이 틀리면(없음·문자열 아님·모르는 칸) 거부", () => {
    for (const input of [null, "문의", {}, { ...OK, title: 1 }, { ...OK, authorId: "someone" }]) {
      expect(checkInquiryInput(input).ok).toBe(false);
    }
  });

  it("normalizeOrderNo: 다듬기만 하고 꼴 검사는 하지 않는다", () => {
    expect(normalizeOrderNo(" ab-1 ")).toBe("AB-1");
    expect(normalizeOrderNo(undefined)).toBeNull();
  });
});
