import {
  SAMPLE_CREATOR_PROFILES,
  SAMPLE_FOLLOWED_CREATOR_IDS,
  SAMPLE_LISTED_CREATORS,
} from "@/entities/creator/api/sample-creators";
import { toCreatorCards } from "@/entities/creator/model/creator-card";
import { sampleApprovalMinutesByCreator } from "@/entities/order/api/sample-views";
import { CreatorSearchPage } from "@/widgets/creator-search/ui/creator-search-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 데이터로 그린다. 로그인이 붙으면 팔로우 목록은 세션의 팬 것으로 바꾼다.
export default function Page() {
  const creators = toCreatorCards(SAMPLE_LISTED_CREATORS, SAMPLE_CREATOR_PROFILES, SAMPLE_FOLLOWED_CREATOR_IDS, sampleApprovalMinutesByCreator());
  return (
    <>
      <SiteHeader {...sampleFanHeader("/creators")} />
      <CreatorSearchPage creators={creators} />
      <SiteFooter />
    </>
  );
}
