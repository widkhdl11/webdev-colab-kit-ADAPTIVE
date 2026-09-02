import { Suspense } from "react";

import { dummyArticles } from "@/entities/article";
import { Feed } from "@/widgets/feed";

// 날짜 그룹이 "오늘"부터 시작해야 하므로 렌더 시각이 필요하다.
// 빌드 시점에 굳으면 다음 날 화면이 하루 밀린다.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const nowIso = new Date().toISOString();

  // 진짜 데이터가 붙으면 이 한 줄이 Supabase 조회로 바뀐다. 아래는 그대로다.
  const articles = dummyArticles(nowIso);

  // Feed 가 useSearchParams 로 주소를 직접 읽는다 — 정렬·필터·펼친 날 수의 근거가 주소 하나여야
  // 뒤로가기가 맞는다. 그 훅은 Suspense 경계를 요구한다.
  return (
    <Suspense fallback={null}>
      <Feed articles={articles} nowIso={nowIso} />
    </Suspense>
  );
}
