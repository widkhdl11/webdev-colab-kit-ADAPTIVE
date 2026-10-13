import type { Metadata } from "next";
import { PROMISE } from "@/shared/config/site-copy";
import { TestSiteBand } from "@/shared/ui/test-site-band";
import "./globals.css";

export const metadata: Metadata = {
  title: "팬꾹 — 크리에이터가 승인한 선물만 배송",
  description: `${PROMISE.approval} ${PROMISE.inspection} ${PROMISE.address}`,
};

// 로그인 후 사이드바 접힘 상태를 첫 그림 전에 단다 — 안 그러면 펼친 240 으로 그렸다가 64 로 줄어드는 게 보인다.
// 저장값이 없으면 1024 이하에서 접힘(design-rules 00절). 값을 쓰는 쪽은 widgets/site-header/ui/app-sidebar.tsx
const SIDEBAR_BOOT = `try{var s=localStorage.getItem("sidebar-collapsed");if(s==="1"||(s!=="0"&&matchMedia("(max-width: 1024px)").matches))document.documentElement.setAttribute("data-collapsed","1")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: 위 스크립트가 <html> 에 다는 data-collapsed 는 서버 HTML 에 없다
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT }} />
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
