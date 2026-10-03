import { parseChargeBreakdown, tierBreakdown, type ChargeBreakdown } from "./charge";
import type { PriceTable, PricedTier } from "./price-table";

// 도착 실측 차액. 실측 구간 판정은 entities/parcel(classifyParcel)이 하고, 여기는 그 결과로 금액만 정한다.

export type MeasuredAssessment = { kind: "none" } | { kind: "difference"; charge: ChargeBreakdown } | { kind: "inspection_failed" };

/**
 * INV-M11: 차액 = 실측 구간 요금 − 신고 구간 요금, 배송비·검수비·기본 서비스료 칸도 각각의 차.
 * 실측이 신고 이하이면 차액도 환불도 없다. 실측이 대형을 넘으면 차액이 아니라 검수 불합격이다.
 * 요금은 넘겨받은 요금표(판정하는 순간 DB 에서 읽은 것)에서만 읽는다.
 */
export function assessMeasuredTier(prices: PriceTable, input: { declared: PricedTier; measured: PricedTier | "oversize" }): MeasuredAssessment {
  if (input.measured === "oversize") return { kind: "inspection_failed" };
  const declared = tierBreakdown(prices, input.declared);
  const measured = tierBreakdown(prices, input.measured);
  if (measured.totalKrw <= declared.totalKrw) return { kind: "none" };
  const charge = parseChargeBreakdown({
    goodsKrw: 0,
    serviceFeeKrw: measured.serviceFeeKrw - declared.serviceFeeKrw,
    inspectionFeeKrw: measured.inspectionFeeKrw - declared.inspectionFeeKrw,
    shippingFeeKrw: measured.shippingFeeKrw - declared.shippingFeeKrw,
    totalKrw: measured.totalKrw - declared.totalKrw,
  });
  // 칸 하나라도 음수면(설정표가 구간마다 단조롭지 않으면) 차액을 만들지 않는다
  if (!charge) throw new Error("difference: 구간 설정표의 칸 차이가 음수다");
  return { kind: "difference", charge };
}

/**
 * INV-M13: 차액 요청 뒤 168시간(7일)이 지나도록 결제되지 않았는가. 시각을 못 읽으면 판정하지 않는다.
 * 시간대가 붙은 ISO 시각(Z 또는 +09:00)만 받는다 — 시간대가 없으면 서버 시간대로 읽혀 168시간이 달라진다.
 */
export const DIFFERENCE_DEADLINE_HOURS = 168;

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function isDifferenceOverdue(input: { requestedAt: string; now: string }): boolean {
  if (!ISO_WITH_OFFSET.test(input.requestedAt) || !ISO_WITH_OFFSET.test(input.now)) {
    throw new Error("difference: 시간대가 붙은 ISO 시각만 받는다");
  }
  const requested = Date.parse(input.requestedAt);
  const now = Date.parse(input.now);
  if (Number.isNaN(requested) || Number.isNaN(now)) throw new Error("difference: 시각을 읽을 수 없다");
  return now - requested >= DIFFERENCE_DEADLINE_HOURS * 3_600_000;
}
