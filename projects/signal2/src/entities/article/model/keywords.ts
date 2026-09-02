/* 상단 뱃지 줄에 세울 키워드를 고른다.
 *
 * 카드 안의 칩과 다른 물건이다 — 카드 칩은 "이 글의 키워드"고, 이쪽은 **최근 며칠의 지형**이다.
 * 그래서 창(며칠), 문턱(몇 건 이상), 상한(몇 개까지)이 붙는다.
 *
 * 값 셋은 2026-08-30 에 실제 수집분 176건으로 재서 정한 것이고 **임시다**.
 * 문턱 2건은 "몇 건이나 나왔나"만 본다 — 한 매체가 시시한 것을 여러 번 써도 뜨고,
 * 중요한 발표가 한 번만 실리면 안 뜬다. 진짜 기준(교차 발행처 수 × 소스 weight × 시간감쇠)은
 * docs/specs/keywords-and-kinds.md INV-N3 인데 아직 코드에도 스키마에도 없다.
 */

import { kstDayKey, kstDayStartMs } from "@/shared/lib/kst";

import { compareIds } from "./order";
import { KEYWORD_AXES, type Article, type KeywordAxis } from "./types";

/** 며칠치를 세는가. */
export const BADGE_WINDOW_DAYS = 3;
/** 몇 건 이상이어야 줄에 세우는가. 1건짜리는 꼬리가 너무 길어진다(42종 중 13종이었다). */
export const BADGE_MIN_ARTICLES = 2;
/**
 * 몇 개까지 담는가. **평소에 닿지 않는 사고 방지선**이다(실측 최대 29종).
 * 이 줄은 클라이언트로 직렬화되므로 상한이 없으면 이상한 날에 수백 개가 통째로 실린다.
 */
export const BADGE_LIMIT = 60;

export type KeywordBadge = {
  /** 축이 다르면 같은 이름도 다른 뱃지다. */
  key: string;
  name: string;
  axis: KeywordAxis;
  /** 창 안의 전체 건수. **자리·순서·노출 여부를 이 값이 정한다.** */
  total: number;
  /** 화면에 찍는 숫자. 그 뱃지가 붙은 글 중 아직 안 읽은 것의 수. */
  unread: number;
};

export const badgeKey = (axis: KeywordAxis, name: string) => `${axis}:${name}`;

/** 창 안에 드는 소식만 남긴다. 오늘을 포함해 BADGE_WINDOW_DAYS 일. */
function withinWindow(articles: Article[], nowIso: string): Article[] {
  const todayStart = kstDayStartMs(nowIso);
  if (todayStart === null) return [];
  const from = todayStart - (BADGE_WINDOW_DAYS - 1) * 86_400_000;
  const fromKey = kstDayKey(new Date(from).toISOString());
  if (fromKey === null) return [];

  return articles.filter((a) => {
    const key = kstDayKey(a.publishedAt);
    return key !== null && key >= fromKey;
  });
}

/**
 * 뱃지 줄을 만든다.
 *
 * **순서와 노출은 전체 건수로만 정한다.** 읽음 상태는 `localStorage` 에 있어서 첫 렌더가
 * 항상 "아무것도 안 읽음"으로 시작하는데, 안 읽은 수로 자리까지 정하면 화면이 뜬 직후
 * 줄 전체가 다시 배열되고 누르려던 뱃지가 눈앞에서 움직인다.
 */
export function buildKeywordBadges(
  articles: Article[],
  readIds: ReadonlySet<string>,
  nowIso: string,
): KeywordBadge[] {
  const inWindow = withinWindow(articles, nowIso);
  const counts = new Map<string, KeywordBadge>();

  for (const article of inWindow) {
    // 같은 글에 같은 키워드가 두 번 들어와도 한 번만 센다.
    const seen = new Set<string>();
    for (const keyword of article.keywords) {
      const key = badgeKey(keyword.axis, keyword.name);
      if (seen.has(key)) continue;
      seen.add(key);

      const entry = counts.get(key) ?? {
        key,
        name: keyword.name,
        axis: keyword.axis,
        total: 0,
        unread: 0,
      };
      entry.total += 1;
      if (!readIds.has(article.id)) entry.unread += 1;
      counts.set(key, entry);
    }
  }

  return [...counts.values()]
    .filter((entry) => entry.total >= BADGE_MIN_ARTICLES)
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      // 이름은 사람이 읽는 순서라 로케일을 고정해 비교한다.
      const byName = a.name.localeCompare(b.name, "ko");
      if (byName !== 0) return byName;
      // 이름까지 같은 경우가 있다 — 축만 다른 `분야 보안` 과 `사건종류 보안`.
      // 여기서 끊지 않으면 Map 삽입 순서, 곧 글 목록 순서가 뱃지 자리를 정한다.
      // 이건 신원 비교라 코드포인트로 본다(위 `byName` 이 0 을 준 뒤에 도는 자리다).
      return compareIds(a.key, b.key);
    })
    .slice(0, BADGE_LIMIT);
}

/**
 * URL 에서 온 값을 뱃지 키로 읽는다. 모르는 값은 "안 켬"이다.
 *
 * 경계에서 한 번만 검사한다 — 축 접두사가 없는 값은 어느 뱃지와도 안 맞아서
 * "이 주제로 모인 소식이 아직 없습니다"만 남기고, 그건 주소를 손으로 고친 사람에게
 * 빈 화면의 이유를 못 알려 준다.
 */
export function parseKeywordKey(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && parseBadgeKey(raw) !== null ? raw : null;
}

/**
 * 뱃지 키를 축과 이름으로 가른다. `badgeKey` 의 짝이다.
 *
 * 이 규칙이 두 곳에 있으면 축이 늘었을 때 한쪽만 따라온다 — 실제로 뱃지 줄 컴포넌트가
 * `key === "kind" ? "kind" : "field"` 로 복사해 갖고 있었고, 축이 세 번째로 늘면
 * `parseKeywordKey` 는 통과시키는데 그 줄만 틀린 색·틀린 낭독 접두사를 냈다.
 * 이름에 콜론이 있어도 된다(`field:a:b` → 이름 `a:b`) — 첫 콜론만 축 구분자다.
 */
export function parseBadgeKey(
  key: string,
): { axis: KeywordAxis; name: string } | null {
  const sep = key.indexOf(":");
  if (sep <= 0 || sep === key.length - 1) return null;

  const head = key.slice(0, sep);
  const axis = KEYWORD_AXES.find((a) => a === head);
  return axis === undefined ? null : { axis, name: key.slice(sep + 1) };
}

/** 켠 뱃지가 붙은 소식만 남긴다. 아무것도 안 켜졌으면 전부. */
export function filterByKeyword(
  articles: Article[],
  selectedKey: string | null,
): Article[] {
  if (selectedKey === null) return articles;
  return articles.filter((a) =>
    a.keywords.some((k) => badgeKey(k.axis, k.name) === selectedKey),
  );
}
