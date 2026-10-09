import Link from "next/link";
import type { ReactNode } from "react";
import { CREATOR_MY_MENU, FAN_MY_MENU, MY_PAGE_TITLE, type CreatorMyHref, type FanMyHref } from "@/entities/session/model/my-menu";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { CurrentChipIntoView } from "./current-chip-into-view";
import s from "./my-nav.module.css";

// 「내 팬꾹」 화면들이 같이 쓰는 틀 — 제목 + 왼쪽 메뉴 + 본문 칸. 시안: docs/design/mockups/site/v9-pages/me-b.html
// 팬: 개인정보 · 팔로우한 크리에이터 · 선물 내역 · 받은 역조공 / 크리에이터: 승인 요청 · 보낸 선물 · 보낸 역조공 · 열람 기록 · 주소와 설정.
// PC 는 얼굴 + 닉네임이 붙은 중립 면 카드 한 장, 767px 이하는 차콜 알약 칩 줄(얼굴 칸은 숨김).
// 라우트(app)가 이 틀 안에 각 화면 본문 위젯을 끼운다. 위젯끼리 서로 가져다 쓰지 않게 하려는 배치다.

type Props = { nickname?: string; children: ReactNode } & ({ role: "fan"; current: FanMyHref } | { role: "creator"; current: CreatorMyHref });

const ROLE_LABEL = { fan: "팬", creator: "크리에이터" } as const;

// 메뉴 줄마다 붙는 가는 선 그림(장식). 같은 주소는 같은 그림.
const ICON_PATHS: Record<FanMyHref | CreatorMyHref, ReactNode> = {
  "/me": (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  "/me/following": <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
  "/gifts": (
    <>
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12" />
      <path d="m3.3 7 8.7 5 8.7-5" />
    </>
  ),
  "/me/revgifts": (
    <>
      <path d="M3 11l9-7 9 7v9H3z" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  "/creator/requests": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16 10" />
    </>
  ),
  "/creator/revgifts": (
    <>
      <path d="M3 11l9-7 9 7v9H3z" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  "/creator/log": (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  "/creator/settings": (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
};

function MenuIcon({ href }: { href: FanMyHref | CreatorMyHref }) {
  return (
    <svg className={s.ico} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[href]}
    </svg>
  );
}

export function MyShell({ role, current, nickname, children }: Props) {
  const menu = role === "creator" ? CREATOR_MY_MENU : FAN_MY_MENU;
  return (
    <main id="main">
      <div className={`container ${s.title}`}>
        <h1 className="page-h">{MY_PAGE_TITLE}</h1>
      </div>
      <div className={`container ${s.grid}`}>
        <nav className={s.side} aria-label={`${MY_PAGE_TITLE} 메뉴`}>
          <div className={s.me}>
            <FaceAvatar className={s.face} />
            <div>
              {nickname ? <b>{nickname}님</b> : null}
              <span>{ROLE_LABEL[role]}</span>
            </div>
          </div>
          <ul>
            {menu.map((it) => (
              <li key={it.href}>
                <Link href={it.href} aria-current={it.href === current ? "page" : undefined}>
                  <MenuIcon href={it.href} />
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
          <CurrentChipIntoView />
        </nav>
        <div className={s.body}>{children}</div>
      </div>
    </main>
  );
}
