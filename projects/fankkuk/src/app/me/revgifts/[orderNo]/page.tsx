import { notFound, redirect } from "next/navigation";
import { readMyRevgiftAccessLog, readReceivedRevgift } from "@/entities/revgift/api/revgift-reads";
import { isRevgiftOrderNo } from "@/entities/revgift/model/revgift-order-no";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { RevgiftReceivePage } from "@/widgets/revgift-receive/ui/revgift-receive-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 받은 역조공 하나 — 받기·받지 않기(팬). 읽기 함수가 로그인한 팬이 받는 몫만 돌려주므로 남의 주문번호는 없는 주소와 같다.
// 아래에 그 몫의 내 주소 열람 기록(INV-R16)을 붙인다 — 누구 몫인지는 DB 가 로그인 토큰으로 다시 판정한다.
// 주소 봉인 공개키는 서버 설정에서 읽어 이 화면에만 넘긴다. 없으면 받기 폼 대신 안내가 나온다(INV-R5).
export default async function Page({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  if (!isRevgiftOrderNo(orderNo)) notFound();
  // 두 읽기는 서로 기다릴 일이 없다 — 남의 몫이면 기록 읽기도 빈 목록이라 먼저 불러도 새는 것이 없다
  const [item, accessLog] = await Promise.all([readReceivedRevgift(supabase, orderNo), readMyRevgiftAccessLog(supabase, orderNo)]);
  if (!item) notFound();
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/me/revgifts")} />
      <RevgiftReceivePage item={item} nowMs={Date.now()} sealingKeyPem={readSealingPublicKeyPem(process.env)} accessLog={accessLog} />
      <SiteFooter />
    </>
  );
}
