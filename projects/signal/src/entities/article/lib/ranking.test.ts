import { describe, expect, it } from "vitest";
import {
  compareForRanking,
  computeScore,
  HALF_LIFE_HOURS,
  markTrending,
  TRENDING_TOP_N,
} from "./ranking";

const HOUR = 3600_000;
const NOW = new Date("2026-08-09T12:00:00.000Z");
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();

describe("computeScore — INV-R2 점수 = 시간감쇠 × 소스 weight", () => {
  it("INV-R2: 같은 입력이면 항상 같은 점수다 (순수 함수)", () => {
    const args = { publishedAt: iso(5), now: NOW, weight: 1.3 };
    expect(computeScore(args)).toBe(computeScore(args));
    expect(computeScore(args)).toBe(computeScore({ ...args }));
  });

  it("INV-R2: 나이에 대해 단조 감소한다", () => {
    const at = (h: number) => computeScore({ publishedAt: iso(h), now: NOW, weight: 1 });
    const ages = [0, 1, 6, 24, 72, 240];
    for (let i = 1; i < ages.length; i += 1) {
      expect(at(ages[i])).toBeLessThan(at(ages[i - 1]));
    }
  });

  it("INV-R2: weight 가 크면 점수가 크다 (같은 발행시각에서)", () => {
    const at = (weight: number) => computeScore({ publishedAt: iso(3), now: NOW, weight });
    expect(at(2)).toBeGreaterThan(at(1));
    // 곱셈이라는 것까지 잡는다 — 덧셈으로 바꾸면 이 비율이 깨진다.
    expect(at(2)).toBeCloseTo(at(1) * 2, 10);
  });

  it("INV-R2: 반감기만큼 지나면 감쇠가 정확히 절반이다", () => {
    const fresh = computeScore({ publishedAt: iso(0), now: NOW, weight: 1 });
    const half = computeScore({ publishedAt: iso(HALF_LIFE_HOURS), now: NOW, weight: 1 });
    expect(half).toBeCloseTo(fresh / 2, 10);
    // 상수를 바꿔도 통과하는 테스트가 되지 않게, 값 자체도 못 박는다.
    expect(HALF_LIFE_HOURS).toBe(18);
  });

  describe("실패 경로", () => {
    it("INV-R2 실패경로: 미래 발행시각이어도 감쇠가 1 을 넘지 않는다", () => {
      const future = computeScore({ publishedAt: iso(-48), now: NOW, weight: 1 });
      const fresh = computeScore({ publishedAt: iso(0), now: NOW, weight: 1 });
      expect(future).toBe(fresh);
      expect(future).toBeLessThanOrEqual(1);
    });

    it("INV-R2 실패경로: 읽을 수 없는 발행시각은 점수 0 (정렬 맨 뒤)", () => {
      // NaN 을 그대로 흘리면 비교가 전부 false 가 되어 정렬이 조용히 뒤죽박죽된다.
      const s = computeScore({ publishedAt: "어제쯤", now: NOW, weight: 5 });
      expect(s).toBe(0);
      expect(Number.isNaN(s)).toBe(false);
    });
  });
});

describe("compareForRanking — INV-R3 정렬은 안정적이다", () => {
  const item = (id: string, score: number, hoursAgo: number) => ({
    id,
    score,
    publishedAt: iso(hoursAgo),
  });

  it("INV-R3: 점수 내림차순이 1순위", () => {
    const sorted = [item("a", 1, 0), item("b", 5, 0), item("c", 3, 0)].sort(compareForRanking);
    expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("INV-R3: 점수가 같으면 발행시각 내림차순이 2순위", () => {
    const sorted = [item("old", 2, 10), item("new", 2, 1)].sort(compareForRanking);
    expect(sorted.map((x) => x.id)).toEqual(["new", "old"]);
  });

  it("INV-R3: 점수·발행시각이 같으면 id 로 가른다 (3순위)", () => {
    const sorted = [item("b", 2, 4), item("a", 2, 4)].sort(compareForRanking);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("INV-R3 (S8): 완전히 같은 두 항목을 두 번 정렬해도 같은 순서다", () => {
    const input = [item("z", 2, 4), item("a", 2, 4), item("m", 2, 4)];
    const first = [...input].sort(compareForRanking).map((x) => x.id);
    const second = [...input].sort(compareForRanking).map((x) => x.id);
    expect(first).toEqual(second);
    expect(first).toEqual(["a", "m", "z"]);
  });

  it("INV-R3: 입력 순서가 달라도 결과가 같다", () => {
    const input = [item("z", 2, 4), item("a", 2, 4), item("m", 2, 4)];
    const forward = [...input].sort(compareForRanking).map((x) => x.id);
    const reversed = [...input].reverse().sort(compareForRanking).map((x) => x.id);
    expect(reversed).toEqual(forward);
  });

  describe("실패 경로", () => {
    it("INV-R3 실패경로: 발행시각을 못 읽어도 순서가 결정적이다", () => {
      const broken = [
        { id: "b", score: 1, publishedAt: "깨짐" },
        { id: "a", score: 1, publishedAt: "깨짐" },
      ];
      expect([...broken].sort(compareForRanking).map((x) => x.id)).toEqual(["a", "b"]);
      expect([...broken].reverse().sort(compareForRanking).map((x) => x.id)).toEqual(["a", "b"]);
    });
  });
});

describe("markTrending — INV-R5 날짜 그룹 안 상위 N", () => {
  // 09-08 그룹 6건(KST 기준), 08-08 그룹 2건.
  const day1 = (h: number) => new Date(`2026-08-09T${String(h).padStart(2, "0")}:00:00+09:00`).toISOString();
  const day2 = (h: number) => new Date(`2026-08-08T${String(h).padStart(2, "0")}:00:00+09:00`).toISOString();
  const items = [
    { id: "d1-1", score: 10, publishedAt: day1(9) },
    { id: "d1-2", score: 9, publishedAt: day1(10) },
    { id: "d1-3", score: 8, publishedAt: day1(11) },
    { id: "d1-4", score: 7, publishedAt: day1(12) },
    { id: "d1-5", score: 6, publishedAt: day1(13) },
    { id: "d1-6", score: 5, publishedAt: day1(14) },
    { id: "d2-1", score: 4, publishedAt: day2(9) },
    { id: "d2-2", score: 3, publishedAt: day2(10) },
  ];
  const trendingIds = (out: { id: string; isTrending: boolean }[]) =>
    out.filter((x) => x.isTrending).map((x) => x.id).sort();

  it("INV-R5: 그룹마다 상위 N 개에만 붙는다 (전역 상위가 아니다)", () => {
    const out = markTrending(items, 3);
    // 전역 상위 3 이면 d1-1·d1-2·d1-3 뿐이다. 그룹 기준이므로 08-08 그룹에서도 뽑힌다.
    expect(trendingIds(out)).toEqual(["d1-1", "d1-2", "d1-3", "d2-1", "d2-2"]);
  });

  it("INV-R5: 그룹이 N 보다 작으면 그 그룹 전부가 뜨는 중", () => {
    const out = markTrending(items, 3);
    expect(out.filter((x) => x.id.startsWith("d2-")).every((x) => x.isTrending)).toBe(true);
  });

  it("INV-R5: 입력 순서가 달라도 같은 집합이 나온다 (정렬 전에 판정한다)", () => {
    const forward = trendingIds(markTrending(items, 3));
    const reversed = trendingIds(markTrending([...items].reverse(), 3));
    expect(reversed).toEqual(forward);
  });

  it("INV-R5: 원본 배열을 건드리지 않는다", () => {
    const before = JSON.stringify(items);
    markTrending(items, 3);
    expect(JSON.stringify(items)).toBe(before);
  });

  it("INV-R5: 기본 개수가 스펙의 값이다", () => {
    // 상수를 바꿔도 전부 green 이면 그 상수는 테스트로 고정돼 있지 않은 것이다.
    expect(TRENDING_TOP_N).toBe(3);
    expect(trendingIds(markTrending(items))).toEqual(trendingIds(markTrending(items, 3)));
  });

  describe("실패 경로", () => {
    it("INV-R5 실패경로: 발행시각을 못 읽는 항목은 뜨는 중이 되지 않는다", () => {
      // 날짜 그룹이 정해지지 않는 항목이다. 아무 그룹에나 넣으면 그 그룹의 상위를 밀어낸다.
      const out = markTrending([...items, { id: "broken", score: 999, publishedAt: "깨짐" }], 3);
      expect(out.find((x) => x.id === "broken")?.isTrending).toBe(false);
      expect(trendingIds(out)).toEqual(["d1-1", "d1-2", "d1-3", "d2-1", "d2-2"]);
    });

    it("INV-R5 실패경로: N 이 0 이하면 아무것도 안 붙는다", () => {
      expect(trendingIds(markTrending(items, 0))).toEqual([]);
      expect(trendingIds(markTrending(items, -1))).toEqual([]);
    });

    it("INV-R5 실패경로: 빈 목록도 그냥 빈 목록", () => {
      expect(markTrending([], 3)).toEqual([]);
    });
  });
});
