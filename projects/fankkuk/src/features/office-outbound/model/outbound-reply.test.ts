import { describe, expect, it } from "vitest";
import { printedReplyFromBody, returnPrintedReplyFromBody } from "./outbound-reply";

describe("출고 응답 다시 읽기 (office-workflow INV-W3·W8)", () => {
  it("INV-W3: 송장 출력 응답은 송장 꼴이어야 한다", () => {
    expect(printedReplyFromBody({ waybill: "555566667777" })).toEqual({ waybill: "555566667777" });
    expect(printedReplyFromBody({ waybill: "12" })).toBeNull();
  });
  it("INV-W8: 반송 송장 응답은 봉투 번호가 있어야 한다", () => {
    expect(returnPrintedReplyFromBody({ waybill: "555566667777", envelopeNo: "Q-000123" })).toEqual({ waybill: "555566667777", envelopeNo: "Q-000123" });
    expect(returnPrintedReplyFromBody({ waybill: "555566667777", envelopeNo: "" })).toBeNull();
  });
});
