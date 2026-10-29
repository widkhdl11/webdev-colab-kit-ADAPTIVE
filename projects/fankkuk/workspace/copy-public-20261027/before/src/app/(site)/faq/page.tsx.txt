import type { Metadata } from "next";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { faqDoc } from "@/widgets/legal/model/faq-doc";
import { FaqPage } from "@/widgets/legal/ui/faq-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "자주 묻는 질문 — 팬꾹" };

// 로그인 없이 열린다. 헤더만 로그인한 사람에 맞춘다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const [header, prices] = await Promise.all([readSiteHeader(supabase, viewer, "/faq"), readPublicPrices(supabase)]);
  const faq = faqDoc(prices);
  return (
    <>
      <SiteHeader {...header} />
      <FaqPage {...faq} />
      <SiteFooter />
    </>
  );
}
