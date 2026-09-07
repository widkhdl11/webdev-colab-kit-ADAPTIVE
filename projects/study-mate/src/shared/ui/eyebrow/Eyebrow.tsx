import type { ReactNode } from "react";
import styles from "./eyebrow.module.css";

/**
 * 랜딩 언어의 여는 표 — 히어로 제목 위에 놓이는 알약. 아이콘은 부르는 쪽이 넘긴다.
 *
 * 홈과 소개가 같은 값을 각각 들고 있던 것을 모았다(닫는 칸을 `CtaCard` 로 모은 것과 같은
 * 이유다). 두 화면의 히어로가 위아래로 이어지는 같은 언어라, 한쪽에서 테두리나 여백을
 * 고치면 다른 쪽이 조용히 어긋난다.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className={styles.eyebrow}>{children}</p>;
}
