import Link from "next/link";
import type { ReactNode } from "react";
import { AdminCrumb, AdminNav } from "./admin-nav";
import s from "./admin-shell.module.css";

// 관리자 틀 (design-rules 8절, 시안 admin/*.html). 왼쪽 세로 메뉴 + 위 줄(현재 위치 · 운영자 닉네임 · 대표/직원 배지) + 본문.
// 사이트 헤더·푸터는 없다. 1024px 미만에서는 틀 대신 「PC에서 써 주세요」 안내만 보인다.
// 사람은 닉네임으로만 보인다(INV-K8). 역할 배지는 DB 판정(is_owner) 결과다 — 시안의 보기 전환은 없다.

type Props = { nickname: string; access: "staff" | "owner"; children: ReactNode };

export function AdminShell({ nickname, access, children }: Props) {
  const initial = Array.from(nickname)[0] ?? "?";
  return (
    <div className={s.root}>
      <div className={s.pcOnly}>
        <h1>PC에서 써 주세요</h1>
        <p className={s.sub}>관리자 화면은 넓은 화면에서 쓰도록 만들었어요. 1024px 이상 화면에서 열어 주세요.</p>
      </div>
      <aside className={s.side} aria-label="관리자 메뉴">
        <Link className={s.sideLogo} href="/admin">
          <span className={s.mark}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.8 6.6 4.8c2 0 3.6 1.1 5.4 3 1.8-1.9 3.4-3 5.4-3 3.6 0 5.7 3.6 4.2 7C19.5 16.4 12 21 12 21z" />
            </svg>
          </span>
          팬꾹<small>관리자</small>
        </Link>
        <AdminNav />
      </aside>
      <div className={s.main}>
        <header className={s.topbar}>
          <AdminCrumb />
          <div className={s.topbarRight}>
            <span className={s.who}>
              <span className={s.face} aria-hidden="true">
                {initial}
              </span>
              <span className={s.nm}>{nickname} 님</span>
              <span className={access === "owner" ? s.badge : `${s.badge} ${s.badgeStaff}`}>{access === "owner" ? "대표" : "직원"}</span>
            </span>
          </div>
        </header>
        <main id="main" className={s.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
