// 상자 구간. 사용자 결정 d7(2026-10-01): 소형 = 세 변 합 100cm 이하·5kg 이하, 중형 = 세 변 합 100cm 이하·10kg 이하.
// 크기와 무게 중 큰 쪽 구간을 쓴다. 중형을 넘는 상자를 어떻게 할지는 결정 대기(d8 ③) — 여기서는 판정만 한다.
// 구간별 요금은 결제 쪽이 정한다(결제 스펙 개정 승인 뒤).

export type ParcelTier = "small" | "medium" | "oversize";

const MAX_SUM_OF_SIDES_CM = 100;
const SMALL_MAX_WEIGHT_KG = 5;
const MEDIUM_MAX_WEIGHT_KG = 10;

export function classifyParcel(measure: { sumOfSidesCm: number; weightKg: number }): ParcelTier {
  const { sumOfSidesCm, weightKg } = measure;
  if (!(sumOfSidesCm > 0) || !(weightKg > 0)) throw new Error("상자 실측은 0보다 큰 숫자여야 한다");
  if (sumOfSidesCm > MAX_SUM_OF_SIDES_CM || weightKg > MEDIUM_MAX_WEIGHT_KG) return "oversize";
  return weightKg > SMALL_MAX_WEIGHT_KG ? "medium" : "small";
}

/** 화면 안내 문구. 판정 상수에서 만들어 기준이 바뀌면 등록 화면·메인 요금표가 같이 바뀐다. */
export const PARCEL_TIER_GUIDE: Readonly<Record<Exclude<ParcelTier, "oversize">, { name: string; rule: string }>> = {
  small: { name: "소형", rule: `세 변 합 ${MAX_SUM_OF_SIDES_CM}cm·${SMALL_MAX_WEIGHT_KG}kg 이하` },
  medium: { name: "중형", rule: `세 변 합 ${MAX_SUM_OF_SIDES_CM}cm·${MEDIUM_MAX_WEIGHT_KG}kg 이하` },
};

/** 받지 않는 상자 안내. */
export const OVERSIZE_RULE = `세 변 합 ${MAX_SUM_OF_SIDES_CM}cm나 ${MEDIUM_MAX_WEIGHT_KG}kg를 넘는 상자`;
