// 브라우저에서 받지 않기를 저장한다(/api/approval-requests/decline). 보내는 값은 요청 식별값과 차단 여부뿐이다(INV-D1).
// ok = 저장됨(서버가 아직 대기 중인 주문번호를 같이 준다) / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다) / failed = 그 밖의 실패

export type SendDeclineOutcome =
  | { kind: "ok"; waitingOrderNos: string[] }
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
      const nos = (body as { waitingOrderNos?: unknown } | null)?.waitingOrderNos;
      return Array.isArray(nos) && nos.every((n) => typeof n === "string") ? { kind: "ok", waitingOrderNos: nos } : { kind: "failed" };
    }
    if (res.status === 401) return { kind: "login" };
    const message = (body as { message?: unknown } | null)?.message;
    return res.status < 500 && typeof message === "string" ? { kind: "refused", message } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
