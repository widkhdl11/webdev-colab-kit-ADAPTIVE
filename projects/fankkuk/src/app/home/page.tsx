import {
  SAMPLE_CREATOR_PROFILES,
  SAMPLE_FOLLOWED_CREATOR_IDS,
  SAMPLE_LISTED_CREATORS,
} from "@/entities/creator/api/sample-creators";
import { toCreatorCards } from "@/entities/creator/model/creator-card";
import { SAMPLE_NOTICES } from "@/entities/notice/api/sample-notices";
import { SAMPLE_ORDERS, SAMPLE_SIGNED_IN_FAN } from "@/entities/order/api/sample-orders";
import { OFFICE_ADDRESS } from "@/entities/order/config/office-address";
import { toFanView } from "@/entities/order/model/fan-view";
import { headerGiftState } from "@/entities/order/ui/fan-stage-copy";
import { HomePage } from "@/widgets/home/ui/home-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 데이터로 그린다. 팬 화면은 주문 기록을 그대로 받지 않고 팬용 모양(toFanView)만 받는다.
// 「진행 중」은 헤더 선물 아이콘과 같은 기준(headerGiftState)이다 — 헤더 숫자와 이 줄이 어긋나지 않게.
export default function Page() {
  const gifts = SAMPLE_ORDERS.filter((o) => o.fanNickname === SAMPLE_SIGNED_IN_FAN)
    .toSorted((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt))
    .map((o) => toFanView(o, OFFICE_ADDRESS))
    .filter((v) => headerGiftState(v) !== null);
  const cards = toCreatorCards(SAMPLE_LISTED_CREATORS, SAMPLE_CREATOR_PROFILES, SAMPLE_FOLLOWED_CREATOR_IDS);
  const following = cards.filter((c) => c.following).map(({ id, name, category, faceTone }) => ({ id, name, category, faceTone }));
  const faceToneByName = Object.fromEntries(cards.map((c) => [c.name, c.faceTone]));
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
