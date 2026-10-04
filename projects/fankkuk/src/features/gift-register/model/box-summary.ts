import { chargeLines, type ChargeLine } from "@/entities/payment/model/charge";
import type { PricedTier, PublicPriceTable } from "@/entities/payment/model/price-table";
import { boxesFromCounts, MAX_BOX_COUNT } from "./register-input";

// 등록 화면의 상자 수량·금액 안내. 화면은 이 결과를 그리기만 한다.
// 금액은 결제와 같은 계산(chargeLines)에 화면을 열 때 읽은 공개 요금표를 넣은 안내일 뿐이고, 실제 결제 금액은 서버가 등록 순간 다시 계산한다(INV-M1·K3).

export type BoxSummary = {
  counts: Record<PricedTier, number>;
  lines: ChargeLine[];
  /** 0개이거나 상한을 넘으면 null — 정상 금액처럼 보이지 않게 */
  totalKrw: number | null;
  overLimit: boolean;
  canAdd: boolean;
  canRemove: Record<PricedTier, boolean>;
};

const toCount = (v: string | undefined): number => (/^[0-9]+$/.test(v ?? "") ? Number(v) : 0);

export function summarizeBoxes(prices: PublicPriceTable, raw: Readonly<Record<PricedTier, string | undefined>>): BoxSummary {
  const counts = { small: toCount(raw.small), medium: toCount(raw.medium), large: toCount(raw.large) };
  const total = counts.small + counts.medium + counts.large;
  const overLimit = total > MAX_BOX_COUNT;
  // 상한 안에서만 상자 목록을 만든다 — 아주 큰 숫자를 그대로 배열로 만들면 탭이 멈춘다
  const lines = total > 0 && !overLimit ? chargeLines(prices, boxesFromCounts(counts)) : [];
  return {
    counts,
    lines,
    totalKrw: lines.length > 0 ? lines.reduce((sum, l) => sum + l.subtotalKrw, 0) : null,
    overLimit,
    canAdd: total < MAX_BOX_COUNT,
    canRemove: { small: counts.small > 0, medium: counts.medium > 0, large: counts.large > 0 },
  };
}
