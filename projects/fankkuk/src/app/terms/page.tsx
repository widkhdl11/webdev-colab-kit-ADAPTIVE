import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { resolveLegal } from "@/widgets/legal/model/legal-versions";
import { termsDoc } from "@/widgets/legal/model/terms-doc";
import { LegalPage } from "@/widgets/legal/ui/legal-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "이용약관 — 팬꾹" };

// 로그인 없이 열린다. 헤더만 로그인한 사람에 맞춘다(about·support 와 같다).
// 요금 숫자는 결제와 같은 DB 요금표에서 읽는다 — 약관과 실제 결제 금액이 갈라지지 않게.
// ?v=버전 이면 그 버전의 글(지난 버전은 legal-versions 의 ARCHIVE), 모르는 버전이면 404.
export default async function Page({ searchParams }: { searchParams: Promise<{ v?: string | string[] }> }) {
  const { v } = await searchParams;
  const { supabase, viewer } = await loadSession();
  const [header, prices] = await Promise.all([readSiteHeader(supabase, viewer, "/terms"), readPublicPrices(supabase)]);
  const resolved = resolveLegal("terms", "/terms", termsDoc(prices), typeof v === "string" ? v : undefined);
  if (!resolved) notFound();
  return (
    <>
      <SiteHeader {...header} />
      <LegalPage doc={resolved.doc} history={resolved.history} pastVersion={!resolved.current} icon="/img/icon-notice.png" />
      <SiteFooter />
    </>
  );
}
