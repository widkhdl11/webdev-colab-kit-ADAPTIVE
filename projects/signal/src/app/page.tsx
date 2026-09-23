import { loadRankedFeed } from "@/features/feed-ranking";
import { FeedScreen } from "@/widgets/feed";

// 기준 시각을 요청 시점에 정한다. 빌드 때 굳으면 "2시간 전" 같은 표기가 배포 직후부터 어긋난다.
// 수집 결과가 매일 바뀌므로 캐시도 하지 않는다.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();
  // 조회·점수·창 경계는 한 함수가 정한다 — 상세의 이전/다음이 같은 함수로 줄을 세운다.
  // `FeedScreen` 이 같은 `nowIso` 로 뱃지를 다시 세므로 셋(조회·집계·표시)이 한 시각을 본다.
  const articles = await loadRankedFeed(now);

  // 목록 쿼리가 본문을 안 뽑으므로 여기 넘어가는 값에 본문이 없다 —
  // FeedScreen 은 클라이언트 컴포넌트라 넘긴 값이 그대로 브라우저로 직렬화된다.
  return <FeedScreen articles={articles} nowIso={now.toISOString()} />;
}
