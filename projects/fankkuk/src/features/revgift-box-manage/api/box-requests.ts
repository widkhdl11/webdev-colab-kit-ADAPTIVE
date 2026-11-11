import { z } from "zod";

// 브라우저에서 선물함 만들기·신청 관리를 보낸다(/api/revgift-boxes…). 판정은 모두 서버(DB 함수)가 한다.
// ok = 됐다(서버 답 본문) / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다) / failed = 그 밖의 실패

export type BoxOutcome<T> = { kind: "ok"; data: T } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };

const refused = z.object({ message: z.string() });

export async function postBox<T>(path: string, body: unknown, parse: (data: unknown) => T): Promise<BoxOutcome<T>> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { kind: "ok", data: parse(json) };
    if (res.status === 401) return { kind: "login" };
    const parsed = refused.safeParse(json);
    // 5xx 의 문구는 믿지 않는다
    if (res.status < 500 && parsed.success) return { kind: "refused", message: parsed.data.message };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

const base = (boxId: string) => `/api/revgift-boxes/${encodeURIComponent(boxId)}`;

export function sendCreateBox(input: { name: string; description: string | null; capacity: number; isPublic: boolean }) {
  return postBox("/api/revgift-boxes", input, (d) => z.object({ boxId: z.string() }).parse(d).boxId);
}
export function sendSetExcluded(boxId: string, applicationId: string, excluded: boolean) {
  return postBox(`${base(boxId)}/exclude`, { applicationId, excluded }, (d) => z.object({ status: z.enum(["applied", "excluded"]) }).parse(d).status);
}
/** 마감 — 넣을 대기 신청 번호(비어도 된다, revgift-box INV-GB8) */
export function sendCloseBox(boxId: string, waitlisted: readonly string[] = []) {
  return postBox(`${base(boxId)}/close`, { waitlisted }, () => null);
}
export function sendCancelBox(boxId: string) {
  return postBox(`${base(boxId)}/cancel`, {}, () => null);
}
export function sendRenewInvite(boxId: string) {
  return postBox(`${base(boxId)}/invite`, {}, (d) => z.object({ token: z.string() }).parse(d).token);
}

// ── 3부 (revgift-box INV-GB1·GB11·GB12·GB23) ──
export function sendSubmitTiers(boxId: string, tiers: Record<string, string>) {
  return postBox(`${base(boxId)}/tiers`, { tiers }, () => null);
}
export function sendCartonCount(boxId: string, count: number) {
  return postBox(`${base(boxId)}/cartons`, { count }, () => null);
}
export function sendResolveHold(holdId: string, applicationId: string) {
  return postBox(`/api/revgift-box-cards/${encodeURIComponent(holdId)}/resolve`, { applicationId }, () => null);
}
export function sendChooseCancelledArrival(cardId: string, choice: "reopen" | "return") {
  return postBox(`/api/revgift-box-cards/${encodeURIComponent(cardId)}/choose`, { choice }, () => null);
}
