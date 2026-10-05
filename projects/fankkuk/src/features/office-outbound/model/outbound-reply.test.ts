import { describe, expect, it } from "vitest";
import { printedReplyFromBody, returnPrintedReplyFromBody } from "./outbound-reply";

describe("출고 응답 다시 읽기 (office-workflow INV-W3·W8)", () => {
  it("INV-W3: 송장 출력 응답은 송장 꼴이어야 한다", () => {
    expect(printedReplyFromBody({ waybill: "555566667777" })).toEqual({ waybill: "555566667777", reprint: false, label: null });
    expect(printedReplyFromBody({ waybill: "12" })).toBeNull();
  });
  it("INV-P4: 팬 선물 송장 출력 응답은 라벨 칸 다섯 개와 재출력 표시를 함께 읽는다 — 다른 칸은 버린다", () => {
    const label = { recipientName: "김하루", phone: "01012345678", zipCode: "06236", address1: "서울시 강남구 테헤란로 123", address2: "" };
    expect(printedReplyFromBody({ waybill: "555566667777", reprint: true, label: { ...label, creatorId: "x" } })).toEqual({ waybill: "555566667777", reprint: true, label });
    expect(printedReplyFromBody({ waybill: "555566667777", reprint: false, label: { ...label, recipientName: "" } })).toBeNull();
    expect(printedReplyFromBody({ waybill: "555566667777", reprint: false, label: { ...label, zipCode: undefined } })).toBeNull();
  });
  it("INV-W8: 반송 송장 응답은 봉투 번호가 있어야 한다", () => {
    expect(returnPrintedReplyFromBody({ waybill: "555566667777", envelopeNo: "Q-000123" })).toEqual({ waybill: "555566667777", envelopeNo: "Q-000123" });
    expect(returnPrintedReplyFromBody({ waybill: "555566667777", envelopeNo: "" })).toBeNull();
  });
});
