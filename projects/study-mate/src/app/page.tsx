import { Suspense } from "react";
import { categoryColor, readTopCategories } from "@/entities/category";
import { readUnreadNotificationCount } from "@/entities/notification";
import { readLatestPosts } from "@/entities/post";
import { currentUser } from "@/entities/session";
import { readMySchedule, readSampleSchedule, type ScheduledSlot } from "@/entities/study";
import { ButtonLink } from "@/shared/ui/button/Button";
import { ChipLink, ChipRow } from "@/shared/ui/chip/Chip";
import { CtaCard } from "@/shared/ui/cta-card/CtaCard";
import { ErrorBoundary } from "@/shared/ui/error-boundary/ErrorBoundary";
import { Section, SectionHead } from "@/shared/ui/section/Section";
import { HomeHero, type PlannerBlock } from "@/widgets/home-hero";
import { PostGrid } from "@/widgets/post-grid";
// 배럴을 안 지난다 — 그 이유는 `widgets/post-grid/index.ts` 에 있다
import {
  RecommendedSection,
  RecommendedSectionPending,
} from "@/widgets/post-grid/ui/RecommendedSection";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";

// 발견 화면이라 로그인 없이 열린다. 다만 위쪽 플래너는 "지금 누구인가"에 따라 달라지므로
// 요청마다 새로 그린다 — 캐시하면 남의 일정이 보인다.
export const dynamic = "force-dynamic";

function toBlocks(slots: readonly ScheduledSlot[]): PlannerBlock[] {
  return slots.map((s) => ({
    key: `${s.studyId}-${s.weekday}-${s.startsAt}`,
    weekday: s.weekday,
    title: s.studyTitle,
    startsAt: s.startsAt,
    color: categoryColor(s.categoryId),
  }));
}

export default async function HomePage() {
  const user = await currentUser();

  const [categories, posts, unread] = await Promise.all([
    readTopCategories(),
    readLatestPosts(3),
    user ? readUnreadNotificationCount() : Promise.resolve(0),
  ]);

  const mine = user ? await readMySchedule(user.id) : [];
  const usingSample = mine.length === 0;
  const slots = usingSample ? await readSampleSchedule(4) : mine;

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <HomeHero
          categoryCount={categories.length}
          planner={toBlocks(slots)}
          weekOf={new Date()}
          plannerTitle={usingSample ? "이번 주 스터디" : "이번 주 계획"}
          plannerCaption={
            usingSample
              ? "지금 모집 중인 스터디의 실제 모임 시간입니다. 참여하면 여기가 내 계획표가 됩니다"
              : "블록 색은 카테고리 색과 같습니다"
          }
        />

        <Section spacing="tight">
          <SectionHead
            title="무엇을 공부하시나요?"
            sub="대분류 8종은 서로 겹치지 않는 형광펜 색을 하나씩 갖습니다."
          />
          <ChipRow>
            {categories.map((c) => (
              <ChipLink key={c.id} href={`/posts?category=${c.id}`} color={categoryColor(c.id)}>
                {c.name}
              </ChipLink>
            ))}
          </ChipRow>
        </Section>

        <Section>
          <SectionHead
            title="이번 주 새로 열린 스터디"
            sub="방금 모집을 시작한 스터디입니다."
            more={{ href: "/posts", label: "모집글 전체 보기" }}
          />
          <PostGrid posts={posts} empty="아직 열린 스터디가 없습니다. 첫 스터디를 만들어 보세요." />
        </Section>

        {/* 추천은 모델을 기다리므로 **여기만 나중에 채워진다** (INV-G5). 이 경계 밖의
            구역들은 모델과 무관하게 먼저 그려지고, 모델이 느리거나 죽어도 홈은 뜬다.
            자리 표시가 카드와 비슷한 높이를 차지해서, 채워질 때 아래가 크게 안 밀린다.

            **경계가 둘인 이유**: 지연 경계는 던져진 약속만 잡는다. 후보를 읽다 던지면
            그 오류는 위로 계속 올라가 홈 전체를 죽인다 — 그래서 오류 경계가 바깥에 있다.
            추천은 곁다리라 실패하면 그 구역만 조용히 없어지는 편이 낫다 */}
        <ErrorBoundary label="recommend" fallback={null}>
          <Suspense fallback={<RecommendedSectionPending />}>
            <RecommendedSection />
          </Suspense>
        </ErrorBoundary>

        <Section flush>
          {/* 「잉크 행동 규칙」— 이 화면에서 해야 할 일은 만드는 쪽이다. 찾는 쪽은 위쪽
              히어로와 섹션 둘이 이미 맡고 있어서, 닫는 칸까지 같은 곳을 가리키면
              한 화면이 같은 행동을 세 번 권한다 */}
          <CtaCard
            title="이번 주 빈칸, 같이 채울 사람은요?"
            sub="찾는 스터디가 없다면 직접 열어도 됩니다. 모집글 한 장이면 시작입니다."
          >
            <ButtonLink href="/studies/create" tone="ink" size="lg">
              스터디 만들기
            </ButtonLink>
            <ButtonLink href="/posts" size="lg">
              먼저 둘러보기
            </ButtonLink>
          </CtaCard>
        </Section>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
