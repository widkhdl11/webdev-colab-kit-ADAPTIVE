import { createDummyArticles, toListItem } from "@/entities/article";
import { FeedScreen } from "@/widgets/feed";

// 기준 시각을 요청 시점에 정한다. 빌드 때 굳으면 "2시간 전" 같은 표기가 배포 직후부터 어긋난다.
// Supabase 조회가 붙으면 이 설정이 그대로 필요해진다(수집 결과가 매일 바뀐다).
export const dynamic = "force-dynamic";

export default function HomePage() {
  // TODO(supabase): 프로비저닝되면 이 줄만 조회로 바꾼다. 화면은 그대로 둔다.
  const now = new Date();

  // 목록에는 본문을 빼고 넘긴다 — FeedScreen 은 클라이언트 컴포넌트라
  // 넘긴 값이 그대로 직렬화돼 브라우저로 간다(수집이 붙으면 요청마다 수 MB가 된다).
  const articles = createDummyArticles(now).map(toListItem);

  return <FeedScreen articles={articles} nowIso={now.toISOString()} />;
}
