import { describe, expect, it } from "vitest";
import { inboundReplyFromBody } from "./inbound-reply";

describe("입고 스캔 응답 다시 읽기 (office-workflow INV-W1·W5, inbound-address-code INV-C5)", () => {
  it("INV-W1: 입고 완료 응답 — 상자 정보가 없으면 null 로 둔다", () => {
    expect(inboundReplyFromBody({ result: "received", qr: "Q-000123", orderNo: "FC-1", parcel: null })).toEqual({ result: "received", qr: "Q-000123", orderNo: "FC-1", parcel: null });
  });
  it("INV-C5: 보류로 기록한 응답 — 사유를 같이 읽는다", () => {
    expect(inboundReplyFromBody({ result: "hold", reason: "code_dispute" })).toEqual({ result: "hold", reason: "code_dispute" });
  });
  it("INV-C5: 보류인데 대조용 값이 모자란 응답(need_details) — 바뀐 것 없음", () => {
    expect(inboundReplyFromBody({ result: "need_details", reason: "no_code" })).toEqual({ result: "need_details", reason: "no_code" });
  });
  it("INV-W5: 이미 보류로 기록한 바코드 응답", () => {
    expect(inboundReplyFromBody({ result: "hold_recorded" })).toEqual({ result: "hold_recorded" });
  });
  it("INV-W1 (실패경로): 라벨 QR 꼴이 아니거나, 모르는 결과·사유면 null", () => {
    expect(inboundReplyFromBody({ result: "received", qr: "x", orderNo: "FC-1", parcel: null })).toBeNull();
    expect(inboundReplyFromBody({ result: "hold", reason: "guess" })).toBeNull();
    expect(inboundReplyFromBody({ result: "unmatched" })).toBeNull();
    expect(inboundReplyFromBody({ result: "shipped" })).toBeNull();
    expect(inboundReplyFromBody(null)).toBeNull();
  });
});
