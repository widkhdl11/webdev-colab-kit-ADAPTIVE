import { PageLoading } from "@/widgets/site-header/ui/page-loading";

// 페이지를 옮기는 순간 바로 보이는 화면 — 상단 바는 그대로, 본문 자리만 뼈대(Next 가 미리 받아 둔다)
export default function Loading() {
  return <PageLoading />;
}
