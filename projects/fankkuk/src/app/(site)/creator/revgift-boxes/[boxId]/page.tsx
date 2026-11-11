import type { Metadata } from "next";
import { viewerHasChannel } from "@/entities/session/model/viewer";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { readBoxCards, readMyBox, readPriceTable } from "@/entities/revgift-box/api/box-reads";
import { readDeliveryStatusSource } from "@/features/delivery-tracking/api/read-delivery-source";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { requestOrigin } from "@/widgets/creator-profile/model/link-metadata";
import { loadBoxList } from "@/widgets/revgift-box/api/box-list-data";
import { BoxListPage } from "@/widgets/revgift-box/ui/box-list-page";
import { BoxManagePage } from "@/widgets/revgift-box/ui/box-manage-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "신청 관리 — 팬꾹" };

// 신청 관리 창(크리에이터, revgift-box INV-GB7·GB9). 읽기 함수가 주인 본인일 때만 돌려준다 — 아니면 없는 주소.
// 신청 받는 중이면 목록 + 신청 관리 모달, 그 밖은 단계 페이지. 신청 링크는 서버가 만든다(비공개면 초대 토큰 — 주인에게만 보인다).
export default async function Page({ params, searchParams }: { params: Promise<{ boxId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { boxId } = await params;
  const q = await searchParams;
  // 결제창에서 돌아온 결과(revgift-box INV-GB18) — 문구 고르기에만 쓴다. 결제 상태는 읽기 함수가 정한다
  const notice = q.paid === "1" ? "paid" : q.payment === "failed" ? "failed" : q.payment === "in_progress" ? "in_progress" : null;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${boxId}`)}`);
  const [header, box, deliverySource] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creator/revgift-boxes"),
    readMyBox(supabase, boxId),
    readDeliveryStatusSource(supabase),
  ]);
  if (!box) notFound();
  const origin = requestOrigin(await headers());
  // 신청 받는 중 — 목록 + 이 선물함의 신청 관리 모달(UX 명세 「2026-11-10 시안 승인」). 마감 뒤 단계는 아래 단계 페이지 그대로
  if (box.status === "open") {
    const data = await loadBoxList(supabase, origin);
    return (
      <>
        <SiteHeader {...header} />
        <BoxListPage hasChannel={viewerHasChannel(viewer)} rows={data.rows} manage={data.manage} price={data.price} initial={{ kind: "manage", boxId: box.id }} />
        <SiteFooter />
      </>
    );
  }
  // 2페이지 예상 금액용 요금(마감 때만) · 확인 필요 카드(확인 필요 때만) — 표시용이라 실패해도 화면은 그린다
  const [price, cards] = await Promise.all([
    box.status === "closed" ? readPriceTable(supabase).catch(() => null) : Promise.resolve(null),
    box.status === "held" ? readBoxCards(supabase).catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <>
      <SiteHeader {...header} />
      <BoxManagePage
        box={box} price={price} cards={cards} clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ""} notice={notice}
        now={new Date().toISOString()}
        deliverySource={deliverySource}
      />
      <SiteFooter />
    </>
  );
}
