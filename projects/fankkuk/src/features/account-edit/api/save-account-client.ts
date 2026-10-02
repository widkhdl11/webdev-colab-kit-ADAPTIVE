import type { AccountInput } from "../model/account-input";

// 브라우저에서 내 정보를 저장한다(/api/me). 서버가 준 문구를 그대로 보여 준다.
// login = 세션이 끝났다(로그인으로 보낸다).

export type SaveAccountOutcome =
  | { kind: "ok"; pendingEmail: string | null }
  | { kind: "login" }
  | { kind: "failed"; message: string };

const FALLBACK = "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

export async function postAccount(input: AccountInput): Promise<SaveAccountOutcome> {
  try {
    const res = await fetch("/api/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => null)) as { pendingEmail?: unknown; message?: unknown } | null;
    if (res.ok) return { kind: "ok", pendingEmail: typeof body?.pendingEmail === "string" ? body.pendingEmail : null };
    if (res.status === 401) return { kind: "login" };
    return { kind: "failed", message: typeof body?.message === "string" ? body.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}
