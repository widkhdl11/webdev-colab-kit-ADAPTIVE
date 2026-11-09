// 안심번호 API 연결 자리(address-protection INV-P21 ② · INV-P19). 로지아이는 안심번호를 발급하지 않고, 이미 받은 안심번호를 엑셀에 넣는 것은 받는다
// (2026-11-09 로지아이 답). 그래서 엑셀 반자동의 받는 사람 전화 칸에 안심번호를 넣으려면 따로 안심번호 업체(050 번호 발급)를 붙여야 한다.
// 아직 업체가 없다 — 이 꼴대로 만든 연결을 엑셀 만들기 조립에 넣는다. 실제 번호를 담은 요청은 송장 출력 함수(게이트웨이) 안에서만 보낸다.

export type SafeNumberApi = {
  /** 계약된 연결인가 — false 면 「안심번호」 설정의 엑셀 만들기 조립이 실패한다(주소를 열기 전에) */
  connected: boolean;
  /** 실제 번호 하나에 안심번호 하나를 받는다. ref 는 상자 식별값(업체 쪽 해지·조회용) — 주문번호·이름은 넘기지 않는다 */
  issue: (input: { realPhone: string; ref: string }) => Promise<string>;
};

const NOT_CONNECTED = "안심번호 업체와 연결하지 않아 안심번호를 받을 수 없다";

/** 연결 전 — 무엇을 부르든 거부한다. */
export const UNCONNECTED_SAFE_NUMBER_API: SafeNumberApi = {
  connected: false,
  issue: async () => {
    throw new Error(NOT_CONNECTED);
  },
};
