import {
  PENDING_SUB,
  RECOMMENDATION_SHOWN,
  recommendForHome,
  SECTION_TITLE,
  sectionCopy,
} from "@/features/recommend-studies";
import { CardGrid, Section, SectionHead } from "@/shared/ui/section/Section";
import { PostGrid } from "./PostGrid";
import styles from "./recommended.module.css";

/**
 * 홈 안의 추천 구역. **독립 화면이 아니다**(`docs/IA.md`).
 *
 * **왜 이 슬라이스에 있나.** 이 구역은 모집글 카드를 그대로 쓴다. 위젯끼리는 서로를 못
 * 가져오고(같은 레이어), 카드를 한 벌 더 만드는 것은 `PostGrid` 가 스스로 적어 둔 이유로
 * 안 된다 — "카드가 두 벌이면 한쪽만 고쳐지는 날이 온다". 그래서 카드와 같은 슬라이스에
 * 둔다. 이 슬라이스는 「모집글을 카드로 보여주는 것」이고 이 구역도 그 하나다.
 *
 * 서버 컴포넌트이고 모델을 기다리므로, 홈은 이걸 지연 경계로 감싼다 — 그래야 나머지가
 * 먼저 그려진다 (INV-G5).
 */
export async function RecommendedSection() {
  const outcome = await recommendForHome();
  if (outcome.posts.length === 0) return null;

  const copy = sectionCopy(outcome.kind);
  return (
    <Section>
      <SectionHead
        title={copy.title}
        sub={copy.sub}
        more={{ href: "/posts", label: "모집글 전체 보기" }}
      />
      <PostGrid posts={outcome.posts.slice(0, RECOMMENDATION_SHOWN)} />
    </Section>
  );
}

/**
 * 채워지기 전에 놓는 자리. **같은 높이를 차지한다** — 안 그러면 추천이 도착하는 순간
 * 아래 내용이 밀려 내려가고, 그때 마침 무언가를 누르던 사람은 다른 것을 누른다.
 */
export function RecommendedSectionPending() {
  return (
    <Section>
      <SectionHead title={SECTION_TITLE} sub={PENDING_SUB} />
      {/* 칸 수는 실제로 그리는 개수와 같은 상수에서 나온다 — 손으로 3 을 적으면
          그 값을 4 로 고치는 날 자리 표시만 3칸으로 남는다 */}
      <div aria-hidden="true">
        <CardGrid>
          {Array.from({ length: RECOMMENDATION_SHOWN }, (_, i) => (
            <div key={i} className={styles.placeholder} />
          ))}
        </CardGrid>
      </div>
    </Section>
  );
}
