import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "팬꾹 — 크리에이터가 승인한 선물만 배송",
  description: "팬의 선물을 검수하고, 크리에이터의 주소를 노출하지 않고 대신 보내 드립니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
