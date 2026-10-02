// 브라우저에서 확인 메일 링크를 확인한다(/api/me/email/confirm). 서버가 준 문구를 그대로 보여 준다.

export type ConfirmEmailOutcome = { kind: "ok"; email: string } | { kind: "failed"; message: string };

const FALLBACK = "확인하지 못했어요. 메일의 링크를 다시 눌러 주세요.";

export async function postEmailConfirm(token: string): Promise<ConfirmEmailOutcome> {
  try {
    const res = await fetch("/api/me/email/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = (await res.json().catch(() => null)) as { email?: unknown; message?: unknown } | null;
    if (res.ok && typeof body?.email === "string") return { kind: "ok", email: body.email };
    return { kind: "failed", message: typeof body?.message === "string" ? body.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}
