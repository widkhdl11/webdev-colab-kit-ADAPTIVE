import { z } from "zod";

// 브라우저에서 승인 서명을 요청하고 결과를 묻는다(/api/approval-requests/sign · /sign/result). 보내는 값은 승인 요청 ID 하나뿐이다 —
// 「서명했다」·서명 값이 들어갈 칸이 없다(approval-signature INV-S17 S17d).
// view = 서버가 정한 화면 상태 · login = 세션이 끝났다 · refused = 서버가 거부했다(문구를 그대로 보인다) · failed = 그 밖의 실패

export type SignClientView =
  | { state: "none" }
  | { state: "waiting"; expiresAt: string }
  | { state: "approved" }
  | { state: "ended"; reason: "expired" | "failed" };

export type SignClientOutcome =
  | { kind: "view"; view: SignClientView }
  | { kind: "login" }
  | { kind: "refused"; message: string; code: "no_address" | "too_many" | null }
  | { kind: "failed" };

const viewSchema = z.object({
  view: z.union([
    z.object({ state: z.literal("none") }),
    z.object({ state: z.literal("waiting"), expiresAt: z.string() }),
    z.object({ state: z.literal("approved") }),
    z.object({ state: z.literal("ended"), reason: z.enum(["expired", "failed"]) }),
  ]),
});
const refusedSchema = z.object({ message: z.string(), code: z.enum(["no_address", "too_many"]).optional() });

async function post(path: string, requestId: string): Promise<SignClientOutcome> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId }) });
  } catch {
    return { kind: "failed" };
  }
  if (res.status === 401) return { kind: "login" };
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const parsed = viewSchema.safeParse(body);
    return parsed.success ? { kind: "view", view: parsed.data.view } : { kind: "failed" };
  }
  const parsed = refusedSchema.safeParse(body);
  // 503(창구 없음·요청을 보내지 못함)도 서버가 정한 문구를 보인다 — 그 밖의 5xx 는 문구를 믿지 않는다
  return (res.status < 500 || res.status === 503) && parsed.success ? { kind: "refused", message: parsed.data.message, code: parsed.data.code ?? null } : { kind: "failed" };
}

/** 「승인 요청 보내기」·「다시 요청」 — 기다리는 요청이 있으면 서버가 그것을 돌려준다 */
export function startSign(requestId: string): Promise<SignClientOutcome> {
  return post("/api/approval-requests/sign", requestId);
}

/** 결과 묻기(3초마다) · 창을 열 때 이어 볼 요청이 있는지 */
export function checkSign(requestId: string): Promise<SignClientOutcome> {
  return post("/api/approval-requests/sign/result", requestId);
}
