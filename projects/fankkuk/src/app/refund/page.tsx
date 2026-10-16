import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { resolveLegal } from "@/widgets/legal/model/legal-versions";
import { refundDoc } from "@/widgets/legal/model/refund-doc";
import { LegalPage } from "@/widgets/legal/ui/legal-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "취소·환불 규정 — 팬꾹" };

// 로그인 없이 열린다. 요금 숫자는 결제와 같은 DB 요금표에서 읽는다. ?v=버전 은 이용약관과 같다.
export default async function Page({ searchParams }: { searchParams: Promise<{ v?: string | string[] }> }) {
  const { v } = await searchParams;
  const { supabase, viewer } = await loadSession();
  const [header, prices] = await Promise.all([readSiteHeader(supabase, viewer, "/refund"), readPublicPrices(supabase)]);
  const resolved = resolveLegal("refund", "/refund", refundDoc(prices), typeof v === "string" ? v : undefined);
  if (!resolved) notFound();
  return (
    <>
      <SiteHeader {...header} />
      <LegalPage doc={resolved.doc} history={resolved.history} pastVersion={!resolved.current} icon="/img/icon-notice.png" />
      <SiteFooter />
    </>
  );
}
