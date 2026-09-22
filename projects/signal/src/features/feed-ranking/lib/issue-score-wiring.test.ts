import { describe, expect, it, vi } from "vitest";

/**
 * 이슈성이 **실제로 `computeIssueScore` 를 거쳐 나오는지** (hot-issue.md INV-N3).
 *
 * ── 왜 값 비교로는 안 되나 ───────────────────────────────────────────────────
 * 지금 이슈성과 랭킹 점수는 **같은 수**다. 이슈성은 `교차 발행처 수 × weight × 시간감쇠`
 * 이고 그 수가 항상 1 이라, `weight × 시간감쇠` 인 점수와 값이 같아진다.
 *
 * 그래서 `rankFeed` 가 이슈성 자리에 점수 계산을 넣어도 **결과가 한 글자도 안 바뀐다.**
 * 실제로 2026-09-21 에 그 변이를 심어 봤고 검사 842개가 전부 통과했다. 동작으로는
 * 구별할 수 없는 자리라는 뜻이다.
 *
 * ── 그래서 호출을 본다 ───────────────────────────────────────────────────────
 * 값이 같은 동안 붙들 수 있는 것은 **어느 함수를 거치는가** 하나뿐이다. 같은 사건 묶기가
 * 붙어 교차 발행처 수가 1 을 넘는 날, 그때 값이 갈리는 것은 이 호출이 살아 있을 때뿐이다.
 * 호출이 끊겨 있으면 그날 핫이슈 순서는 조용히 안 바뀐다 — 2026-09-21 이전 상태가 그것이고,
 * `placeArticle` 이 화면에서 안 불리던 것과 같은 모양이다.
 *
 * **이 검사는 값이 갈리는 날 지워도 된다.** 그때는 값 비교가 더 강한 검사가 된다.
 */

interface IssueScoreArgs {
  crossPublisherCount: number;
  weight: number;
  publishedAt: string;
  now: Date;
}

const { computeIssueScoreSpy } = vi.hoisted(() => ({
  computeIssueScoreSpy: vi.fn((_args: unknown) => 42),
}));

vi.mock("@/entities/article", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/article")>();
  return { ...actual, computeIssueScore: computeIssueScoreSpy };
});

const { rankFeed } = await import("./rank-feed");

const NOW = new Date("2026-09-21T12:00:00.000Z");
const weightOf = (id: string) => (id === "heavy" ? 1.6 : 1.0);

const row = (id: string, sourceId = "heavy") => ({
  id,
  sourceId,
  publishedAt: "2026-09-21T09:00:00.000Z",
});

describe("rankFeed — 이슈성은 computeIssueScore 를 거친다 (INV-N3)", () => {
  it("항목마다 그 함수를 부르고, 나온 값을 그대로 싣는다", () => {
    computeIssueScoreSpy.mockClear();
    const out = rankFeed({ items: [row("a"), row("b")], now: NOW, weightOf });

    expect(computeIssueScoreSpy).toHaveBeenCalledTimes(2);
    // 가짜가 42 를 돌려주므로, 점수 계산을 베껴 쓰면 여기가 실제 점수값이 되어 깨진다.
    expect(out.map((x) => x.issueScore)).toEqual([42, 42]);
  });

  it("교차 발행처 수를 인자로 넘긴다 — 식에서 빼지 않는다", () => {
    computeIssueScoreSpy.mockClear();
    rankFeed({ items: [row("a")], now: NOW, weightOf });

    const arg = computeIssueScoreSpy.mock.calls[0][0] as IssueScoreArgs;
    // 지금은 항상 1 이다. **그래도 넘긴다** — 빼면 같은 사건 묶기가 붙는 날 식이
    // 조용히 달라지고 그 전후를 대조할 수 없다(INV-N3).
    expect(arg.crossPublisherCount).toBe(1);
    expect(arg.weight).toBe(1.6);
    expect(arg.now).toBe(NOW);
    expect(arg.publishedAt).toBe("2026-09-21T09:00:00.000Z");
  });

  it("점수(`score`)는 이 함수를 안 거친다 — 두 값이 서로 다른 계산에서 나온다", () => {
    computeIssueScoreSpy.mockClear();
    const out = rankFeed({ items: [row("a")], now: NOW, weightOf });

    // 가짜가 42 인데 점수까지 42 면 두 칸이 한 계산에 묶인 것이다.
    expect(out[0].score).not.toBe(42);
    expect(out[0].score).toBeGreaterThan(0);
  });
});
