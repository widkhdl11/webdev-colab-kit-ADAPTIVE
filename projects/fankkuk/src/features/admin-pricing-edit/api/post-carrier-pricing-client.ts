import { pricingProblemsFromRows, type PricingProblem } from "@/entities/payment/model/carrier-pricing";
import type { CarrierPricingBody } from "../model/save-carrier-pricing";

// 브라우저에서 경로표·기본 경로·팬에게 보내기 택배비를 저장한다(/api/admin/pricing/carrier). 서버가 준 문구·수정안을 그대로 보여 준다.

export type SaveCarrierOutcome = { kind: "ok" } | { kind: "failed"; message: string; problems: PricingProblem[] };

const FALLBACK = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 서버가 준 수정안 목록 — 서버 응답의 problems 는 이미 화면 꼴(kind·tier·…Krw)이다 */
function problemsOf(raw: unknown): PricingProblem[] {
  if (!Array.isArray(raw)) return [];
  const asRows = raw.map((p: Record<string, unknown>) => ({
    check_kind: p?.kind,
    tier: p?.tier,
    amount_krw: p?.amountKrw,
    minimum_krw: p?.minimumKrw,
    proposal_krw: p?.proposalKrw,
  }));
  return pricingProblemsFromRows(asRows) ?? [];
}

export async function postCarrierPricing(body: CarrierPricingBody): Promise<SaveCarrierOutcome> {
  try {
    const res = await fetch("/api/admin/pricing/carrier", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { kind: "ok" };
    const got = (await res.json().catch(() => null)) as { message?: unknown; problems?: unknown } | null;
    return { kind: "failed", message: typeof got?.message === "string" ? got.message : FALLBACK, problems: problemsOf(got?.problems) };
  } catch {
    return { kind: "failed", message: FALLBACK, problems: [] };
  }
}
