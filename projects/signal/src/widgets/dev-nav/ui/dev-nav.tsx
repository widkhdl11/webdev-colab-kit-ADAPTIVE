import Link from "next/link";
import styles from "./dev-nav.module.css";

/**
 * 개발자 대시보드의 탭 줄 — 수집 파이프라인 · 판정 검토(2026-09-24).
 * 두 화면 모두 이 PC 의 개발 서버에서만 열린다(배포본은 404).
 */
const TABS = [
  { key: "ingest", href: "/dev/ingest", label: "수집 파이프라인" },
  { key: "review", href: "/dev/ingest/review", label: "판정 검토" },
] as const;

export type DevTab = (typeof TABS)[number]["key"];

export function DevNav({ current }: { current: DevTab }) {
  return (
    <nav className={styles.nav} aria-label="개발자 화면">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className={styles.tab} aria-current={t.key === current ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
