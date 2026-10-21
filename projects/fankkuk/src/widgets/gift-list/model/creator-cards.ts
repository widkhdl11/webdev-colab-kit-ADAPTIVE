import type { FanGiftView } from "@/entities/order/model/fan-view";

// 보낸 선물 — 위 「크리에이터별로 보기」 카드 줄 + 아래 크리에이터로 묶지 않은 선물 격자 (action-center INV-J14, design-rules 22절).
// 카드 숫자(선물 수·답장 수)는 함께한 시간의 개인 기록 두 칸과 같은 읽기(my_together)의 값을 그대로 쓴다 — 목록이 따로 세지 않는다.
// 카드의 「최근 선물」이 어느 주문인지도 함께한 시간과 같은 읽기(my_together_gifts — 그 크리에이터에게 센 주문번호)로 정한다.
// 함께한 시간에 세지 않는 주문(결제를 취소한 주문)은 크리에이터 ID 가 없어 이름으로 찾되, 그 이름의 카드가 하나뿐일 때만 그 카드에 붙인다(이름은 겹칠 수 있다).
// 함께한 시간에 센 주문이 하나도 없는 크리에이터는 카드를 만들지 않는다 — 보일 숫자가 없다. 그 선물은 아래 격자에는 그대로 나온다.

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

export type CreatorCard = {
  key: string;
  creatorName: string;
  /** 함께한 시간으로 가는 주소 */
  href: string;
  photoUrl: string | null;
  giftCount: number;
  replyCount: number;
  /** 그 크리에이터에게 가장 최근에 등록한 선물 — 목록에 없으면 null */
  latest: FanGiftView | null;
};

/** 최근 등록 순 — 등록 시각이 같으면 읽은 순서 그대로(안정 정렬). 입력은 바꾸지 않는다 */
export function recentFirst(gifts: readonly FanGiftView[]): FanGiftView[] {
  return [...gifts].sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt));
}

/** 카드 순서는 함께한 시간 읽기 순서(최근에 선물한 크리에이터가 먼저) 그대로 */
export function buildCreatorCards(gifts: readonly FanGiftView[], together: readonly TogetherOfCreator[]): CreatorCard[] {
  const ownerOf = new Map<string, string>();
  for (const t of together) for (const no of t.orderNos) ownerOf.set(no, t.creatorId);
  const cards: CreatorCard[] = together.map((t) => ({
    key: t.creatorId,
    creatorName: t.creatorName,
    href: t.href,
    photoUrl: t.photoUrl,
    giftCount: t.giftCount,
    replyCount: t.replyCount,
    latest: null,
  }));
  const byKey = new Map(cards.map((c) => [c.key, c]));
  const byName = new Map<string, CreatorCard | null>();
  for (const c of cards) byName.set(c.creatorName, byName.has(c.creatorName) ? null : c);
  for (const g of recentFirst(gifts)) {
    const owner = ownerOf.get(g.orderNo);
    const card = owner ? byKey.get(owner) : (byName.get(g.creatorName) ?? undefined);
    if (card && !card.latest) card.latest = g;
  }
  return cards;
}
