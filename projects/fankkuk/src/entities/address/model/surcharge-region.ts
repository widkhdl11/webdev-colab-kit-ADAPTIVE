import { z } from "zod";

// 할증 지역 구분 (address-protection INV-P20 ②③, payment INV-M24). 우편번호를 할증 지역 설정표와 비교해 구분 하나를 정한다.
// 브라우저(주소 저장 — 우편번호 대신 이 구분만 보낸다)와 송장 출력 함수(연 주소로 다시 판정)가 같은 함수를 쓴다.
// 구분 값의 목록은 DB 칸의 허용 값과 같다(manual/0030). 할증 금액은 DB 설정표(public.surcharge_fees)가 정한다.

export const SURCHARGE_REGIONS = ["none", "jeju", "island"] as const;
export type SurchargeRegion = (typeof SURCHARGE_REGIONS)[number];

export type ZipRange = { from: number; to: number };

/** 제주 우편번호 범위(DECISIONS 2026-11-07 「주소 입력은 카카오(다음) 우편번호 서비스」). 양 끝 포함 */
export const JEJU_ZIP_RANGE: ZipRange = { from: 63000, to: 63644 };

/** 도서 지역 우편번호 범위 — 택배사(로지아이 문의 10번)에서 목록을 받으면 채운다(BACKLOG). 비어 있으면 도서 판정은 없다. */
export const ISLAND_ZIP_RANGES: readonly ZipRange[] = [];

const surchargeRegionSchema = z.enum(SURCHARGE_REGIONS);

const inRange = (n: number, r: ZipRange) => n >= r.from && n <= r.to;

/** 다섯 자리 숫자 우편번호의 구분. 꼴이 다르면 null. 제주가 도서보다 먼저다(제주 안의 섬도 제주 할증). */
export function surchargeRegionOf(zipCode: string, islandRanges: readonly ZipRange[] = ISLAND_ZIP_RANGES): SurchargeRegion | null {
  if (!/^[0-9]{5}$/.test(zipCode)) return null;
  const n = Number(zipCode);
  if (inRange(n, JEJU_ZIP_RANGE)) return "jeju";
  if (islandRanges.some((r) => inRange(n, r))) return "island";
  return "none";
}

/** 목록에 있는 값이면 그 구분, 아니면 null. */
export function parseSurchargeRegion(value: unknown): SurchargeRegion | null {
  const r = surchargeRegionSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** 운영자 화면에 쓰는 구분 이름 */
export const SURCHARGE_REGION_NAME: Record<SurchargeRegion, string> = { none: "할증 없음", jeju: "제주", island: "도서" };
