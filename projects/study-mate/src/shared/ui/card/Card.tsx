import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./card.module.css";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className ? `${styles.card} ${className}` : styles.card}>{children}</div>;
}

/** 카드 전체가 한 곳으로 가는 링크일 때. hover 에서 살짝 들어 올린다. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${styles.card} ${styles.linked}`}>
      {children}
    </Link>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function CardDivider() {
  return <hr className={styles.divider} />;
}
