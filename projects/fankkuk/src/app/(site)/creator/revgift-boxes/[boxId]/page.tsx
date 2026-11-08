import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { readMyBox } from "@/entities/revgift-box/api/box-reads";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { requestOrigin } from "@/widgets/creator-profile/model/link-metadata";
import { BoxManagePage } from "@/widgets/revgift-box/ui/box-manage-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "신청 관리 — 팬꾹" };

// 신청 관리 창(크리에이터, revgift-box INV-GB7·GB9). 읽기 함수가 주인 본인일 때만 돌려준다 — 아니면 없는 주소.
// 신청 링크는 서버가 만든다(비공개면 초대 토큰을 붙인다 — 토큰은 주인에게만 보인다).
export default async function Page({ params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${boxId}`)}`);
  const [header, box] = await Promise.all([readSiteHeader(supabase, viewer, "/creator/revgift-boxes"), readMyBox(supabase, boxId)]);
  if (!box) notFound();
  const url = new URL(`/gift-boxes/${box.id}`, requestOrigin(await headers()));
  if (box.inviteToken) url.searchParams.set("invite", box.inviteToken);
  return (
    <>
      <SiteHeader {...header} />
      <BoxManagePage box={box} applyUrl={url.toString()} />
      <SiteFooter />
    </>
  );
}
