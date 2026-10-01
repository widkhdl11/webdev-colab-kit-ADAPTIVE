import {
  SAMPLE_CREATOR_PROFILES,
  SAMPLE_FOLLOWED_CREATOR_IDS,
  SAMPLE_LISTED_CREATORS,
  sampleFaceToneByName,
} from "@/entities/creator/api/sample-creators";
import { toCreatorCards } from "@/entities/creator/model/creator-card";
import { SAMPLE_NOTICES } from "@/entities/notice/api/sample-notices";
import { SAMPLE_SIGNED_IN_FAN } from "@/entities/order/api/sample-orders";
import { sampleFanGiftViews } from "@/entities/order/api/sample-views";
import { fanGiftBucket } from "@/entities/order/ui/fan-stage-copy";
import { HomePage } from "@/widgets/home/ui/home-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 데이터로 그린다. 팬 화면은 주문 기록을 그대로 받지 않고 팬용 모양(toFanView)만 받는다.
// 「진행 중」은 선물 내역의 「진행 중」 탭과 같은 기준(fanGiftBucket)이다.
export default function Page() {
  const gifts = sampleFanGiftViews().filter((v) => fanGiftBucket(v) === "ongoing");
  const following = toCreatorCards(SAMPLE_LISTED_CREATORS, SAMPLE_CREATOR_PROFILES, SAMPLE_FOLLOWED_CREATOR_IDS)
    .filter((c) => c.following)
    .map(({ id, name, category, faceTone }) => ({ id, name, category, faceTone }));
  const faceToneByName = sampleFaceToneByName();
  const notices = SAMPLE_NOTICES.toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ id, title, date }) => ({ id, title, date }));
  return (
    <>
      <SiteHeader {...sampleFanHeader("/home")} />
      <HomePage
        nickname={SAMPLE_SIGNED_IN_FAN}
        gifts={gifts}
        following={following}
        faceToneByName={faceToneByName}
        notices={notices}
      />
      <SiteFooter />
    </>
  );
}
