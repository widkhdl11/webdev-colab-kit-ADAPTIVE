import { describe, expect, it } from "vitest";
import { isoWeekKst } from "@/entities/verdict-review";
import { type Candidate, closeStatus, drawSample, excludeSampled, seededRandom, toCandidate } from "./draw-sample";

/** 판정 검토의 표본 뽑기와 닫힘 — docs/specs/verdict-review.md INV-VR1·VR5. */

const NOW = Date.parse("2026-09-28T07:00:00+09:00");
const DAY = 86_400_000;

let n = 0;
function cand(hot: boolean, source: string): Candidate {
  n += 1;
  return {
    itemId: `id-${n}`,
    hot,
    snapshot: { title: `글 ${n}`, source, sourceName: source, url: null, judgedAt: "", trueQuestions: hot ? ["변화"] : [], reasons: {}, oneLine: null, points: [] },
  };
}
function pool(hot: Record<string, number>, notHot: Record<string, number>): Candidate[] {
  const out: Candidate[] = [];
  for (const [s, k] of Object.entries(hot)) for (let i = 0; i < k; i += 1) out.push(cand(true, s));
  for (const [s, k] of Object.entries(notHot)) for (let i = 0; i < k; i += 1) out.push(cand(false, s));
  return out;
}
const countBy = <T,>(xs: readonly T[], f: (x: T) => string) =>
  xs.reduce<Record<string, number>>((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {});

describe("표본 (INV-VR1)", () => {
  it("INV-VR1: 핫이슈 10 + 아님 10 을 뽑는다", () => {
    const { items, shortfall } = drawSample(pool({ a: 8, b: 8, c: 8, d: 8 }, { a: 8, b: 8, c: 8, d: 8 }), seededRandom(1));
    expect(countBy(items, (i) => String(i.hot))).toEqual({ true: 10, false: 10 });
    expect(shortfall).toEqual({ hot: 0, notHot: 0 });
    expect(new Set(items.map((i) => i.itemId)).size).toBe(items.length);
  });

  it("INV-VR1: 한 출처가 판정 대부분을 차지해도 표본에서는 5건을 넘지 않는다 (편중을 심어 확인)", () => {
    const skewed = pool({ big: 36, x: 2, y: 2 }, { big: 36, x: 3, y: 3, z: 3 });
    for (let seed = 1; seed <= 30; seed += 1) {
      const { items } = drawSample(skewed, seededRandom(seed));
      expect(Math.max(...Object.values(countBy(items, (i) => i.snapshot.source)))).toBeLessThanOrEqual(5);
    }
  });

  it("INV-VR1: 상한 때문에 모자라면 있는 만큼만 뽑고 모자란 수를 적는다", () => {
    const { items, shortfall } = drawSample(pool({ a: 9 }, { b: 20, c: 20 }), seededRandom(3));
    expect(countBy(items, (i) => String(i.hot)).true).toBe(5);
    expect(shortfall).toEqual({ hot: 5, notHot: 0 });
  });

  it("INV-VR1: 먼저 뽑은 쪽이 출처를 선점해 반대쪽이 모자라면 맞바꿔서 채운다", () => {
    // 아님 후보는 전부 A 8건, 핫이슈는 A·B·C 5건씩. 최선은 아님=A 5건, 핫이슈=B 5 + C 5.
    for (let seed = 1; seed <= 20; seed += 1) {
      const { items, shortfall } = drawSample(pool({ A: 5, B: 5, C: 5 }, { A: 8 }), seededRandom(seed));
      expect(shortfall).toEqual({ hot: 0, notHot: 5 });
      expect(Math.max(...Object.values(countBy(items, (i) => i.snapshot.source)))).toBeLessThanOrEqual(5);
      // 맞바꾼 결과: 아님 쪽은 A 5건, 핫이슈는 A 없이 B·C 로 — 같은 글이 두 번 들어가지도 않는다
      expect(items.filter((i) => !i.hot).every((i) => i.snapshot.source === "A")).toBe(true);
      expect(items.filter((i) => i.hot).some((i) => i.snapshot.source === "A")).toBe(false);
      expect(new Set(items.map((i) => i.itemId)).size).toBe(items.length);
    }
  });

  it("INV-VR1: 무작위다 — 시드가 다르면 다른 글이 뽑힌다", () => {
    const p = pool({ a: 5, b: 5, c: 5, d: 5 }, { a: 5, b: 5, c: 5, d: 5 });
    const ids = (seed: number) => drawSample(p, seededRandom(seed)).items.map((i) => i.itemId).sort().join();
    expect(ids(1)).not.toBe(ids(2));
    expect(ids(7)).toBe(ids(7));
  });

  it("INV-VR1: 지난 표본에 들어간 글은 다시 뽑지 않는다", () => {
    const p = pool({ a: 3 }, { b: 3 });
    expect(excludeSampled(p, new Set([p[0]!.itemId, p[4]!.itemId])).map((c) => c.itemId)).toEqual(
      p.filter((_, i) => i !== 0 && i !== 4).map((c) => c.itemId),
    );
  });

  it("INV-VR1: 지난 7일 밖·미래·질문별 답 없는 판정은 후보가 아니다 · 사본을 만든다", () => {
    const row = {
      id: "u1", title: "t", title_ko: "제목", source_id: "s", source_name: "S", original_url: "https://ex.com/1", gate: "gate1",
      hot_issue_at: new Date(NOW - 2 * DAY).toISOString(),
      hot_issue_answers: { "변화": true, "방향": false, "기회": true },
      hot_issue_reasons: { "변화": " 비용이 준다. ", "기회": " " },
      one_line: "한 줄", summary_points: ["a", "b", "c", "d"],
    };
    const c = toCandidate(row, NOW);
    expect(c?.hot).toBe(true);
    expect(c?.snapshot).toMatchObject({
      title: "제목", sourceName: "S", url: "https://ex.com/1", trueQuestions: ["변화", "기회"], reasons: { "변화": "비용이 준다." }, points: ["a", "b", "c"],
    });
    expect(toCandidate({ ...row, hot_issue_at: new Date(NOW - 8 * DAY).toISOString() }, NOW)).toBeNull();
    expect(toCandidate({ ...row, hot_issue_at: new Date(NOW + 3600_000).toISOString() }, NOW)).toBeNull();
    expect(toCandidate({ ...row, hot_issue_answers: null }, NOW)).toBeNull();
    expect(toCandidate({ ...row, gate: null }, NOW)?.hot).toBe(false);
  });
});

describe("닫힘 (INV-VR5)", () => {
  const current = isoWeekKst(NOW);
  const w = (extracted: number, status: "reviewed" | null = null) => ({ week: isoWeekKst(extracted), extractedAt: new Date(extracted).toISOString(), status });

  it("INV-VR5: 답이 다 있으면 검토됨, 7일이 지나면 검토 안 함, 그 전에는 안 닫는다", () => {
    expect(closeStatus(w(NOW), [{ answer: "correct" }, { answer: "unsure" }], NOW, current)).toBe("reviewed");
    expect(closeStatus(w(NOW), [{ answer: "correct" }, { answer: null }], NOW + 3 * DAY, current)).toBeNull();
    expect(closeStatus(w(NOW), [{ answer: null }], NOW + 7 * DAY, isoWeekKst(NOW + 7 * DAY))).toBe("unreviewed");
  });

  it("INV-VR5: 지난주 표본은 7일이 몇 초 모자라도 닫는다 — 열린 주가 둘이 되지 않는다", () => {
    expect(closeStatus(w(NOW - 7 * DAY + 5000), [{ answer: null }], NOW, current)).toBe("unreviewed");
  });

  it("INV-VR5: 이미 닫힌 주는 다시 닫지 않는다 · 0건 주는 검토됨이 아니다", () => {
    expect(closeStatus(w(NOW - 8 * DAY, "reviewed"), [], NOW, current)).toBeNull();
    expect(closeStatus(w(NOW), [], NOW, current)).toBeNull();
  });
});
