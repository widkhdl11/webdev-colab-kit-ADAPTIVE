import { z } from "zod";

// 브라우저에서 선물함 신청·신청 취소를 보낸다. 신청 본문은 초대 토큰뿐이다 — 주소는 등록한 받을 주소를 서버가 복사한다(revgift-box INV-GB6).
// 등록 주소가 없으면 서버가 422(reason: no_address)로 답한다 — 화면이 주소 입력부터 띄운다.

export type ApplyOutcome = { ok: true } | { ok: false; status: number; message: string; noAddress: boolean };

const refused = z.object({ message: z.string(), reason: z.string().optional() });
const FAILED = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

async function post(path: string, body: unknown): Promise<ApplyOutcome> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const parsed = refused.safeParse(await res.json().catch(() => null));
    return {
      ok: false,
      status: res.status,
      message: res.status < 500 && parsed.success ? parsed.data.message : FAILED,
      noAddress: res.status === 422 && parsed.success && parsed.data.reason === "no_address",
    };
  } catch {
    return { ok: false, status: 0, message: "저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.", noAddress: false };
  }
}

export function sendApply(boxId: string, token: string | null): Promise<ApplyOutcome> {
  return post(`/api/revgift-boxes/${encodeURIComponent(boxId)}/apply`, token ? { token } : {});
}
export function sendWithdraw(boxId: string): Promise<ApplyOutcome> {
  return post(`/api/revgift-boxes/${encodeURIComponent(boxId)}/withdraw`, {});
}
