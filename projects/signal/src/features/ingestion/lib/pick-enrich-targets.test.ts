import { describe, expect, it } from "vitest";
import { pickEnrichTargets } from "./pick-enrich-targets";

const NOW = new Date("2026-08-13T12:00:00.000Z");
/** 기본 배수 1.0, 공식 소스만 높게 — 실제 sources.ts 의 모양과 같다. */
const weightOf = (sourceId: string) => (sourceId === "official" ? 1.6 : 1.0);

const row = (id: string, sourceId: string, hoursAgo: number) => ({
  id,
  sourceId,
  publishedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
});

describe("pickEnrichTargets — 요약할 항목 고르기", () => {
  it("같은 시각이면 weight 높은 소스가 먼저다 — 자주 올리는 매체가 예산을 다 먹지 않는다", () => {
    // 2026-08-13 실행에서 실제로 일어난 일: 한 매체가 10칸을 전부 가져갔다.
    const pool = [
      row("news-1", "news", 1),
      row("news-2", "news", 1),
      row("official-1", "official", 1),
    ];
    expect(pickEnrichTargets({ pool, now: NOW, weightOf, limit: 1 })).toEqual(["official-1"]);
  });

  it("weight 가 같으면 최신이 먼저다", () => {
    const pool = [row("old", "news", 48), row("new", "news", 1)];
    expect(pickEnrichTargets({ pool, now: NOW, weightOf, limit: 1 })).toEqual(["new"]);
  });

  it("충분히 오래되면 weight 가 높아도 최신 글에 밀린다 (시간감쇠가 산다)", () => {
    // weight 만 보면 요약이 옛 공식 발표에만 붙고 오늘 글은 영영 안 붙는다.
    const pool = [row("official-old", "official", 240), row("news-now", "news", 0)];
    expect(pickEnrichTargets({ pool, now: NOW, weightOf, limit: 1 })).toEqual(["news-now"]);
  });

  it("limit 만큼만, 그리고 **어느 것을** 돌려주는지까지", () => {
    // toHaveLength 만 보면 "정렬을 뒤집고 뒤에서 자르기" 변이가 통과한다.
    const pool = [row("a", "news", 1), row("b", "news", 2), row("c", "news", 3)];
    expect(pickEnrichTargets({ pool, now: NOW, weightOf, limit: 2 })).toEqual(["a", "b"]);
  });

  it("limit 이 0 이면 아무것도 고르지 않는다 — 전부 넘기지 않는다", () => {
    const pool = [row("a", "news", 1)];
    expect(pickEnrichTargets({ pool, now: NOW, weightOf, limit: 0 })).toEqual([]);
  });

  it("점수가 같으면 매 주기 같은 순서가 나온다 (경계 항목이 뽑혔다 말았다 하지 않는다)", () => {
    const pool = [row("b", "news", 5), row("a", "news", 5)];
    const first = pickEnrichTargets({ pool, now: NOW, weightOf, limit: 1 });
    const second = pickEnrichTargets({ pool: [...pool].reverse(), now: NOW, weightOf, limit: 1 });
    expect(first).toEqual(second);
  });

  it("입력을 제자리에서 뒤집지 않는다", () => {
    const pool = [row("a", "news", 1), row("b", "news", 2)];
    const before = pool.map((r) => r.id);
    pickEnrichTargets({ pool, now: NOW, weightOf, limit: 2 });
    expect(pool.map((r) => r.id)).toEqual(before);
  });
});

/**
 * 소스당 상한 (2026-08-13 리뷰).
 *
 * 점수순으로만 고르면 "자주 올리고 weight 도 높은 소스"가 그날 신규분만으로 예산을 채운다.
 * 고치려던 것(한 매체가 10칸 독식)이 축만 바꿔 되살아나는 자리다.
 */
describe("pickEnrichTargets — 소스당 상한", () => {
  it("한 소스가 예산을 다 먹지 않는다 — 점수가 전부 더 높아도 상한에서 멈춘다", () => {
    // busy 는 전부 최근이라 점수가 quiet 보다 높다. 상한이 없으면 5칸을 다 가져간다.
    const pool = [
      row("busy-1", "news", 0),
      row("busy-2", "news", 1),
      row("busy-3", "news", 2),
      row("busy-4", "news", 3),
      row("busy-5", "news", 4),
      row("quiet-1", "other", 20),
      row("quiet-2", "other", 21),
    ];
    const picked = pickEnrichTargets({
      pool,
      now: NOW,
      weightOf,
      limit: 5,
      perSourceLimit: 2,
    });
    expect(picked).toEqual(["busy-1", "busy-2", "quiet-1", "quiet-2", "busy-3"]);
    // 상한 안에서는 여전히 점수순이다.
    expect(picked.slice(0, 2)).toEqual(["busy-1", "busy-2"]);
  });

  it("상한에 걸려 칸이 남으면 점수순으로 채운다 — 소스가 하나뿐인 날 예산을 버리지 않는다", () => {
    // 상한을 그냥 잘라 버리면 이 날은 2건만 요약하고 3칸을 버린다.
    const pool = [
      row("a", "news", 0),
      row("b", "news", 1),
      row("c", "news", 2),
      row("d", "news", 3),
      row("e", "news", 4),
    ];
    expect(pickEnrichTargets({ pool, now: NOW, weightOf, limit: 5, perSourceLimit: 2 })).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("남는 칸을 채울 때도 점수순이다 — 상한에 걸린 것들이 뒤섞이지 않는다", () => {
    const pool = [
      row("busy-1", "news", 0),
      row("busy-2", "news", 1),
      row("busy-3", "news", 2),
      row("busy-4", "news", 3),
      row("quiet-1", "other", 10),
    ];
    // 상한 1: busy-1, quiet-1 을 먼저 담고, 남은 2칸은 busy-2 → busy-3 순으로.
    expect(pickEnrichTargets({ pool, now: NOW, weightOf, limit: 4, perSourceLimit: 1 })).toEqual([
      "busy-1",
      "quiet-1",
      "busy-2",
      "busy-3",
    ]);
  });

  it("perSourceLimit 이 0 이하면 상한 없이 점수순 그대로다", () => {
    const pool = [row("a", "news", 0), row("b", "news", 1), row("c", "other", 2)];
    expect(pickEnrichTargets({ pool, now: NOW, weightOf, limit: 2, perSourceLimit: 0 })).toEqual([
      "a",
      "b",
    ]);
  });

  it("기본값이 있다 — perSourceLimit 을 안 주면 상한이 걸린다", () => {
    // 부르는 쪽이 깜빡하면 상한이 사라지는 구조면 안 된다.
    const pool = Array.from({ length: 6 }, (_, i) => row(`busy-${i}`, "news", i));
    pool.push(row("quiet", "other", 30));
    const picked = pickEnrichTargets({ pool, now: NOW, weightOf, limit: 4 });
    expect(picked).toContain("quiet");
    expect(picked.filter((id) => id.startsWith("busy")).length).toBeLessThanOrEqual(3);
  });
});
