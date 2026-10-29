import type { PricingRow } from "../model/save-pricing";

// 브라우저에서 요금표를 저장한다(/api/admin/pricing). 서버가 준 문구를 그대로 보여 준다.

export type SavePricingOutcome = { kind: "ok" } | { kind: "failed"; message: string };

const FALLBACK = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export async function postPricing(rows: PricingRow[]): Promise<SavePricingOutcome> {
  try {
    const res = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (res.ok) return { kind: "ok" };
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    return { kind: "failed", message: typeof body?.message === "string" ? body.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}
