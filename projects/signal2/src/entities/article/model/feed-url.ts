/* 피드 화면의 상태를 주소로 읽고 쓴다.
 *
 * **주소가 유일한 근거다.** 전에는 정렬·필터를 컴포넌트의 `useState` 에 두고 주소에는
 * 베껴 쓰기만 했다. 그러면 주소가 쓰기 전용이 되어 뒤로가기가 안 맞고, 실제로 안 맞았다 —
 * 「최신」으로 바꾸고 글을 연 뒤 뒤로 오면 주소가 `/` 로 돌아가고 화면도 「핫이슈」였다.
 * (`history.replaceState` 는 Next 라우터가 자기 히스토리를 따로 들고 있어서 남지 않는다.)
 *
 * **쓰는 자리도 여기 하나다.** 전에는 피드 · 카드 링크 · 상세의 「돌아가기」 셋이 각자 주소를
 * 조립했고 이미 갈려 있었다(카드는 `sort=hot` 도 실었고 나머지는 뺐다). 상태가 하나 늘 때마다
 * 세 자리를 다 고쳐야 하는데 한 곳을 빠뜨리면 그 경로에서만 상태가 죽는다 — 실제로
 * `days` 가 그렇게 죽었다.
 */

import { BADGE_WINDOW_DAYS, parseKeywordKey } from "./keywords";
import { parseSort, type FeedSort } from "./order";

export type FeedState = {
  sort: FeedSort;
  keyword: string | null;
  /** 「더 보기」로 펼쳐 둔 날 수. 하루가 기본이다. */
  days: number;
};

export const DEFAULT_FEED_STATE: FeedState = {
  sort: "hot",
  keyword: null,
  days: 1,
};

/**
 * 펼칠 수 있는 최대 날 수.
 *
 * 상한이 읽는 쪽에만 있으면 반쪽이다 — 쓰는 쪽이 범위 밖 값을 주소에 실으면 읽는 쪽이
 * 조용히 기본값으로 되돌려서 **펼쳐 둔 것이 통째로 접힌다.** 전이 함수가 여기서 자른다.
 */
export const MAX_FEED_DAYS = 365;

/** 「더 보기」 한 번. 하루씩 늘린다 — 수집이 매일 아침 도는 배치라 사용자가 세는 단위가 하루다. */
export function withMoreDays(state: FeedState): FeedState {
  return { ...state, days: Math.min(state.days + 1, MAX_FEED_DAYS) };
}

/**
 * 뱃지를 켜고 끈다.
 *
 * **켤 때는 집계 창만큼 편다.** 뱃지 숫자는 창 3일치를 센 값인데 목록은 하루씩 나오므로,
 * 그대로 두면 「6」이라고 적힌 뱃지를 눌렀을 때 카드가 1장만 보이고 나머지는 「더 보기」 뒤에 숨는다.
 *
 * **줄이지는 않는다.** 이미 5일치를 펼쳐 둔 사람에게는 보던 것이 사라지는 일이 된다.
 * 끌 때도 안 돌린다 — 「더 보기」를 두 번 누른 것과 같은 상태다.
 */
export function withKeyword(state: FeedState, keyword: string | null): FeedState {
  if (keyword === null) return { ...state, keyword: null };
  return {
    ...state,
    keyword,
    days: Math.min(Math.max(state.days, BADGE_WINDOW_DAYS), MAX_FEED_DAYS),
  };
}

/** 정렬을 바꾼다. 둘 다 같은 글 전부를 보여주므로 펼친 날 수는 그대로다. */
export function withSort(state: FeedState, sort: FeedSort): FeedState {
  return { ...state, sort };
}

/** 주소에서 값 하나를 꺼내는 함수. 서버(`searchParams` 객체)와 클라이언트(`URLSearchParams`)가 모양이 달라 함수로 받는다. */
export type ParamReader = (key: string) => string | null;

function parseDays(raw: string | null, keyword: string | null): number {
  const n = raw === null ? NaN : Number(raw);
  // 정수가 아니거나 범위를 벗어나면 기본값이다. 상한을 두는 이유는 `?days=99999` 같은
  // 주소가 그대로 렌더 비용이 되기 때문이다 — 날짜 그룹 수를 넘으면 어차피 더 안 나온다.
  //
  // **기본값은 파싱을 통과한 `keyword` 로 정한다.** 주소의 `kw` 를 그대로 보면
  // `/?kw=모델`(축 접두사가 없어 필터가 안 걸리는 값)에서 필터도 안 걸린 채 3일치가 펼쳐진다.
  if (!Number.isInteger(n) || n < 1 || n > MAX_FEED_DAYS) {
    return keyword === null ? DEFAULT_FEED_STATE.days : BADGE_WINDOW_DAYS;
  }
  return n;
}

export function parseFeedState(get: ParamReader): FeedState {
  const keyword = parseKeywordKey(get("kw") ?? undefined);
  return {
    sort: parseSort(get("sort") ?? undefined),
    keyword,
    days: parseDays(get("days"), keyword),
  };
}

/** 기본값은 안 싣는다 — 아무것도 안 건드린 화면의 주소가 `/` 로 남는다. */
export function toFeedQuery(state: FeedState): string {
  const params = new URLSearchParams();
  if (state.sort !== DEFAULT_FEED_STATE.sort) params.set("sort", state.sort);
  if (state.keyword !== null) params.set("kw", state.keyword);
  // 뱃지를 켠 상태의 기본 펼침은 집계 창만큼이므로 그때는 그 값이 생략 대상이다.
  const defaultDays =
    state.keyword === null ? DEFAULT_FEED_STATE.days : BADGE_WINDOW_DAYS;
  if (state.days !== defaultDays) params.set("days", String(state.days));
  return params.toString();
}

/** 피드 주소. */
export function feedHref(state: FeedState): string {
  const query = toFeedQuery(state);
  return query === "" ? "/" : `/?${query}`;
}

/**
 * 상세 주소.
 *
 * `sort` 는 기본값이어도 싣는다 — 상세의 이전/다음이 무엇을 근거로 줄을 세웠는지가 주소에
 * 남아야 링크를 공유했을 때 같은 이웃이 나온다.
 *
 * **`days` 도 싣는다.** 상세 자신은 목록이 없어 안 쓰지만 「피드로 돌아가기」가 이 주소에서
 * 상태를 복원한다. 안 실었더니 3일치를 펼쳐 놓고 그저께 글을 연 뒤 돌아오면 오늘치만 남아
 * **방금 읽고 나온 글이 피드에 없었다.** 브라우저 뒤로가기는 제대로 복원하는데 링크만
 * 다른 곳으로 가는 상태였다 — 두 경로가 같은 곳으로 가야 한다.
 */
export function articleHref(id: string, state: FeedState): string {
  const params = new URLSearchParams({ sort: state.sort });
  if (state.keyword !== null) params.set("kw", state.keyword);
  const defaultDays =
    state.keyword === null ? DEFAULT_FEED_STATE.days : BADGE_WINDOW_DAYS;
  if (state.days !== defaultDays) params.set("days", String(state.days));
  return `/articles/${id}?${params.toString()}`;
}
