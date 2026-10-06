import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmEmailPanel } from "@/features/email-confirm/ui/confirm-email-panel";
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
      {viewer?.role === "fan" ? (
        <MyShell role="fan" current="/me">
          <ConfirmEmailPanel token={token} />
        </MyShell>
      ) : viewer ? (
        // 팬이 아닌 계정(크리에이터)에는 팬 메뉴 틀을 씌우지 않는다 — 링크의 계정과 맞는지는 서버가 가린다
        <main id="main">
          <div className="container">
            <ConfirmEmailPanel token={token} />
          </div>
        </main>
      ) : (
        <main id="main">
          <div className="container">
            <h1 className="page-h">이메일 확인</h1>
            <p>
              메일을 받은 계정으로 <Link href="/login">로그인</Link>한 뒤, 메일의 링크를 다시 눌러 주세요.
            </p>
          </div>
        </main>
      )}
      <SiteFooter />
    </>
  );
}
