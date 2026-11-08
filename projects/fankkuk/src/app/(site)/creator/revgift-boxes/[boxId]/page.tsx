import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { readBoxCards, readMyBox, readPriceTable } from "@/entities/revgift-box/api/box-reads";
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
  // 2페이지 예상 금액용 요금(마감 때만) · 확인 필요 카드(확인 필요 때만) — 표시용이라 실패해도 화면은 그린다
  const [price, cards] = await Promise.all([
    box.status === "closed" ? readPriceTable(supabase).catch(() => null) : Promise.resolve(null),
    box.status === "held" ? readBoxCards(supabase).catch(() => []) : Promise.resolve([]),
  ]);
  const url = new URL(`/gift-boxes/${box.id}`, requestOrigin(await headers()));
  if (box.inviteToken) url.searchParams.set("invite", box.inviteToken);
  return (
    <>
      <SiteHeader {...header} />
      <BoxManagePage box={box} applyUrl={url.toString()} price={price} cards={cards} />
      <SiteFooter />
    </>
  );
}
