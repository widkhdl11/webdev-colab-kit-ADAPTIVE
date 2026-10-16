// 상자 구간 (admin-console INV-K6). 소형 = 세 변 합 100cm·5kg 이하 · 중형 = 100cm·10kg 이하 · 대형 = 160cm·20kg 이하.
// 크기와 무게 중 큰 쪽 구간을 쓴다. 대형을 넘는 상자는 받지 않는다(검수 불합격 반송). 구간별 요금은 DB 요금표가 정한다.

export type ParcelTier = "small" | "medium" | "large" | "oversize";

const SMALL_MEDIUM_MAX_SUM_CM = 100;
const SMALL_MAX_WEIGHT_KG = 5;
const MEDIUM_MAX_WEIGHT_KG = 10;
const LARGE_MAX_SUM_CM = 160;
const LARGE_MAX_WEIGHT_KG = 20;

export function classifyParcel(measure: { sumOfSidesCm: number; weightKg: number }): ParcelTier {
  const { sumOfSidesCm, weightKg } = measure;
  if (!(sumOfSidesCm > 0) || !(weightKg > 0)) throw new Error("상자 실측은 0보다 큰 숫자여야 한다");
  if (sumOfSidesCm > LARGE_MAX_SUM_CM || weightKg > LARGE_MAX_WEIGHT_KG) return "oversize";
  if (sumOfSidesCm > SMALL_MEDIUM_MAX_SUM_CM || weightKg > MEDIUM_MAX_WEIGHT_KG) return "large";
  return weightKg > SMALL_MAX_WEIGHT_KG ? "medium" : "small";
}

/** 화면 안내 문구. 판정 상수에서 만들어 기준이 바뀌면 등록 화면·메인 요금표가 같이 바뀐다. */
export const PARCEL_TIER_GUIDE: Readonly<Record<Exclude<ParcelTier, "oversize">, { name: string; rule: string }>> = {
  small: { name: "소형", rule: `세 변 합 ${SMALL_MEDIUM_MAX_SUM_CM}cm·${SMALL_MAX_WEIGHT_KG}kg 이하` },
  medium: { name: "중형", rule: `세 변 합 ${SMALL_MEDIUM_MAX_SUM_CM}cm·${MEDIUM_MAX_WEIGHT_KG}kg 이하` },
  large: { name: "대형", rule: `세 변 합 ${LARGE_MAX_SUM_CM}cm·${LARGE_MAX_WEIGHT_KG}kg 이하` },
};

/** 받지 않는 상자 안내. */
/** 상자 크기 이름(소형·중형·대형) — 모르는 값(대형 초과 등)은 그대로 */
export function tierName(t: string): string {
  return t in PARCEL_TIER_GUIDE ? PARCEL_TIER_GUIDE[t as keyof typeof PARCEL_TIER_GUIDE].name : t;
}

export const OVERSIZE_RULE = `세 변 합 ${LARGE_MAX_SUM_CM}cm나 ${LARGE_MAX_WEIGHT_KG}kg를 넘는 상자`;

/** 보내기 전에 알리는 검수 반송 안내. 추적 장치 등이 나오거나 대형을 넘으면 팬의 위반이라 검수비·반송비를 모두 뺀다(결제 INV-M8).
 *  받지 않는 크기는 OVERSIZE_RULE 에서 만든다 — 구간 기준이 바뀌면 이 안내도 같이 바뀐다. */
export const RETURN_ON_INSPECTION_NOTICE = `검수에서 추적 장치처럼 보낼 수 없는 물품이 나오거나 ${OVERSIZE_RULE}면 돌려보내 드려요. 이때는 검수비와 택배비를 빼면 환불 금액이 남지 않아요.`;
