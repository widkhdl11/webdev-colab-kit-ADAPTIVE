import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveLegal } from "@/widgets/legal/model/legal-versions";
import { privacyDoc } from "@/widgets/legal/model/privacy-doc";
import { PolicyPage } from "@/widgets/legal/ui/policy-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "개인정보처리방침 — 팬꾹" };

// 로그인 없이 열린다. 헤더만 로그인한 사람에 맞춘다(about·support 와 같다). ?v=버전 은 이용약관과 같다.
export default async function Page({ searchParams }: { searchParams: Promise<{ v?: string | string[] }> }) {
  const { v } = await searchParams;
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/privacy");
  const resolved = resolveLegal("privacy", "/privacy", privacyDoc(), typeof v === "string" ? v : undefined);
  if (!resolved) notFound();
  return (
    <>
      <SiteHeader {...header} />
      <PolicyPage kind="privacy" doc={resolved.doc} history={resolved.history} pastVersion={!resolved.current} />
      <SiteFooter />
    </>
  );
}
