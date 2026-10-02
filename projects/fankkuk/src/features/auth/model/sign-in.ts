import { z } from "zod";
import { isTestAccountEmail, loginIdToEmail } from "@/entities/session/model/login-id";

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
  const email = loginIdToEmail(parsed.data.loginId);
  if (!email) return failed;

  // INV-L6: 운영에서는 시험 계정을 Auth 에 보내지도 않는다
  const production = deps.env.NODE_ENV === "production" || deps.env.VERCEL_ENV === "production";
  if (production && isTestAccountEmail(email)) return failed;

  try {
    const { error } = await deps.auth.signInWithPassword({ email, password: parsed.data.password });
    return error ? failed : { ok: true };
  } catch {
    return failed;
  }
}
