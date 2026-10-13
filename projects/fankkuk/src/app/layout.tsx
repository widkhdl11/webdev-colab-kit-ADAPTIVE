import type { Metadata } from "next";
import { PROMISE } from "@/shared/config/site-copy";
import { TestSiteBand } from "@/shared/ui/test-site-band";
import "./globals.css";

export const metadata: Metadata = {
  title: "팬꾹 — 크리에이터가 승인한 선물만 배송",
  description: `${PROMISE.approval} ${PROMISE.inspection} ${PROMISE.address}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: <head> 의 sidebar-boot.js 가 <html> 에 다는 data-collapsed 는 서버 HTML 에 없다
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 사이드바 접힘 상태를 첫 그림 전에 단다(public/sidebar-boot.js). 비동기로 받으면 그린 뒤에 줄어드는 게 보여 일부러 동기로 부른다 */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/sidebar-boot.js" />
        {/* 제목 글꼴 티머니 둥근바람(v18) — @font-face 는 shared/ui/base.css. 첫 화면에서 글꼴이 늦게 바뀌지 않게 미리 받는다 */}
        <link rel="preload" href="/fonts/TmoneyRoundWindRegular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/TmoneyRoundWindExtraBold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* 본문·로고 글꼴 Pretendard(v18). 압축본(.min.css)은 jsDelivr 가 그때그때 만들어 해시가 바뀔 수 있어, 고정된 원본 파일에 무결성 해시를 건다 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
          integrity="sha384-5BlC3z5PiUASCwi5iNqbsXbtE1SBi8nn1Upz4JWJg2upbZKNNDXLRPKEcn79qArn"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          본문 바로가기
        </a>
        <TestSiteBand />
        {children}
      </body>
    </html>
  );
}
