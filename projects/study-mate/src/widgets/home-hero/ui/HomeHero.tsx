import { Container } from "@/shared/ui/container/Container";
import { ButtonLink } from "@/shared/ui/button/Button";
import { Eyebrow } from "@/shared/ui/eyebrow/Eyebrow";
import { ArrowRightIcon, CalendarIcon, CheckIcon } from "@/shared/ui/icon/Icon";
import { WeeklyPlanner, type PlannerBlock } from "./WeeklyPlanner";
import styles from "./home-hero.module.css";

const PROMISES = [
  <>
    카테고리와 지역으로 좁혀서 <b className="mark">나에게 맞는 스터디</b>만 봅니다
  </>,
  <>신청한 뒤 지금 대기 중인지 승인됐는지 항상 보입니다</>,
  <>승인되면 같은 자리에서 채팅으로 첫 모임을 잡습니다</>,
];

/**
 * 홈의 첫 화면. 오른쪽 플래너는 로그인한 사람에게는 자기 일정이고,
 * 비로그인에게는 이 서비스가 무엇인지 보여주는 예시다 — 어느 쪽인지 캡션이 밝힌다.
 */
export function HomeHero({
  categoryCount,
  planner,
  plannerCaption,
  plannerTitle,
  weekOf,
}: {
  categoryCount: number;
  planner: readonly PlannerBlock[];
  plannerCaption?: string;
  plannerTitle?: string;
  weekOf: Date;
}) {
  return (
    <section className={styles.hero}>
      <Container className={styles.grid}>
        <div>
          <Eyebrow>
            <CalendarIcon />
            함께 성장하는 스터디 문화
          </Eyebrow>

          <h1 className={`h-display ${styles.title}`}>
            이번 주,
            <br />
            어느 칸을 채울까?
          </h1>

          <p className={styles.sub}>
            관심 분야와 지역으로 스터디를 찾고, 신청하고, 승인되면 바로 채팅방에서 시작합니다.
          </p>

          <ul className={styles.checklist}>
            {PROMISES.map((text, i) => (
              <li key={i}>
                <span className={styles.check} aria-hidden="true">
                  <CheckIcon />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <ButtonLink href="/posts" tone="ink" size="lg">
              스터디 찾기
              <ArrowRightIcon size={18} />
            </ButtonLink>
            <ButtonLink href="/studies/create" size="lg">
              스터디 만들기
            </ButtonLink>
          </div>

          {/* 제품 원칙 5「정직한 데모」— 실적 수치는 넣지 않는다. 사실인 것만 */}
          <p className={styles.facts}>
            <span>
              <strong className="num">{categoryCount}</strong>개 대분류
            </span>
            <span>지역별 오프라인 탐색</span>
            <span>신청부터 채팅까지 한 곳에서</span>
          </p>
        </div>

        <WeeklyPlanner
          blocks={planner}
          weekOf={weekOf}
          caption={plannerCaption}
          title={plannerTitle}
        />
      </Container>
    </section>
  );
}
