import { postJson } from "@/shared/lib/http/post-json-client";

// 브라우저에서 재설정 요청·새 비밀번호를 서버에 보낸다. 서버가 준 문구를 그대로 보여 준다.

const FALLBACK = "연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";

export async function sendResetRequest(loginId: string, email: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const r = await postJson("/api/auth/password/reset-request", { loginId, email }, FALLBACK);
  if (r.kind === "ok") return { ok: true, message: typeof r.body.message === "string" ? r.body.message : "" };
  return { ok: false, message: r.message };
}

export type NewPasswordField = "link" | "password" | "passwordConfirm";

export async function sendNewPassword(
  token: string,
  password: string,
  passwordConfirm: string,
): Promise<{ ok: true; message: string | null } | { ok: false; field: NewPasswordField | null; message: string }> {
  try {
    const res = await fetch("/api/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password, passwordConfirm }),
    });
    const body = (await res.json().catch(() => null)) as { field?: unknown; message?: unknown } | null;
    // 바뀌었지만 세션을 끝내지 못했으면 서버가 다시 로그인하라는 문구를 싣는다
    if (res.ok) return { ok: true, message: typeof body?.message === "string" ? body.message : null };
    const field = body?.field === "link" || body?.field === "password" || body?.field === "passwordConfirm" ? body.field : null;
    return { ok: false, field, message: typeof body?.message === "string" ? body.message : FALLBACK };
  } catch {
    return { ok: false, field: null, message: FALLBACK };
  }
}
