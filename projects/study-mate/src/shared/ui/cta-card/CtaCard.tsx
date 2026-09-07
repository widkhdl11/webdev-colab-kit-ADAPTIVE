import type { ReactNode } from "react";
import { Card } from "../card/Card";
import styles from "./cta-card.module.css";

/**
 * 랜딩 언어의 닫는 칸 — 굵은 제목 + 약한 잉크 한 줄 + 가운데 정렬 행동 버튼.
 *
 * 홈과 소개가 같은 값을 각각 들고 있던 것을 모았다. 값이 두 벌이면 한쪽만 고쳐지고,
 * 그 어긋남은 두 화면을 나란히 놓기 전까지 아무도 못 본다 (폼 카드 껍데기와 같은 자리).
 *
 * 「잉크 행동 규칙」은 이 컴포넌트가 강제하지 않는다 — 어느 버튼이 잉크인지는
 * **지금 이 화면에서 해야 할 일**이 정하는 것이라 부르는 쪽만 안다.
 *
 * 넘기는 버튼은 `size="lg"` 다. 이건 화면의 판단이 아니라 이 칸의 값인데 지금은
 * 부르는 쪽에 적혀 있다 — 빠뜨리면 조용히 `md` 로 작게 그려진다.
 */
export function CtaCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <Card className={styles.cta}>
      <h2 className={`h-display ${styles.title}`}>{title}</h2>
      {sub ? <p className={styles.sub}>{sub}</p> : null}
      <div className={styles.actions}>{children}</div>
    </Card>
  );
}
