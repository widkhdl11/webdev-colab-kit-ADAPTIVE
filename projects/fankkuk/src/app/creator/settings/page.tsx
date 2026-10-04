import { redirect } from "next/navigation";
import { readMyBlockedSenders } from "@/entities/creator/api/blocked-senders";
import { SAMPLE_CREATOR_SETTINGS } from "@/entities/creator/api/sample-creator-settings";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { CreatorSettingsPage } from "@/widgets/creator-settings/ui/creator-settings-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 차단 목록은 DB 에서(로그인한 크리에이터의 것만 — INV-D9). 주소·프로필·알림은 아직 예시 데이터다. 주소는 값이 아니라 등록 여부만 넘긴다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [header, blockedFans] = await Promise.all([readSiteHeader(supabase, viewer, "/creator/settings"), readMyBlockedSenders(supabase)]);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell role="creator" current="/creator/settings">
        <CreatorSettingsPage settings={SAMPLE_CREATOR_SETTINGS} blockedFans={blockedFans} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
