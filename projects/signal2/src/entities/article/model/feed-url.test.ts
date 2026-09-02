import { describe, expect, it } from "vitest";

import { BADGE_WINDOW_DAYS } from "./keywords";
import {
  articleHref,
  DEFAULT_FEED_STATE,
  feedHref,
  MAX_FEED_DAYS,
  parseFeedState,
  toFeedQuery,
  withKeyword,
  withMoreDays,
  withSort,
  type FeedState,
} from "./feed-url";

/** 주소 문자열을 읽는 쪽 모양으로 바꾼다. 서버·클라이언트 둘 다 이 함수 하나를 부른다. */
const readerOf = (query: string) => {
  const params = new URLSearchParams(query);
  return (key: string) => params.get(key);
};

describe("parseFeedState", () => {
  it("빈 주소는 기본값이다", () => {
    expect(parseFeedState(readerOf(""))).toEqual(DEFAULT_FEED_STATE);
  });

  it("셋을 다 읽는다", () => {
    expect(parseFeedState(readerOf("sort=latest&kw=field:모델&days=4"))).toEqual({
      sort: "latest",
      keyword: "field:모델",
      days: 4,
    });
  });

  it("뱃지를 켠 주소의 days 기본값은 집계 창이다", () => {
    // 링크를 받아 들어온 사람도 「6」짜리 뱃지에서 카드 1장만 보는 일이 없어야 한다.
    expect(parseFeedState(readerOf("kw=kind:출시")).days).toBe(BADGE_WINDOW_DAYS);
    expect(parseFeedState(readerOf("")).days).toBe(1);
  });

  it("망가진 days 는 기본값으로 물러선다", () => {
    for (const raw of ["0", "-3", "1.5", "abc", "99999", ""]) {
      expect(parseFeedState(readerOf(`days=${raw}`)).days).toBe(1);
    }
  });

  it("모르는 키워드 형식은 안 켠 것이고, 그때 days 도 안 펼쳐진다", () => {
    expect(parseFeedState(readerOf("kw=모델")).keyword).toBeNull();
    expect(parseFeedState(readerOf("kw=axis:모델")).keyword).toBeNull();
    // 주소의 kw 를 파싱 전에 보면 `/?kw=모델` 이 **필터도 안 걸린 채 3일치가 펼쳐진** 화면이 된다.
    expect(parseFeedState(readerOf("kw=모델")).days).toBe(1);
  });
});

describe("toFeedQuery", () => {
  it("기본값은 안 싣는다 — 아무것도 안 건드린 화면의 주소가 / 로 남는다", () => {
    expect(toFeedQuery(DEFAULT_FEED_STATE)).toBe("");
    expect(feedHref(DEFAULT_FEED_STATE)).toBe("/");
  });

  it("뱃지를 켠 상태의 days 는 집계 창이면 생략된다", () => {
    const on: FeedState = {
      sort: "hot",
      keyword: "field:모델",
      days: BADGE_WINDOW_DAYS,
    };
    expect(toFeedQuery(on)).toBe("kw=field%3A%EB%AA%A8%EB%8D%B8");
    // 창보다 더 펼쳤으면 실린다 — 그래야 왕복해도 안 접힌다.
    expect(toFeedQuery({ ...on, days: 5 })).toContain("days=5");
  });
});

describe("왕복", () => {
  const cases: FeedState[] = [
    DEFAULT_FEED_STATE,
    { sort: "latest", keyword: null, days: 1 },
    { sort: "hot", keyword: "field:모델", days: BADGE_WINDOW_DAYS },
    { sort: "latest", keyword: "kind:출시", days: 7 },
    { sort: "hot", keyword: null, days: 4 },
    // 콜론·공백이 든 이름도 주소를 거쳐 돌아와야 한다.
    { sort: "hot", keyword: "field:개발 환경", days: 1 },
  ];

  it.each(cases)("주소로 썼다 읽으면 같은 상태다: %j", (state) => {
    expect(parseFeedState(readerOf(toFeedQuery(state)))).toEqual(state);
  });
});

describe("withKeyword", () => {
  it("켜면 집계 창만큼 편다 — 「6」짜리 뱃지에서 카드 1장만 보이지 않게", () => {
    expect(withKeyword(DEFAULT_FEED_STATE, "field:모델")).toEqual({
      sort: "hot",
      keyword: "field:모델",
      days: BADGE_WINDOW_DAYS,
    });
  });

  it("이미 더 펼쳐 뒀으면 안 줄인다 — 보던 것이 사라지지 않게", () => {
    const wide: FeedState = { sort: "hot", keyword: null, days: 5 };
    expect(withKeyword(wide, "field:모델").days).toBe(5);
  });

  it("끌 때도 안 돌린다 — 「더 보기」를 두 번 누른 것과 같은 상태다", () => {
    const on: FeedState = { sort: "hot", keyword: "field:모델", days: 5 };
    expect(withKeyword(on, null)).toEqual({ ...on, keyword: null });
  });

  it("정렬은 안 건드린다", () => {
    const s: FeedState = { sort: "latest", keyword: null, days: 1 };
    expect(withKeyword(s, "kind:출시").sort).toBe("latest");
  });
});

describe("withMoreDays", () => {
  it("하루씩 늘린다", () => {
    expect(withMoreDays(DEFAULT_FEED_STATE).days).toBe(2);
    expect(withMoreDays({ ...DEFAULT_FEED_STATE, days: 9 }).days).toBe(10);
  });

  it("상한에서 멈춘다 — 파서가 못 읽는 값을 주소에 실으면 펼친 것이 통째로 접힌다", () => {
    const max: FeedState = { sort: "hot", keyword: null, days: MAX_FEED_DAYS };
    const next = withMoreDays(max);
    expect(next.days).toBe(MAX_FEED_DAYS);
    // 상한 값도 주소를 왕복해서 돌아와야 한다.
    expect(parseFeedState(readerOf(toFeedQuery(next)))).toEqual(next);
  });

  it("정렬·필터는 안 건드린다", () => {
    const s: FeedState = { sort: "latest", keyword: "kind:출시", days: 3 };
    expect(withMoreDays(s)).toEqual({ ...s, days: 4 });
  });
});

describe("withSort", () => {
  it("펼친 날 수와 필터는 그대로다 — 둘 다 같은 글 전부를 보여준다", () => {
    const s: FeedState = { sort: "hot", keyword: "kind:출시", days: 4 };
    expect(withSort(s, "latest")).toEqual({ ...s, sort: "latest" });
  });
});

describe("articleHref", () => {
  it("정렬은 기본값이어도 싣는다 — 링크를 공유해도 같은 이웃이 나와야 한다", () => {
    expect(articleHref("a01", DEFAULT_FEED_STATE)).toBe("/articles/a01?sort=hot");
  });

  it("켠 뱃지와 펼친 날 수를 같이 싣는다 — 「돌아가기」가 여기서 상태를 복원한다", () => {
    const href = articleHref("a01", {
      sort: "latest",
      keyword: "kind:출시",
      days: 5,
    });
    expect(href).toContain("sort=latest");
    expect(href).toContain("kw=kind%3A");
    // 안 실었더니 3일치를 펼쳐 놓고 그저께 글을 연 뒤 돌아오면 오늘치만 남았다 —
    // 방금 읽고 나온 글이 피드에 없는 상태다.
    expect(href).toContain("days=5");
  });

  it("기본값인 days 는 생략한다 — 주소가 지저분해지지 않게", () => {
    expect(articleHref("a01", DEFAULT_FEED_STATE)).not.toContain("days");
    expect(
      articleHref("a01", { sort: "hot", keyword: "kind:출시", days: BADGE_WINDOW_DAYS }),
    ).not.toContain("days");
  });

  it("상세를 거쳐도 상태가 그대로 돌아온다", () => {
    // 카드 → 상세 → 「피드로 돌아가기」 왕복. 이 경로에서 days 가 죽었었다.
    const before: FeedState = { sort: "latest", keyword: "kind:출시", days: 5 };
    const query = articleHref("a01", before).split("?")[1] ?? "";
    expect(parseFeedState(readerOf(query))).toEqual(before);
  });
});
