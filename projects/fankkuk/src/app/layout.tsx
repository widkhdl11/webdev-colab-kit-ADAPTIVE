import type { Metadata } from "next";
import { TestSiteBand } from "@/shared/ui/test-site-band";
import "./globals.css";

export const metadata: Metadata = {
  title: "팬꾹 — 크리에이터가 승인한 선물만 배송",
  description: "팬의 선물을 검수하고, 크리에이터의 주소를 노출하지 않고 대신 보내 드립니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 압축본(.min.css)은 jsDelivr 가 그때그때 만들어 해시가 바뀔 수 있어, 고정된 원본 파일에 무결성 해시를 건다 */}
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
