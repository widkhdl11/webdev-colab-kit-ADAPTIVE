import type { Metadata } from "next";
import { Jua } from "next/font/google";
import "./globals.css";

// 주아체는 자가호스팅한다 — design-rules 「글자」. next/font 가 빌드 시점에 받아 같이 낸다.
const jua = Jua({ weight: "400", subsets: ["latin"], variable: "--font-jua", display: "swap" });

export const metadata: Metadata = {
  title: "Study Mate — 함께 성장하는 스터디 문화",
  description:
    "관심 분야와 지역으로 스터디를 찾고, 신청하고, 승인되면 바로 채팅방에서 시작합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={jua.variable}>
      <head>
        {/*
          Pretendard 는 구글 폰트에 없어 CDN 스타일시트로 받는다. 승인된 시안 3장이
          쓰던 것과 같은 출처·같은 버전이다(가변 폰트 동적 서브셋).
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin=""
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
