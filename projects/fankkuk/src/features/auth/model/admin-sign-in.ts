import { adminNextPath } from "@/entities/session/model/admin-next-path";
import { SIGN_IN_FAILED_MESSAGE, signIn, type PasswordAuth, type SignInResult } from "./sign-in";
import type { PasswordAttempts } from "@/entities/session/api/password-attempts";
import type { DeployEnv } from "@/shared/lib/env/is-production";

// 운영자 로그인 (admin-console INV-K13). 비밀번호 확인·틀린 횟수는 일반 로그인(signIn)을 그대로 거친다(session-login INV-L5·L14).
// 맞으면 방금 만든 세션으로 DB 판정 함수에 운영자인지 묻고, 아니면 그 세션을 끝낸 뒤 틀렸을 때와 같은 실패를 준다 —
// 이 화면에서는 그 계정이 사이트 회원인지 알 수 없다. 판정을 못 읽어도(오류) 운영자가 아닌 것으로 본다.
// 「로그인 상태 유지」는 받지 않는다 — 라우트가 늘 브라우저를 닫으면 끝나는 세션으로 쓴다.

export type AdminSignInDeps = {
  attempts: PasswordAttempts;
  auth: PasswordAuth & { signOut(options: { scope: "local" }): Promise<{ error: unknown }> };
  env: DeployEnv;
  /** 지금 클라이언트에 든 세션(방금 로그인한 사람)이 운영자인가 — DB 판정 함수 */
  isOperator(): Promise<boolean>;
};

const failed = { ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE } as const;

/** 본문에서 아이디·비밀번호만 넘긴다 — 돌아갈 곳은 관리자 주소 검사로 따로 정하고, 유지 값은 버린다 */
function credentialsOf(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const { loginId, password } = input as { loginId?: unknown; password?: unknown };
  return { loginId, password };
}

function nextOf(input: unknown): unknown {
  return typeof input === "object" && input !== null ? (input as { next?: unknown }).next : undefined;
}

export async function adminSignIn(deps: AdminSignInDeps, input: unknown): Promise<SignInResult> {
  const result = await signIn(deps, credentialsOf(input));
  if (!result.ok) return result;

  let operator = false;
  try {
    operator = (await deps.isOperator()) === true;
  } catch {
    operator = false;
  }
  if (!operator) {
    // 이 요청의 세션 하나만 끝낸다(local) — 그 사람이 다른 기기에서 쓰는 로그인은 건드리지 않는다
    try {
      await deps.auth.signOut({ scope: "local" });
    } catch {
      // 끝내지 못해도 응답은 같다 — 그 사람은 자기 계정으로 로그인된 채 남을 뿐 권한이 늘지 않는다(INV-K13)
    }
    return failed;
  }
  return { ok: true, next: adminNextPath(nextOf(input)) };
}
