import { PageLoading } from "@/widgets/site-header/ui/page-loading";

// 운영자 화면은 자기 틀(admin/layout)이 이동 중에도 남는다 — 본문 자리만 뼈대
export default function Loading() {
  return <PageLoading withHeader={false} />;
}
