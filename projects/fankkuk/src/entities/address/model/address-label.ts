import { z } from "zod";

// 주소 이름표(address-protection INV-P16). 주소에서 나온 값이 아니라 정해진 목록에서 고른 값이다 —
// 자유 입력이면 「역삼동 집」처럼 주소가 평문으로 들어올 수 있어서 고르게만 한다. DB 칸의 허용 값과 같은 목록이다(manual/0017).

export const ADDRESS_LABELS = ["home", "studio", "office", "other"] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export const addressLabelSchema = z.enum(ADDRESS_LABELS);

export const ADDRESS_LABEL_NAME: Record<AddressLabel, string> = { home: "집", studio: "작업실", office: "사무실", other: "기타" };

/** 목록에 있는 값이면 그 이름표, 아니면 null. */
export function parseAddressLabel(value: unknown): AddressLabel | null {
  const r = addressLabelSchema.safeParse(value);
  return r.success ? r.data : null;
}
