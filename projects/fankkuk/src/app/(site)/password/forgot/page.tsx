import type { Metadata } from "next";
import { PasswordForgotPage } from "@/widgets/password-forgot/ui/password-forgot-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const metadata: Metadata = { title: "비밀번호 찾기" };

// 휴대폰 비밀번호 찾기(session-login INV-L10·L11). 로그인과 상관없이 연다 — 번호로 받은 인증번호를 맞히면 새 비밀번호를 정하고, 받기 응답은 늘 같은 문장이다.
export default function Page() {
  return (
    <>
      <SiteHeader role="guest" />
      <PasswordForgotPage />
      <SiteFooter />
    </>
  );
}
