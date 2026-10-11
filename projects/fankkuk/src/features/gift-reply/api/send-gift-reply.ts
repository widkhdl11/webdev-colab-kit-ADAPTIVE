import type { ReplyPhrase } from "@/entities/gift-reply/model/reply";

// 브라우저에서 받았어요·답장·지우기·공개 동의를 보낸다(/api/gifts/reply …). 서버가 준 문구를 그대로 보여 준다.
// ok = 저장됨 / login = 세션이 끝났다 / failed = 저장하지 못했다(문구를 보인다)

export type SendReplyOutcome<T = undefined> = { kind: "ok"; value: T } | { kind: "login" } | { kind: "failed"; message: string };

const FALLBACK = "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

async function post(path: string, body: unknown): Promise<{ kind: "ok"; data: Record<string, unknown> } | { kind: "login" } | { kind: "failed"; message: string }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (res.ok) return { kind: "ok", data };
    if (res.status === 401) return { kind: "login" };
    return { kind: "failed", message: res.status < 500 && typeof data.message === "string" ? data.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}

export type ConfirmOutcomeValue = "received" | "replied" | "unchanged";

/** 받았어요 — phrase 가 null 이면 확인만. */
export async function sendConfirmGiftBox(input: { boxId: string; phrase: ReplyPhrase | null; line: string | null }): Promise<SendReplyOutcome<ConfirmOutcomeValue>> {
  const r = await post("/api/gifts/reply", input);
  if (r.kind !== "ok") return r;
  const v = r.data.result;
  return v === "received" || v === "replied" || v === "unchanged" ? { kind: "ok", value: v } : { kind: "failed", message: FALLBACK };
}

export async function sendDeleteGiftReply(boxId: string): Promise<SendReplyOutcome> {
  const r = await post("/api/gifts/reply/delete", { boxId });
  return r.kind === "ok" ? { kind: "ok", value: undefined } : r;
}

/** 공개 동의 저장 — 서버가 저장한 두 값(공개를 끄면 닉네임 보이기도 꺼진 값)을 돌려준다. */
export async function sendReplyConsent(input: {
  boxId: string;
  isPublic: boolean;
  showNickname: boolean;
}): Promise<SendReplyOutcome<{ isPublic: boolean; showNickname: boolean }>> {
  const r = await post("/api/gifts/reply/consent", input);
  if (r.kind !== "ok") return r;
  const { isPublic, showNickname } = r.data;
  return typeof isPublic === "boolean" && typeof showNickname === "boolean" ? { kind: "ok", value: { isPublic, showNickname } } : { kind: "failed", message: FALLBACK };
}
