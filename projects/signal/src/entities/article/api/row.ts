import { z } from "zod";
import { toArticleKinds, toGate } from "../lib/hot-issue";
import { toOfficialBasis } from "../lib/official";
import { isOneLine, parseSummaryTable, signalPoints } from "../lib/summary-format";
import type { ArticleKeyword, StoredArticle } from "../model/types";

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
  .array(
    z
      .object({ tag: z.object({ name: z.string(), axis: z.unknown() }).nullable() })
      .passthrough(),
  )
  .optional()
  .nullable();

const kindJoin = z
  .array(z.object({ kind: z.unknown() }).passthrough())
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
  // 모르는 값이 와도 행을 버리지 않는다 — 표시 하나 때문에 소식이 사라지면 안 된다.
  // 값의 판정은 toOfficialBasis 가 한다(모르는 값 → none).
  official_basis: z.unknown().optional(),
  // 문 배정 (hot-issue.md INV-H1). 모르는 값이 와도 행을 버리지 않는다 — 위와 같은 이유다.
  // 값의 판정은 toGate 가 한다(모르는 값 · 없음 → null = 판정 못 받음).
  gate: z.unknown().optional(),
  published_at: z.string().min(1),
  item_tag: tagJoin,
  // 종류 (hot-issue.md INV-G1). 축 태그(item_tag)와 다른 테이블이다 — 이름이 비슷해서
  // 헷갈리기 쉬운데, 저쪽은 뱃지 줄에 쓰는 키워드고 이쪽은 화면 자리를 정하는 판정이다.
  item_kind: kindJoin,
  // 상세만 받는 칸 (0011 · INV-S8 · INV-G2). 모양 검사는 summary-format 이 한다.
  one_line: z.string().nullable().optional(),
  summary_table: z.unknown().optional(),
  hot_issue_answers: z.unknown().optional(),
  hot_issue_reasons: z.unknown().optional(),
});

/** 목록 투영에는 본문이 없다 — `StoredArticle` 에서 contentHtml 만 뺀 모양. */
export type StoredArticleListItem = Omit<StoredArticle, "contentHtml">;

/**
 * 붙어 있는 키워드를 이름+축으로 읽는다.
 *
 * **고정 5개 목록으로 거르지 않는다** (2026-08-30). 여기가 모델이 만든 말을 통째로 버리던
 * 세 자리 중 하나였다 — `ARTICLE_TAGS.includes` 로 걸러서, 저장은 됐는데 화면에는 안 나왔다.
 *
 * `legacy` 는 걸러낸다. 0007 이 그 행들을 지웠으니 정상 상태에서는 안 나오지만, 축이
 * 모르는 값으로 오는 경우까지 포함해 **아는 두 축만 통과시킨다** — 화면이 색을 못 정하는
 * 값을 그리면 어느 축인지 알 수 없는 뱃지가 생긴다.
 */
function knownTags(join: z.infer<typeof tagJoin>): ArticleKeyword[] {
  if (!join) return [];
  const out: ArticleKeyword[] = [];
  for (const j of join) {
    const name = j.tag?.name;
    const axis = j.tag?.axis;
    if (typeof name !== "string" || name === "") continue;
    if (axis !== "field" && axis !== "kind") continue;
    out.push({ name, axis });
  }
  return out;
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
    officialBasis: toOfficialBasis(r.official_basis),
    gate: toGate(r.gate),
    // 모르는 이름은 toArticleKinds 가 버린다. 버려도 그 글이 사라지지는 않는다 —
    // 종류가 비어 있으면 소식에 선다(INV-G3).
    kinds: toArticleKinds((r.item_kind ?? []).map((k) => k.kind)),
    contentHtml: r.content_html ?? "",
    // 한 줄 요약도 형식 검사를 다시 한다 — 검사를 바꾼 날 이미 저장된 값이 화면에서 깨지지 않게.
    oneLine: r.one_line && isOneLine(r.one_line) ? r.one_line.trim() : null,
    summaryTable: parseSummaryTable(r.summary_table),
    signalPoints: signalPoints(r.hot_issue_answers, r.hot_issue_reasons),
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
