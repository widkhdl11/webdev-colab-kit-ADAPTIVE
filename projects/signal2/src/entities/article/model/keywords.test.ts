import { describe, expect, it } from "vitest";

import {
  BADGE_LIMIT,
  BADGE_MIN_ARTICLES,
  badgeKey,
  buildKeywordBadges,
  filterByKeyword,
  parseKeywordKey,
} from "./keywords";
import type { Article, Keyword } from "./types";

const NOW = "2026-09-01T12:00:00+09:00";

function make(id: string, publishedAt: string, keywords: Keyword[]): Article {
  return {
    id,
    title: id,
    originalTitle: null,
    summary: null,
    source: "테스트",
    sourceUrl: "https://example.test",
    publishedAt,
    keywords,
    official: null,
    score: 0,
    isTrending: false,
  };
}

const field = (name: string): Keyword => ({ name, axis: "field" });
const kind = (name: string): Keyword => ({ name, axis: "kind" });

const none: ReadonlySet<string> = new Set<string>();

describe("buildKeywordBadges — 창", () => {
  it("창 3일 밖의 소식은 안 센다", () => {
    const articles = [
      make("in-today", "2026-09-01T09:00:00+09:00", [field("모델")]),
      make("in-edge", "2026-08-30T00:30:00+09:00", [field("모델")]),
      // 4일 전 — 창(오늘 포함 3일 = 09-01·08-31·08-30) 밖이다.
      make("out", "2026-08-29T23:30:00+09:00", [field("모델")]),
    ];
    const [badge] = buildKeywordBadges(articles, none, NOW);
    expect(badge?.total).toBe(2);
  });

  it("창 밖 소식만 붙은 키워드는 줄에 아예 안 선다", () => {
    const articles = [
      make("old1", "2026-08-20T09:00:00+09:00", [field("옛것")]),
      make("old2", "2026-08-21T09:00:00+09:00", [field("옛것")]),
    ];
    expect(buildKeywordBadges(articles, none, NOW)).toEqual([]);
  });
});

describe("buildKeywordBadges — 문턱", () => {
  const articles = [
    make("a", "2026-09-01T09:00:00+09:00", [field("둘"), field("하나")]),
    make("b", "2026-09-01T10:00:00+09:00", [field("둘")]),
  ];

  it("문턱(2건) 미만은 빠지고 이상은 남는다", () => {
    const names = buildKeywordBadges(articles, none, NOW).map((b) => b.name);
    expect(names).toContain("둘");
    expect(names).not.toContain("하나");
  });

  it("문턱 상수가 바뀌면 결과도 바뀐다 — 상수가 테스트로 고정돼 있다", () => {
    // 지금 값이 2 라는 사실 자체를 붙든다. 3 으로 바꾸면 '둘'(2건)도 빠져야 맞다.
    expect(BADGE_MIN_ARTICLES).toBe(2);
    expect(BADGE_LIMIT).toBe(60);
  });
});

describe("buildKeywordBadges — 축과 숫자", () => {
  const articles = [
    make("a", "2026-09-01T09:00:00+09:00", [field("보안"), kind("보안")]),
    make("b", "2026-09-01T10:00:00+09:00", [field("보안"), kind("보안")]),
  ];

  it("이름이 같아도 축이 다르면 다른 뱃지다", () => {
    const badges = buildKeywordBadges(articles, none, NOW);
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.key).sort()).toEqual(["field:보안", "kind:보안"]);
  });

  it("숫자는 안 읽은 수이고 전체 건수는 따로 남는다", () => {
    const badges = buildKeywordBadges(articles, new Set(["a"]), NOW);
    for (const badge of badges) {
      expect(badge.total).toBe(2);
      expect(badge.unread).toBe(1);
    }
  });

  it("다 읽으면 숫자가 0 이 되지만 뱃지는 줄에 남는다", () => {
    const badges = buildKeywordBadges(articles, new Set(["a", "b"]), NOW);
    expect(badges).toHaveLength(2);
    expect(badges.every((b) => b.unread === 0 && b.total === 2)).toBe(true);
  });

  it("한 글에 같은 키워드가 두 번 들어와도 한 번만 센다", () => {
    const dup = [
      make("a", "2026-09-01T09:00:00+09:00", [field("모델"), field("모델")]),
      make("b", "2026-09-01T10:00:00+09:00", [field("모델")]),
    ];
    expect(buildKeywordBadges(dup, none, NOW)[0]?.total).toBe(2);
  });
});

describe("buildKeywordBadges — 상한", () => {
  it("상한을 넘는 키워드는 잘라낸다", () => {
    // 문턱(2건)을 넘겨야 줄에 서므로 키워드마다 글 두 개씩 만든다.
    // 건수를 61 → 1 로 내려가게 줘서 잘리는 쪽이 어느 것인지도 정해지게 한다.
    const articles: Article[] = [];
    const total = BADGE_LIMIT + 1;
    for (let i = 0; i < total; i += 1) {
      const name = `키워드${String(i).padStart(3, "0")}`;
      const repeats = total - i + 1;
      for (let n = 0; n < repeats; n += 1) {
        articles.push(
          make(`a${i}-${n}`, "2026-09-01T09:00:00+09:00", [field(name)]),
        );
      }
    }

    const badges = buildKeywordBadges(articles, none, NOW);

    // 자르지 않으면 61 이 된다 — `.slice(0, BADGE_LIMIT)` 를 지우면 이 줄이 깨진다.
    expect(badges).toHaveLength(BADGE_LIMIT);
    // 건수가 가장 적은(=마지막) 키워드가 잘려 나간 쪽이다.
    expect(badges.map((b) => b.name)).not.toContain("키워드060");
    expect(badges[0]?.name).toBe("키워드000");
  });
});

describe("buildKeywordBadges — 순서", () => {
  it("건수가 같으면 축보다 이름이 먼저다", () => {
    // 축을 일부러 엇갈리게 뒀다. 이름 비교자를 지우면 뒤의 key 비교자가 답을 내는데,
    // key 는 `field:하나` · `kind:가나` 라 축 글자(f < k)가 이겨서 ["하나", "가나"] 가 된다.
    // 같은 축 안에서는 key 비교가 이름 비교와 결과가 같아서 이 변이가 안 잡힌다.
    const articles = [
      make("a", "2026-09-01T09:00:00+09:00", [field("하나"), kind("가나")]),
      make("b", "2026-09-01T10:00:00+09:00", [field("하나"), kind("가나")]),
    ];
    expect(buildKeywordBadges(articles, none, NOW).map((b) => b.name)).toEqual([
      "가나",
      "하나",
    ]);
  });

  it("건수도 이름도 같으면 축으로 끊는다", () => {
    // 축만 다른 같은 이름은 localeCompare 가 0 이라 여기서 안 끊으면 입력 순서가 답이 된다.
    const articles = [
      make("a", "2026-09-01T09:00:00+09:00", [kind("보안"), field("보안")]),
      make("b", "2026-09-01T10:00:00+09:00", [kind("보안"), field("보안")]),
    ];
    expect(buildKeywordBadges(articles, none, NOW).map((b) => b.key)).toEqual([
      "field:보안",
      "kind:보안",
    ]);
  });


  it("자리는 전체 건수로 정한다 — 읽어도 순서가 안 바뀐다", () => {
    const articles = [
      make("a1", "2026-09-01T09:00:00+09:00", [field("많음"), field("적음")]),
      make("a2", "2026-09-01T10:00:00+09:00", [field("많음"), field("적음")]),
      make("a3", "2026-09-01T11:00:00+09:00", [field("많음")]),
    ];
    const before = buildKeywordBadges(articles, none, NOW).map((b) => b.name);
    // '많음'(3건)이 붙은 글을 두 개 읽어 안 읽은 수를 1 로 만든다 — '적음'(2건)보다 적어진다.
    const after = buildKeywordBadges(articles, new Set(["a1", "a2"]), NOW).map((b) => b.name);

    expect(before).toEqual(["많음", "적음"]);
    expect(after).toEqual(before);
  });
});

describe("filterByKeyword", () => {
  const articles = [
    make("a", "2026-09-01T09:00:00+09:00", [field("모델"), kind("출시")]),
    make("b", "2026-09-01T10:00:00+09:00", [kind("모델")]),
    make("c", "2026-09-01T11:00:00+09:00", []),
  ];

  it("아무것도 안 켜면 전부 남는다", () => {
    expect(filterByKeyword(articles, null)).toHaveLength(3);
  });

  it("켠 뱃지가 붙은 소식만 남는다", () => {
    expect(filterByKeyword(articles, badgeKey("field", "모델")).map((a) => a.id)).toEqual(["a"]);
  });

  it("축까지 대조한다 — 이름만 같은 다른 축은 안 걸린다", () => {
    expect(filterByKeyword(articles, badgeKey("kind", "모델")).map((a) => a.id)).toEqual(["b"]);
  });

  it("아무 글에도 없는 키워드면 빈 목록이다", () => {
    expect(filterByKeyword(articles, badgeKey("field", "없음"))).toEqual([]);
  });
});

describe("buildKeywordBadges — 깨진 기준 시각", () => {
  it("기준 시각을 못 읽으면 빈 줄이다 — 창이 1970 년까지 열리지 않는다", () => {
    // 가드를 지우면 todayStart 가 null 이라 `null - 172800000` 이 음수가 되고,
    // 창 시작이 1969-12-30 이 되어 **모든 글이 창 안에 든다.**
    const articles = [
      make("a", "2020-01-01T09:00:00+09:00", [field("옛것")]),
      make("b", "2020-01-02T09:00:00+09:00", [field("옛것")]),
    ];
    expect(buildKeywordBadges(articles, none, "날짜가 아님")).toEqual([]);
  });
});

describe("parseKeywordKey", () => {
  it("축 접두사가 붙은 값만 통과한다", () => {
    expect(parseKeywordKey("field:모델")).toBe("field:모델");
    expect(parseKeywordKey("kind:출시")).toBe("kind:출시");
  });

  it("모르는 값·빈 이름·배열·없음은 전부 안 켠 것이다", () => {
    expect(parseKeywordKey("모델")).toBeNull();
    expect(parseKeywordKey("axis:모델")).toBeNull();
    expect(parseKeywordKey("field:")).toBeNull();
    expect(parseKeywordKey(["field:모델"])).toBeNull();
    expect(parseKeywordKey(undefined)).toBeNull();
  });
});
