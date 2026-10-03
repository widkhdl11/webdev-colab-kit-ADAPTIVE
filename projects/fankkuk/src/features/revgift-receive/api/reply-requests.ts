import { z } from "zod";
import type { Envelope } from "@/shared/lib/envelope/envelope";

// 브라우저에서 받기·받지 않기를 저장한다. 받기 본문에는 봉인된 주소만 싣는다 — 평문 주소가 들어갈 칸이 없다(reverse-gift INV-R5).

export type ReplyOutcome = { ok: true } | { ok: false; status: number; message: string };

const refused = z.object({ message: z.string() });

async function post(path: string, body: unknown): Promise<ReplyOutcome> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const parsed = refused.safeParse(await res.json().catch(() => null));
    return { ok: false, status: res.status, message: parsed.success ? parsed.data.message : "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  } catch {
    return { ok: false, status: 0, message: "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요." };
  }
}

export function acceptRevgift(orderNo: string, envelope: Envelope): Promise<ReplyOutcome> {
  return post(`/api/revgifts/${encodeURIComponent(orderNo)}/accept`, { envelope });
}

export function declineRevgift(orderNo: string): Promise<ReplyOutcome> {
  return post(`/api/revgifts/${encodeURIComponent(orderNo)}/decline`, {});
}
