import { z } from "zod";
import { ARTICLE_TAGS, type ArticleTag, type StoredArticle } from "../model/types";

/**
 * 조회 응답 → 도메인 모양. **신뢰 경계다.**
 *
 * rules/supabase: "쿼리 응답은 신뢰 경계 밖. 반환값을 그대로 도메인에 넘기지 말고
 * 경계에서 파싱·검증한다." DB 스키마와 코드가 어긋나면(마이그레이션 누락·컬럼 이름 변경)
 * 여기서 걸린다. 안 걸리면 화면이 `undefined` 를 그리고, 원인에서 먼 곳에서 증상이 난다.
 *
 * 못 믿을 행은 **버린다**(null). 던지지 않는 이유: 행 하나가 목록 전체를 죽이면 안 된다.
 */

const tagJoin = z
  .array(z.object({ tag: z.object({ name: z.string() }).nullable() }).passthrough())
  .optional()
  .nullable();

const rowSchema = z.object({
  id: z.string().min(1),
  original_url: z.string().min(1),
  title: z.string().min(1),
  title_ko: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  source_excerpt: z.string().nullable().optional(),
  summary_points: z.array(z.string()).nullable().optional(),
  content_html: z.string().nullable().optional(),
  source_id: z.string().min(1),
  source_name: z.string().nullable().optional(),
  published_at: z.string().min(1),
  item_tag: tagJoin,
});

/** 목록 투영에는 본문이 없다 — `StoredArticle` 에서 contentHtml 만 뺀 모양. */
export type StoredArticleListItem = Omit<StoredArticle, "contentHtml">;

function knownTags(join: z.infer<typeof tagJoin>): ArticleTag[] {
  if (!join) return [];
  return join
    .map((j) => j.tag?.name)
    .filter((n): n is ArticleTag =>
      typeof n === "string" && (ARTICLE_TAGS as readonly string[]).includes(n),
    );
}

function common(raw: unknown) {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;

  // Postgres 는 `2026-08-09T00:00:00+00:00` 꼴로 준다. 화면·정렬이 쓰는 표기로 맞춘다 —
  // 표기가 갈리면 문자열 비교가 어긋나고, 못 읽는 값이면 날짜 묶음에서 조용히 사라진다.
  const ms = Date.parse(r.published_at);
  if (Number.isNaN(ms)) return null;

  return {
    id: r.id,
    title: r.title,
    // 원문 제목과 다른 칸이다 (INV-S6). 없으면 null 로 두고 화면이 원문으로 떨어진다.
    titleKo: r.title_ko ?? null,
    summary: r.summary ?? "",
    sourceExcerpt: r.source_excerpt ?? null,
    summaryPoints: r.summary_points ?? [],
    sourceId: r.source_id,
    sourceName: r.source_name ?? r.source_id,
    // 사람이 여는 주소는 정규화 이전 값이다. canonical_url 은 유일성 키일 뿐이다(INV-C2).
    sourceUrl: r.original_url,
    publishedAt: new Date(ms).toISOString(),
    tags: knownTags(r.item_tag),
    contentHtml: r.content_html ?? "",
  };
}

/** 상세용 — 본문까지. */
export function toStoredArticle(raw: unknown): StoredArticle | null {
  return common(raw);
}

/**
 * 목록용 — 본문을 **뺀다.**
 *
 * 쿼리에서 `content_html` 을 안 뽑는 게 1차 방어인데, 실수로 넣어도 여기서 한 번 더 떨어진다.
 * 목록은 클라이언트 컴포넌트로 직렬화돼 나가므로 본문이 섞이면 요청마다 수 MB가 된다.
 */
export function toListItemRow(raw: unknown): StoredArticleListItem | null {
  const item = common(raw);
  if (item === null) return null;
  const { contentHtml: _drop, ...rest } = item;
  return rest;
}
