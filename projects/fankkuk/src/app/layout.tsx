import type { Metadata } from "next";
import { IntentPrefetch } from "@/shared/ui/intent-prefetch";
import { HeaderMemoryProvider } from "@/widgets/site-header/model/header-memory";
import "./globals.css";

// 사이트 주소 — 공개 이미지(opengraph-image·twitter-image)의 전체 주소를 만드는 기준. 이미 쓰는 서버 설정값 APP_ORIGIN(메일 링크·시험 사이트 판정과 같은 값)을 쓴다.
// 없으면 Vercel 이 넣어 주는 운영 주소, 그것도 없으면 로컬. 아이콘·미리보기 이미지 태그는 src/app 의 파일 규칙이 만든다(2026-10-16 로고 교체).
// 주소 꼴이 아닌 값은 건너뛴다 — 여기서 new URL 이 던지면 모든 페이지가 그려지지 않는다(보안 리뷰 2026-10-16 하).
function siteOrigin(): URL {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  for (const candidate of [process.env.APP_ORIGIN, vercel ? `https://${vercel}` : undefined]) {
    if (candidate && URL.canParse(candidate)) return new URL(candidate);
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  title: "팬꾹",
  description: "주소 노출 없이 전하는 팬 선물 배송 대행",
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
        {/* 페이지를 옮기는 동안 로딩 화면이 마지막 상단 바를 그대로 보여 주도록 그 값을 기억한다(widgets/site-header) */}
        <HeaderMemoryProvider>{children}</HeaderMemoryProvider>
        {/* 링크에 마우스를 올리면 그 페이지를 통째로 미리 받는다(shared/ui/intent-prefetch) */}
        <IntentPrefetch />
      </body>
    </html>
  );
}
