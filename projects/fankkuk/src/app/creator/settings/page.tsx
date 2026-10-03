import { redirect } from "next/navigation";
import { SAMPLE_BLOCKED_FANS, SAMPLE_CREATOR_SETTINGS } from "@/entities/creator/api/sample-creator-settings";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { CreatorSettingsPage } from "@/widgets/creator-settings/ui/creator-settings-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 예시 데이터로 그린다. 주소는 값이 아니라 등록 여부만 넘긴다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const header = await readSiteHeader(supabase, viewer, "/creator/settings");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell role="creator" current="/creator/settings">
        <CreatorSettingsPage settings={SAMPLE_CREATOR_SETTINGS} blockedFans={SAMPLE_BLOCKED_FANS} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
