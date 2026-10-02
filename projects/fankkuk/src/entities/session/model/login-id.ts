// 아이디 로그인은 Supabase Auth 의 이메일 로그인 위에 얹는다(결정 카드 d9·d10).
// 가입한 계정: 아이디 → <아이디>@login.fankkuk.invalid — 메일이 갈 수 없는 예약 도메인이고 사용자 이메일과 상관없다(signup INV-U8).
// 시험 계정(seed.sql): 아이디 → <아이디>@fankkuk.test — 로컬에서만 시도한다(INV-L6).
// 아이디 꼴을 좁혀 두는 이유: 꼴이 열려 있으면 "a@other.com" 같은 값으로 다른 주소의 계정에 로그인을 시도할 수 있다.
// 로그인 꼴은 DB 의 profiles.login_id 제약과 같고, 가입 꼴(4~20자)은 그보다 좁다(INV-U6).

export const LOGIN_ID_PATTERN = /^[a-z0-9_]{4,30}$/;
export const SIGNUP_LOGIN_ID_PATTERN = /^[a-z0-9_]{4,20}$/;

const TEST_LOGIN_DOMAIN = "fankkuk.test";
const ACCOUNT_LOGIN_DOMAIN = "login.fankkuk.invalid";

type EnvLike = { NODE_ENV?: string; VERCEL_ENV?: string };

export function isProduction(env: EnvLike): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/** 시험 계정 주소. */
export function loginIdToEmail(loginId: string): string | null {
  const id = loginId.trim();
  return LOGIN_ID_PATTERN.test(id) ? `${id}@${TEST_LOGIN_DOMAIN}` : null;
}

/** INV-U8: 가입한 계정의 로그인 주소. */
export function accountLoginEmail(loginId: string): string | null {
  const id = loginId.trim();
  return LOGIN_ID_PATTERN.test(id) ? `${id}@${ACCOUNT_LOGIN_DOMAIN}` : null;
}

/** 로그인 때 차례로 시도할 주소. 운영에서는 가입 계정 주소 하나뿐이다(INV-U8·L6). */
export function loginEmailCandidates(loginId: string, env: EnvLike): string[] {
  const account = accountLoginEmail(loginId);
  if (!account) return [];
  if (isProduction(env)) return [account];
  const test = loginIdToEmail(loginId);
  return test ? [account, test] : [account];
}

/** INV-L6: 시험 계정 주소. */
export function isTestAccountEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${TEST_LOGIN_DOMAIN}`);
}
