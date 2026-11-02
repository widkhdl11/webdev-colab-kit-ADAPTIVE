// 브라우저에서 승인 취소를 저장한다(/api/approval-requests/cancel, approval-cancel INV-AC1·AC4). 보내는 값은 승인 요청 ID 하나뿐이다.
// ok = 저장됨(결과는 새로 읽기 router.refresh 가 보인다) / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다, 송장 출력됨이면 code printed)
// / failed = 그 밖의 실패

export type SendCancelApprovalOutcome =
  | { kind: "ok" }
  | { kind: "login" }
  | { kind: "refused"; message: string; code?: "printed" }
  | { kind: "failed" };

export async function sendCancelApproval(requestId: string): Promise<SendCancelApprovalOutcome> {
  try {
    const res = await fetch("/api/approval-requests/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const b = body as { message?: unknown; code?: unknown } | null;
    if (res.status >= 500 || typeof b?.message !== "string") return { kind: "failed" };
    return b.code === "printed" ? { kind: "refused", message: b.message, code: "printed" } : { kind: "refused", message: b.message };
  } catch {
    return { kind: "failed" };
  }
}
