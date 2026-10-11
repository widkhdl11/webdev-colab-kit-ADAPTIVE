import type { NotifyInput, ProfileInput } from "../model/creator-settings-input";
import type { DaysInput, ReceivingInput } from "../model/receiving-input";
import type { HardItemsInput } from "../model/hard-items-input";
import type { HandleInput } from "../model/handle-input";
import type { ReplySettingsInput } from "../model/reply-settings-input";

// 브라우저에서 크리에이터 설정을 저장한다(/api/creator/profile · /api/creator/notify). 서버가 준 문구를 그대로 보여 준다.
// ok = 저장됨 / login = 세션이 끝났다 / failed = 저장하지 못했다(문구를 보인다)

export type SendSettingsOutcome = { kind: "ok" } | { kind: "login" } | { kind: "failed"; message: string };

const FALLBACK = "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

async function post(path: string, body: unknown): Promise<SendSettingsOutcome> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const data: unknown = await res.json().catch(() => null);
    const message = (data as { message?: unknown } | null)?.message;
    return { kind: "failed", message: res.status < 500 && typeof message === "string" ? message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}

export function sendCreatorProfile(input: ProfileInput): Promise<SendSettingsOutcome> {
  return post("/api/creator/profile", input);
}

export function sendCreatorNotify(input: NotifyInput): Promise<SendSettingsOutcome> {
  return post("/api/creator/notify", input);
}

export function sendCreatorReceiving(input: ReceivingInput): Promise<SendSettingsOutcome> {
  return post("/api/creator/receiving", input);
}

export function sendCreatorDays(input: DaysInput): Promise<SendSettingsOutcome> {
  return post("/api/creator/days", input);
}

export function sendCreatorHardItems(input: HardItemsInput): Promise<SendSettingsOutcome> {
  return post("/api/creator/hard-items", input);
}

// gift-reply: 답장 모음 보이기 · X 계정 · 태그 허용
export function sendCreatorReplySettings(input: ReplySettingsInput): Promise<SendSettingsOutcome> {
  return post("/api/creator/reply-settings", input);
}

// creator-link: 링크용 아이디 저장 — 저장된 값(소문자로 바뀐 아이디)을 돌려받는다
export type SendHandleOutcome = { kind: "ok"; handle: string } | { kind: "login" } | { kind: "failed"; message: string };

export async function sendCreatorHandle(input: HandleInput): Promise<SendHandleOutcome> {
  try {
    const res = await fetch("/api/creator/handle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const data: unknown = await res.json().catch(() => null);
    if (res.status === 401) return { kind: "login" };
    const body = (data ?? {}) as { handle?: unknown; message?: unknown };
    if (res.ok && typeof body.handle === "string") return { kind: "ok", handle: body.handle };
    return { kind: "failed", message: res.status < 500 && typeof body.message === "string" ? body.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}
