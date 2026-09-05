import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "../container/Container";
import { ArrowRightIcon } from "../icon/Icon";
import styles from "./section.module.css";

/** 종이 바탕 위에 세로로 쌓이는 한 칸 */
export function Section({
  spacing = "normal",
  flush = false,
  children,
}: {
  spacing?: "normal" | "tight";
  flush?: boolean;
  children: ReactNode;
}) {
  const classes = [spacing === "tight" ? styles.tight : styles.section];
  if (flush) classes.push(styles.flush);
  return (
    <section className={classes.join(" ")}>
      <Container>{children}</Container>
    </section>
  );
}

/** 굵은 제목 + 약한 잉크 부제, 오른쪽에 「전체 보기」 */
export function SectionHead({
  title,
  sub,
  more,
}: {
  title: string;
  sub?: string;
  more?: { href: string; label: string };
}) {
  return (
    <div className={styles.head}>
      <div>
        <h2 className={`h-display ${styles.title}`}>{title}</h2>
        {sub ? <p className={styles.sub}>{sub}</p> : null}
      </div>
      {more ? (
        <Link className={styles.more} href={more.href}>
          {more.label}
          <ArrowRightIcon />
        </Link>
      ) : null}
    </div>
  );
}

export function CardGrid({ columns = 3, children }: { columns?: 2 | 3; children: ReactNode }) {
  return (
    <div className={columns === 3 ? `${styles.grid} ${styles.grid3}` : styles.grid}>{children}</div>
  );
}
