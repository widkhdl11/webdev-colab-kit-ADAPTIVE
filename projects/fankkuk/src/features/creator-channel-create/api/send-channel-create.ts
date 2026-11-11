import type { ChannelCreateBody, ChannelCreateField } from "../model/channel-create-input";

// 브라우저에서 채널을 만든다(POST /api/creator/channel, signup INV-U21). 서버가 준 문구와 칸을 그대로 돌려준다.
// ok = 만들어짐 / login = 세션이 끝났다 / failed = 만들지 못했다(field 칸에 문구를 보인다 — form 이면 칸 밖 오류 줄)

export const CHANNEL_CREATE_PATH = "/api/creator/channel";

export type SendChannelCreateOutcome = { kind: "ok" } | { kind: "login" } | { kind: "failed"; field: ChannelCreateField; message: string };

const FALLBACK = "채널을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
const FIELDS: readonly ChannelCreateField[] = ["nickname", "fanName", "tags", "form"];

export async function sendChannelCreate(body: ChannelCreateBody): Promise<SendChannelCreateOutcome> {
  try {
    const res = await fetch(CHANNEL_CREATE_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const data = (await res.json().catch(() => null)) as { message?: unknown; field?: unknown } | null;
    const field = FIELDS.find((f) => f === data?.field) ?? "form";
    const message = res.status < 500 && typeof data?.message === "string" ? data.message : FALLBACK;
    return { kind: "failed", field, message };
  } catch {
    return { kind: "failed", field: "form", message: FALLBACK };
  }
}
