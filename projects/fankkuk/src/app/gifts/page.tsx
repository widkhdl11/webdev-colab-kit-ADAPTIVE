import { sampleFaceToneByName } from "@/entities/creator/api/sample-creators";
import { sampleFanGiftViews } from "@/entities/order/api/sample-views";
import { GiftListPage } from "@/widgets/gift-list/ui/gift-list-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

// 예시 데이터로 그린다. 팬 화면은 주문 기록을 그대로 받지 않고 팬용 모양(toFanView)만 받는다.
export default function Page() {
  const gifts = sampleFanGiftViews();
  const faceToneByName = sampleFaceToneByName();
  return (
    <>
      <SiteHeader {...sampleFanHeader("/gifts")} />
      <MyShell current="/gifts">
        <GiftListPage gifts={gifts} faceToneByName={faceToneByName} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
