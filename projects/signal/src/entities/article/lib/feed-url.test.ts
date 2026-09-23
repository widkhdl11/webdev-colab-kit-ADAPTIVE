import { describe, expect, it } from "vitest";
import { BADGE_WINDOW_DAYS } from "./badges";
import {
  articleHref,
  DEFAULT_FEED_STATE,
  feedHref,
  fitFeedStateToArticle,
  MAX_FEED_DAYS,
  parseFeedState,
  withMoreDays,
  withDaysCovering,
  withSegment,
  withTag,
} from "./feed-url";
import type { FeedState } from "./feed-url";
import { findNeighbors } from "./query";
import type { ArticleListItem } from "../model/types";

/** 주소 문자열을 읽는 쪽으로 되돌린다 — 화면이 실제로 하는 왕복과 같다. */
function roundTrip(href: string): FeedState {
  const params = new URLSearchParams(href.split("?")[1] ?? "");
  return parseFeedState((key) => params.get(key));
}

describe("피드 주소 — 주소가 화면 상태의 근거다 (design-rules 2026-09-01 (3))", () => {
  it("아무것도 안 건드린 화면의 주소는 `/` 다", () => {
    expect(feedHref(DEFAULT_FEED_STATE)).toBe("/");
  });

  it("자리·필터·펼친 날 수가 주소를 왕복해도 그대로다 — 뒤로가기가 맞는 근거", () => {
    const state: FeedState = { segment: "news", tag: "코딩", days: 5 };
    expect(roundTrip(feedHref(state))).toEqual(state);
  });

  it("상세 주소도 같은 상태를 싣는다 — 「피드로」가 들어올 때의 화면으로 돌아간다", () => {
    const state: FeedState = { segment: "tools", tag: null, days: 3 };
    const href = articleHref("abc", state);
    expect(href.startsWith("/articles/abc?")).toBe(true);
    expect(roundTrip(href)).toEqual(state);
  });

  it("뱃지를 켠 상태의 기본 펼침(집계 창)은 주소에 안 싣는다", () => {
    const href = feedHref({
      segment: "hot",
      tag: "코딩",
      days: BADGE_WINDOW_DAYS,
    });
    expect(href).not.toContain("days=");
    // 안 실어도 읽는 쪽이 같은 값으로 복원해야 한다
    expect(roundTrip(href).days).toBe(BADGE_WINDOW_DAYS);
  });

  it("실패경로: 모르는 자리·범위 밖 날 수는 기본값으로 읽는다", () => {
    const get = (q: string) => {
      const p = new URLSearchParams(q);
      return parseFeedState((k) => p.get(k));
    };
    expect(get("tab=nope").segment).toBe("hot");
    expect(get("days=0").days).toBe(1);
    expect(get(`days=${MAX_FEED_DAYS + 1}`).days).toBe(1);
    expect(get("days=2.5").days).toBe(1);
    expect(get("kw=%20%20").tag).toBeNull();
  });
});

describe("상태 전이", () => {
  it("「더 보기」는 하루씩 늘린다", () => {
    expect(withMoreDays(DEFAULT_FEED_STATE).days).toBe(2);
  });

  it("「더 보기」는 상한에서 멈춘다 — 넘기면 읽는 쪽이 기본값으로 접어 버린다", () => {
    const at = { ...DEFAULT_FEED_STATE, days: MAX_FEED_DAYS };
    expect(withMoreDays(at).days).toBe(MAX_FEED_DAYS);
  });

  it("뱃지를 켜면 집계 창만큼 편다 — 「6」을 눌렀는데 1장만 보이는 일을 막는다", () => {
    expect(withTag(DEFAULT_FEED_STATE, "코딩").days).toBe(BADGE_WINDOW_DAYS);
  });

  it("뱃지를 켜도 이미 펼친 것은 줄이지 않는다", () => {
    expect(withTag({ ...DEFAULT_FEED_STATE, days: 5 }, "코딩").days).toBe(5);
  });

  it("뱃지를 꺼도 펼친 날 수는 그대로다", () => {
    const on = withTag(DEFAULT_FEED_STATE, "코딩");
    expect(withTag(on, null)).toEqual({ ...on, tag: null });
  });

  it("자리를 바꾸면 펼친 날 수가 처음으로 돌아간다 — 자리마다 다른 글이다", () => {
    const wide = { ...DEFAULT_FEED_STATE, days: 6 };
    expect(withSegment(wide, "news")).toEqual({
      segment: "news",
      tag: null,
      days: 1,
    });
    // 뱃지가 켜져 있으면 처음 = 집계 창
    expect(withSegment({ ...wide, tag: "코딩" }, "news").days).toBe(
      BADGE_WINDOW_DAYS,
    );
  });
});

describe("상세를 열 때 피드 상태를 그 글에 맞춘다 (design-rules 2026-09-01 (3))", () => {
  const everywhere = () => true;

  it("글이 필터 안이면 그대로다", () => {
    const state: FeedState = { segment: "news", tag: "코딩", days: 4 };
    expect(
      fitFeedStateToArticle({
        state,
        daysExplicit: true,
        inSegment: everywhere,
        hasTag: () => true,
      }),
    ).toEqual(state);
  });

  it("켠 뱃지가 안 붙은 글이면 필터를 놓는다", () => {
    const state: FeedState = {
      segment: "news",
      tag: "코딩",
      days: BADGE_WINDOW_DAYS,
    };
    const got = fitFeedStateToArticle({
      state,
      daysExplicit: false,
      inSegment: everywhere,
      hasTag: () => false,
    });
    expect(got.tag).toBeNull();
    // 주소에 없던 3일은 필터 때문에 합성된 값이라 같이 놓는다
    expect(got.days).toBe(1);
  });

  it("주소에 명시된 날 수는 필터를 놓아도 지킨다 — 사용자가 실제로 펼친 값이다", () => {
    const state: FeedState = { segment: "news", tag: "코딩", days: 5 };
    const got = fitFeedStateToArticle({
      state,
      daysExplicit: true,
      inSegment: everywhere,
      hasTag: () => false,
    });
    expect(got.days).toBe(5);
  });

  it("그 자리에 안 서는 글이면 그 글이 서는 자리로 옮긴다", () => {
    const state: FeedState = { segment: "hot", tag: null, days: 1 };
    const got = fitFeedStateToArticle({
      state,
      daysExplicit: false,
      inSegment: (s) => s === "news",
      hasTag: () => true,
    });
    expect(got.segment).toBe("news");
  });

  it("스킬·툴 자리에 안 서는 핫이슈 글은 핫이슈로 옮긴다", () => {
    const state: FeedState = { segment: "tools", tag: null, days: 1 };
    const got = fitFeedStateToArticle({
      state,
      daysExplicit: false,
      inSegment: (s) => s === "hot",
      hasTag: () => true,
    });
    expect(got.segment).toBe("hot");
  });
});

describe("이전/다음 이웃", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("가운데 글은 앞뒤가 다 있다", () => {
    expect(findNeighbors(rows, "b")).toEqual({
      prev: { id: "a" },
      next: { id: "c" },
    });
  });

  it("끝에 닿으면 그쪽이 비어 있다", () => {
    expect(findNeighbors(rows, "a")?.prev).toBeNull();
    expect(findNeighbors(rows, "c")?.next).toBeNull();
  });

  it("목록에 없는 글이면 이웃을 모른다 — 「끝에 닿았다」와 구별된다", () => {
    expect(findNeighbors(rows, "z")).toBeNull();
  });
});

describe("펼친 날 수를 그 글의 날까지 넓힌다", () => {
  const at = (id: string, publishedAt: string) =>
    ({ id, publishedAt }) as unknown as ArticleListItem;
  const ordered = [
    at("t1", "2026-08-05T01:00:00.000Z"),
    at("y1", "2026-08-04T01:00:00.000Z"),
    at("d1", "2026-08-03T01:00:00.000Z"),
  ];

  it("어제 글이면 이틀로 넓힌다 — 「피드로」 돌아갔을 때 그 글이 보인다", () => {
    expect(withDaysCovering(DEFAULT_FEED_STATE, ordered, "y1").days).toBe(2);
  });

  it("이미 넓으면 줄이지 않는다", () => {
    expect(
      withDaysCovering({ ...DEFAULT_FEED_STATE, days: 5 }, ordered, "t1").days,
    ).toBe(5);
  });

  it("목록에 없는 글이면 그대로다", () => {
    expect(withDaysCovering(DEFAULT_FEED_STATE, ordered, "zz")).toEqual(
      DEFAULT_FEED_STATE,
    );
  });
});
