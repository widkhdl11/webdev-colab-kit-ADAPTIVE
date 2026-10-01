import {
  SAMPLE_CREATOR_PROFILES,
  SAMPLE_FOLLOWED_CREATOR_IDS,
  SAMPLE_LISTED_CREATORS,
} from "@/entities/creator/api/sample-creators";
import { toCreatorCards } from "@/entities/creator/model/creator-card";
import { MyFollowingPanel } from "@/widgets/my-following/ui/my-following-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 데이터로 그린다. 로그인이 붙으면 세션의 팬이 팔로우한 크리에이터로 바꾼다.
export default function Page() {
  const followed = toCreatorCards(SAMPLE_LISTED_CREATORS, SAMPLE_CREATOR_PROFILES, SAMPLE_FOLLOWED_CREATOR_IDS).filter(
    (c) => c.following,
  );
  return (
    <>
      <SiteHeader {...sampleFanHeader("/me/following")} />
      <MyShell current="/me/following">
        <MyFollowingPanel creators={followed} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
