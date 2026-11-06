import { z } from "zod";
import { endAllSessions, PASSWORD_CHANGED_RELOGIN, retryOnce, type AccountPasswordDeps } from "@/entities/session/api/account-password";
import { newPasswordProblem } from "@/entities/session/model/password-rule";
import { RESET_SAVE_FAILED, RESET_TICKET_EXPIRED } from "./reset-messages";

// 재설정 표로 새 비밀번호 정하기(session-login INV-L11). 표는 휴대폰 인증번호를 맞혔을 때 서버가 발급해 스크립트가 못 읽는 쿠키로만 준 값이다(phone-reset.ts).
// 표는 쿠키 값(ticket 인자)만 읽는다 — 본문의 표·계정 ID·아이디는 읽지 않는다. 계정은 표가 정한다. 표 확인과 사용 표시는 DB 함수 claim_password_reset 이 한 처리에서 한다.
// 순서: 표가 살아 있는지 보고(쓰지 않음) → 새 비밀번호 검사(아이디와 같은지 포함) → 표 쓰기 → 비밀번호 바꾸기 → 그 계정의 세션 모두 끝내기.
// 입력 검사를 표 쓰기 앞에 두어, 비밀번호를 잘못 적었다고 표가 버려지지 않게 한다.
// 재설정은 비밀번호만 바꾼다 — 주소·승인·휴대폰 번호에는 닿지 않는다. 끝나면 새 비밀번호로 다시 로그인한다(자동 로그인 없음).
// 비밀번호를 바꾼 뒤 세션 끝내기가 실패하면 한 번 더 하고, 그래도 실패하면 성공(바뀐 것은 사실)으로 답하되 「모든 기기에서 로그아웃됐다」고는
// 하지 않는 문구(message)를 싣고 로그를 남긴다. 그 계정의 남은 세션은 Auth 가 관리자 키 비밀번호 변경 때 끝내 준다(2026-10-06 통합 시험) — 그 동작에 기대지 않으려고 직접 끝내는 것이다.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export type ResetPasswordDeps = AccountPasswordDeps & { admin: { rpc: Rpc } };

export type ResetPasswordResult =
  | { ok: true; message?: string }
  | { ok: false; status: 400 | 502; field: "ticket" | "password" | "passwordConfirm"; message: string };

const inputSchema = z.object({
  password: z.string().max(200),
  passwordConfirm: z.string().max(200),
});

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

const ticketExpired = { ok: false, status: 400, field: "ticket", message: RESET_TICKET_EXPIRED } as const;

/** ticket: 재설정 표 쿠키 값 */
export async function resetPassword(deps: ResetPasswordDeps, body: unknown, ticket: string | undefined): Promise<ResetPasswordResult> {
  if (!ticket || !TOKEN_SHAPE.test(ticket)) return ticketExpired;
  const token = ticket;
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, field: "password", message: "새 비밀번호를 입력해 주세요." };
  const { password, passwordConfirm } = parsed.data;

  const peek = await deps.admin.rpc("password_reset_login_id", { p_token: token });
  if (peek.error) throw new Error(`재설정 표를 읽지 못했다: ${peek.error.code}`);
  const loginId = typeof peek.data === "string" ? peek.data : null;
  if (!loginId) return ticketExpired;

  const problem = newPasswordProblem(password, loginId);
  if (problem) return { ok: false, status: 400, field: "password", message: problem };
  if (password !== passwordConfirm) return { ok: false, status: 400, field: "passwordConfirm", message: "비밀번호가 일치하지 않습니다." };

  const claimed = await deps.admin.rpc("claim_password_reset", { p_token: token });
  if (claimed.error) {
    if (claimed.error.code === "P0002") return ticketExpired;
    throw new Error(`재설정 표를 쓰지 못했다: ${claimed.error.code}`);
  }
  const accountId = z.string().uuid().parse(claimed.data);

  const updated = await deps.authAdmin.updateUserById(accountId, { password });
  if (updated.error) {
    return { ok: false, status: 502, field: "ticket", message: RESET_SAVE_FAILED };
  }
  // INV-L14: 재설정이 끝났으니 그 아이디의 비밀번호 확인 막힘을 푼다 — 못 풀어도 비밀번호는 이미 바뀌었다(15분 뒤 풀린다)
  await retryOnce("password-reset: 확인 막힘 풀기", () => deps.attempts.clear(loginId));
  const ended = await retryOnce("password-reset: 세션 끝내기", () => endAllSessions(deps, accountId, password));
  return ended ? { ok: true } : { ok: true, message: PASSWORD_CHANGED_RELOGIN };
}
