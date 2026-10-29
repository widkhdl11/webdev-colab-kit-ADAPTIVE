import { z } from "zod";
import type { Envelope } from "@/shared/lib/envelope/envelope";

// 브라우저에서 승인 서명 연결을 요청하고 결과를 묻는다(/api/creator/signature-link). 본문에는 봉인된 연결 정보와 요청 ID 만 싣는다 —
// 평문 이름·생년월일·번호와 「연결됨」이 들어갈 칸이 없다(INV-S16).
// login = 세션이 끝났다 · refused = 서버가 거부했다(문구를 그대로 보인다) · failed = 그 밖의 실패

export type StartOutcome = { kind: "ok"; requestId: string; expiresAt: string } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };
export type CheckOutcome = { kind: "pending" } | { kind: "linked"; linkedAt: string | null } | { kind: "failed" } | { kind: "login" } | { kind: "refused"; message: string };

const message = z.object({ message: z.string() });
const started = z.object({ requestId: z.string(), expiresAt: z.string() });
const checked = z.object({ state: z.enum(["pending", "linked", "failed"]), linkedAt: z.string().nullable() });

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return null;
  }
}

async function refusedOf(res: Response): Promise<{ kind: "refused"; message: string } | null> {
  const parsed = message.safeParse(await res.json().catch(() => null));
  // 503(창구 없음)도 서버가 정한 문구를 보인다 — 그 밖의 5xx 는 문구를 믿지 않는다
  return (res.status < 500 || res.status === 503) && parsed.success ? { kind: "refused", message: parsed.data.message } : null;
}

export async function startLink(identity: Envelope): Promise<StartOutcome> {
  const res = await post("/api/creator/signature-link", { identity });
  if (!res) return { kind: "failed" };
  if (res.status === 401) return { kind: "login" };
  if (res.ok) {
    const parsed = started.safeParse(await res.json().catch(() => null));
    return parsed.success ? { kind: "ok", ...parsed.data } : { kind: "failed" };
  }
  return (await refusedOf(res)) ?? { kind: "failed" };
}

export async function checkLink(requestId: string): Promise<CheckOutcome> {
  const res = await post("/api/creator/signature-link/result", { requestId });
  // 연결이 잠깐 끊긴 것은 실패로 치지 않는다 — 다음 확인에서 다시 묻는다(기한은 화면 시계와 DB 가 본다)
  if (!res) return { kind: "pending" };
  if (res.status === 401) return { kind: "login" };
  if (res.ok) {
    const parsed = checked.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { kind: "pending" };
    if (parsed.data.state === "linked") return { kind: "linked", linkedAt: parsed.data.linkedAt };
    return { kind: parsed.data.state };
  }
  return (await refusedOf(res)) ?? { kind: "pending" };
}
