// 계정 비밀번호를 확인하고, 한 계정의 로그인 세션을 끝내는 도구(session-login INV-L11·L12, signup INV-U12).
// 비밀번호 확인은 Supabase Auth 의 로그인으로 한다 — 일회용 클라이언트로 잠깐 로그인해 보고 그 세션은 바로 끝낸다.
// (DB 에서 비밀번호 해시를 직접 비교하면 Auth 의 로그인 시도 제한을 거치지 않아, 세션 하나로 비밀번호를 끝없이 맞춰 볼 수 있다.)
// 계정 ID 는 부르는 쪽이 세션에서 확인한 ID(INV-L2) 또는 DB 가 링크로 정한 ID 만 넘긴다.
// INV-L14: 지금 비밀번호 확인도 로그인과 같은 아이디별 횟수를 거친다(attempts).

import type { PasswordAttempts } from "./password-attempts";

type AuthError = { message?: string } | null;

export type AccountAuthAdmin = {
  getUserById(uid: string): PromiseLike<{ data: { user: { id: string; email?: string } | null }; error: AuthError }>;
  updateUserById(uid: string, attrs: { password: string }): PromiseLike<{ error: AuthError }>;
};

export type DetachedAuth = {
  signInWithPassword(c: { email: string; password: string }): PromiseLike<{ data: { user: { id: string } | null }; error: AuthError }>;
  signOut(o: { scope: "local" | "global" | "others" }): PromiseLike<{ error: AuthError }>;
};

export type AccountPasswordDeps = { authAdmin: AccountAuthAdmin; makeDetachedAuth: () => DetachedAuth; attempts: PasswordAttempts };

/** 지금 비밀번호 확인의 결과. locked = 아이디별 확인 횟수를 넘겨 묻지 않았다(INV-L14). */
export type PasswordCheck = "ok" | "wrong" | "locked";

/** 그 계정의 로그인 주소(아이디@...). 없으면 null. */
export async function loginEmailOf(authAdmin: AccountAuthAdmin, userId: string): Promise<string | null> {
  const { data, error } = await authAdmin.getUserById(userId);
  if (error || !data.user || data.user.id !== userId || !data.user.email) return null;
  return data.user.email;
}

/** 로그인 주소의 앞부분 = 아이디. */
export function loginIdOfEmail(email: string): string {
  const at = email.indexOf("@");
  return at < 0 ? email : email.slice(0, at);
}

/**
 * 그 계정의 지금 비밀번호가 맞는가. 맞으면 확인에 쓴 세션은 바로 끝낸다(그 세션 하나만).
 * 로그인된 계정이 그 계정이 아니면 틀림으로 본다. 아이디별 확인 횟수를 넘겼으면 묻지 않고 locked(INV-L14).
 */
export async function passwordMatches(deps: AccountPasswordDeps, userId: string, password: string): Promise<PasswordCheck> {
  if (password === "") return "wrong";
  const email = await loginEmailOf(deps.authAdmin, userId);
  if (!email) return "wrong";
  const attempt = await deps.attempts.begin(loginIdOfEmail(email));
  if (attempt === null) return "locked";
  const auth = deps.makeDetachedAuth();
  const { data, error } = await auth.signInWithPassword({ email, password });
  const ok = !error && data.user?.id === userId;
  await deps.attempts.finish(attempt, ok);
  if (!ok) return "wrong";
  await auth.signOut({ scope: "local" });
  return "ok";
}

/**
 * 그 계정의 로그인 세션을 모두 끝낸다(INV-L11). 방금 정한 비밀번호로 일회용 로그인을 한 뒤 「모든 기기」 로그아웃을 부른다 —
 * Auth 가 그 계정의 세션을 전부 지운다. 끝내지 못하면 예외 — 부르는 쪽이 성공으로 답하지 않게.
 */
export async function endAllSessions(deps: AccountPasswordDeps, userId: string, password: string): Promise<void> {
  const email = await loginEmailOf(deps.authAdmin, userId);
  if (!email) throw new Error("계정의 로그인 주소를 찾지 못했다");
  const auth = deps.makeDetachedAuth();
  const { data, error } = await auth.signInWithPassword({ email, password });
  if (error || data.user?.id !== userId) throw new Error("세션을 끝내려고 로그인하지 못했다");
  const out = await auth.signOut({ scope: "global" });
  if (out.error) throw new Error("모든 기기 로그아웃을 하지 못했다");
}

/** 비밀번호는 바뀌었는데 세션을 끝내지 못했을 때 사람에게 주는 문구 — 바뀐 사실은 알리고, 새 비밀번호로 다시 들어오게 한다. */
export const PASSWORD_CHANGED_RELOGIN = "비밀번호는 변경되었지만 다른 기기의 로그아웃은 완료하지 못했습니다. 새 비밀번호로 로그인해 주세요.";

/**
 * 일을 한 번 하고, 실패하면(예외) 한 번 더 한다. 두 번 다 실패하면 false 를 돌려주고 로그를 남긴다(값 없이 이름만).
 * 비밀번호를 바꾼 뒤의 세션 끝내기에 쓴다 — 이미 바뀐 비밀번호를 「실패」로 답하면 사람이 바뀐 줄 모르고 옛 비밀번호로 헤맨다.
 */
export async function retryOnce(label: string, task: () => Promise<void>): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await task();
      return true;
    } catch (e) {
      console.error(`${label}: ${attempt}번째 시도 실패`, e instanceof Error ? e.message : typeof e);
    }
  }
  return false;
}
