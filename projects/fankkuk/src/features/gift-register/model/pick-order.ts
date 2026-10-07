// 선물 보내기 1단계 목록의 순서 — 화면 표시용이다(누구에게 보낼 수 있는지는 sender-rule 이 정한다).

/**
 * 미리 고른 사람(크리에이터 페이지의 「선물 보내기」로 들어온 경우)을 맨 위에, 그다음 내가 팔로우한 크리에이터, 나머지 순.
 * 같은 묶음 안에서는 받은 순서를 그대로 둔다.
 */
export function pickOrder<T extends { id: string; following?: boolean }>(list: readonly T[], pinnedId: string | null): T[] {
  const rank = (c: T) => (c.id === pinnedId ? 0 : c.following ? 1 : 2);
  return list.toSorted((a, b) => rank(a) - rank(b));
}
