// 아이디 로그인은 Supabase Auth 의 이메일 로그인 위에 얹는다: 아이디 → <아이디>@fankkuk.test (결정 카드 d9·d10).
// 아이디 꼴을 좁혀 두는 이유: 꼴이 열려 있으면 "a@other.com" 같은 값으로 다른 주소의 계정에 로그인을 시도할 수 있다.
// 이 꼴은 DB 의 profiles.login_id 제약과 같다.

export const LOGIN_ID_PATTERN = /^[a-z0-9_]{4,30}$/;

const LOGIN_EMAIL_DOMAIN = "fankkuk.test";

export function loginIdToEmail(loginId: string): string | null {
  const id = loginId.trim();
  return LOGIN_ID_PATTERN.test(id) ? `${id}@${LOGIN_EMAIL_DOMAIN}` : null;
}

/** INV-L6: 시험 계정 주소. 가입 화면이 생기면 실제 계정은 다른 주소를 쓴다(계정 스펙). */
export function isTestAccountEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${LOGIN_EMAIL_DOMAIN}`);
}
