// 로그인 화면(일반 /login · 운영자 /admin/login)이 같이 쓰는 문구. 서버 응답을 받지 못했을 때 화면이 직접 보이는 것만 둔다 —
// 서버가 정하는 실패·잠김 문구는 서버 쪽 상수(sign-in.ts · password-attempts.ts)가 정본이다.
export const LOGIN_NETWORK_ERROR = "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
