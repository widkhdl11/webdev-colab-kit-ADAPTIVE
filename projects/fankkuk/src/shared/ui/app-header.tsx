import Link from "next/link";
import s from "./screen.module.css";

export function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--brand)" />
      <path d="M16 24C12 21 7 18 7 13a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5-5 8-9 11Z" fill="var(--on-brand)" />
    </svg>
  );
}

/** 앱 화면 위 띠. 오른쪽에는 그 화면에서 가장 자주 가는 곳 하나만 둔다. */
export function AppHeader({ link }: { link?: { href: string; label: string } }) {
  return (
    <header className={s.top}>
      <Link className={s.logo} href="/" aria-label="팬꾹 홈">
        <Logo />
        팬꾹
      </Link>
      {link ? (
        <Link className={s["top-link"]} href={link.href}>
          {link.label}
        </Link>
      ) : null}
    </header>
  );
}
