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
 * **타임존이 없는 ISO 꼴 시각은 `feedTimezone` 의 벽시계값으로 읽는다** (안 주면 UTC).
 * 처음엔 "존을 모르면 추측하지 말자"며 수집시각으로 대체했는데, 그러면 **일주일 전 글이
 * 오늘 날짜 묶음에 들어간다.** 이 화면의 목적이 "언제 나온 소식인지"이므로(2026-08-09 사용자)
 * 읽기로 했고, 그때는 전부 UTC 로 읽으면서 "최악이 하루 어긋난다"로 봤다.
 *
 * **2026-08-26 그 판단이 틀린 것으로 드러났다.** 아이타임스·인공지능신문이 타임존 없이
 * 한국시간 벽시계값을 준다(`2026-08-26 17:50:06`). UTC 로 읽으면 9시간 **미래**가 되어
 * ① 날짜가 하루 뒤로 보이고 ② 랭킹의 나이가 0 이라 피드 맨 위에 계속 고정된다.
 * 실측으로 29건이 미래에 있었다. 그래서 존 없는 값은 그 소스의 시간대로 읽는다.
 *
 * `Date.parse` 에 그냥 맡기지 않는 이유: 자바스크립트는 존 없는 날짜-시각을 **실행 환경의
 * 로컬 시간대**로 읽는다. 서버와 브라우저가 다른 존이면 같은 값이 다른 날로 갈린다.
 * 그래서 오프셋을 직접 계산해 못 박는다 — 어디서 돌려도 같은 값이 나온다.
 *
 * @param feedTimezone IANA 시간대 이름(`Asia/Seoul` 등). 존이 **없는** 값에만 쓰인다 —
 *   존이 적혀 있으면 그 존이 우선이다(같은 피드에 섞여 오는 정상 표기를 틀지 않는다).
 */
export function normalizePublishedAt(
  raw: string | null | undefined,
  fetchedAt: Date,
  feedTimezone?: string,
): NormalizedPublishedAt {
  const fallback = { publishedAt: fetchedAt.toISOString(), isFallback: true };

  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;

  if (HAS_TIMEZONE.test(trimmed)) {
    const ms = Date.parse(trimmed);
    return Number.isNaN(ms)
      ? fallback
      : { publishedAt: new Date(ms).toISOString(), isFallback: false };
  }

  const ms = parseWallClock(trimmed, feedTimezone);
  if (ms === null) return fallback;
  return { publishedAt: new Date(ms).toISOString(), isFallback: false };
}

/**
 * 존이 없는 값을 `timeZone` 의 벽시계값으로 읽어 epoch 밀리초를 돌려준다.
 * ISO 꼴이 아니거나 시간대 이름을 못 알아보면 null (→ 대체).
 */
function parseWallClock(value: string, timeZone: string | undefined): number | null {
  const m = ISO_LIKE.exec(value);
  if (!m) return null;
  const [, date, time] = m;

  const [y, mo, d] = date.split("-").map(Number);
  const [h = 0, mi = 0, s = 0] = (time ?? "").split(":").map(Number);

  // 벽시계값을 일단 UTC 로 본 값. 시간대가 없으면 이게 곧 답이다(예전 동작).
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (timeZone === undefined || timeZone === "UTC") return asUtc;

  const offset = zoneOffsetMs(asUtc, timeZone);
  if (offset === null) return null;

  // 같은 벽시계값이라도 그 지역의 오프셋은 날짜에 따라 다르다(일광절약시간).
  // 1차로 뺀 시점에서 오프셋을 다시 재 경계를 넘었는지 확인한다.
  const refined = zoneOffsetMs(asUtc - offset, timeZone);
  return asUtc - (refined ?? offset);
}

/**
 * `instant` 시점에 `timeZone` 이 UTC 보다 몇 밀리초 앞서는지. 모르는 이름이면 null.
 *
 * 고정 오프셋 표를 두지 않는 이유: 일광절약시간이 있는 지역은 같은 이름이 계절마다 다른
 * 오프셋을 쓴다. 런타임의 시간대 데이터베이스에 물어보면 그 날짜의 실제 값이 나온다.
 */
function zoneOffsetMs(instant: number, timeZone: string): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23", // hour12:false 는 자정을 "24" 로 주는 런타임이 있다.
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
  } catch {
    return null; // 알 수 없는 시간대 이름 — 조용히 UTC 로 흘리지 않는다.
  }

  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour"),
    at("minute"),
    at("second"),
  );
  return Number.isNaN(wall) ? null : wall - instant;
}
