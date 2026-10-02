import { redirect } from "next/navigation";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { GiftListPage } from "@/widgets/gift-list/ui/gift-list-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 로그인한 팬의 선물(DB 읽기 함수 my_gifts — 팬의 것만, 팬이 봐도 되는 칸만). 팬이 아니면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role !== "fan") redirect("/login");
  const gifts = await readMyGiftViews(supabase);
  const faceToneByName = Object.fromEntries((await readCreatorCards(supabase, { signedIn: true })).map((c) => [c.name, c.faceTone]));
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts", gifts)} />
      <MyShell current="/gifts">
        <GiftListPage gifts={gifts} faceToneByName={faceToneByName} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
