import { parcelTabOf, type OfficeParcel, type ParcelTab } from "@/entities/parcel/model/office-parcel";

// 「들어온 상자」 탭·검색 (시안 admin/parcels.html). 검색은 주문번호·닉네임·이름으로만(office-workflow INV-W7).

export type ParcelFilterTab = "all" | ParcelTab;

export const PARCEL_TABS: readonly { key: ParcelFilterTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "inbound", label: "입고 대기" },
  { key: "inspect", label: "검수 대기" },
  { key: "outbound", label: "출고 대기" },
  { key: "shipped", label: "출고함" },
  { key: "return", label: "반송" },
];

export function filterParcels(rows: readonly OfficeParcel[], tab: ParcelFilterTab, query: string): OfficeParcel[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (tab === "all" || parcelTabOf(r.state) === tab) &&
      (q === "" || [r.orderNo, r.senderNickname, r.receiverName].some((v) => v.toLowerCase().includes(q))),
  );
}

export function countByParcelTab(rows: readonly OfficeParcel[]): Record<ParcelFilterTab, number> {
  const counts: Record<ParcelFilterTab, number> = { all: rows.length, inbound: 0, inspect: 0, outbound: 0, shipped: 0, return: 0 };
  for (const r of rows) counts[parcelTabOf(r.state)] += 1;
  return counts;
}
