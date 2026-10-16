import { z } from "zod";

// 브라우저에서 받기·받지 않기를 저장한다. 받기 본문은 비어 있다 — 주소는 팬이 등록한 받을 주소(봉인된 값)를 DB 받기 함수가 그 선물에 복사한다
// (reverse-gift INV-R4·R5·R6). 등록 주소가 없으면 서버가 422(reason: no_address)로 답한다 — 화면이 주소 입력부터 다시 띄운다.

export type ReplyOutcome = { ok: true } | { ok: false; status: number; message: string; noAddress: boolean };

const refused = z.object({ message: z.string(), reason: z.string().optional() });

async function post(path: string, body: unknown): Promise<ReplyOutcome> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const parsed = refused.safeParse(await res.json().catch(() => null));
    return {
      ok: false,
      status: res.status,
      message: parsed.success ? parsed.data.message : "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      noAddress: res.status === 422 && parsed.success && parsed.data.reason === "no_address",
    };
  } catch {
    return { ok: false, status: 0, message: "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", noAddress: false };
  }
}

export function acceptRevgift(orderNo: string): Promise<ReplyOutcome> {
  return post(`/api/revgifts/${encodeURIComponent(orderNo)}/accept`, {});
}

export function declineRevgift(orderNo: string): Promise<ReplyOutcome> {
  return post(`/api/revgifts/${encodeURIComponent(orderNo)}/decline`, {});
}
