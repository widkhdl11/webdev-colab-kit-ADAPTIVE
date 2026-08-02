import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/shared/providers/app-providers";

export const metadata: Metadata = {
  title: "signal",
  description: "AI·IT 소식을 신호만 골라 보는 개인용 리더",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
