import type { Metadata } from "next";
import { ResetPasswordPanel } from "@/features/password-reset/ui/reset-password-panel";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 주소창에 링크 값이 있는 화면이라, 이 화면에서 다른 사이트로 나갈 때 주소를 넘기지 않고 검색에도 싣지 않는다.
export const metadata: Metadata = { title: "비밀번호 재설정", referrer: "no-referrer", robots: { index: false, follow: false } };

// 비밀번호 재설정 메일의 링크(session-login INV-L11). 로그인과 상관없이 연다 — 계정은 링크가 정하고, 저장해야 바뀐다.
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  return (
    <>
      <SiteHeader role="guest" />
      <main id="main">
        <ResetPasswordPanel token={token} />
      </main>
      <SiteFooter />
    </>
  );
}
