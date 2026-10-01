import { SAMPLE_FAN_ACCOUNT } from "@/entities/fan/api/sample-fan-account";
import { SAMPLE_SIGNED_IN_FAN } from "@/entities/order/api/sample-orders";
import { MyInfoPanel } from "@/widgets/my-info/ui/my-info-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

// 예시 데이터로 그린다. 로그인이 붙으면 세션의 팬 정보로 바꾼다.
export default function Page() {
  return (
    <>
      <SiteHeader {...sampleFanHeader("/me")} />
      <MyShell current="/me">
        <MyInfoPanel account={SAMPLE_FAN_ACCOUNT} nickname={SAMPLE_SIGNED_IN_FAN} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
