import { readNotices } from "@/entities/notice/api/notice-reads";
import { NoticesPage } from "@/widgets/notices/ui/notices-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 공지는 DB 에서 읽는다(고정 글이 먼저, 그다음 최신순). 한 쪽에 8개.
const PAGE_SIZE = 8;

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page: raw } = await searchParams;
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/notices");
  const all = await readNotices(supabase);
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const asked = Number.parseInt(typeof raw === "string" ? raw : "1", 10);
  const page = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), pageCount) : 1;
  const notices = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <>
      <SiteHeader {...header} />
      <NoticesPage notices={notices} page={page} pageCount={pageCount} />
      <SiteFooter />
    </>
  );
}
