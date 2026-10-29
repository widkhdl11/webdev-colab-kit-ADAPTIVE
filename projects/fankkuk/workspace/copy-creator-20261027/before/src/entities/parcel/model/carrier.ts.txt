// 택배사 목록 (inbound-address-code INV-C4 ②·C5). 6자리 없이 온 상자를 보류로 넣을 때 직원이 고르고,
// 「받는 주소 없이 보냈어요」에서 팬이 고르는 같은 목록이다. DB 의 public.inbound_carrier_ok 와 값이 같아야 한다.
// 택배사 연결(배송 조회) 전까지는 대조용 이름표일 뿐이다.

export const CARRIERS = ["cj", "post", "hanjin", "lotte", "logen", "kd", "daesin", "ilyang", "cu", "gs", "etc"] as const;
export type Carrier = (typeof CARRIERS)[number];

export const CARRIER_LABEL: Record<Carrier, string> = {
  cj: "CJ대한통운",
  post: "우체국택배",
  hanjin: "한진택배",
  lotte: "롯데택배",
  logen: "로젠택배",
  kd: "경동택배",
  daesin: "대신택배",
  ilyang: "일양로지스",
  cu: "CU 편의점택배",
  gs: "GS25 편의점택배",
  etc: "그 밖의 택배사",
};

export function isCarrier(value: unknown): value is Carrier {
  return typeof value === "string" && (CARRIERS as readonly string[]).includes(value);
}
