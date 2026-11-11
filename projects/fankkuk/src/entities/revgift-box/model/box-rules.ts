// 선물함 만들기 입력의 한도(revgift-box INV-GB3, 정할 것 Q3). 판정은 DB 가 규칙 함수(revgift_box_rules)로 다시 한다 —
// 여기 값은 입력 칸의 최대 길이·범위 표시용이다. 통합 시험이 두 값이 같은지 본다.
export const BOX_NAME_MAX = 40;
export const BOX_CAPACITY_MAX = 100;
/** 간단한 설명 — 선택, 한 줄, 앞뒤 공백을 뺀 뒤 100자까지. DB 제약과 만들기 함수가 같은 값으로 다시 본다 */
export const BOX_DESCRIPTION_MAX = 100;
