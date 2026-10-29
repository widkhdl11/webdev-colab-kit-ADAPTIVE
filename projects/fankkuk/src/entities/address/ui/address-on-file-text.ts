import { formatDate } from "@/shared/lib/format/datetime";
import { ADDRESS_LABEL_NAME, type AddressLabel } from "../model/address-label";

// 등록한 주소를 본인에게 확인시키는 한 줄(address-protection INV-P16). 주소 자체는 본인에게도 보이지 않는다 —
// 고른 이름표와 마지막으로 바꾼 날만 쓴다. 이름표가 생기기 전에 등록한 주소는 이름표 없이 날짜만.

/** "집 · 10월 3일 (금) 등록" / "10월 3일 (금) 등록" / "등록한 주소" */
export function addressOnFileText(a: { label: AddressLabel | null; updatedAt: string | null }): string {
  const when = a.updatedAt ? `${formatDate(a.updatedAt)} 등록` : "등록한 주소";
  return a.label ? `${ADDRESS_LABEL_NAME[a.label]} · ${when}` : when;
}
