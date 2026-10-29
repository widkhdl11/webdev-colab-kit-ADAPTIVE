// 브라우저에서 같은 사이트의 JSON 주소로 POST 한다. 실패하면 서버가 준 문구(message)와 응답 코드를 돌려준다.

/** status: 서버 응답 코드. 연결이 안 됐으면 0. field: 서버가 틀린 칸을 알려 줬으면 그 이름(화면이 그 칸에 포커스를 옮긴다), 아니면 null */
export type PostJsonOutcome = { kind: "ok"; body: Record<string, unknown> } | { kind: "failed"; status: number; message: string; field: string | null };

const FALLBACK = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 화면이 낡았다는 뜻의 실패 — 다른 사람이 먼저 처리했거나(409) 이미 없어졌다(404). 화면을 다시 읽어야 한다. */
export function isStaleFailure(outcome: PostJsonOutcome): boolean {
  return outcome.kind === "failed" && (outcome.status === 409 || outcome.status === 404);
}

export async function postJson(url: string, payload: unknown, fallback: string = FALLBACK): Promise<PostJsonOutcome> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { kind: "ok", body: body ?? {} };
    return {
      kind: "failed",
      status: res.status,
      message: typeof body?.message === "string" ? body.message : fallback,
      field: typeof body?.field === "string" ? body.field : null,
    };
  } catch {
    return { kind: "failed", status: 0, message: fallback, field: null };
  }
}
