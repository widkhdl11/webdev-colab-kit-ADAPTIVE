import type { ParcelKind } from "@/entities/parcel/model/office-parcel";

/**
 * 송장 다시 출력(크리에이터 주소를 한 번 더 연다)은 대표만, 팬 선물 상자에만 — address-protection INV-P8, office-workflow INV-W3.
 * 서버(scan-outbound 의 print_label, 송장 출력 함수)가 같은 판정을 다시 한다. 화면은 이 값으로 버튼과 안내를 보일지만 정한다.
 */
export function canReprintCreatorLabel(access: "staff" | "owner", parcelKind: ParcelKind): boolean {
  return access === "owner" && parcelKind === "gift";
}
