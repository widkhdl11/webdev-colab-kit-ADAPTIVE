import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  articleHref,
  displayTitle,
  feedHref,
  fetchArticleById,
  filterByTag,
  findNeighbors,
  fitFeedStateToArticle,
  inSegment,
  orderFeed,
  parseFeedState,
  withDaysCovering,
  toListItem,
} from "@/entities/article";
import { getSourceWeight } from "@/entities/source";
import { loadRankedFeed, rankFeed } from "@/features/feed-ranking";
import { ArticleView } from "@/widgets/article-view";
import type { ArticleNavLink } from "@/widgets/article-view";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * 요청당 한 번만 조회한다.
 *
 * generateMetadata 와 페이지 본체가 각각 부르면 **같은 쿼리가 요청마다 두 번** 나가고,
 * `new Date()` 도 두 값이 갈려 두 결과의 상대시각이 미세하게 달라진다.
 */
const loadArticle = cache(async (id: string) => {
  const now = new Date();
  const stored = await fetchArticleById(id);
  if (stored === null) return { now, article: null };

  // 상세는 뱃지를 안 그리지만 랭킹을 통과시킨다 — 목록과 다른 경로로 Article 을 만들면
  // 두 화면의 파생값이 갈릴 수 있고, 그러면 어느 쪽이 맞는지 알 수 없다.
  // 한 건만 넘기므로 '뜨는 중'은 항상 true 가 되는데, 이 화면은 그 값을 쓰지 않는다.
  const [article] = rankFeed({
    items: [stored],
    now,
    weightOf: getSourceWeight,
  });
  return { now, article };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { article } = await loadArticle(id);
  return { title: article ? `${article.title} — simoori` : "simoori" };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const { now, article } = await loadArticle(id);

  // **존재 판정은 거르기 전에 한다.** 필터를 건 목록에서 찾으면 켠 뱃지가 안 붙은 글의
  // 주소로 들어왔을 때 있는 글이 404 가 된다(signal2 실측: `/articles/a06?kw=field:MCP`).
  if (!article) notFound();

  const read = (key: string) => {
    const raw = sp[key];
    return typeof raw === "string" ? raw : null;
  };
  // 거르는 함수들은 목록 투영을 받는다 — 본문이 든 글을 그대로 넘기지 않는다.
  const item = toListItem(article);
  const asked = fitFeedStateToArticle({
    state: parseFeedState(read),
    inSegment: (segment) => inSegment([item], segment).length > 0,
    hasTag: (tag) => filterByTag([item], tag).length > 0,
  });

  // 이전/다음은 피드에 보이던 순서 그대로다 — **같은 조회, 같은 줄 세우기 함수**를 쓴다.
  // 날짜 경계를 넘어간다: 오늘 마지막 글의 「다음」은 어제 첫 글이다.
  const feed = await loadRankedFeed(now);
  const ordered = orderFeed({ articles: feed, ...asked });
  // 「피드로」·이웃 링크가 싣는 날 수는 이 글이 속한 날까지 넓힌다 — 안 그러면 돌아간
  // 피드에 방금 읽은 글이 없다. 날은 자리의 날짜 묶음으로 세므로 거르기 전 목록을 넘긴다.
  const state = withDaysCovering(asked, feed, article.id);
  const neighbors = findNeighbors(ordered, article.id);
  const toLink = (a: (typeof ordered)[number] | null): ArticleNavLink | null =>
    a === null
      ? null
      : { href: articleHref(a.id, state), title: displayTitle(a).text };

  return (
    <ArticleView
      article={article}
      nowIso={now.toISOString()}
      backHref={feedHref(state)}
      // 피드가 가져오는 범위 밖의 옛 글이면 이웃을 모른다. 그때 「첫 글입니다」·「마지막 글입니다」를
      // 띄우면 거짓말이라 이동 줄 자체를 안 그린다.
      nav={
        neighbors === null
          ? null
          : { prev: toLink(neighbors.prev), next: toLink(neighbors.next) }
      }
    />
  );
}
