// 선물 보내기 1단계 목록의 순서 — 화면 표시용이다(누구에게 보낼 수 있는지는 sender-rule 이 정한다).

export type PickOrderInput = {
  /** 크리에이터 페이지의 「선물 보내기」로 들어와 미리 고른 사람 */
  pinnedId: string | null;
  /** 내가 선물을 보낸 크리에이터, 마지막으로 보낸 순(my_recent_recipients) */
  recentRecipientIds: readonly string[];
  /** 내가 팔로우한 크리에이터, 팔로우한 순서(오래된 것부터, my_follows) */
  followIds: readonly string[];
};

/**
 * 미리 고른 사람 → 최근에 선물한 사람(마지막으로 보낸 순) → 선물한 적 없는 사람은 최근에 팔로우한 순 → 나머지(받은 순서).
 * 자주 보내는 사람이 처음 몇 줄 안에 오게 한다(2026-10-07 사용자 「팔로우 중인 사람이 30명이면」, 카드 d41).
 */
export function pickOrder<T extends { id: string }>(list: readonly T[], input: PickOrderInput): T[] {
  const sent = new Map(input.recentRecipientIds.map((id, i) => [id, i]));
  const followed = new Map(input.followIds.map((id, i) => [id, input.followIds.length - 1 - i]));
  const key = (c: T): [number, number] => {
    if (c.id === input.pinnedId) return [0, 0];
    const s = sent.get(c.id);
    if (s !== undefined) return [1, s];
    const f = followed.get(c.id);
    if (f !== undefined) return [2, f];
    return [3, 0];
  };
  return list.toSorted((a, b) => {
    const [ga, ia] = key(a);
    const [gb, ib] = key(b);
    return ga - gb || ia - ib;
  });
}
