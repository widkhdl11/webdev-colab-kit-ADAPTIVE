import { fetchArticleList } from "@/entities/article";
import { getSourceWeight } from "@/entities/source";
import { rankFeed } from "@/features/feed-ranking";
import { FeedScreen } from "@/widgets/feed";

// 기준 시각을 요청 시점에 정한다. 빌드 때 굳으면 "2시간 전" 같은 표기가 배포 직후부터 어긋난다.
// 수집 결과가 매일 바뀌므로 캐시도 하지 않는다.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();

  // 조회는 저장된 것만 준다. 점수와 '뜨는 중'은 여기서 만든다 —
  // 저장된 값이 아니다(ingestion-ranking INV-R1). 필터·정렬보다 먼저 걸어야
  // 뱃지가 필터에 따라 흔들리지 않는다(INV-R5).
  const articles = rankFeed({
    items: await fetchArticleList(),
    now,
    weightOf: getSourceWeight,
  });

  // 목록 쿼리가 본문을 안 뽑으므로 여기 넘어가는 값에 본문이 없다 —
  // FeedScreen 은 클라이언트 컴포넌트라 넘긴 값이 그대로 브라우저로 직렬화된다.
  return <FeedScreen articles={articles} nowIso={now.toISOString()} />;
}
