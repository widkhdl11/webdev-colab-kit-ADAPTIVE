import { dayKey } from "@/shared/lib/datetime";
import { normalizeTagName } from "./tagging";
import { inSegment, shownDays } from "./query";
import type { FeedSegment } from "./query";
import type { ArticleKeyword, ArticleListItem, TagAxis } from "../model/types";

/**
 * 뱃지 줄의 집계 — badge-keywords INV-B4 · design-rules 2026-08-27 블록.
 *
 * **자리·순서·노출은 전체 건수로 정하고, 숫자만 안 읽은 수로 바꾼다.** 읽음 상태가
 * `localStorage` 에 있어 첫 렌더가 항상 "아무것도 안 읽음"으로 시작하기 때문이다 —
 * 안 읽은 수로 자리까지 정하면 화면이 뜬 직후 줄 전체가 다시 배열되고, 누르려던 뱃지가
 * 눈앞에서 움직인다.
 *
 * 세는 범위는 **날짜 단위**다 — 날짜 묶음도 KST 날짜로 나뉘므로 같은 기준을 쓴다. 시각
 * 단위(72시간)로 하면 화면의 날짜 묶음과 뱃지 줄이 서로 다른 경계를 갖는다.
 * 화면은 **피드가 펼친 날**만 센다(`buildSegmentBadges`, 2026-09-24). `windowDays` 로 세는
 * 방식은 조회 창 검사와 `npm run badges` 분포 확인용으로 남아 있다.
 */

/**
 * 글을 **빠짐없이** 받아 오는 기간(날짜 수, 오늘 포함). 조회(`badgeWindowStartIso`)와
 * 수집 후보 창이 이 값을 쓴다.
 *
 * 2026-09-24 까지는 화면의 뱃지 줄도 이 기간을 셌다. 지금 화면은 **피드가 펼친 날**만 센다
 * (`buildSegmentBadges` — 기본은 오늘 하루). 이 값보다 멀리 펼치면 그 날들은 목록이 받은
 * 만큼만 센다 — 목록에 보이는 카드와 같은 글이다.
 * 창 밖 글은 **지우지 않는다** — 날짜 묶음에는 그대로 남는다(INV-B4).
 */
export const BADGE_WINDOW_DAYS = 3;

/**
 * 뱃지 줄에 오르는 최소 건수. **지금 노출을 정하는 값은 이것 하나다** (2026-08-30).
 *
 * 2026-08-30 사용자 결정: "한번 언급된게 뜰 필요는 없을거같아. 최소 2~3번 이상으로 높이자."
 * 2 와 3 을 실측으로 비교했는데 **그려지는 줄이 완전히 같았다** — 차이가 나는 두 종이
 * 꼬리에 있어 어차피 옛 상한 24 에 잘렸다(창 3일 · 42종 · 2건 이상 29종 / 3건 이상 27종).
 * 그래서 2 로 둔다. 근거: `npm run badges`, design-rules.md 2026-08-30 블록.
 *
 * **이 기준은 "몇 건이나 나왔나"만 본다 — 임시다.** 한 매체가 시시한 것을 여러 번 써도
 * 뜨고, 중요한 발표가 한 번만 실리면 안 뜬다. 사용자가 원하는 기준은 이슈성·중요도인데
 * (`docs/specs/keywords-and-kinds.md` INV-G2 · N1 · N3) 둘 다 아직 없다 —
 * 교차 발행처 수는 "같은 사건 묶기"가 필요하고 중요도는 모델 판정 단계가 필요하다.
 * 그게 붙으면 이 상수를 조정하는 게 아니라 **고르는 기준 자체가 바뀐다.**
 */
export const BADGE_MIN_COUNT = 2;

/**
 * DOM 에 넣는 뱃지 수의 **사고 방지선.** 화면에 몇 개가 뜰지를 정하는 값이 아니다.
 *
 * 2026-08-30 에 24 → 60 으로 올렸다(사용자 결정). 24 였을 때는 이 값이 노출을 정하고
 * 있었다 — 2건 기준을 넘는 것이 29종인데 24에서 잘려서, **뉴스가 몰린 날과 한산한 날이
 * 화면에서 똑같이 24개로 보였다.** 개수가 그날 뉴스 양을 따라 달라지는 게 원래 의도다.
 *
 * 60 은 평소에 닿지 않는 수다(실측 최대 29종). 그래도 없애지 않는 이유는 하나 —
 * 뱃지 줄은 클라이언트 컴포넌트라 여기 담긴 것이 그대로 브라우저로 직렬화된다.
 * 상한이 없으면 이상한 날에 수백 개가 통째로 실린다.
 *
 * 넘치는 것을 **화면에서** 자르는 것은 이 값이 아니라 접힘(2줄, CSS)이고 `더 보기` 가 편다.
 */
export const BADGE_LIMIT = 60;

export interface KeywordBadge {
  /** 화면에 쓰는 표기. 표기가 갈리면 **처음 나온 것**을 쓴다(저장 규칙과 같다). */
  name: string;
  axis: TagAxis;
  /** 세는 범위(화면에서는 펼친 날) 안에서 이 뱃지가 붙은 글 수. 자리·순서·노출을 정하는 값이다. */
  total: number;
  /** 그중 아직 안 읽은 글 수. **숫자만** 이 값으로 바뀐다. */
  unread: number;
}

interface BadgeSource {
  id: string;
  publishedAt: string;
  tags: readonly ArticleKeyword[];
}

/**
 * 창의 **왼쪽 끝** — 이 시각 이후의 글이 뱃지 창 안이다 (INV-B4).
 *
 * **조회하는 쪽이 이 함수를 쓴다.** 창을 세는 쪽(`windowKeys`)과 가져오는 쪽이 경계를
 * 따로 계산하면 사이에 낀 글이 생긴다 — 가져오긴 했는데 안 세거나, 세야 하는데 안 가져온
 * 상태가 되고 둘 다 화면에는 "뱃지 숫자가 좀 작다"로만 보인다. 정의는 한 곳에 둔다.
 *
 * 창은 KST 달력 날짜라 왼쪽 끝도 **그 날의 KST 자정**이다. `+09:00` 을 그대로 실어 보내
 * Postgres 가 timestamptz 로 비교하게 한다(UTC 로 손수 옮기면 그 계산이 또 하나의
 * 어긋날 자리가 된다).
 */
export function badgeWindowStartIso(nowIso: string, days = BADGE_WINDOW_DAYS): string | null {
  const base = Date.parse(nowIso);
  if (Number.isNaN(base)) return null;
  const back = (Math.max(1, days) - 1) * 86_400_000;
  const oldest = dayKey(new Date(base - back).toISOString());
  return oldest === "" ? null : `${oldest}T00:00:00+09:00`;
}

/** 오늘 포함 최근 N일의 날짜 키. 그 밖의 글은 안 센다. */
function windowKeys(nowIso: string, days: number): Set<string> {
  const keys = new Set<string>();
  const base = Date.parse(nowIso);
  if (Number.isNaN(base)) return keys;
  for (let back = 0; back < Math.max(1, days); back += 1) {
    keys.add(dayKey(new Date(base - back * 86_400_000).toISOString()));
  }
  return keys;
}

export function buildKeywordBadges(params: {
  articles: readonly BadgeSource[];
  /** 읽은 글 판정. 서버 렌더에서는 항상 false 가 오고, 그래서 첫 화면은 전부 안 읽음이다. */
  isRead: (id: string) => boolean;
  /** 서버에서 한 번 정한 기준 시각. 창의 오른쪽 끝이다. `fromDayKey` 를 주면 안 쓰인다. */
  nowIso?: string;
  windowDays?: number;
  /**
   * 주어지면 `windowDays` 대신 **이 날짜 키 이후(포함)의 글**만 센다 — 피드가 펼친 날들과
   * 같은 날을 세게 하는 자리다(`shownDays`). `null` 이면 셀 글이 없다(그 자리에 글이 없다) —
   * `undefined`(안 줌)와 뜻이 다르다.
   */
  fromDayKey?: string | null;
  minCount?: number;
  limit?: number;
}): KeywordBadge[] {
  const {
    articles,
    isRead,
    nowIso,
    windowDays = BADGE_WINDOW_DAYS,
    fromDayKey,
    minCount = BADGE_MIN_COUNT,
    limit = BADGE_LIMIT,
  } = params;

  const keys = fromDayKey === undefined ? windowKeys(nowIso ?? "", windowDays) : null;
  const byKey = new Map<string, KeywordBadge>();

  const inWindow = (key: string): boolean =>
    keys !== null
      ? keys.has(key)
      : fromDayKey != null && key !== "" && key >= fromDayKey;

  for (const article of articles) {
    if (!inWindow(dayKey(article.publishedAt))) continue;
    const read = isRead(article.id);

    // 한 글이 같은 뱃지를 두 번 올리지 않는다. 저장 쪽이 막고 있지만(item_tag 기본키)
    // 여기서도 접는다 — 세는 기준이 저장 기준과 갈리면 화면 숫자가 실제와 달라진다.
    const seen = new Set<string>();
    for (const tag of article.tags) {
      // 표기 갈림은 **저장 유일성 키와 같은 기준**으로 접는다. 다른 기준을 쓰면
      // DB 에서 한 행인 것이 화면에서 두 뱃지로 갈린다.
      const key = normalizeTagName(tag.name);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);

      const cur = byKey.get(key);
      if (cur) {
        cur.total += 1;
        if (!read) cur.unread += 1;
      } else {
        byKey.set(key, { name: tag.name, axis: tag.axis, total: 1, unread: read ? 0 : 1 });
      }
    }
  }

  return [...byKey.values()]
    .filter((b) => b.total >= minCount)
    // 건수 내림차순, 동률이면 표기순. 동률 규칙이 없으면 같은 데이터에서 순서가 흔들리고
    // "자리를 고정한다"는 규칙 자체가 성립하지 않는다.
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}

/**
 * 지금 자리의 뱃지 줄 (2026-09-24 사용자 지시 — 뱃지와 숫자는 고른 자리를 따른다).
 *
 * 핫이슈를 보고 있는데 모든 글로 세면 뱃지에 「6」이라고 적혀 있고 눌렀을 때 2장만 나온다.
 * **키워드 필터는 걸기 전**이다 — 필터 결과로 세면 켠 뱃지 하나만 남아 갈아탈 수 없다.
 *
 * **세는 날은 피드가 펼친 날과 같다** (2026-09-24 사용자 지시 — "기본은 당일 것만, 더 보기를
 * 누르면 전날 것 포함"). 처음에는 오늘치만 세고 「더 보기」로 하루를 펼칠 때마다 그날이 더해진다.
 * 경계는 `shownDays` 하나가 정한다 — 목록과 따로 계산하면 뱃지 숫자와 눌렀을 때 나오는
 * 카드 수가 갈린다.
 *
 * `elsewhere` 는 자리와 무관하게 같은 날들의 키워드를 문턱 없이 모은 것이다. 켠 키워드가 이 자리
 * 줄에 없을 때 "다른 자리에는 있다"와 "펼친 날에 아예 없다"를 가르고, 그 키워드의 축을 찾는다.
 */
export function buildSegmentBadges(params: {
  articles: readonly ArticleListItem[];
  segment: FeedSegment;
  isRead: (id: string) => boolean;
  /** 피드가 펼쳐 둔 날 수. 그 자리에 글이 있는 가장 최근 날이 1이다. */
  days: number;
}): { badges: KeywordBadge[]; elsewhere: KeywordBadge[] } {
  const { articles, segment, isRead, days } = params;
  const fromDayKey = shownDays({ articles, segment, days }).start;
  return {
    badges: buildKeywordBadges({
      articles: inSegment(articles, segment),
      isRead,
      fromDayKey,
    }),
    elsewhere: buildKeywordBadges({
      articles,
      isRead,
      fromDayKey,
      minCount: 1,
      limit: Number.POSITIVE_INFINITY,
    }),
  };
}
