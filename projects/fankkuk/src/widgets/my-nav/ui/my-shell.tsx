import Link from "next/link";
import type { ReactNode } from "react";
import s from "./my-nav.module.css";

// 내 정보 화면 세 개(개인정보 · 팔로우한 크리에이터 · 선물 내역)가 같이 쓰는 틀 — 제목 + 메뉴 + 본문 칸.
// 라우트(app)가 이 틀 안에 각 화면 본문 위젯을 끼운다. 위젯끼리 서로 가져다 쓰지 않게 하려는 배치다.

const MY_MENU = [
  { href: "/me", label: "개인정보" },
  { href: "/me/following", label: "팔로우한 크리에이터" },
  { href: "/gifts", label: "선물 내역" },
] as const;

export type MyMenuHref = (typeof MY_MENU)[number]["href"];

export function MyShell({ current, children }: { current: MyMenuHref; children: ReactNode }) {
  return (
    <main id="main">
      <div className={`container ${s.title}`}>
        <h1 className="page-h">내 정보</h1>
      </div>
      <div className={`container ${s.grid}`}>
        <nav className={s.side} aria-label="내 정보 메뉴">
          <ul>
            {MY_MENU.map((it) => (
              <li key={it.href}>
                <Link href={it.href} aria-current={it.href === current ? "page" : undefined}>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {children}
      </div>
    </main>
  );
}
