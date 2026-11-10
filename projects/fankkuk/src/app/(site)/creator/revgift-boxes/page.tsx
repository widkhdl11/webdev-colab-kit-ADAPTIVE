import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "팬에게 보내기 — 팬꾹" };

// 팬에게 보내기 — 내 선물함 목록 + 설명(크리에이터, revgift-box). 읽기 함수가 로그인한 크리에이터의 선물함만 돌려준다.
// 만들기·신청 관리는 이 페이지 위 모달이다(주소는 그대로).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login?next=/creator/revgift-boxes");
  const [header, data] = await Promise.all([readSiteHeader(supabase, viewer, "/creator/revgift-boxes"), loadBoxList(supabase, requestOrigin(await headers()))]);
  return (
    <>
      <SiteHeader {...header} />
      <BoxListPage rows={data.rows} manage={data.manage} price={data.price} />
      <SiteFooter />
    </>
  );
}
