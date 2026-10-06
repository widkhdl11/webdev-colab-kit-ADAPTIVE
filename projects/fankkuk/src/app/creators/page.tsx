import { readCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { followModeOf } from "@/features/creator-follow/model/follow-mode";
import { CreatorSearchPage } from "@/widgets/creator-search/ui/creator-search-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 목록은 DB(본인 확인을 마쳤고 찾기 노출을 켠 크리에이터 — my-account INV-A10)에서 읽는다. 로그인했으면 팔로우 여부가 붙는다.
// 로그인하지 않아도 찾을 수 있다 — 팔로우 버튼은 누르면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  // 크리에이터는 자기 줄에서 팔로우·선물 보내기를 보지 않고, 팔로우하지 않은 줄에는 선물 보내기가 없다(INV-L9 — 받는 쪽만
  // 팔로우한 경우는 크리에이터 페이지에서 한 명씩 확인한다)
  const [header, creators, ownCreatorId] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creators"),
    readCreatorCards(supabase, { signedIn: viewer !== null, forSearch: true }),
    viewer?.role === "creator" ? readOwnCreatorId(supabase) : Promise.resolve(null),
  ]);
  return (
    <>
      <SiteHeader {...header} />
      <CreatorSearchPage
        creators={creators}
        followMode={followModeOf(viewer)}
        ownCreatorId={ownCreatorId}
        sendOnlyToFollowed={viewer?.role === "creator"}
      />
      <SiteFooter />
    </>
  );
}
