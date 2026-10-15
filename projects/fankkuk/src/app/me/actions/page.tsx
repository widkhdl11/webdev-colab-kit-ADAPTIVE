import { redirect } from "next/navigation";
import { readActionItems } from "@/entities/action-item/api/read-action-items";
import { ACTION_CENTER_HREF } from "@/entities/action-item/model/action-items";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { ActionCenterPage } from "@/widgets/action-center/ui/action-center-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 처리할 일(팬 — action-center INV-J1~J4). DB 읽기 함수 한 번의 결과를 사이드바 숫자와 카드 목록에 함께 넘긴다(J2).
// 누구 것인지는 DB 가 로그인 토큰으로 정한다(J3). 크리에이터 쪽은 아직 만들지 않는다(카드 d91) — 크리에이터는 크리에이터 메인으로.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  const items = await readActionItems(supabase);
  const header = await readSiteHeader(supabase, viewer, ACTION_CENTER_HREF, undefined, items);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <ActionCenterPage items={items} clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ""} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
