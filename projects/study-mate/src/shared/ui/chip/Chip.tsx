import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { highlightVar, type Highlight } from "../highlight";
import styles from "./chip.module.css";

const fill = (color: Highlight) => ({ "--fill": highlightVar(color) }) as CSSProperties;

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

/** 눌린 상태가 주소로 표현되는 칩(목록 필터·홈의 카테고리 바로가기) */
export function ChipLink({
  href,
  color,
  selected = false,
  children,
}: {
  href: string;
  color: Highlight;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={styles.chip}
      style={fill(color)}
      aria-current={selected ? "true" : undefined}
    >
      <span className={styles.swatch} aria-hidden="true" />
      {children}
    </Link>
  );
}
