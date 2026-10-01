import { SAMPLE_NOTICES } from "@/entities/notice/api/sample-notices";
import { NoticesPage } from "@/widgets/notices/ui/notices-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 공지로 그린다. 한 쪽에 8개 — 고정 글이 먼저, 그다음 최신순(예시 데이터가 그 순서로 적혀 있다).
const PAGE_SIZE = 8;

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page: raw } = await searchParams;
  const pageCount = Math.max(1, Math.ceil(SAMPLE_NOTICES.length / PAGE_SIZE));
  const asked = Number.parseInt(typeof raw === "string" ? raw : "1", 10);
  const page = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), pageCount) : 1;
  const notices = SAMPLE_NOTICES.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <>
      <SiteHeader role="guest" current="/notices" />
      <NoticesPage notices={notices} page={page} pageCount={pageCount} />
      <SiteFooter />
    </>
  );
}
