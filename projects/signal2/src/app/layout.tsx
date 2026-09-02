import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "signal — AI·IT 소식에서 신호만",
  description: "AI·IT 소식에서 신호만 골라 한곳에서 훑는 개인용 소식 모음.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard 하나만 쓴다(코드 블록만 모노). 지금은 CDN 이라 오프라인에서 시스템 폰트로 떨어진다. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        />
      </head>
      <body>
        <header className={styles.top}>
          <div className={styles.topInner}>
            <Link className={styles.logo} href="/">
              signal<span className={styles.logoDot}>.</span>
            </Link>
            <span className={styles.tagline}>
              AI·IT 소식에서 신호만 골라 훑는 곳
            </span>
          </div>
        </header>

        <main className={`${styles.wrap} ${styles.main}`}>{children}</main>

        <footer className={styles.bottom}>
          <div className={styles.wrap}>
            signal — 개인용 소식 리더 · 수집된 원문의 저작권은 각 출처에 있습니다.
          </div>
        </footer>
      </body>
    </html>
  );
}
