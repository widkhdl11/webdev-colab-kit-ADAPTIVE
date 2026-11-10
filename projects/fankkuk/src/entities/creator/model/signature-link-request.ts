// 승인 서명 연결의 시험 서명 — 요청 구분 문구(approval-signature INV-S16). 카카오 지갑에 보인다.
// 연결하는 두 길(가입 3단계 signup INV-U19 · 크리에이터 설정)이 같은 문구를 쓴다.
export const LINK_REQUEST_MESSAGE = "팬꾹 승인 서명 연결";

/**
 * 승인 서명 연결의 시험 서명 결과로 게이트웨이가 확인하는 최소 나이(signup INV-U16 정함 · approval-signature INV-S16).
 * 가입 3단계와 설정의 연결이 같은 값을 보낸다 — 장애 대비 길로 가입해 건너뛴 나이 확인을 설정 연결에서 받는다.
 */
export const LINK_MIN_AGE = 14;
