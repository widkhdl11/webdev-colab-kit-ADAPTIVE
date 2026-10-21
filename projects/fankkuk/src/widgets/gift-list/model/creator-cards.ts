import type { FanGiftView } from "@/entities/order/model/fan-view";

// 보낸 선물 — 크리에이터별 묶음 (action-center INV-J14, design-rules 21절).
// 묶음 머리의 숫자(선물 수·답장 수)는 함께한 시간의 개인 기록 두 칸과 같은 읽기(my_together)의 값을 그대로 쓴다 — 목록이 따로 세지 않는다.
// 어느 주문이 어느 크리에이터 것인지도 함께한 시간과 같은 읽기(my_together_gifts — 그 크리에이터에게 센 주문번호)로 정한다.
// 함께한 시간에 세지 않는 주문(결제를 취소한 주문)은 같은 크리에이터 묶음에 넣고(숫자는 그대로 함께한 시간의 값),
// 그 크리에이터에게 센 주문이 하나도 없을 때만 크리에이터 이름으로 따로 묶는다 — 그 묶음은 머리 링크·숫자가 없다.

/** 함께한 시간 한 명 — 라우트가 my_together·my_together_gifts 로 읽어 넘긴다 */
export type TogetherOfCreator = {
  creatorId: string;
  creatorName: string;
  href: string;
  photoUrl: string | null;
  giftCount: number;
  replyCount: number;
  /** 그 크리에이터에게 센 주문번호(함께한 시간의 선물 카드와 같은 목록) */
  orderNos: readonly string[];
};

export type GiftGroup = {
  key: string;
  creatorName: string;
  /** 함께한 시간으로 가는 머리 — 센 선물이 없는 묶음은 null */
  together: Pick<TogetherOfCreator, "href" | "photoUrl" | "giftCount" | "replyCount"> | null;
  /** 묶음 안의 줄 — 목록 읽기 순서(최근 등록이 먼저) 그대로 */
  gifts: FanGiftView[];
};

/** 묶음 순서는 함께한 시간 읽기 순서(최근에 선물한 크리에이터가 먼저), 세지 않는 주문의 묶음은 그 뒤 */
export function groupGiftsByCreator(gifts: readonly FanGiftView[], together: readonly TogetherOfCreator[]): GiftGroup[] {
  const ownerOf = new Map<string, string>();
  for (const t of together) for (const no of t.orderNos) ownerOf.set(no, t.creatorId);
  const groups: GiftGroup[] = together.map((t) => ({
    key: t.creatorId,
    creatorName: t.creatorName,
    together: { href: t.href, photoUrl: t.photoUrl, giftCount: t.giftCount, replyCount: t.replyCount },
    gifts: [],
  }));
  const byKey = new Map(groups.map((g) => [g.key, g]));
  // 세지 않는 주문은 크리에이터 ID 가 없어 이름으로 찾는다 — 그 이름의 묶음이 하나뿐일 때만 합친다(이름은 겹칠 수 있다)
  const byName = new Map<string, GiftGroup | null>();
  for (const g of groups) byName.set(g.creatorName, byName.has(g.creatorName) ? null : g);
  const loose = new Map<string, GiftGroup>();
  for (const g of gifts) {
    const owner = ownerOf.get(g.orderNo);
    const known = owner ? byKey.get(owner) : (byName.get(g.creatorName) ?? undefined);
    if (known) {
      known.gifts.push(g);
      continue;
    }
    const key = `name:${g.creatorName}`;
    const group = loose.get(key) ?? { key, creatorName: g.creatorName, together: null, gifts: [] };
    group.gifts.push(g);
    loose.set(key, group);
  }
  return [...groups, ...loose.values()];
}
