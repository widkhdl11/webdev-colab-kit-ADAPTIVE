// 브라우저에서 차단을 푼다(/api/blocks/unblock). 보내는 값은 차단 줄 식별값 하나다(INV-D10).
// ok = 풀림 / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다) / failed = 그 밖의 실패

export type SendUnblockOutcome = { kind: "ok" } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };

export async function sendUnblock(blockId: string): Promise<SendUnblockOutcome> {
  try {
    const res = await fetch("/api/blocks/unblock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blockId }),
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
