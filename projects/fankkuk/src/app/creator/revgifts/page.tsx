import { redirect } from "next/navigation";
import { OFFICE_ADDRESS } from "@/entities/order/config/office-address";
import { readMyShareBoxes } from "@/entities/parcel/api/box-reads";
import { readSentRevgifts } from "@/entities/revgift/api/revgift-reads";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { RevgiftSentPage } from "@/widgets/revgift-sent/ui/revgift-sent-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 보낸 역조공(크리에이터). DB 읽기 함수가 로그인한 크리에이터가 보낸 몫만, 크리에이터가 봐도 되는 칸만 돌려준다(INV-R8).
// 몫마다 원 송장번호(입고 전까지 고침)는 my_share_boxes 가 같은 크리에이터의 몫만 준다(design-rules 8-1).
// 결제 성공 뒤 서버가 ?paid=1 로 보낸다 — 이 값은 안내 한 줄만 바꾼다.
// 사무실 주소는 팬 선물 안내와 같은 한 곳(OFFICE_ADDRESS)에서 읽고, 묶음에 붙일지는 DB 판정(ship_to_office)을 따른다(INV-R14).
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { paid } = await searchParams;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [header, rows, boxes] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creator/revgifts"),
    readSentRevgifts(supabase),
    readMyShareBoxes(supabase),
  ]);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell role="creator" current="/creator/revgifts">
        <RevgiftSentPage rows={rows} boxes={boxes} paid={paid === "1"} officeAddress={OFFICE_ADDRESS} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
