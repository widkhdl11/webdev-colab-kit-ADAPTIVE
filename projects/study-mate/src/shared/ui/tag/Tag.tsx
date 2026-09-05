import type { CSSProperties, ReactNode } from "react";
import { highlightVar, type Highlight } from "../highlight";
import styles from "./tag.module.css";

/** 카테고리 라벨. 모집 상태와 색이 겹쳐도 모양(사각)으로 구분된다. */
export function Tag({ color, children }: { color: Highlight; children: ReactNode }) {
  return (
    <span className={styles.tag} style={{ "--fill": highlightVar(color) } as CSSProperties}>
      {children}
    </span>
  );
}
