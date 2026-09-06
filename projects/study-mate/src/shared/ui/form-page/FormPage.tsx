import type { ReactNode } from "react";
import { Container } from "../container/Container";
import styles from "./form-page.module.css";

/**
 * 폼 한 장의 껍데기. 화면 목록이 폼에 배정한 것은 상세·작업 언어의 **좁은 변형**이라
 * (docs/IA.md 「화면 언어는 세 종류뿐이다」) 본문 폭과 제목 크기가 상세 화면과 다르다.
 *
 * 컴포넌트로 두는 이유: 그 두 값이 이미 폼 세 장에 각각 복사돼 있었고, 네 번째·다섯 번째
 * 폼이 그것을 안 물려받아 상세 화면 값(전폭·42px)으로 들어갔다(2026-09-06 ui-reviewer).
 * 값이 한 곳에 있으면 다음 폼은 물려받는 것 말고 할 수 있는 일이 없다.
 */
export function FormPage({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <Container>
      <div className={styles.page}>
        <div className={styles.head}>
          <h1 className={`h-display ${styles.title}`}>{title}</h1>
          {sub ? <p className={styles.sub}>{sub}</p> : null}
        </div>
        {children}
      </div>
    </Container>
  );
}
