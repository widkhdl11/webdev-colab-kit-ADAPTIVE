import { z } from "zod";
import type { BillableTier } from "@/entities/payment/config/tier-pricing";

// 브라우저에서 역조공 API 를 부른다 — 팬 찾기(/api/revgifts/fans)와 보내기 등록(/api/revgifts).
// login = 세션이 끝났다(로그인으로 보낸다) / failed = 그 밖의 실패.

export type FoundFan = { fanId: string; loginId: string; nickname: string };

const fanReply = z.object({
  fan: z.object({ fanId: z.string(), loginId: z.string(), nickname: z.string() }).nullable(),
});

/** INV-R2: 정확히 입력한 아이디로만 찾는다. 못 찾으면 이유와 상관없이 null. */
export async function findFan(loginId: string): Promise<{ ok: true; fan: FoundFan | null } | { ok: false; reason: "login" | "failed" }> {
  try {
    const res = await fetch(`/api/revgifts/fans?loginId=${encodeURIComponent(loginId)}`, { cache: "no-store" });
    if (res.status === 401) return { ok: false, reason: "login" };
    if (!res.ok) return { ok: false, reason: "failed" };
    const parsed = fanReply.safeParse(await res.json());
    return parsed.success ? { ok: true, fan: parsed.data.fan } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

const registered = z.object({ tossOrderId: z.string(), amountKrw: z.number().int().positive(), orderNos: z.array(z.string()).min(1) });
const refused = z.object({ message: z.string() });

export type RegisteredRevgift = z.infer<typeof registered>;

/** 보내기 등록. 금액·보내는 사람은 서버가 정한다 — 본문에는 받는 팬과 상자 구간만 싣는다(INV-R3). */
export async function registerRevgiftRequest(
  shares: readonly { fanId: string; tier: BillableTier }[],
): Promise<{ ok: true; value: RegisteredRevgift } | { ok: false; reason: "login" | "failed"; message?: string }> {
  try {
    const res = await fetch("/api/revgifts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shares }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const parsed = registered.safeParse(body);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "failed" };
    }
    if (res.status === 401) return { ok: false, reason: "login" };
    const message = refused.safeParse(body);
    return { ok: false, reason: "failed", message: message.success ? message.data.message : undefined };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
