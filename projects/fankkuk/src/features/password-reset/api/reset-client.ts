// 브라우저에서 휴대폰 비밀번호 찾기 세 단계를 서버에 보낸다. 서버가 준 문구를 그대로 보여 준다.
// 번호표·재설정 표는 브라우저 스크립트가 만지지 않는다 — 서버가 쿠키로 주고 쿠키에서 읽는다(session-login INV-L11).

const FALLBACK = "연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";

async function post(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const messageOf = (data: Record<string, unknown> | null) => (typeof data?.message === "string" ? data.message : FALLBACK);

/** 「인증번호 받기」·「인증번호 다시 받기」. field = 번호 꼴 오류(번호 칸 아래), closed = 이용 불가(다시 해도 같다), box = 그 밖의 실패(상자) */
export async function requestResetCode(
  phone: string,
): Promise<{ ok: true; message: string } | { ok: false; where: "field" | "closed" | "box"; message: string }> {
  try {
    const { status, data } = await post("/api/auth/password/reset/code", { phone });
    if (status === 200) return { ok: true, message: messageOf(data) };
    return { ok: false, where: data?.reason === "phone" ? "field" : data?.reason === "closed" ? "closed" : "box", message: messageOf(data) };
  } catch {
    return { ok: false, where: "box", message: FALLBACK };
  }
}

/** 「확인」. 맞혔는지는 서버가 판정한다 */
export async function checkResetCode(phone: string, code: string): Promise<{ ok: true } | { ok: false; reason: string; message: string }> {
  try {
    const { status, data } = await post("/api/auth/password/reset/code/check", { phone, code });
    if (status === 200 && data?.status === "verified") return { ok: true };
    return { ok: false, reason: typeof data?.reason === "string" ? data.reason : "error", message: messageOf(data) };
  } catch {
    return { ok: false, reason: "error", message: FALLBACK };
  }
}

export type NewPasswordField = "ticket" | "password" | "passwordConfirm";

/** 「비밀번호 바꾸기」. 표는 쿠키로 간다 — 본문은 새 비밀번호 두 칸뿐 */
export async function sendNewPassword(
  password: string,
  passwordConfirm: string,
): Promise<{ ok: true; message: string | null } | { ok: false; field: NewPasswordField | null; message: string }> {
  try {
    const { status, data } = await post("/api/auth/password/reset", { password, passwordConfirm });
    // 바뀌었지만 세션을 끝내지 못했으면 서버가 다시 로그인하라는 문구를 싣는다
    if (status === 200) return { ok: true, message: typeof data?.message === "string" ? data.message : null };
    const field = data?.field === "ticket" || data?.field === "password" || data?.field === "passwordConfirm" ? data.field : null;
    return { ok: false, field, message: messageOf(data) };
  } catch {
    return { ok: false, field: null, message: FALLBACK };
  }
}
