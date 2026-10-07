import type { CreatorCard } from "./creator-card";

// 메인 「새로 들어온 크리에이터」의 순서와 대상.

/**
 * all = 전체 목록(들어온 순서, list_creators), searchable = 찾기에 나오는 크리에이터(find_creators).
 * 찾기에 나오는 크리에이터만 남겨 최근에 들어온 순으로 돌려준다 — 찾기 노출을 끈 크리에이터는 메인에도 나오지 않는다.
 */
export function newestSearchable(all: readonly CreatorCard[], searchable: readonly CreatorCard[]): CreatorCard[] {
  const ids = new Set(searchable.map((c) => c.id));
  return all.filter((c) => ids.has(c.id)).toReversed();
}
