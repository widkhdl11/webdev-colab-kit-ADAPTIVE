import { persistsOnReingest } from "@/entities/article";
import type { FeedItemDraft } from "@/entities/article";

/**
 * 적재 페이로드를 만든다 (INV-C1 upsert).
 *
 * **핵심 규칙: 값이 없으면 그 컬럼을 아예 빼고 보낸다.**
 *
 * 왜냐하면 upsert 는 준 컬럼을 전부 덮어쓰기 때문이다. 피드는 대부분의 소스에서 본문을
 * 주지 않는데(HN 은 링크 모음, OpenAI 는 요약글만), 그때 `content_html: ""` 를 실어 보내면
 * **직전 주기에 원문 페이지에서 추출해 채운 본문(INV-S5)이 매번 지워진다.** 그러면 그 항목은
 * 다음 주기에도 추출 후보로 다시 잡혀 배치 자리를 영구히 차지하고, 새 글은 차례가 안 온다.
 *
 * `summary`·`title_ko` 는 어떤 경우에도 넣지 않는다 — 둘 다 우리가 만든 값이라 피드에 없고,
 * 비어 있다는 사실 자체가 "다시 만들어야 한다"는 신호다(INV-S3·S6).
 */
export type UpsertRow = Record<string, unknown>;

/**
 * PostgREST 는 한 번의 upsert 안에서 행들이 **같은 컬럼 집합**이기를 요구한다.
 * 그래서 조건부로 컬럼을 뺀 행들은 구성별로 나눠서 보내야 한다.
 */
export function upsertBatches(items: FeedItemDraft[], nowIso: string): UpsertRow[][] {
  const byShape = new Map<string, UpsertRow[]>();

  for (const item of items) {
    const row: UpsertRow = {
      canonical_url: item.canonicalUrl,
      original_url: item.originalUrl,
      title: item.title,
      source_id: item.sourceId,
      source_name: item.sourceName,
      published_at: item.publishedAt,
      published_at_is_fallback: item.publishedAtIsFallback,
      updated_at: nowIso,
    };

    if (item.contentHtml.trim() !== "") row.content_html = item.contentHtml;
    if ((item.sourceExcerpt ?? "").trim() !== "") row.source_excerpt = item.sourceExcerpt;
    // 어떤 근거를 다시 실을지는 entities 가 정한다 (INV-O2) — 여기와 후처리 두 곳에
    // 조건문으로 흩어져 있으면 한쪽만 고치는 날 조용히 어긋난다.
    if (persistsOnReingest(item.officialBasis)) row.official_basis = item.officialBasis;

    const shape = Object.keys(row).sort().join(",");
    const bucket = byShape.get(shape);
    if (bucket) bucket.push(row);
    else byShape.set(shape, [row]);
  }

  return [...byShape.values()];
}
