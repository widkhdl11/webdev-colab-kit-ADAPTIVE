// 브라우저에서 승인을 보낸다(/api/approval-requests/approve). 보내는 값은 요청 식별값뿐이다(INV-S11).
// ok = 승인됨 / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다) / failed = 그 밖의 실패

export type SendApproveOutcome = { kind: "ok" } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };

export async function sendApprove(requestId: string): Promise<SendApproveOutcome> {
  try {
    const res = await fetch("/api/approval-requests/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const body: unknown = await res.json().catch(() => null);
    const message = (body as { message?: unknown } | null)?.message;
    return res.status < 500 && typeof message === "string" ? { kind: "refused", message } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
