import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { followModeOf } from "@/features/creator-follow/model/follow-mode";
import { CreatorSearchPage } from "@/widgets/creator-search/ui/creator-search-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 목록은 DB(본인 확인을 마친 크리에이터)에서 읽는다. 로그인했으면 팔로우 여부가 붙는다.
// 로그인하지 않아도 찾을 수 있다 — 팔로우 버튼은 누르면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/creators");
  const creators = await readCreatorCards(supabase, { signedIn: viewer !== null });
  return (
    <>
      <SiteHeader {...header} />
      <CreatorSearchPage creators={creators} followMode={followModeOf(viewer)} />
      <SiteFooter />
    </>
  );
}
