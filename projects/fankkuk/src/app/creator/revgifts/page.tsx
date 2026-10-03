import { redirect } from "next/navigation";
import { readSentRevgifts } from "@/entities/revgift/api/revgift-reads";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { RevgiftSentPage } from "@/widgets/revgift-sent/ui/revgift-sent-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 보낸 역조공(크리에이터). DB 읽기 함수가 로그인한 크리에이터가 보낸 몫만, 크리에이터가 봐도 되는 칸만 돌려준다(INV-R8).
// 결제 성공 뒤 서버가 ?paid=1 로 보낸다 — 이 값은 안내 한 줄만 바꾼다.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { paid } = await searchParams;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [header, rows] = await Promise.all([readSiteHeader(supabase, viewer, "/creator/revgifts"), readSentRevgifts(supabase)]);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell role="creator" current="/creator/revgifts">
        <RevgiftSentPage rows={rows} paid={paid === "1"} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
