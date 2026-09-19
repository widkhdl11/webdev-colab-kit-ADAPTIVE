import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchArticleById } from "@/entities/article";
import { getSourceWeight } from "@/entities/source";
import { rankFeed } from "@/features/feed-ranking";
import { ArticleView } from "@/widgets/article-view";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
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
  const [article] = rankFeed({ items: [stored], now, weightOf: getSourceWeight });
  return { now, article };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { article } = await loadArticle(id);
  return { title: article ? `${article.title} — signal` : "signal" };
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  const { now, article } = await loadArticle(id);

  if (!article) notFound();

  return <ArticleView article={article} nowIso={now.toISOString()} />;
}
