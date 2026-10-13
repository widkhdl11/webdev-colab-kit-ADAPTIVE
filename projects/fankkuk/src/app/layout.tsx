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
    <html lang="ko">
      <head>
        {/* 본문 글꼴 티머니 둥근바람(재디자인 v11) — @font-face 는 shared/ui/base.css. 첫 화면에서 글꼴이 늦게 바뀌지 않게 미리 받는다 */}
        <link rel="preload" href="/fonts/TmoneyRoundWindRegular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/TmoneyRoundWindExtraBold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* 로고 글자 전용 Pretendard(티머니는 로고에 쓸 수 없다). 압축본(.min.css)은 jsDelivr 가 그때그때 만들어 해시가 바뀔 수 있어, 고정된 원본 파일에 무결성 해시를 건다 */}
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
