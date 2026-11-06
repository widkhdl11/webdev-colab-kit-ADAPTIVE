// 송장 라벨의 받는 사람 번호에 무엇을 찍는가(address-protection INV-P19).
// - "real": 받는 사람의 실제 번호. 택배사 계약 전 값이다.
// - "courier_safe_number": 택배사가 운송장과 함께 준 안심번호(050 등). 택배사 계약에 「수취인 안심번호 제공」이 들어가고
//   택배사 연결(운송장·안심번호 받기)이 생긴 뒤에만 바꾼다. 연결 없이 바꾸면 송장 출력이 조립 단계에서 실패한다 — 실제 번호로 대신 찍지 않는다.
// 계약 확인 항목: docs/courier-contract-checklist.md
export type RecipientPhoneMode = "real" | "courier_safe_number";

export const RECIPIENT_PHONE_ON_LABEL: RecipientPhoneMode = "real";
