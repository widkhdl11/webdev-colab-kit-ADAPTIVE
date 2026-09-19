import { z } from "zod";
import { canonicalizeUrl } from "../lib/canonical-url";
import { sourceExcerpt } from "../lib/excerpt";
import { normalizePublishedAt } from "../lib/published-at";
import { publisherFromUrl } from "../lib/publisher";
import { isOfficialByUrl, type SubjectSiteLike } from "../lib/official";
import type { OfficialBasis } from "./types";

/**
 * 외부 피드 항목 → 적재할 모양. ingestion-ranking INV-C3 강제 지점.
 *
 * 여기가 신뢰 경계다. 이 함수를 통과한 값만 DB 로 들어가고, 통과하지 못한 항목은
 * **버린다**(예외를 던지지 않는다 — 한 항목 때문에 그 소스의 수집 전체가 죽으면 INV-C4 위반이다).
 */

/**
 * 느슨하게 받는다. 소스마다 필드 이름이 다르고, 없는 필드도 흔하다.
 * 엄격함은 스키마가 아니라 **아래 필수 판정**이 맡는다.
 */
const rawFeedItemSchema = z.object({
  title: z.unknown().optional(),
  link: z.unknown().optional(),
  pubDate: z.unknown().optional(),
  summary: z.unknown().optional(),
  contentHtml: z.unknown().optional(),
  tags: z.unknown().optional(),
});

export interface IngestContext {
  fetchedAt: Date;
  sourceId: string;
  sourceName: string;
  /**
   * 공식 `byUrl` 판정에 쓰는 자리 목록 (INV-O3). 설정파일(entities/source)에서 온다.
   *
   * 인자로 받는 이유는 레이어 규칙이다 — entities 끼리는 서로 import 하지 않는다.
   */
  subjectSites: readonly SubjectSiteLike[];
  /**
   * 이 피드가 타임존 없이 주는 시각을 어느 시간대로 읽을지 (INV-C5, 2026-08-26).
   * 없으면 UTC. 설정파일(entities/source 의 `feedTimezone`)에서 온다.
   */
  feedTimezone?: string;
}

/** 적재 직전의 항목. id 는 DB 가 만든다(정규화 URL 이 유일성 키다 — INV-C1). */
export interface FeedItemDraft {
  title: string;
  /** 유일성 키 (INV-C1·C2). */
  canonicalUrl: string;
  /** 정규화 이전 주소. 추적 파라미터를 지운 주소가 404 인 출처가 있어 원본도 남긴다. */
  originalUrl: string;
  /** 출처가 준 요약글. 없으면 null — AI 요약의 근거이자 대체 표시다 (INV-S2·S3). */
  sourceExcerpt: string | null;
  contentHtml: string;
  publishedAt: string;
  publishedAtIsFallback: boolean;
  sourceId: string;
  sourceName: string;
  /**
   * 적재 시점에 정할 수 있는 근거는 주소뿐이다 (INV-O3). 내용 근거(`byContent`)는
   * 요약 단계에서 붙으므로 여기서는 `byUrl` 아니면 `none` 이다.
   */
  officialBasis: OfficialBasis;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * 외부 항목 하나를 검증·정규화한다. 적재할 수 없으면 null.
 *
 * 필수는 **제목과 원문 URL 둘뿐**이다. 발행시각은 없어도 버리지 않고 INV-C5 가 대체한다
 * (2026-08-09 정정: 원래 필수 목록에 있었는데 그러면 C5 의 대체 분기에 영영 닿지 않는다).
 */
export function parseFeedItem(
  raw: unknown,
  ctx: IngestContext,
): FeedItemDraft | null {
  const parsed = rawFeedItemSchema.safeParse(raw);
  if (!parsed.success) return null;

  const title = asString(parsed.data.title).trim();
  if (title === "") return null;

  const originalUrl = asString(parsed.data.link).trim();
  // "있다"가 아니라 "정규화에 성공한다"가 기준이다. 유일성 키를 못 만들면
  // 중복 판정(INV-C1)이 아예 불가능하므로 적재하지 않는다.
  const canonicalUrl = originalUrl === "" ? null : canonicalizeUrl(originalUrl);
  if (canonicalUrl === null) return null;

  const published = normalizePublishedAt(
    typeof parsed.data.pubDate === "string" ? parsed.data.pubDate : null,
    ctx.fetchedAt,
    ctx.feedTimezone,
  );

  return {
    title,
    canonicalUrl,
    originalUrl,
    sourceExcerpt: sourceExcerpt(asString(parsed.data.summary)),
    contentHtml: asString(parsed.data.contentHtml),
    publishedAt: published.publishedAt,
    publishedAtIsFallback: published.isFallback,
    sourceId: ctx.sourceId,
    // 화면에 보이는 출처는 실제 발행처다 — 못 뽑으면 수집 소스 이름으로 되돌아간다(INV-O1).
    sourceName: publisherFromUrl(originalUrl) ?? ctx.sourceName,
    // **태그를 여기서 안 붙인다** (2026-08-30, 옛 INV-T3 폐기). 손으로 쓴 키워드 표로
    // 고정 5개를 미리 붙이던 자리였다. 이제는 수집 뒤 `runKeywords` 가 모델에게 물어 만든다.
    // 모델을 거치지 않는다 (INV-O3). 여기서 못 정한 것은 none 이고, 내용 근거는 나중에 붙는다.
    officialBasis: isOfficialByUrl(originalUrl, ctx.subjectSites) ? "byUrl" : "none",
  };
}
