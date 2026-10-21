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

// 지금 할 일(팬 — action-center INV-J1~J4·J13). DB 읽기 함수 한 번의 결과를 사이드바 숫자와 줄 목록에 함께 넘긴다(J2).
// 누구 것인지는 DB 가 로그인 토큰으로 정한다(J3). 크리에이터는 크리에이터 메인으로.
// 이 화면에는 처리 칸이 없다 — 줄은 선물 상세의 「지금 할 일」 칸으로 가고, 처리(반송 주소 확인 창의 주소 입력 포함)는 그 칸이 한다(J13).
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
        <ActionCenterPage items={items} now={new Date().toISOString()} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
