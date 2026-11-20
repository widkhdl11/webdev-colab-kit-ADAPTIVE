import Link from "next/link";
import type { ReactNode } from "react";
import s from "./empty-state.module.css";

// 공용 빈 상태 — 흰 카드 가운데에 그림 · 제목 · 한 줄 · 다음 행동 하나(design-prompt 9-2).
// 문구와 행동은 부르는 쪽이 정한다. 행동이 없는 빈 상태는 action 을 빼면 된다.
export function EmptyState({
  id,
  art,
  title,
  body,
  action,
  headingLevel = 2,
  className,
  testId,
}: {
  /** 제목 id — 카드가 이 제목으로 이름 붙는다 */
  id: string;
  /** 장식 그림 주소(낭독하지 않는다) */
  art: string;
  title: string;
  body?: ReactNode;
  action?: { href: string; label: string };
  headingLevel?: 2 | 3;
  className?: string;
  testId?: string;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className={`card ${s.root}${className ? ` ${className}` : ""}`} aria-labelledby={id} data-testid={testId}>
      <img className={s.art} src={art} alt="" aria-hidden="true" width={72} height={72} />
      <Heading className={s.title} id={id}>
        {title}
      </Heading>
      {body ? <p className={s.body}>{body}</p> : null}
      {action ? (
        <Link className="btn btn--line" href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}
