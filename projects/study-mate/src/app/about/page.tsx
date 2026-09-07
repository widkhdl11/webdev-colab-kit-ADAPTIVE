import type { Metadata } from "next";
import { readUnreadNotificationCount } from "@/entities/notification";
import { currentUser } from "@/entities/session";
import { ButtonLink } from "@/shared/ui/button/Button";
import { Card, CardBody } from "@/shared/ui/card/Card";
import { Container } from "@/shared/ui/container/Container";
import { Eyebrow } from "@/shared/ui/eyebrow/Eyebrow";
import { CtaCard } from "@/shared/ui/cta-card/CtaCard";
import { CalendarIcon } from "@/shared/ui/icon/Icon";
import { CardGrid, Section, SectionHead } from "@/shared/ui/section/Section";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "소개 — Study Mate" };

// 본문은 요청과 무관하게 같지만 헤더가 "지금 누구인가"를 그린다(로그인 여부·안 읽음 개수).
export const dynamic = "force-dynamic";

const JOBS = [
  {
    title: "찾는다",
    body: "관심 분야와 지역으로 좁혀서 나에게 맞는 모집글만 봅니다. 남은 자리와 모집 상태는 카드에서 바로 보입니다.",
  },
  {
    title: "만든다",
    body: "찾는 스터디가 없으면 직접 엽니다. 스터디를 하나 만들고 모집글을 한 장 붙이면 그게 시작입니다.",
  },
  {
    title: "이어간다",
    body: "신청이 승인되면 그 스터디의 채팅방이 열립니다. 첫 모임을 잡으려고 다른 곳으로 옮겨 갈 일이 없습니다.",
  },
];

const STEPS = [
  {
    title: "발견",
    body: "모집글 목록을 카테고리·지역·모집 상태로 좁혀 훑습니다. 여기까지는 로그인하지 않아도 볼 수 있습니다.",
  },
  {
    title: "신청",
    body: "마음에 드는 스터디에 참가를 신청합니다. 찾는 길에서 로그인이 처음 필요해지는 자리가 이 버튼입니다.",
  },
  {
    title: "승인",
    body: "스터디를 연 사람이 신청을 보고 받거나 거절합니다. 기다리는 동안에도 지금 어느 상태인지는 계속 보입니다.",
  },
  {
    title: "대화",
    body: "승인되면 그 스터디의 채팅방에 들어갑니다. 안 읽은 메시지는 헤더에 숫자로 뜹니다.",
  },
];

const CARES = [
  {
    title: "판단에 필요한 것은 로그인 앞에 둡니다",
    body: "카테고리·지역·남은 자리·모집 상태는 로그인하지 않아도 보입니다. 판단할 정보를 로그인 뒤로 숨기면 찾는 일 자체가 시작되지 못합니다.",
  },
  {
    title: "신청이 지금 어디까지 왔는지 늘 보입니다",
    body: "대기 중인지 승인됐는지 거절됐는지를 모집글의 버튼과 내 프로필 두 곳에서 항상 볼 수 있습니다. 알림도 이 투명성의 일부입니다.",
  },
  {
    title: "AI 는 거들 뿐입니다",
    body: "스터디 추천과 모집글 초안 도우미는 흐름을 돕는 보조 장치입니다. 쓰지 않아도 찾고 신청하고 대화하는 길은 그대로 열려 있습니다.",
  },
];

export default async function AboutPage() {
  const user = await currentUser();
  const unread = user ? await readUnreadNotificationCount() : 0;

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <section className={styles.hero}>
          <Container>
            <Eyebrow>
              <CalendarIcon />
              함께 성장하는 스터디 문화
            </Eyebrow>
            <h1 className={`h-display ${styles.title}`}>
              찾는 곳과
              <br />
              이야기하는 곳이 같습니다
            </h1>
            <p className={styles.sub}>
              Study Mate 는 함께 공부할 사람을 찾고, 참가를 신청하고, 승인되면 그 자리에서
              대화를 시작하는 스터디 매칭 서비스입니다. 스터디를 찾다가 이야기를 시작하려고
              다른 서비스로 옮겨 가는 일이 없도록 만들었습니다.
            </p>
          </Container>
        </section>

        <Section spacing="tight">
          <SectionHead
            title="여기서 하는 일은 셋입니다"
            sub="찾거나, 만들거나, 이어가거나. 어느 쪽으로 들어와도 같은 화면 안에서 끝납니다."
          />
          <CardGrid columns={3}>
            {JOBS.map((job) => (
              <Card key={job.title}>
                <CardBody>
                  <h3 className={styles.cardTitle}>{job.title}</h3>
                  <p className={styles.cardBody}>{job.body}</p>
                </CardBody>
              </Card>
            ))}
          </CardGrid>
        </Section>

        <Section>
          <SectionHead
            title="신청하면 이렇게 흘러갑니다"
            sub="네 걸음이고, 네 걸음 모두 이 서비스 안에 있습니다."
          />
          <ol className={styles.steps} role="list">
            {STEPS.map((step, i) => (
              <li key={step.title} className={styles.step}>
                {/* 숨기지 않는다 — 전역 리셋이 ul/ol 의 list-style 을 없애 순서를 읽어
                    주는 표지가 이 숫자뿐이다 */}
                <span className={`num ${styles.stepNo}`}>{i + 1}</span>
                <div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.cardBody}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section>
          <SectionHead title="무엇을 신경 썼나" />
          <ul className={styles.cares} role="list">
            {CARES.map((care) => (
              <li key={care.title} className={styles.care}>
                <h3 className={styles.careTitle}>{care.title}</h3>
                <p className={styles.cardBody}>{care.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* 제품 원칙 5「정직한 데모」— 없는 실적을 꾸며내지 않는다. 소개 화면은 그 원칙이
            가장 먼저 시험받는 자리라, 자랑 대신 밝힐 것을 적는다 */}
        <Section>
          <SectionHead title="밝혀 둘 것" />
          <Card>
            <CardBody>
              <ul className={styles.notes} role="list">
                <li>
                  개인 포트폴리오로 만든 데모입니다. 지금 열려 있는 스터디와 사람들은 화면을
                  채우려고 미리 넣어 둔 예시 데이터이고, 진짜 모임이 아닙니다.
                </li>
                <li>
                  기능은 예시가 아닙니다. 회원가입·모집글·신청·승인·채팅은 실제로 동작하고,
                  직접 스터디를 열어 처음부터 끝까지 해 보실 수 있습니다.
                </li>
                <li>
                  실제로 운영한 지표나 이용 후기는 없습니다. 없는 실적을 화면에 지어내지
                  않습니다.
                </li>
                <li>결제와 과금은 없습니다. 모든 기능이 무료입니다.</li>
              </ul>
            </CardBody>
          </Card>
        </Section>

        <Section flush>
          {/* 「잉크 행동 규칙」— 소개를 다 읽은 사람이 지금 할 일은 찾는 쪽이다.
              만드는 쪽은 이미 찾을 스터디가 정해진 사람의 길이라 한 걸음 뒤에 있다 */}
          <CtaCard
            title="어떤 스터디가 열려 있는지 볼까요?"
            sub="지금 모집 중인 스터디부터 봅니다. 찾는 것이 없으면 직접 열어도 됩니다."
          >
            <ButtonLink href="/posts" tone="ink" size="lg">
              모집글 둘러보기
            </ButtonLink>
            <ButtonLink href="/studies/create" size="lg">
              스터디 만들기
            </ButtonLink>
          </CtaCard>
        </Section>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
