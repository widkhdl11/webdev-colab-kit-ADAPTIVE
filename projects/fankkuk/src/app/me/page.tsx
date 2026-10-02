import { SAMPLE_FAN_ACCOUNT } from "@/entities/fan/api/sample-fan-account";
import { SAMPLE_SIGNED_IN_FAN } from "@/entities/order/api/sample-orders";
import { MyInfoPanel } from "@/widgets/my-info/ui/my-info-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 예시 데이터로 그린다. 로그인이 붙으면 세션의 팬 정보로 바꾼다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/me");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell current="/me">
        <MyInfoPanel account={SAMPLE_FAN_ACCOUNT} nickname={SAMPLE_SIGNED_IN_FAN} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
