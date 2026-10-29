import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";

// 번호 바꾸기의 본인 확인 번호표 — 가입과 같은 방식으로 스크립트가 못 읽는 쿠키에만 둔다(signup S1c).
// 가입 쿠키와 이름·경로를 나눈다: 이 쿠키는 /api/me/phone 아래 요청에만 실려 가고, 가입 화면의 번호표와 섞이지 않는다.
// 수명 20분 — 인증번호는 3분(INV-U15), 확인부터 바꾸기까지 10분(INV-U2). 넉넉히 둔다.

export const PHONE_CHANGE_COOKIE = "fk_phone_change_verification";

export function phoneChangeCookieOptions(env: DeployEnv) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(env),
    path: "/api/me/phone",
    maxAge: 1200,
  };
}
