// 송장 라벨의 받는 사람 번호에 무엇을 찍는가(address-protection INV-P19).
// - "real": 받는 사람의 실제 번호. 택배사 계약 전 값이다.
// - "courier_safe_number": 택배사가 운송장과 함께 준 안심번호(050 등). 택배사 계약에 「수취인 안심번호 제공」이 들어가고
//   택배사 연결(운송장·안심번호 받기)이 생긴 뒤에만 바꾼다. 연결 없이 바꾸면 송장 출력이 조립 단계에서 실패한다 — 실제 번호로 대신 찍지 않는다.
// 계약 확인 항목: docs/courier-contract-checklist.md
export type RecipientPhoneMode = "real" | "courier_safe_number";

export const RECIPIENT_PHONE_ON_LABEL: RecipientPhoneMode = "real";

// 송장 출력 방식(address-protection INV-P21). 세 방식 모두 주소는 송장 출력 함수만 열고, 상자마다 기존 규칙(INV-P4·P5·P7·P8)을 지킨다.
// - "courier_api": 택배사 API 가 운송장 번호를 주고 라벨을 찍는다. 택배사 계약·연결(shared/api/courier) 뒤에만 — 계약 전 연결이면 출력 기능 조립이 실패한다.
// - "excel": 엑셀 반자동 — 고른 상자들로 택배 중개 플랫폼 일괄 등록 파일을 만든다. 아직 만들지 않았다(BACKLOG) — 고르면 조립이 실패한다.
// - "manual": 수동 입력 — 대표가 상자 하나씩 주소를 열어 택배 접수 화면에 옮긴 뒤 운송장 번호를 넣는다. 택배사 계약 전 값이다.
export type InvoiceOutputMode = "courier_api" | "excel" | "manual";

export const INVOICE_OUTPUT_MODE: InvoiceOutputMode = "manual";

// 엑셀 반자동(INV-P21 ②)에서 로지아이 일괄 예약 양식의 받는 사람 전화 칸에 무엇을 넣는가(DECISIONS 2026-11-09 「로지아이 답 반영」 ②).
// 로지아이는 안심번호를 발급하지 않으므로 택배사 안심번호(RECIPIENT_PHONE_ON_LABEL 의 courier_safe_number)는 이 방식에 없다.
// - "real": 받는 사람의 실제 번호. 지금 값이다.
// - "safe_number_api": 안심번호 업체(shared/api/safe-number)가 그 상자에 준 번호. 업체 연결 뒤에만 바꾼다 —
//   연결 없이 바꾸면 엑셀 만들기 조립이 실패한다. 번호를 못 받은 상자는 실제 번호로 대신 넣지 않고 그 상자를 파일에서 뺀다.
export type ExcelRecipientPhoneMode = "real" | "safe_number_api";

export const EXCEL_RECIPIENT_PHONE: ExcelRecipientPhoneMode = "real";
