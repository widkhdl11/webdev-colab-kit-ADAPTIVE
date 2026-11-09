import { z } from "zod";

// 브라우저에서 선물함 신청·신청 취소를 보낸다. 신청 본문은 초대 토큰과 신청 폼에서 봉인한 주소·할증 구분뿐이다(revgift-box INV-GB6) — 평문이 들어갈 칸이 없다.

import type { SurchargeRegion } from "@/entities/address/model/surcharge-region";
import type { Envelope } from "@/shared/lib/envelope/envelope";

export type ApplyOutcome = { ok: true } | { ok: false; status: number; message: string };

const refused = z.object({ message: z.string() });
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
    };
  } catch {
    return { ok: false, status: 0, message: "저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요." };
  }
}

export function sendApply(boxId: string, token: string | null, envelope: Envelope, region: SurchargeRegion): Promise<ApplyOutcome> {
  return post(`/api/revgift-boxes/${encodeURIComponent(boxId)}/apply`, { ...(token ? { token } : {}), address: envelope, region });
}
export function sendWithdraw(boxId: string): Promise<ApplyOutcome> {
  return post(`/api/revgift-boxes/${encodeURIComponent(boxId)}/withdraw`, {});
}
export function sendReceived(boxId: string): Promise<ApplyOutcome> {
  return post(`/api/revgift-boxes/${encodeURIComponent(boxId)}/received`, {});
}
