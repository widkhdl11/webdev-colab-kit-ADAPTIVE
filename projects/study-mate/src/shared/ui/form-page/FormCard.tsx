import type { ReactNode } from "react";
import { Card } from "../card/Card";
import styles from "./form-page.module.css";

/**
 * 폼이 앉는 카드. 공용 카드에 **폼의 안쪽 여백과 제목과의 간격**을 얹은 것뿐이다.
 *
 * 컴포넌트로 두는 이유는 `FormPage` 와 같다 — 그 두 값(`margin-top: 26` · `28px 24`)이
 * 폼 다섯 장의 `.card` 에 **바이트까지 같은 모양으로** 복사돼 있었다(2026-09-06 ui-reviewer).
 * `28px` 은 토큰에 없는 값이라 「일회성은 px 허용」으로 넘어갔던 것인데, 다섯 벌이 된 뒤로는
 * 일회성이 아니다. 여섯 번째 폼이 여기서 물려받으면 그 값은 다시 한 곳에만 있게 된다.
 */
export function FormCard({ children }: { children: ReactNode }) {
  return <Card className={styles.card}>{children}</Card>;
}
