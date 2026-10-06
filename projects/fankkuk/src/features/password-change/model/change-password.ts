import { z } from "zod";
import {
  loginEmailOf,
  loginIdOfEmail,
  PASSWORD_CHANGED_RELOGIN,
  passwordMatches,
  retryOnce,
  type AccountPasswordDeps,
} from "@/entities/session/api/account-password";
import { CURRENT_PASSWORD_EMPTY, CURRENT_PASSWORD_WRONG, newPasswordProblem } from "@/entities/session/model/password-rule";
import type { Viewer } from "@/entities/session/model/viewer";

// 로그인한 사람의 비밀번호 바꾸기(session-login INV-L12).
// 사람은 세션에서 확인한 사람(INV-L2)뿐이다 — 본문의 계정 ID 는 읽지 않는다. 지금 비밀번호가 맞을 때만 바꾸고,
// 틀리면 문구 하나(INV-L5 와 같은 방식 — 무엇이 틀렸는지 더 알려 주지 않는다).
// 바꾸면 지금 세션을 뺀 그 계정의 다른 세션을 모두 끝낸다 — 세션 하나를 빼앗긴 상태였다면 그 세션이 여기서 끊긴다.
// 비밀번호는 요청한 사람의 세션으로 바꾼다 — 관리자 키로 바꾸면 Auth 가 지금 세션까지 모두 끝낸다(2026-10-06 통합 시험에서 확인).
// 세션으로 바꾸면 Auth 가 그 세션만 남기고 나머지를 끝내고, 뒤이어 「다른 기기 로그아웃」을 한 번 더 불러 확실히 한다.
// 그 로그아웃이 실패하면 한 번 더 하고, 그래도 실패하면 성공(바뀐 것은 사실)으로 답하되 다시 로그인하라는 문구(message)를 싣고 로그를 남긴다.

type AuthError = { message?: string } | null;

export type SessionAuth = {
  updateUser(attrs: { password: string }): PromiseLike<{ error: AuthError }>;
  signOut(o: { scope: "others" }): PromiseLike<{ error: AuthError }>;
};

export type ChangePasswordDeps = AccountPasswordDeps & { viewer: Viewer | null; sessionAuth: SessionAuth };

export type ChangePasswordField = "currentPassword" | "newPassword" | "newPasswordConfirm";

export type ChangePasswordResult = { ok: true; message?: string } | { ok: false; status: 400 | 401; field?: ChangePasswordField; message: string };

export { CURRENT_PASSWORD_WRONG };

const inputSchema = z.object({
  currentPassword: z.string().max(200),
  newPassword: z.string().max(200),
  newPasswordConfirm: z.string().max(200),
});

export async function changePassword(deps: ChangePasswordDeps, body: unknown): Promise<ChangePasswordResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "입력을 확인해 주세요." };
  const { currentPassword, newPassword, newPasswordConfirm } = parsed.data;
  if (currentPassword === "") return { ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_EMPTY };

  const userId = deps.viewer.userId;
  const email = await loginEmailOf(deps.authAdmin, userId);
  if (!email) return { ok: false, status: 401, message: "로그인이 필요해요." };

  const problem = newPasswordProblem(newPassword, loginIdOfEmail(email));
  if (problem) return { ok: false, status: 400, field: "newPassword", message: problem };
  if (newPassword !== newPasswordConfirm) return { ok: false, status: 400, field: "newPasswordConfirm", message: "새 비밀번호가 서로 달라요." };

  if (!(await passwordMatches(deps, userId, currentPassword))) {
    return { ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_WRONG };
  }

  const updated = await deps.sessionAuth.updateUser({ password: newPassword });
  if (updated.error) throw new Error("비밀번호를 바꾸지 못했다");
  const ended = await retryOnce("password-change: 다른 기기 로그아웃", async () => {
    const out = await deps.sessionAuth.signOut({ scope: "others" });
    if (out.error) throw new Error("다른 기기의 세션을 끝내지 못했다");
  });
  return ended ? { ok: true } : { ok: true, message: PASSWORD_CHANGED_RELOGIN };
}
