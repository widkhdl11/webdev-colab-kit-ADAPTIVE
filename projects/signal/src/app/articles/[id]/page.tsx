import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createDummyArticles, findArticleById } from "@/entities/article";
import { ArticleView } from "@/widgets/article-view";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * 요청당 한 번만 만든다.
 *
 * generateMetadata 와 페이지 본체가 각각 부르면 데이터 소스가 두 번 구성된다 —
 * TODO(supabase) 대로 조회로 바뀌면 **요청마다 같은 쿼리가 두 번** 나가고,
 * `new Date()` 도 두 값이 갈려 두 결과의 상대시각이 미세하게 달라진다.
 */
const loadArticles = cache(() => {
  const now = new Date();
  // TODO(supabase): 프로비저닝되면 이 줄만 단건 조회로 바꾼다.
  return { now, articles: createDummyArticles(now) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { articles } = loadArticles();
  const article = findArticleById(articles, id);
  return { title: article ? `${article.title} — signal` : "signal" };
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  const { now, articles } = loadArticles();
  const article = findArticleById(articles, id);

  if (!article) notFound();

  return <ArticleView article={article} nowIso={now.toISOString()} />;
}
