import type { RefundUnitKind } from "@/entities/payment/model/payment-rows";

// 브라우저에서 「직접 환불함」을 적는다(/api/admin/refunds/manual, admin-console INV-K7 S7d). 금액은 보내지 않는다 — 기록된 금액 그대로다.
// 서버가 준 문구를 그대로 보여 준다.

/** field: 메모 때문에 거부됐으면 "memo" — 메모 칸만 틀렸다고 표시한다 */
export type ManualRefundOutcome = { kind: "ok" } | { kind: "failed"; message: string; field: "memo" | null };

const FALLBACK = "기록하지 못했어요. 잠시 뒤 다시 해 주세요.";

export async function postManualRefund(kind: RefundUnitKind, unitId: string, memo: string): Promise<ManualRefundOutcome> {
  try {
    const res = await fetch("/api/admin/refunds/manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, unitId, memo }),
    });
    if (res.ok) return { kind: "ok" };
    const body = (await res.json().catch(() => null)) as { message?: unknown; field?: unknown } | null;
    return { kind: "failed", message: typeof body?.message === "string" ? body.message : FALLBACK, field: body?.field === "memo" ? "memo" : null };
  } catch {
    return { kind: "failed", message: FALLBACK, field: null };
  }
}
