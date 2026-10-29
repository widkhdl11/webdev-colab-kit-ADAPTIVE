import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";

// 본인 확인 번호표는 화면 스크립트가 읽을 수 없는 쿠키에만 둔다(signup S1c, 2026-10-03 security-reviewer).
// 요청을 보낸 브라우저만 그 번호표로 결과를 묻고 가입할 수 있다 — 번호표와 번호를 손에 넣어도
// 다른 브라우저에서는 쓸 수 없다. 본문에 실려 온 번호표는 버리고 쿠키 값으로 바꿔 끼운다.
// 쿠키 수명 20분 — 인증번호는 3분(INV-U15), 확인부터 가입까지 10분(INV-U2). 넉넉히 둔다.

export const VERIFICATION_COOKIE = "fk_signup_verification";

export function verificationCookieOptions(env: DeployEnv) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(env),
    path: "/api/signup",
    maxAge: 1200,
  };
}

export function withVerificationFromCookie(body: unknown, cookieValue: string | undefined): Record<string, unknown> {
  const base: Record<string, unknown> = body !== null && typeof body === "object" && !Array.isArray(body) ? { ...body } : {};
  delete base.verificationId;
  if (cookieValue) base.verificationId = cookieValue;
  return base;
}
