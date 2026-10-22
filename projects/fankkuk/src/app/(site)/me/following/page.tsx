import { redirect } from "next/navigation";
import {
  readCreatorCards,
  readCreatorLooks,
} from "@/entities/creator/api/creator-reads";
import { toCardLooks } from "@/entities/creator/model/card-look";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { MyFollowingPanel } from "@/widgets/my-following/ui/my-following-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import {
  loadSession,
  readSiteHeader,
} from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 로그인한 팬·크리에이터가 팔로우한 크리에이터(DB — my_follows 는 로그인한 사람 기준). 크리에이터도 다른 크리에이터를 팔로우한다(2026-10-22).
// 그 밖(로그인 안 함·운영자)은 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role !== "fan" && viewer?.role !== "creator") redirect("/login");
  const header = await readSiteHeader(supabase, viewer, "/me/following");
  const followed = (
    await readCreatorCards(supabase, { signedIn: true })
  ).filter((c) => c.following);
  // 카드마다 크리에이터가 꾸민 대로(2026-10-16 — 크리에이터 찾기와 같은 카드). 찾기 노출을 끈 크리에이터도 팔로우 목록에는 보여 id 로 읽는다
  const looks = toCardLooks(
    followed,
    await readCreatorLooks(
      supabase,
      followed.map((c) => c.id),
    ),
    readPublicStorageBase(),
  );
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <MyFollowingPanel creators={followed} looks={looks} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
