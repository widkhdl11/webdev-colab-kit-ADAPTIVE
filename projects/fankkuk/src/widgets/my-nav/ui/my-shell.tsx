import Link from "next/link";
import type { ReactNode } from "react";
import { CREATOR_MY_MENU, FAN_MY_MENU, MY_PAGE_TITLE, type CreatorMyHref, type FanMyHref } from "@/entities/session/model/my-menu";
import s from "./my-nav.module.css";

// 「내 팬꾹」 화면들이 같이 쓰는 틀 — 제목 + 왼쪽 메뉴 + 본문 칸.
// 팬: 개인정보 · 팔로우한 크리에이터 · 선물 내역 · 받은 역조공 / 크리에이터: 승인 요청 · 보낸 역조공 · 열람 기록 · 주소와 설정.
// 라우트(app)가 이 틀 안에 각 화면 본문 위젯을 끼운다. 위젯끼리 서로 가져다 쓰지 않게 하려는 배치다.

type Props = { role: "fan"; current: FanMyHref; children: ReactNode } | { role: "creator"; current: CreatorMyHref; children: ReactNode };

export function MyShell({ role, current, children }: Props) {
  const menu = role === "creator" ? CREATOR_MY_MENU : FAN_MY_MENU;
  return (
    <main id="main">
      <div className={`container ${s.title}`}>
        <h1 className="page-h">{MY_PAGE_TITLE}</h1>
      </div>
      <div className={`container ${s.grid}`}>
        <nav className={s.side} aria-label={`${MY_PAGE_TITLE} 메뉴`}>
          <ul>
            {menu.map((it) => (
              <li key={it.href}>
                <Link href={it.href} aria-current={it.href === current ? "page" : undefined}>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={s.body}>{children}</div>
      </div>
    </main>
  );
}
