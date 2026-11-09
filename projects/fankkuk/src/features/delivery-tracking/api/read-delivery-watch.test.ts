import { describe, expect, it } from "vitest";
import { parseDeliveryWatch } from "./read-delivery-watch";

// delivery-status INV-DS10·DS14 — 운영자 배송 조회 응답은 정해진 칸만(송장 끝 네 자리). 다른 칸이 섞여 오면 받지 않는다.

const row = {
  tracking_id: "6f1d2c1e-0000-4000-8000-000000000001",
  kind: "gift",
  waybill_last4: "9012",
  carrier_state: "in_transit",
  last_status: "IN_TRANSIT",
  subscribe_state: "subscribed",
  subscribe_error: null,
  since: "2026-11-08T01:00:00+00:00",
  last_event_at: "2026-11-08T02:00:00+00:00",
  stale: true,
};

describe("parseDeliveryWatch (INV-DS14)", () => {
  it("INV-DS14: 정해진 칸을 화면 꼴로", () => {
    expect(parseDeliveryWatch([row])[0]).toMatchObject({ waybillLast4: "9012", carrierState: "in_transit", stale: true });
  });
  it("INV-DS10 (실패경로): 송장번호 전체·수령인 칸이 섞여 오거나 끝 네 자리가 아니면 받지 않는다", () => {
    expect(() => parseDeliveryWatch([{ ...row, waybill_no: "123456789012" }])).toThrow();
    expect(() => parseDeliveryWatch([{ ...row, receiver_name: "홍길동" }])).toThrow();
    expect(() => parseDeliveryWatch([{ ...row, waybill_last4: "123456789012" }])).toThrow();
  });
});
