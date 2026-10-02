import {
  SAMPLE_CREATOR_PROFILES,
  SAMPLE_FOLLOWED_CREATOR_IDS,
  SAMPLE_LISTED_CREATORS,
} from "@/entities/creator/api/sample-creators";
import { toCreatorCards } from "@/entities/creator/model/creator-card";
import { sampleApprovalMinutesByCreator } from "@/entities/order/api/sample-views";
import { MyFollowingPanel } from "@/widgets/my-following/ui/my-following-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 예시 데이터로 그린다. 로그인이 붙으면 세션의 팬이 팔로우한 크리에이터로 바꾼다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/me/following");
  const followed = toCreatorCards(SAMPLE_LISTED_CREATORS, SAMPLE_CREATOR_PROFILES, SAMPLE_FOLLOWED_CREATOR_IDS, sampleApprovalMinutesByCreator()).filter(
    (c) => c.following,
  );
  return (
    <>
      <SiteHeader {...header} />
      <MyShell current="/me/following">
        <MyFollowingPanel creators={followed} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
