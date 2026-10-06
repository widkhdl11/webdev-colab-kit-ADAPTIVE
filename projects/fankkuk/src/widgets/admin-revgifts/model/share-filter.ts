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

/** 받기 기한(reverse-gift INV-R10)이 지났는데 아직 답이 없는 몫 — 이 화면에서 「지금 돌리기」로 기한 처리를 부를 수 있다.
 *  실제 판정은 DB 기한 처리 함수가 서버 시각으로 다시 한다(버튼이 보여도 기한 전이면 아무것도 바뀌지 않는다). now 는 서버가 그린 시각. */
export function needsExpiryRun(row: Pick<RevgiftShare, "reply" | "deadlineAt">, now: string): boolean {
  return row.reply === "waiting" && Date.parse(now) >= Date.parse(row.deadlineAt);
}
