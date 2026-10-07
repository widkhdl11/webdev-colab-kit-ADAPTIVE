import { redirect } from "next/navigation";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { MyFollowingPanel } from "@/widgets/my-following/ui/my-following-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 로그인한 팬이 팔로우한 크리에이터(DB). 팬이 아니면 다른 화면으로 보낸다(메인과 같은 기준).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  const header = await readSiteHeader(supabase, viewer, "/me/following");
  const followed = (await readCreatorCards(supabase, { signedIn: true })).filter((c) => c.following);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell role="fan" current="/me/following" nickname={viewer.nickname}>
        <MyFollowingPanel creators={followed} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
