import { z } from "zod";
import type { Envelope } from "@/shared/lib/envelope/envelope";

// 브라우저에서 크리에이터 가입 3단계 카카오 서명을 요청하고 결과를 묻는다(/api/signup/sign · /api/signup/sign/check, signup INV-U19·U20).
// 본문에는 봉인된 이름·생년월일·번호, 크리에이터 ID, 번호, 요청 ID 만 싣는다 — 「서명 완료」가 들어갈 칸이 없다. 번호표는 서버가 쿠키로만 다룬다.
// pending = 기다림 · down = 서버가 창구 장애를 확인함(6자리 길) · refused = 서버가 거부했다(문구를 그대로 보인다) · failed = 그 밖의 실패

export type SignStartOutcome =
  | { kind: "pending"; requestId: string; expiresAt: string }
  | { kind: "down" }
  | { kind: "refused"; message: string }
  | { kind: "failed" };
export type SignCheckOutcome = { kind: "pending" | "verified" | "failed" | "exists" | "down" } | { kind: "refused"; message: string };

const message = z.object({ message: z.string() });
const started = z.union([
  z.object({ state: z.literal("pending"), requestId: z.string(), expiresAt: z.string() }),
  z.object({ state: z.literal("down") }),
]);
const checked = z.object({ state: z.enum(["pending", "verified", "failed", "exists", "down"]) });

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return null;
  }
}

async function refusedOf(res: Response): Promise<{ kind: "refused"; message: string } | null> {
  const parsed = message.safeParse(await res.json().catch(() => null));
  // 503(이용할 수 없음)도 서버가 정한 문구를 보인다 — 그 밖의 5xx 는 문구를 믿지 않는다
  return (res.status < 500 || res.status === 503) && parsed.success ? { kind: "refused", message: parsed.data.message } : null;
}

export async function startCreatorSign(input: { identity: Envelope; creatorId: string; phone: string }): Promise<SignStartOutcome> {
  const res = await post("/api/signup/sign", input);
  if (!res) return { kind: "failed" };
  if (res.ok) {
    const parsed = started.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { kind: "failed" };
    return parsed.data.state === "down" ? { kind: "down" } : { kind: "pending", requestId: parsed.data.requestId, expiresAt: parsed.data.expiresAt };
  }
  return (await refusedOf(res)) ?? { kind: "failed" };
}

export async function checkCreatorSign(requestId: string): Promise<SignCheckOutcome> {
  const res = await post("/api/signup/sign/check", { requestId });
  // 연결이 잠깐 끊긴 것은 실패로 치지 않는다 — 다음 확인에서 다시 묻는다
  if (!res) return { kind: "pending" };
  if (res.ok) {
    const parsed = checked.safeParse(await res.json().catch(() => null));
    return parsed.success ? { kind: parsed.data.state } : { kind: "pending" };
  }
  return (await refusedOf(res)) ?? { kind: "pending" };
}
