import type { Metadata } from "next";
import { ConfirmEmailPanel, ConfirmEmailSignInNotice } from "@/features/email-confirm/ui/confirm-email-panel";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 주소창에 링크 값이 있는 화면이라, 이 화면에서 다른 사이트로 나갈 때 주소를 넘기지 않는다.
export const metadata: Metadata = { referrer: "no-referrer" };

// 확인 메일의 링크(my-account INV-A7). 링크의 계정으로 로그인해 있어야 바뀐다 — 로그인하지 않았으면 먼저 로그인을 안내한다.
// 링크 값의 꼴 검사·만료·계정 일치는 서버와 DB 가 한다. 이 화면은 값을 버튼에 실어 보내기만 한다.
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { supabase, viewer } = await loadSession();
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const header = await readSiteHeader(supabase, viewer, "/me");
  return (
    <>
      <SiteHeader {...header} />
      {viewer ? (
        // 로그인한 계정은 역할과 상관없이 다른 설정 화면과 같은 880 틀(왼쪽 시작선). 제목 h1 은 패널이 하나만 그린다.
        // 링크의 계정과 맞는지는 서버가 가린다
        <MyShell width="list">
          <ConfirmEmailPanel token={token} />
        </MyShell>
      ) : (
        <main id="main" className="page-centered">
          <div>
            <div className="col">
              <ConfirmEmailSignInNotice loginHref="/login" />
            </div>
          </div>
        </main>
      )}
      <SiteFooter />
    </>
  );
}
