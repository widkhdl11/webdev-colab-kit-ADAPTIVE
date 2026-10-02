import { z } from "zod";
import { loginEmailCandidates } from "@/entities/session/model/login-id";

// 아이디·비밀번호 로그인. 비밀번호 확인은 Supabase Auth 가 하고, 성공하면 그 클라이언트가 세션 쿠키를 쓴다.

export type PasswordAuth = {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ error: unknown }>;
};

type EnvLike = { NODE_ENV?: string; VERCEL_ENV?: string };

export type SignInResult = { ok: true } | { ok: false; status: 400 | 401; message: string };

/** INV-L5: 아이디가 없든 비밀번호가 틀렸든 이 문구 하나. */
export const SIGN_IN_FAILED_MESSAGE = "아이디 또는 비밀번호가 맞지 않아요.";

const inputSchema = z.object({
  loginId: z.string().max(100),
  password: z.string().max(200),
});

const failed = { ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE } as const;

export async function signIn(deps: { auth: PasswordAuth; env: EnvLike }, input: unknown): Promise<SignInResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.loginId.trim() === "" || parsed.data.password === "") {
    return { ok: false, status: 400, message: "아이디와 비밀번호를 입력해 주세요." };
  }

  // 꼴이 다른 아이디도 같은 실패로 — 꼴 검사가 「없는 아이디」를 따로 알려 주지 않게(INV-L5)
  const candidates = loginEmailCandidates(parsed.data.loginId, deps.env);
  if (candidates.length === 0) return failed;

  // INV-L6: 운영에서는 후보에 시험 계정 주소가 없다 — Auth 에 보내지도 않는다
  for (const email of candidates) {
    try {
      const { error } = await deps.auth.signInWithPassword({ email, password: parsed.data.password });
      if (!error) return { ok: true };
    } catch {
      // 다음 후보로 — 모두 실패하면 같은 실패 응답(INV-L5)
    }
  }
  return failed;
}
