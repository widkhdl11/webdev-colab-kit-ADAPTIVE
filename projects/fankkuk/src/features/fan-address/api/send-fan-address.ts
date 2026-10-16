import { z } from "zod";
import type { AddressLabel } from "@/entities/address/model/address-label";
import type { Envelope } from "@/shared/lib/envelope/envelope";

// 브라우저에서 팬 받을 주소를 저장·지운다(/api/me/address, /api/me/address/delete). 저장 본문에는 봉인된 주소와 고른 이름표만 싣는다 —
// 평문 주소가 들어갈 칸이 없다(address-protection INV-P1·P16·P17).
// ok = 됐다 / login = 세션이 끝났다 / refused = 서버가 거부했다(문구를 그대로 보인다) / failed = 그 밖의 실패

export type FanAddressOutcome = { kind: "ok" } | { kind: "login" } | { kind: "refused"; message: string } | { kind: "failed" };

const refused = z.object({ message: z.string() });

async function post(path: string, body: unknown): Promise<FanAddressOutcome> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { kind: "ok" };
    if (res.status === 401) return { kind: "login" };
    const parsed = refused.safeParse(await res.json().catch(() => null));
    // 5xx 의 문구는 믿지 않는다
    if (res.status < 500 && parsed.success) return { kind: "refused", message: parsed.data.message };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

export function sendFanAddress(envelope: Envelope, label: AddressLabel): Promise<FanAddressOutcome> {
  return post("/api/me/address", { address: envelope, label });
}

export function sendFanAddressDelete(): Promise<FanAddressOutcome> {
  return post("/api/me/address/delete", {});
}
