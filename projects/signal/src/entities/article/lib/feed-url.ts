import type { ArticleListItem, ArticleTag } from "../model/types";
import { BADGE_WINDOW_DAYS } from "./badges";
import { groupByDay } from "./query";
import type { FeedSegment } from "./query";

/**
 * 피드 화면의 상태를 주소로 읽고 쓴다 (design-rules 2026-09-01 (3) 「주소가 화면 상태의
 * 유일한 근거다」).
 *
 * **주소가 근거다.** 상태를 컴포넌트 안(`useState`)에 두면 글을 열었다가 뒤로 왔을 때
 * 자리·필터·펼친 양이 전부 처음으로 돌아간다. 주소에 두면 뒤로·앞으로가 저절로 맞는다.
 *
 * **조립하는 자리도 여기 하나다.** 피드 · 카드 링크 · 상세의 「피드로」 · 이전/다음이
 * 각자 주소를 만들면 상태가 하나 늘 때 한 곳을 빠뜨리고, 그 경로에서만 상태가 죽는다.
 */

export interface FeedState {
  segment: FeedSegment;
  tag: ArticleTag | null;
  /** 「더 보기」로 펼쳐 둔 날 수. 오늘 하루가 1이다. */
  days: number;
}

export const DEFAULT_FEED_STATE: FeedState = {
  segment: "hot",
  tag: null,
  days: 1,
};

/**
 * 펼칠 수 있는 최대 날 수.
 *
 * 상한이 읽는 쪽에만 있으면 반쪽이다 — 쓰는 쪽이 범위 밖 값을 주소에 실으면 읽는 쪽이
 * 조용히 기본값으로 되돌려서 **펼쳐 둔 것이 통째로 접힌다.** 전이 함수들이 여기서 자른다.
 */
export const MAX_FEED_DAYS = 365;

const SEGMENTS: readonly FeedSegment[] = ["all", "hot", "news", "tools"];

/** 뱃지를 켠 상태의 기본 펼침은 집계 창만큼이다 — 아래 `withTag` 참고. */
function defaultDays(tag: ArticleTag | null): number {
  return tag === null ? DEFAULT_FEED_STATE.days : BADGE_WINDOW_DAYS;
}

/** 「더 보기」 한 번. 하루씩 늘린다 — 수집이 매일 아침 도는 배치라 사용자가 세는 단위가 하루다. */
export function withMoreDays(state: FeedState): FeedState {
  return { ...state, days: Math.min(state.days + 1, MAX_FEED_DAYS) };
}

/**
 * 뱃지를 켜고 끈다 (design-rules 2026-09-01 (2) 「뱃지를 켜면 집계 창만큼 편다」).
 *
 * **켤 때는 집계 창만큼 편다.** 뱃지 숫자는 창 3일치를 센 값인데 목록은 하루씩 나오므로,
 * 그대로 두면 「6」이라고 적힌 뱃지를 눌렀을 때 카드가 1장만 보이고 나머지는 「더 보기」 뒤에 숨는다.
 *
 * **줄이지는 않는다.** 이미 5일치를 펼쳐 둔 사람에게는 보던 것이 사라지는 일이 된다.
 * 끌 때도 안 돌린다 — 「더 보기」를 두 번 누른 것과 같은 상태다.
 */
export function withTag(state: FeedState, tag: ArticleTag | null): FeedState {
  if (tag === null) return { ...state, tag: null };
  return {
    ...state,
    tag,
    days: Math.min(Math.max(state.days, BADGE_WINDOW_DAYS), MAX_FEED_DAYS),
  };
}

/**
 * 자리를 바꾼다. **펼친 날 수는 처음으로 돌린다.**
 *
 * signal2 의 규칙(「정렬을 바꿔도 펼친 날 수는 그대로」)은 두 버튼이 **같은 글 전부**를
 * 순서만 달리 보여줄 때의 것이다. 이 구현의 자리들은 서로 다른 글을 보여주므로
 * (hot-issue.md INV-G3 — `전체` 도 핫이슈·소식보다 훨씬 많다) 핫이슈에서 5일치 펼친 것이
 * 소식이나 전체 5일치로 넘어가면 뜬금없이 길어진다.
 */
export function withSegment(state: FeedState, segment: FeedSegment): FeedState {
  return { ...state, segment, days: defaultDays(state.tag) };
}

/** 주소에서 값 하나를 꺼내는 함수. 서버(`searchParams` 객체)와 클라이언트(`URLSearchParams`)가 모양이 달라 함수로 받는다. */
export type ParamReader = (key: string) => string | null;

function parseSegment(raw: string | null): FeedSegment {
  return SEGMENTS.find((s) => s === raw) ?? DEFAULT_FEED_STATE.segment;
}

function parseTag(raw: string | null): ArticleTag | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function parseDays(raw: string | null, tag: ArticleTag | null): number {
  const n = raw === null ? NaN : Number(raw);
  // 정수가 아니거나 범위를 벗어나면 기본값이다. 상한을 두는 이유는 `?days=99999` 같은
  // 주소가 그대로 렌더 비용이 되기 때문이다 — 날짜 그룹 수를 넘으면 어차피 더 안 나온다.
  if (!Number.isInteger(n) || n < 1 || n > MAX_FEED_DAYS)
    return defaultDays(tag);
  return n;
}

export function parseFeedState(get: ParamReader): FeedState {
  const tag = parseTag(get("kw"));
  return {
    segment: parseSegment(get("tab")),
    tag,
    days: parseDays(get("days"), tag),
  };
}

/** 기본값은 안 싣는다 — 아무것도 안 건드린 화면의 주소가 `/` 로 남는다. */
function toParams(state: FeedState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.segment !== DEFAULT_FEED_STATE.segment)
    params.set("tab", state.segment);
  if (state.tag !== null) params.set("kw", state.tag);
  if (state.days !== defaultDays(state.tag))
    params.set("days", String(state.days));
  return params;
}

/** 피드 주소. */
export function feedHref(state: FeedState): string {
  const query = toParams(state).toString();
  return query === "" ? "/" : `/?${query}`;
}

/**
 * 상세 주소. 피드 상태를 **그대로** 싣는다.
 *
 * 상세 자신은 목록을 안 그리지만 두 가지가 이 값을 쓴다 — 이전/다음이 어느 줄에서
 * 이웃을 찾는지, 그리고 「피드로」가 어디로 돌아가는지. 안 실으면 3일치를 펼쳐 놓고
 * 그저께 글을 연 뒤 돌아왔을 때 오늘치만 남아 **방금 읽고 나온 글이 피드에 없다.**
 */
export function articleHref(id: string, state: FeedState): string {
  const query = toParams(state).toString();
  const path = `/articles/${encodeURIComponent(id)}`;
  return query === "" ? path : `${path}?${query}`;
}

/**
 * 상세를 열 때 주소가 들고 온 피드 상태를 **그 글에 맞춘다** (design-rules 2026-09-01 (3)
 * 「필터 밖 글의 주소로 들어오면 필터를 놓는다」).
 *
 * 켠 뱃지가 안 붙은 글의 주소로 들어오면(손으로 고친 주소·오래된 북마크·공유 링크)
 * 그 목록에 없는 글이라 지킬 이웃 약속이 없다. 필터를 든 채로 두면 이전/다음이 둘 다
 * 비고 주소만 거짓말이 된다. 그래서 놓는다.
 *
 * **자리도 같은 이유로 옮긴다.** 규칙 문서는 필터만 말하지만, 이 구현에서는 자리도
 * 글을 거른다(hot-issue.md INV-G3). 핫이슈 자리를 든 주소로 소식 글을 열면 같은 일이
 * 난다 — 그 글이 서는 자리(핫이슈 아니면 소식)로 옮긴다. `전체` 에는 모든 글이 서므로
 * 그 주소는 자리를 옮길 일이 없다.
 *
 * `days` 는 주소에 명시돼 있을 때만 지킨다. 없던 값은 "뱃지를 켰으니 3일"로 합성된
 * 것이라, 필터를 놓으면 근거가 사라진다.
 */
export function fitFeedStateToArticle(params: {
  state: FeedState;
  /** 주소에 `days` 가 실제로 있었나. */
  daysExplicit: boolean;
  /** 이 글이 요청한 자리에 서나 */
  inSegment: (segment: FeedSegment) => boolean;
  /** 이 글에 이 키워드가 붙어 있나 */
  hasTag: (tag: ArticleTag) => boolean;
}): FeedState {
  const { state, daysExplicit, inSegment, hasTag } = params;
  let next = state;
  if (next.tag !== null && !hasTag(next.tag)) {
    next = {
      ...next,
      tag: null,
      days: daysExplicit ? next.days : defaultDays(null),
    };
  }
  if (!inSegment(next.segment)) {
    const home: FeedSegment = inSegment("hot") ? "hot" : "news";
    next = {
      ...next,
      segment: home,
      days: daysExplicit ? next.days : defaultDays(next.tag),
    };
  }
  return next;
}

/**
 * 펼친 날 수를 **이 글이 속한 날까지** 넓힌다.
 *
 * 이전/다음은 날짜를 넘어 이어지는데(오늘 마지막 글 → 어제 첫 글) 주소의 `days` 는 그대로라,
 * 「다음 글」로 어제 글에 온 뒤 「피드로」를 누르면 오늘치만 펼친 피드로 돌아가 **방금 읽은
 * 글이 피드에 없었다**(2026-09-23 리뷰). 공유 링크로 사흘 전 글에 바로 들어온 경우도 같다.
 * 줄이지는 않는다 — 넓게 펼쳐 둔 사람의 화면을 좁힐 이유가 없다.
 */
export function withDaysCovering<T extends ArticleListItem>(
  state: FeedState,
  ordered: readonly T[],
  id: string,
): FeedState {
  const index = groupByDay(ordered).findIndex((g) =>
    g.articles.some((a) => a.id === id),
  );
  if (index === -1) return state;
  return {
    ...state,
    days: Math.min(Math.max(state.days, index + 1), MAX_FEED_DAYS),
  };
}
