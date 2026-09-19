import type { ReactNode } from "react";
import type { Metadata } from "next";
// 토큰이 먼저다 — 전역 스타일이 var(--...) 로 이 값을 쓴다.
import "@/shared/ui/tokens.css";
import "./globals.css";
import { AppProviders } from "@/shared/providers/app-providers";
import { SiteFooter, SiteHeader } from "@/widgets/site-chrome";

export const metadata: Metadata = {
  title: "signal",
  description: "AI·IT 소식을 신호만 골라 보는 개인용 리더",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppProviders>
          <SiteHeader />
          {children}
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
