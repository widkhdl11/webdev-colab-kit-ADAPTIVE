import { z } from "zod";
import type { PricedTier } from "@/entities/payment/model/price-table";

// 브라우저에서 역조공 보내기 등록(/api/revgifts)을 부른다. 받을 팬 목록은 서버 page 가 미리 읽어 넘긴다(INV-R2).
// login = 세션이 끝났다(로그인으로 보낸다) /
// price_changed = 화면이 보여 준 합계가 등록 순간 요금표의 합계와 다르다 — 화면을 연 뒤 요금이 바뀌었다(409, admin-console INV-K3) /
// failed = 그 밖의 실패.

const refused = z.object({ message: z.string() });

const registered = z.object({ tossOrderId: z.string(), amountKrw: z.number().int().positive(), orderNos: z.array(z.string()).min(1) });

export type RegisteredRevgift = z.infer<typeof registered>;

/**
 * 보내기 등록. 금액·보내는 사람은 서버가 정한다 — 본문에는 받는 팬·상자 구간과, 화면이 보여 준 합계(quotedTotalKrw)를 싣는다.
 * 합계는 서버가 등록 순간 요금표로 계산한 값과 비교만 하고 결제 금액으로 쓰지 않는다(INV-R3·K3).
 */
export async function registerRevgiftRequest(
  shares: readonly { fanId: string; tier: PricedTier }[],
  quotedTotalKrw: number,
): Promise<{ ok: true; value: RegisteredRevgift } | { ok: false; reason: "login" | "price_changed" | "failed"; message?: string }> {
  try {
    const res = await fetch("/api/revgifts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shares, quotedTotalKrw }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const parsed = registered.safeParse(body);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "failed" };
    }
    if (res.status === 401) return { ok: false, reason: "login" };
    const message = refused.safeParse(body);
    return { ok: false, reason: res.status === 409 ? "price_changed" : "failed", message: message.success ? message.data.message : undefined };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
