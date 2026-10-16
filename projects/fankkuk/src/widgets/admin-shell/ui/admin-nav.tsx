"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_MENU, adminPlaceOf } from "../model/admin-menu";
import s from "./admin-shell.module.css";

// 지금 화면 표시가 주소에 따라 바뀌는 두 곳 — 왼쪽 메뉴의 현재 항목, 위 줄의 현재 위치.
// 레이아웃은 화면을 옮겨도 다시 그려지지 않아 주소를 브라우저에서 읽는다.

export function AdminNav() {
  const current = adminPlaceOf(usePathname())?.item.href;
  return (
    <nav className={s.sideNav} aria-label="화면 이동">
      {ADMIN_MENU.map((g) => (
        <div key={g.name} className={s.sideGroup}>
          <h2>{g.name}</h2>
          <ul>
            {g.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} aria-current={it.href === current ? "page" : undefined}>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminCrumb() {
  const place = adminPlaceOf(usePathname());
  if (!place) return <p className={s.crumb}>운영자 화면</p>;
  return (
    <p className={s.crumb}>
      {place.group} / <strong>{place.item.label}</strong>
    </p>
  );
}
