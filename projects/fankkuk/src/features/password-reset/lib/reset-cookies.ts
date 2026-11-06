import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";

// 휴대폰 비밀번호 찾기의 쿠키 둘(session-login INV-L10·L11) — 가입·번호 바꾸기와 같은 방식(스크립트가 못 읽는 쿠키)이고 이름·경로를 따로 둔다.
// 경로는 /api/auth/password/reset 아래(받기·확인·저장 라우트)에만 실려 가게 한다.
// - 번호표(인증번호 요청 ID): 20분 — 인증번호는 3분(signup INV-U15), 확인부터 표 발급까지 10분. 넉넉히 둔다.
// - 재설정 표(64자 16진수): 10분 — DB 의 표 수명과 같다(INV-L11). 표는 응답 본문·주소창에 싣지 않는다.

export const RESET_COOKIE_PATH = "/api/auth/password/reset";
export const RESET_VERIFICATION_COOKIE = "fk_password_reset_verification";
export const RESET_TICKET_COOKIE = "fk_password_reset_ticket";
export const RESET_VERIFICATION_MAX_AGE = 1200;
export const RESET_TICKET_MAX_AGE = 600;

export function resetCookieOptions(env: DeployEnv, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(env),
    path: RESET_COOKIE_PATH,
    maxAge,
  };
}
