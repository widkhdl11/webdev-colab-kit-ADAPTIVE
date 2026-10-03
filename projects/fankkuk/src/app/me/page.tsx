import { redirect } from "next/navigation";
import { readMyAccount } from "@/entities/fan/api/read-my-account";
import { CREATOR_MY_HOME } from "@/entities/session/model/my-menu";
import { MyInfoPanel } from "@/widgets/my-info/ui/my-info-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 로그인한 팬 자기 내 정보(DB). 크리에이터 설정은 따로라(my-account 비범위) 팬이 아니면 다른 화면으로 보낸다.
// 연락처가 담긴 화면이다. 요청마다 그리는 화면(force-dynamic)이라 운영 모드의 Next 가 Cache-Control: private, no-store 를 붙인다(INV-A6).
// 개발 서버는 no-cache 만 붙이고, proxy 에서 붙인 헤더는 Next 가 덮어쓴다(2026-10-02 실측 — 운영 빌드에서만 no-store 확인).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_MY_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  const account = await readMyAccount(supabase);
  if (!account) throw new Error("내 정보를 읽지 못했다");
  const header = await readSiteHeader(supabase, viewer, "/me");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell role="fan" current="/me">
        <MyInfoPanel account={account} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
