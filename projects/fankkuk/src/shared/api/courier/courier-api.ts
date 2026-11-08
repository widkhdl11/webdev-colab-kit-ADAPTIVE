// 택배사 API 연결 자리(address-protection INV-P21 ①, external-connections INV-P6). 택배사 계약 전이라 실제 연결은 없다 —
// 계약하면 이 꼴대로 만든 연결을 송장 출력 함수 조립에 넣는다. 주소를 담은 요청은 송장 출력 함수(게이트웨이) 안에서만 보낸다.

export type CourierLabel = { recipientName: string; phone: string; zipCode: string; address1: string; address2: string };

export type CourierApi = {
  /** 계약된 연결인가 — false 면 송장 출력 함수 조립이 실패한다(주소를 열기 전에) */
  contracted: boolean;
  /** 택배사가 나눠 준 운송장 번호 대역에서 다음 번호 하나 */
  nextWaybill: () => string;
  /** 연 주소로 그 운송장의 접수를 택배사에 보낸다 */
  registerShipment: (input: { waybill: string; orderNo: string; label: CourierLabel }) => Promise<void>;
};

const NOT_CONTRACTED = "택배사 계약 전이라 택배사 API 연결이 없다";

/** 계약 전 연결 — 무엇을 부르든 거부한다. */
export const UNCONTRACTED_COURIER_API: CourierApi = {
  contracted: false,
  nextWaybill: () => {
    throw new Error(NOT_CONTRACTED);
  },
  registerShipment: async () => {
    throw new Error(NOT_CONTRACTED);
  },
};
