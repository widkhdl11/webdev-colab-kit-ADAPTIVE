import type { CourierApi } from "@/shared/api/courier/courier-api";
import type { InvoiceOutputMode } from "@/shared/config/courier";

// 송장 출력 방식(address-protection INV-P21)에 맞춰 첫 출력의 운송장 번호를 어디서 받을지 정한다.
// - 수동 입력: 번호를 만들지 않는다(null) — 대표가 택배 접수 뒤 받은 번호를 상자에 넣는다(office_set_outbound_waybill).
// - 택배사 API: 계약된 연결이 나눠 준 번호. 계약 전 연결이면 여기서 실패한다 — 출력 횟수를 쓰기 전에(INV-P19 와 같은 자리).
// - 엑셀 반자동: 상자 하나씩 출력하는 길이 없다 — 여기서 실패한다(엑셀 만들기는 따로).

export type OutboundWaybill = () => string | null;

export function outboundWaybillSource(mode: InvoiceOutputMode, courier: CourierApi): OutboundWaybill {
  switch (mode) {
    case "manual":
      return () => null;
    case "courier_api":
      if (!courier.contracted) throw new Error("송장 출력 방식이 택배사 API 인데 계약된 연결이 없다 — 계약 전에는 manual 로 둔다");
      return () => courier.nextWaybill();
    case "excel":
      throw new Error("송장 출력 방식이 엑셀 반자동이면 상자 하나씩 출력하지 않는다 — 엑셀 만들기를 쓴다");
  }
}
