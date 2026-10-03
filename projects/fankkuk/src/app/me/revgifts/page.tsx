import { redirect } from "next/navigation";
import { readReceivedRevgifts } from "@/entities/revgift/api/revgift-reads";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { MyRevgiftsPanel } from "@/widgets/my-revgifts/ui/my-revgifts-panel";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 받은 역조공(팬). DB 읽기 함수가 로그인한 팬이 받는 몫만 돌려준다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  const [header, items] = await Promise.all([readSiteHeader(supabase, viewer, "/me/revgifts"), readReceivedRevgifts(supabase)]);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell role="fan" current="/me/revgifts">
        <MyRevgiftsPanel items={items} nowMs={Date.now()} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
