import { describe, expect, it } from "vitest";
import { inboundReplyFromBody } from "./inbound-reply";

describe("입고 스캔 응답 다시 읽기 (office-workflow INV-W1·W5)", () => {
  it("INV-W1: 입고 완료 응답 — 상자 정보가 없으면 null 로 둔다", () => {
    expect(inboundReplyFromBody({ result: "received", qr: "Q-000123", orderNo: "FC-1", parcel: null })).toEqual({ result: "received", qr: "Q-000123", orderNo: "FC-1", parcel: null });
  });
  it("INV-W5: 미확인 응답", () => {
    expect(inboundReplyFromBody({ result: "unmatched", qr: null, orderNo: null, parcel: null })).toEqual({ result: "unmatched" });
  });
  it("INV-W5: 이미 미확인으로 기록한 송장 응답", () => {
    expect(inboundReplyFromBody({ result: "unmatched_recorded", qr: null, orderNo: null, parcel: null })).toEqual({ result: "unmatched_recorded" });
  });
  it("INV-W1 (실패경로): 라벨 QR 꼴이 아니거나 모르는 결과면 null", () => {
    expect(inboundReplyFromBody({ result: "received", qr: "x", orderNo: "FC-1", parcel: null })).toBeNull();
    expect(inboundReplyFromBody({ result: "shipped" })).toBeNull();
    expect(inboundReplyFromBody(null)).toBeNull();
  });
});
