import { redirect } from "next/navigation";
import { LoginPage } from "@/widgets/login/ui/login-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 이미 로그인한 사람은 자기 첫 화면으로 보낸다 — 손님 화면을 보여 주면 로그인이 풀린 것처럼 보인다.
export default async function Page() {
  const { viewer } = await loadSession();
  const home = signedInHome(viewer);
  if (home) redirect(home);
  return (
    <>
      <SiteHeader role="guest" current="/login" />
      <LoginPage />
      <SiteFooter />
    </>
  );
}
