import type { RevgiftShare, ShareReply } from "@/entities/parcel/model/office-lists";

// 「역조공 처리」 탭·검색 (시안 admin/revgifts.html). 탭은 팬의 답, 검색은 주문번호·닉네임·이름.

export type ShareTab = "all" | ShareReply;

export const SHARE_TABS: readonly { key: ShareTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "waiting", label: "기다리는 중" },
  { key: "accepted", label: "받음" },
  { key: "declined", label: "거절" },
  { key: "expired", label: "기한 지남" },
];

export function filterShares(rows: readonly RevgiftShare[], tab: ShareTab, query: string): RevgiftShare[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (r) => (tab === "all" || r.reply === tab) && (q === "" || [r.orderNo, r.creatorName, r.fanNickname].some((v) => v.toLowerCase().includes(q))),
  );
}

export function countByShareTab(rows: readonly RevgiftShare[]): Record<ShareTab, number> {
  const counts: Record<ShareTab, number> = { all: rows.length, waiting: 0, accepted: 0, declined: 0, expired: 0 };
  for (const r of rows) counts[r.reply] += 1;
  return counts;
}
