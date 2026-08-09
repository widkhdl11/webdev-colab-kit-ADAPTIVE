/**
 * 발행시각 정규화 — ingestion-ranking INV-C5 강제 지점.
 *
 * 저장은 UTC 로만 한다. 타임존이 섞이면 정렬·랭킹·날짜 그룹이 전부 어긋나는데,
 * 어긋난 티가 안 나서 발견이 늦는다.
 */

export interface NormalizedPublishedAt {
  /** UTC ISO 표기. 저장·정렬·랭킹이 전부 이 값을 쓴다. */
  publishedAt: string;
  /**
   * 수집시각으로 대체했는지.
   *
   * 대체값은 "이때 발행됐다"가 아니라 "이때 우리가 봤다"다. 구분해 남기지 않으면
   * 날짜 그룹이 틀린 이야기를 하는데 아무도 그걸 알 수 없다.
   */
  isFallback: boolean;
}

/**
 * 타임존이 명시됐는지.
 *
 * `Z` 이거나 `+09:00`/`-0500` 꼴의 오프셋이 붙었거나, RFC 822 의 이름난 존(GMT·UT·
 * 군용 1글자·미국 존 약어)이 붙은 경우.
 */
const HAS_TIMEZONE =
  /(Z|[+-]\d{2}:?\d{2}|\b(?:GMT|UTC?|[ECMP][SD]T|[A-IK-Z])\s*)$/i;

/** `2026-08-09` · `2026-08-09T09:00` · `2026-08-09 09:00:00` 꼴. */
const ISO_LIKE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/;

/**
 * 발행시각을 UTC ISO 로 정규화한다. 없거나 못 읽으면 수집시각으로 대체하고 그 사실을 남긴다.
 *
 * **타임존이 없는 ISO 꼴 시각은 UTC 로 읽는다.** 처음엔 "존을 모르면 추측하지 말자"며
 * 수집시각으로 대체했는데, 그러면 **일주일 전 글이 오늘 날짜 묶음에 들어간다.** 이 화면의
 * 목적이 "언제 나온 소식인지"이므로(2026-08-09 사용자), 최악이 하루 어긋나는 쪽이
 * 완전히 틀리는 쪽보다 낫다. 대가는 KST 자정 근처 글의 날짜 묶음이 하루 밀릴 수 있다는 것.
 *
 * `Date.parse` 에 그냥 맡기지 않는 이유: 자바스크립트는 존 없는 날짜-시각을 **실행 환경의
 * 로컬 시간대**로 읽는다. 서버와 브라우저가 다른 존이면 같은 값이 다른 날로 갈린다.
 * 그래서 UTC 라고 명시해서 넘긴다 — 어디서 돌려도 같은 값이 나온다.
 */
export function normalizePublishedAt(
  raw: string | null | undefined,
  fetchedAt: Date,
): NormalizedPublishedAt {
  const fallback = { publishedAt: fetchedAt.toISOString(), isFallback: true };

  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;

  const normalized = HAS_TIMEZONE.test(trimmed) ? trimmed : assumeUtc(trimmed);
  if (normalized === null) return fallback;

  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return fallback;

  return { publishedAt: new Date(ms).toISOString(), isFallback: false };
}

/**
 * 존이 없는 값을 UTC 로 못 박는다. ISO 꼴이 아니면 null — 형식을 모르는 채로
 * 문자열에 `Z` 를 붙이면 엉뚱한 값이 파싱될 수 있다.
 */
function assumeUtc(value: string): string | null {
  const m = ISO_LIKE.exec(value);
  if (!m) return null;
  const [, date, time] = m;
  return `${date}T${time ?? "00:00"}${(time?.length ?? 0) === 5 || !time ? ":00" : ""}Z`;
}
