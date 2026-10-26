import { z } from "zod";
import { PASSWORD_LOCKED_MESSAGE, passwordLoginKey, type PasswordAttempts } from "@/entities/session/api/password-attempts";
import { loginEmailCandidates } from "@/entities/session/model/login-id";
import { safeNextPath } from "@/entities/session/model/safe-next-path";
import type { DeployEnv } from "@/shared/lib/env/is-production";

// 아이디·비밀번호 로그인. 비밀번호 확인은 Supabase Auth 가 하고, 성공하면 그 클라이언트가 세션 쿠키를 쓴다.
// INV-L14: Auth 에 묻기 전에 아이디별 확인 횟수를 거친다 — 막혔으면 묻지 않고 429. 없는 아이디도 똑같이 센다(INV-L5).

export type PasswordAuth = {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ error: unknown }>;
};

/** next: 로그인 뒤 돌아갈 같은 사이트 경로(INV-L13). 검사를 통과하지 못하면 메인(/). */
export type SignInResult = { ok: true; next: string } | { ok: false; status: 400 | 401 | 429; message: string };

/** INV-L5: 아이디가 없든 비밀번호가 틀렸든 이 문구 하나. */
export const SIGN_IN_FAILED_MESSAGE = "아이디 또는 비밀번호가 일치하지 않습니다.";

const inputSchema = z.object({
  loginId: z.string().max(100),
  password: z.string().max(200),
  /** 로그인 뒤 돌아갈 주소 — 꼴 검사는 safeNextPath 하나가 한다(INV-L13). 성공 뒤에만 쓴다. */
  next: z.unknown().optional(),
  /** 「로그인 상태 유지」(INV-L15). 꼴 검사는 keepSignedInOf 하나가 한다 — 꼴이 틀려도 로그인 판정은 바꾸지 않는다. */
  keepSignedIn: z.unknown().optional(),
});

/** INV-L15: 본문의 keepSignedIn 이 true 일 때만 켬. 없거나 boolean 이 아니면 끔(만료 시각 없는 쿠키). */
export function keepSignedInOf(input: unknown): boolean {
  return typeof input === "object" && input !== null && (input as { keepSignedIn?: unknown }).keepSignedIn === true;
}

const failed = { ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE } as const;

export async function signIn(deps: { attempts: PasswordAttempts; auth: PasswordAuth; env: DeployEnv }, input: unknown): Promise<SignInResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.loginId.trim() === "" || parsed.data.password === "") {
    return { ok: false, status: 400, message: "아이디와 비밀번호를 입력해 주세요." };
  }

  // INV-L14: 꼴이 다른 아이디·없는 아이디도 먼저 센다 — 막혔다는 안내로 아이디가 있는지 알 수 없게
  const attempt = await deps.attempts.begin(passwordLoginKey(parsed.data.loginId));
  if (attempt === null) return { ok: false, status: 429, message: PASSWORD_LOCKED_MESSAGE };

  // 꼴이 다른 아이디도 같은 실패로 — 꼴 검사가 「없는 아이디」를 따로 알려 주지 않게(INV-L5)
  // INV-L6: 운영에서는 후보에 시험 계정 주소가 없다 — Auth 에 보내지도 않는다
  for (const email of loginEmailCandidates(parsed.data.loginId, deps.env)) {
    try {
      const { error } = await deps.auth.signInWithPassword({ email, password: parsed.data.password });
      if (!error) {
        await deps.attempts.finish(attempt, true);
        return { ok: true, next: safeNextPath(parsed.data.next) };
      }
    } catch {
      // 다음 후보로 — 모두 실패하면 같은 실패 응답(INV-L5)
    }
  }
  await deps.attempts.finish(attempt, false);
  return failed;
}
