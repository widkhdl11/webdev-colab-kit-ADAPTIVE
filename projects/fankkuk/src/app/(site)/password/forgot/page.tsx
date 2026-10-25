import type { Metadata } from "next";
import { PasswordForgotPage } from "@/widgets/password-forgot/ui/password-forgot-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "비밀번호 찾기" };

// 비밀번호 재설정 메일 요청(session-login INV-L10). 로그인과 상관없이 연다 — 요청은 아이디+가입 이메일이 정하고, 응답은 늘 같은 문장이다.
export default function Page() {
  return (
    <>
      <SiteHeader role="guest" />
      <PasswordForgotPage />
      <SiteFooter />
    </>
  );
}
