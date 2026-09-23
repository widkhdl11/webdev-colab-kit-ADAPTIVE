import { badgeWindowStartIso, fetchFeedArticles } from "@/entities/article";
import { getSourceWeight } from "@/entities/source";
import { rankFeed } from "../lib/rank-feed";

/**
 * 피드 목록을 조회하고 점수를 붙인다 — 메인과 상세가 **같은 함수로** 받는다.
 *
 * 상세의 이전/다음은 피드에 보이던 순서와 같아야 한다(design-rules 2026-09-01).
 * 두 화면이 조회·점수를 각자 조립하면 한쪽만 고쳐지는 날 「다음 글」이 피드와 갈린다.
 *
 * 조회는 저장된 것만 준다. 점수와 '뜨는 중'은 여기서 만든다 — 저장된 값이 아니다
 * (ingestion-ranking INV-R1). 필터·정렬보다 먼저 걸어야 뱃지가 필터에 따라 흔들리지
 * 않는다(INV-R5).
 *
 * **창 시작을 여기서 정해 조회에 넘긴다.** 뱃지 줄이 세는 기간과 가져오는 기간이
 * 같은 함수에서 나와야 사이에 낀 글이 안 생긴다(INV-B4). 창 밖 마지막 날짜를 끝내
 * 다 못 받았으면 그 그룹에는 '뜨는 중'을 안 붙인다 — 일부만 보고 뽑은 상위는 INV-R5 가
 * 말하는 상위가 아니다.
 */
export async function loadRankedFeed(now: Date) {
  const { items, partialDayKey } = await fetchFeedArticles({
    windowStartIso: badgeWindowStartIso(now.toISOString()),
  });
  return rankFeed({
    items,
    now,
    weightOf: getSourceWeight,
    excludeTrendingDays: partialDayKey === null ? [] : [partialDayKey],
  });
}
