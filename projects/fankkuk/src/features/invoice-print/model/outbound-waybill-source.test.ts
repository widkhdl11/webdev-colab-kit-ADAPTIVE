import { describe, expect, it } from "vitest";
import { UNCONTRACTED_COURIER_API, type CourierApi } from "@/shared/api/courier/courier-api";
import { INVOICE_OUTPUT_MODE } from "@/shared/config/courier";
import { outboundWaybillSource } from "./outbound-waybill-source";

// 송장 출력 방식(address-protection INV-P21) — 설정값 하나가 첫 출력의 운송장 번호를 어디서 받을지 정한다.

const contracted: CourierApi = {
  contracted: true,
  nextWaybill: () => "640123457788",
  registerShipment: async () => undefined,
};

describe("송장 출력 방식 (INV-P21)", () => {
  it("INV-P21: 택배사 계약 전 기본값은 「수동 입력」이다", () => {
    expect(INVOICE_OUTPUT_MODE).toBe("manual");
  });

  it("INV-P21 ③: 수동 입력이면 주소를 열 때 운송장 번호를 만들지 않는다 — 대표가 택배 접수 뒤 넣는다", () => {
    const source = outboundWaybillSource("manual", UNCONTRACTED_COURIER_API);
    expect(source()).toBeNull();
  });

  it("INV-P21 ① (실패경로): 택배사 API 설정인데 계약 전 연결이면 조립 단계에서 실패한다 — 주소를 열기 전에", () => {
    expect(() => outboundWaybillSource("courier_api", UNCONTRACTED_COURIER_API)).toThrow();
  });

  it("INV-P21 ①: 택배사 API 설정이고 계약된 연결이면 그 연결이 준 운송장 번호를 쓴다", () => {
    expect(outboundWaybillSource("courier_api", contracted)()).toBe("640123457788");
  });

  it("INV-P21 ② (실패경로): 엑셀 반자동은 상자 하나씩 출력하는 길이 없다 — 조립 단계에서 실패한다", () => {
    expect(() => outboundWaybillSource("excel", UNCONTRACTED_COURIER_API)).toThrow();
  });

  it("INV-P21 ① (실패경로): 계약 전 연결은 부르면 거부한다", async () => {
    expect(UNCONTRACTED_COURIER_API.contracted).toBe(false);
    expect(() => UNCONTRACTED_COURIER_API.nextWaybill()).toThrow();
    await expect(
      UNCONTRACTED_COURIER_API.registerShipment({
        waybill: "640123457788",
        orderNo: "FC-AAAAA",
        label: { recipientName: "가", phone: "01000000000", zipCode: "06236", address1: "가", address2: "" },
      }),
    ).rejects.toThrow();
  });
});
