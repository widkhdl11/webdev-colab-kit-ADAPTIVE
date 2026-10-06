import { redirect } from "next/navigation";
import { HOME_PATH, safeNextPath } from "@/entities/session/model/safe-next-path";
import { LoginPage } from "@/widgets/login/ui/login-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 이미 로그인한 사람은 돌아갈 주소(같은 사이트 경로만, session-login INV-L13)나 자기 첫 화면으로 보낸다 — 손님 화면을 보여 주면 로그인이 풀린 것처럼 보인다.
// 돌아갈 주소는 주소창 값 그대로 로그인 요청에 실린다. 검사는 서버의 로그인 처리가 한다.
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = typeof raw === "string" ? raw : undefined;
  const { viewer } = await loadSession();
  const home = signedInHome(viewer);
  if (home) {
    const back = safeNextPath(next);
    redirect(back === HOME_PATH ? home : back);
  }
  return (
    <>
      <SiteHeader role="guest" current="/login" />
      <LoginPage next={next} />
      <SiteFooter />
    </>
  );
}
