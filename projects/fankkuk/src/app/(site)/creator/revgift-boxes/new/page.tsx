import type { Metadata } from "next";
import { viewerHasChannel } from "@/entities/session/model/viewer";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { requestOrigin } from "@/widgets/creator-profile/model/link-metadata";
import { loadBoxList } from "@/widgets/revgift-box/api/box-list-data";
import { BoxListPage } from "@/widgets/revgift-box/ui/box-list-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "선물함 만들기 — 팬꾹" };

// 옛 링크·알림용 — 선물함 목록에 만들기 모달을 연 채로 보인다(UX 명세 creator-revgifts-new 「바꾼 뒤 — 자리」). 만들기 판정은 DB 함수가 로그인 토큰으로 한다(INV-GB3).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login?next=/creator/revgift-boxes/new");
  const [header, data] = await Promise.all([readSiteHeader(supabase, viewer, "/creator/revgift-boxes"), loadBoxList(supabase, requestOrigin(await headers()))]);
  return (
    <>
      <SiteHeader {...header} />
      <BoxListPage hasChannel={viewerHasChannel(viewer)} rows={data.rows} manage={data.manage} price={data.price} initial={{ kind: "create" }} />
      <SiteFooter />
    </>
  );
}
