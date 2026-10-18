import type { CreatorCard } from "./creator-card";

// 첫 화면 「새로 들어온 크리에이터」의 순서와 개수(design-rules 16절 ④).

/**
 * searchable = 크리에이터 찾기 목록(find_creators — 본인 확인됨 + 찾기 노출 켜짐, my-account INV-A10). 들어온 순서(오래된 것부터)로 온다.
 * 최근에 들어온 순으로 앞 limit 명을 돌려준다.
 */
export function newestFirst(searchable: readonly CreatorCard[], limit: number): CreatorCard[] {
  return searchable.toReversed().slice(0, limit);
}
