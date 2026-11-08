import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readMyBoxes } from "@/entities/revgift-box/api/box-reads";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { BoxListPage } from "@/widgets/revgift-box/ui/box-list-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "선물함 — 팬꾹" };

// 내 선물함 목록(크리에이터, revgift-box). 읽기 함수가 로그인한 크리에이터의 선물함만 돌려준다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login?next=/creator/revgift-boxes");
  const [header, rows] = await Promise.all([readSiteHeader(supabase, viewer, "/creator/revgift-boxes"), readMyBoxes(supabase)]);
  return (
    <>
      <SiteHeader {...header} />
      <BoxListPage rows={rows} />
      <SiteFooter />
    </>
  );
}
