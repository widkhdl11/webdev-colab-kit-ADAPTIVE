import { describe, expect, it } from "vitest";
import {
  BADGE_LIMIT,
  BADGE_MIN_COUNT,
  BADGE_WINDOW_DAYS,
  badgeWindowStartIso,
  buildKeywordBadges,
} from "./badges";
import { dayKey } from "@/shared/lib/datetime";
import type { ArticleKeyword } from "../model/types";

/**
 * 뱃지 줄 집계 — INV-B4(미끄러지는 창) · design-rules 2026-08-27.
 *
 * 여기서 붙드는 것 셋: **창 밖은 안 센다** · **자리·순서는 전체 건수로 정한다**
 * (안 읽은 수로 정하면 화면이 뜬 직후 줄이 다시 배열된다) · **문턱 미만은 아예 안 나온다**.
 */

/** KST 기준 날짜가 갈리는 자리를 피해 정오로 잡는다. */
const NOW = "2026-08-30T03:00:00.000Z"; // KST 12:00

const at = (daysAgo: number) =>
  new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString();

const field = (name: string): ArticleKeyword => ({ name, axis: "field" });
const kind = (name: string): ArticleKeyword => ({ name, axis: "kind" });

const article = (id: string, daysAgo: number, tags: ArticleKeyword[]) => ({
  id,
  publishedAt: at(daysAgo),
  tags,
});

const build = (
  articles: ReturnType<typeof article>[],
  readIds: string[] = [],
  over: { windowDays?: number; minCount?: number; limit?: number } = {},
) =>
  buildKeywordBadges({
    articles,
    isRead: (id) => readIds.includes(id),
    nowIso: NOW,
    minCount: 1,
    ...over,
  });

describe("buildKeywordBadges — INV-B4 창 밖은 안 센다", () => {
  it("창 안 글만 센다", () => {
    const badges = build([
      article("a", 0, [field("보안")]),
      article("b", 2, [field("보안")]),
      article("c", 5, [field("보안")]), // 창 밖
    ]);
    expect(badges).toEqual([{ name: "보안", axis: "field", total: 2, unread: 2 }]);
  });

  it("창 안에 하나도 없으면 줄이 비어 있다 — 창 밖 글로 채우지 않는다", () => {
    expect(build([article("c", 9, [field("보안")])])).toEqual([]);
  });

  it("창 길이를 늘리면 그만큼 더 센다 — 창 검사가 살아 있는지 본다", () => {
    const articles = [article("a", 0, [field("보안")]), article("c", 5, [field("보안")])];
    expect(build(articles, [], { windowDays: 7 })[0].total).toBe(2);
  });
});

describe("buildKeywordBadges — 자리·순서는 전체 건수로 정한다", () => {
  it("건수 내림차순", () => {
    const badges = build([
      article("a", 0, [field("코딩")]),
      article("b", 0, [field("보안"), field("코딩")]),
      article("c", 1, [field("보안"), field("코딩")]),
      article("d", 1, [field("보안")]),
    ]);
    expect(badges.map((b) => b.name)).toEqual(["보안", "코딩"]);
  });

  it("동률이면 표기순 — 안 정하면 같은 데이터에서 순서가 흔들린다", () => {
    const badges = build([article("a", 0, [field("나중"), field("가장")])]);
    expect(badges.map((b) => b.name)).toEqual(["가장", "나중"]);
  });

  it("**안 읽은 수는 순서를 안 바꾼다** — 숫자만 바뀐다", () => {
    const articles = [
      article("a", 0, [field("코딩")]),
      article("b", 0, [field("코딩")]),
      article("c", 0, [field("보안")]),
      article("d", 0, [field("보안")]),
      article("e", 0, [field("보안")]),
    ];
    const 안읽음 = build(articles);
    // `보안` 쪽 글을 전부 읽어도 자리는 그대로여야 한다.
    const 읽음 = build(articles, ["c", "d", "e"]);
    expect(안읽음.map((b) => b.name)).toEqual(읽음.map((b) => b.name));
    expect(읽음.map((b) => b.total)).toEqual(안읽음.map((b) => b.total));
    expect(읽음[0]).toEqual({ name: "보안", axis: "field", total: 3, unread: 0 });
  });
});

describe("buildKeywordBadges — 문턱과 상한", () => {
  it("한 번만 나온 키워드는 **아예 안 나온다** (2026-08-30 사용자 결정)", () => {
    const badges = build(
      [
        article("a", 0, [field("보안"), field("한번뿐")]),
        article("b", 0, [field("보안")]),
      ],
      [],
      { minCount: BADGE_MIN_COUNT },
    );
    expect(badges.map((b) => b.name)).toEqual(["보안"]);
  });

  it("문턱을 3 으로 올리면 2건짜리도 빠진다 — 값이 실제로 걸리는지 본다", () => {
    const badges = build(
      [
        article("a", 0, [field("보안"), field("코딩")]),
        article("b", 0, [field("보안"), field("코딩")]),
        article("c", 0, [field("보안")]),
      ],
      [],
      { minCount: 3 },
    );
    expect(badges.map((b) => b.name)).toEqual(["보안"]);
  });

  it("상한을 넘으면 자른다 — 자주 나온 것부터 남는다", () => {
    // 30종을 건수가 서로 다르게 만든다. 한 글에 같은 키워드를 여러 번 넣어도 1로 접히므로
    // 건수를 만들려면 **글을 나눠야** 한다.
    const spread = Array.from({ length: 30 }, (_, i) =>
      Array.from({ length: i + 1 }, (_, n) =>
        article(`i${i}-${n}`, 0, [field(`k${String(i).padStart(2, "0")}`)]),
      ),
    ).flat();

    // 상수가 아니라 **명시한 값**으로 자른다 — 자르는 동작과 `BADGE_LIMIT` 의 값은 다른 문제다.
    // 상수를 쓰면 그 값을 올리는 순간 이 테스트가 동작이 아니라 숫자 때문에 깨진다.
    const badges = build(spread, [], { limit: 5 });
    expect(badges).toHaveLength(5);
    // 제일 많이 나온 k29 가 맨 앞, 제일 적은 k00 은 잘려 나간다.
    expect(badges[0].name).toBe("k29");
    expect(badges.map((b) => b.name)).not.toContain("k00");
  });
});

describe("buildKeywordBadges — 세는 기준이 저장 기준과 같다", () => {
  it("표기가 갈려도 한 뱃지로 합친다 — 처음 나온 표기를 쓴다", () => {
    const badges = build([
      article("a", 0, [field("온-디바이스")]),
      article("b", 0, [field("온_디바이스")]),
    ]);
    expect(badges).toEqual([{ name: "온-디바이스", axis: "field", total: 2, unread: 2 }]);
  });

  it("한 글에 같은 뱃지가 두 번 있어도 한 번만 센다", () => {
    const badges = build([article("a", 0, [field("MCP"), field("mcp")])]);
    expect(badges[0].total).toBe(1);
  });

  it("축을 함께 들고 온다 — 화면이 색을 정하는 값이다", () => {
    const badges = build([
      article("a", 0, [kind("출시")]),
      article("b", 0, [kind("출시")]),
    ]);
    expect(badges[0].axis).toBe("kind");
  });
});

describe("뱃지 잠정값", () => {
  it("값 자체를 못 박는다 — 조용히 바뀌면 화면이 달라진 이유를 못 찾는다", () => {
    expect(BADGE_WINDOW_DAYS).toBe(3);
    expect(BADGE_MIN_COUNT).toBe(2);
    expect(BADGE_LIMIT).toBe(60);
    // 문턱이 1이면 한 번 나온 말이 전부 올라와 줄이 수십 개가 된다(2026-08-30 사용자 결정).
    expect(BADGE_MIN_COUNT).toBeGreaterThanOrEqual(2);
  });

  /**
   * 2026-08-30 실측 분포를 그대로 넣는다 (`npm run badges`, 창 3일 · 176건 · 42종).
   * 건수: 21 · 14 · 12 · 11×2 · 10×2 · 9×2 · 8×2 · 7 · 6×4 · 5×2 · 4×3 · 3×6 · 2×2 · 1×13
   */
  const MEASURED_2026_08_30 = [
    21, 14, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 6, 6, 6, 6, 5, 5, 4, 4, 4, 3, 3, 3, 3, 3, 3, 2, 2,
    ...Array.from({ length: 13 }, () => 1),
  ];

  /** `build` 헬퍼는 `minCount: 1` 을 덮어쓴다 — 여기서는 **세 상수의 기본값**이 걸려야 한다. */
  const buildWithDefaults = (articles: ReturnType<typeof article>[]) =>
    buildKeywordBadges({ articles, isRead: () => false, nowIso: NOW });

  it("상한은 화면을 정하지 않는다 — 실측 규모에서는 문턱만 걸린다", () => {
    const articles = MEASURED_2026_08_30.flatMap((count, i) =>
      Array.from({ length: count }, (_, n) =>
        article(`m${i}-${n}`, 0, [field(`k${String(i).padStart(2, "0")}`)]),
      ),
    );

    const badges = buildWithDefaults(articles);

    // 2건 이상이 29종. **상한(60)에 하나도 안 닿는다** — 24 였을 때는 여기서 5종이 잘렸고,
    // 그래서 뉴스가 몰린 날과 한산한 날이 화면에서 똑같이 24개로 보였다.
    expect(badges).toHaveLength(29);
    expect(badges.length).toBeLessThan(BADGE_LIMIT);
    // 1건짜리 13종은 문턱이 걷어낸다.
    expect(badges.every((b) => b.total >= BADGE_MIN_COUNT)).toBe(true);
  });

  it("문턱이 개수를 정한다 — 한산한 창에서는 줄이 짧아진다", () => {
    // 같은 코드에 글이 적게 들어온 날. 2건을 넘는 것이 3종뿐이라 뱃지도 3개다.
    const quiet = [4, 3, 2, 1, 1, 1].flatMap((count, i) =>
      Array.from({ length: count }, (_, n) =>
        article(`q${i}-${n}`, 0, [field(`k${i}`)]),
      ),
    );

    expect(buildWithDefaults(quiet)).toHaveLength(3);
  });
});

/**
 * 창의 왼쪽 끝 — **조회하는 쪽과 세는 쪽이 같은 경계를 봐야 한다** (INV-B4, 2026-08-31).
 *
 * 전에는 조회가 "최신 200건"이라 시간이 아니라 건수로 잘랐다. 3일치가 200건을 넘으면
 * 뱃지가 있는 글을 다 못 세서 숫자가 조용히 작아졌다(실측: 창 185건, 과거 최악 424건).
 * 지금은 조회가 이 함수의 값을 그대로 쓴다 — 그래서 이 둘이 어긋나면 안 된다.
 */
describe("badgeWindowStartIso — 창의 왼쪽 끝", () => {
  it("오늘 포함 3일이면 그저께 KST 자정이다", () => {
    // NOW = 2026-08-30T03:00:00Z = KST 8/30 12:00 → 창은 8/28·8/29·8/30
    expect(badgeWindowStartIso(NOW)).toBe("2026-08-28T00:00:00+09:00");
  });

  it("창을 늘리면 왼쪽 끝이 그만큼 앞으로 간다", () => {
    expect(badgeWindowStartIso(NOW, 1)).toBe("2026-08-30T00:00:00+09:00");
    expect(badgeWindowStartIso(NOW, 7)).toBe("2026-08-24T00:00:00+09:00");
  });

  it("KST 자정 직후에도 그날이 창의 오른쪽 끝이다", () => {
    // 2026-08-30T15:10:00Z = KST 8/31 00:10 → 오늘은 8/31, 창 시작은 8/29
    expect(badgeWindowStartIso("2026-08-30T15:10:00.000Z")).toBe("2026-08-29T00:00:00+09:00");
  });

  it("기준 시각이 깨졌으면 null — 부르는 쪽이 옛 동작으로 되돌아갈 수 있어야 한다", () => {
    expect(badgeWindowStartIso("이건 날짜가 아니다")).toBeNull();
  });

  /**
   * **세는 쪽과 가져오는 쪽이 같은 경계인가.** 이 테스트가 이번 수정의 요점이다 —
   * 둘이 어긋나면 "가져왔는데 안 세는" 글이나 "세야 하는데 안 가져온" 글이 생기고,
   * 둘 다 화면에는 "뱃지 숫자가 좀 작다"로만 보인다.
   */
  it("경계 바로 안쪽 글은 세고, 바로 바깥쪽 글은 안 센다", () => {
    const start = badgeWindowStartIso(NOW)!;
    const startMs = Date.parse(start);
    const justInside = new Date(startMs).toISOString();
    const justOutside = new Date(startMs - 1000).toISOString();

    const build1 = (publishedAt: string) =>
      buildKeywordBadges({
        articles: [{ id: "a", publishedAt, tags: [field("보안")] }],
        isRead: () => false,
        nowIso: NOW,
        minCount: 1,
      });

    expect(build1(justInside)).toHaveLength(1);
    expect(build1(justOutside)).toHaveLength(0);
  });

  it("창 시작이 창 안 가장 오래된 날짜 키와 같은 날이다", () => {
    // 조회는 이 값으로 `published_at >= start` 를 건다. 집계가 쓰는 날짜 키 집합의
    // 가장 이른 날과 같아야 한다 — 하루라도 어긋나면 그 하루가 통째로 새거나 남는다.
    const start = badgeWindowStartIso(NOW)!;
    const oldestCounted = new Date(Date.parse(NOW) - 2 * 86_400_000).toISOString();
    expect(start.slice(0, 10)).toBe(dayKey(oldestCounted));
  });
});
