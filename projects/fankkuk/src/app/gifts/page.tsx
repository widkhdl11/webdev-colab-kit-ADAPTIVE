import { redirect } from "next/navigation";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { senderRoleAllowed } from "@/features/gift-register/model/sender-rule";
import { GiftListPage } from "@/widgets/gift-list/ui/gift-list-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 로그인한 사람이 보낸 선물(DB 읽기 함수 my_gifts — 보낸 사람 것만, 보낸 사람이 봐도 되는 칸만).
// 팬·크리에이터 모두 「내 팬꾹」 안에서 본다(팬 메뉴 「선물 내역」, 크리에이터 메뉴 「보낸 선물」). 운영자·손님은 로그인으로.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (!viewer || !senderRoleAllowed(viewer.role)) redirect("/login");
  const gifts = await readMyGiftViews(supabase);
  const faceToneByName = Object.fromEntries((await readCreatorCards(supabase, { signedIn: true })).map((c) => [c.name, c.faceTone]));
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts", gifts)} />
      {viewer.role === "fan" ? (
        <MyShell role="fan" current="/gifts" nickname={viewer.nickname}>
          <GiftListPage gifts={gifts} faceToneByName={faceToneByName} />
        </MyShell>
      ) : (
        <MyShell role="creator" current="/gifts" nickname={viewer.nickname}>
          <GiftListPage gifts={gifts} faceToneByName={faceToneByName} title="보낸 선물" />
        </MyShell>
      )}
      <SiteFooter />
    </>
  );
}
