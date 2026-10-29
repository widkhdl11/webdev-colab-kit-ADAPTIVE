// 브라우저에서 받지 않기를 저장한다(/api/approval-requests/decline). 보내는 값은 요청 식별값과 차단 여부뿐이다(INV-D1).
// ok = 저장됨(서버가 차단으로 함께 거절한 주문번호를 같이 준다) / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다) / failed = 그 밖의 실패

export type SendDeclineOutcome =
  | { kind: "ok"; alsoDeclinedOrderNos: string[] }
  | { kind: "login" }
  | { kind: "refused"; message: string }
  | { kind: "failed" };

export async function sendDecline(requestId: string, block: boolean): Promise<SendDeclineOutcome> {
  try {
    const res = await fetch("/api/approval-requests/decline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, block }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const nos = (body as { alsoDeclinedOrderNos?: unknown } | null)?.alsoDeclinedOrderNos;
      // 저장은 됐다 — 목록 꼴만 이상하면 함께 거절된 줄 표시만 건너뛰고, 새로 읽기(router.refresh)가 바로잡는다
      return { kind: "ok", alsoDeclinedOrderNos: Array.isArray(nos) ? nos.filter((n): n is string => typeof n === "string") : [] };
    }
    if (res.status === 401) return { kind: "login" };
    const message = (body as { message?: unknown } | null)?.message;
    return res.status < 500 && typeof message === "string" ? { kind: "refused", message } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
