import type { RefundUnitKind } from "@/entities/payment/model/payment-rows";

// 브라우저에서 환불을 실행한다(/api/admin/refunds). 금액은 보내지 않는다 — 서버가 정한다(INV-K7).
// 서버가 준 문구를 그대로 보여 준다.

export type RefundOutcome = { kind: "ok" } | { kind: "failed"; message: string };

const FALLBACK = "환불하지 못했어요. 잠시 뒤 다시 해 주세요.";

export async function postRefund(kind: RefundUnitKind, unitId: string): Promise<RefundOutcome> {
  try {
    const res = await fetch("/api/admin/refunds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, unitId }),
    });
    if (res.ok) return { kind: "ok" };
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    return { kind: "failed", message: typeof body?.message === "string" ? body.message : FALLBACK };
  } catch {
    return { kind: "failed", message: FALLBACK };
  }
}
