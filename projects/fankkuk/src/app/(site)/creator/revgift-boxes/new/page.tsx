import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { BoxNewPage } from "@/widgets/revgift-box/ui/box-new-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "팬에게 보내기 — 팬꾹" };

// 팬에게 보내기 1페이지(설명) → 선물함 만들기(크리에이터, revgift-box INV-GB3). 만들기 판정은 DB 함수가 로그인 토큰으로 한다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login?next=/creator/revgift-boxes/new");
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/creator/revgift-boxes/new")} />
      <BoxNewPage />
      <SiteFooter />
    </>
  );
}
