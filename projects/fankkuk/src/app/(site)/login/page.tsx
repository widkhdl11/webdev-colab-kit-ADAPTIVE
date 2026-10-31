import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginNoticeOf } from "@/entities/session/model/login-link";
import { LOGIN_HINT_HEADER, LOGIN_HINT_LINK, sessionEndNoticeOf } from "@/entities/session/model/session-end-notice";
import { HOME_PATH, safeNextPath } from "@/entities/session/model/safe-next-path";
import { LoginPage } from "@/widgets/login/ui/login-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 이미 로그인한 사람은 돌아갈 주소(같은 사이트 경로만, session-login INV-L13)나 자기 첫 화면으로 보낸다 — 손님 화면을 보여 주면 로그인이 풀린 것처럼 보인다.
// 돌아갈 주소는 주소창 값 그대로 로그인 요청에 실린다. 검사는 서버의 로그인 처리가 한다.
// link: 알림톡 로그인 링크를 못 쓰고 온 표시(link-login INV-K4) — 정해 둔 값일 때만 안내 하나를 보인다.
// reason: 로그인 유지 기간으로 끝나 온 표시(session-login INV-L17) — 누구에게나 같은 값 하나. 계정·역할 값은 주소에 없다.
// 알림톡 안내 줄은 proxy 가 짧은 HttpOnly 쿠키를 읽어 넘긴 요청 머리로만 정한다(브라우저가 보낸 같은 머리는 proxy 가 지운다).
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[]; link?: string | string[]; reason?: string | string[] }> }) {
  const params = await searchParams;
  const raw = params.next;
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
      <LoginPage next={next} notice={loginNoticeOf(params.link) ?? sessionEndNoticeOf(params.reason, (await headers()).get(LOGIN_HINT_HEADER) === LOGIN_HINT_LINK)} />
      <SiteFooter />
    </>
  );
}
