import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Answer, Direction, ReviewItem, ReviewWeek } from "../model/types";
import {
  REVIEW_WINDOW_MS,
  accuracyBars,
  directionsFor,
  pickReviewWeek,
  isAnswerOpen,
  isoWeekKst,
  repeatedKinds,
  summarize,
  weekLabel,
} from "./aggregate";
import { kindLabel } from "./labels";

/** 판정 검토 집계 — docs/specs/verdict-review.md INV-VR5·VR6·VR7. */

const NOW = Date.parse("2026-09-28T07:00:00+09:00"); // 월요일
const DAY = 86_400_000;

function item(pos: number, hot: boolean, source: string, qs: string[], answer: Answer | null = null, direction: Direction | null = null): ReviewItem {
  return {
    itemId: `00000000-0000-4000-8000-00000000000${pos}`,
    position: pos,
    hot,
    snapshot: { title: `글 ${pos}`, source, sourceName: source, url: null, judgedAt: "", trueQuestions: qs, reasons: {}, oneLine: null, points: [] },
    answer,
    direction,
    answeredAt: answer === null ? null : "x",
  };
}

const week = (w: string, status: ReviewWeek["status"], kinds: Record<string, number> = {}): ReviewWeek => ({
  week: w,
  extractedAt: new Date(NOW).toISOString(),
  poolSize: 0,
  shortfall: { hot: 0, notHot: 0 },
  firstAnswerAt: null,
  completedAt: null,
  closingAt: status === null ? null : "x",
  status,
  closedAt: status === null ? null : "x",
  summary: status === null ? null : { ...summarize([]), kinds },
});

describe("집계 (INV-VR6)", () => {
  it("INV-VR6: 정확도는 맞다/(맞다+틀리다) — 모르겠다는 분모에서 빼고 건수만 센다 (수기 계산과 대조)", () => {
    const s = summarize([
      item(1, true, "a", ["변화"], "correct"),
      item(2, true, "a", ["기회"], "wrong", "should_not_be_hot"),
      item(3, true, "b", ["변화", "기회"], "wrong", "wrong_reason"),
      item(4, false, "b", [], "unsure"),
      item(5, false, "c", [], "wrong", "should_be_hot"),
    ]);
    // 수기: 맞다 1, 틀리다 3, 모르겠다 1 → 1 / 4 = 25%
    expect(s.accuracy).toBe(0.25);
    expect([s.correct, s.wrong, s.unsure, s.answered, s.total]).toEqual([1, 3, 1, 5, 5]);
    expect(s.byDirection).toEqual({ should_not_be_hot: 1, wrong_reason: 1, should_be_hot: 1 });
    expect(s.byQuestion).toEqual({ "기회": 2, "변화": 1 });
    expect(s.bySource).toEqual({ a: 1, b: 1, c: 1 });
    expect(s.kinds).toEqual({ "should_not_be_hot:기회": 1, "wrong_reason:변화": 1, "wrong_reason:기회": 1, should_be_hot: 1 });
  });

  it("INV-VR6: 모르겠다만 있거나 답이 없으면 정확도는 값 없음이다 (0% 가 아니다)", () => {
    expect(summarize([item(1, true, "a", ["변화"], "unsure")]).accuracy).toBeNull();
    expect(summarize([item(1, true, "a", ["변화"])]).accuracy).toBeNull();
  });

  it("INV-VR6: 같은 사건이라 빠진 아님 글(질문은 참)의 오류는 질문별에 안 들어간다", () => {
    const s = summarize([item(9, false, "c", ["변화"], "wrong", "should_be_hot")]);
    expect(s.byQuestion).toEqual({});
    expect(s.kinds).toEqual({ should_be_hot: 1 });
  });

  it("INV-VR6: 걸린 시간은 첫 답부터 전부 답한 순간까지다", () => {
    const t0 = new Date(NOW).toISOString();
    const t1 = new Date(NOW + 15 * 60_000).toISOString();
    expect(summarize([], { firstAnswerAt: t0, completedAt: t1 }).answerMinutes).toBe(15);
    expect(summarize([], { firstAnswerAt: t0, completedAt: null }).answerMinutes).toBeNull();
  });

  it("INV-VR7: 어느 쪽인지 안 고른 답은 오류 종류에 안 들어가고, 참인 질문이 없는 핫이슈 글은 방향만으로 센다", () => {
    expect(summarize([item(1, true, "a", ["변화"], "wrong", "unknown")]).kinds).toEqual({});
    expect(summarize([item(1, true, "a", ["변화"], "wrong", "unknown")]).byDirection).toEqual({ unknown: 1 });
    expect(summarize([item(1, true, "a", [], "wrong", "should_not_be_hot")]).kinds).toEqual({ should_not_be_hot: 1 });
  });
});

const K = "should_not_be_hot:기회";

describe("2주 연속 오류 (INV-VR7)", () => {
  it("INV-VR7: 같은 종류가 연속한 두 검토됨 주에 나오면 표시한다", () => {
    const r = repeatedKinds([week("2026-W39", "reviewed", { [K]: 2, should_be_hot: 1 }), week("2026-W40", "reviewed", { [K]: 1 })]);
    expect(r).toEqual([{ kind: K, weeks: ["2026-W39", "2026-W40"], counts: [2, 1] }]);
    expect(kindLabel(K)).toBe("잘못 뽑음 · 시한 있음");
  });

  it("INV-VR7: 한 주만 나온 오류는 표시하지 않는다", () => {
    expect(repeatedKinds([week("2026-W39", "reviewed"), week("2026-W40", "reviewed", { should_be_hot: 3 })])).toEqual([]);
  });

  it("INV-VR7: 사이에 검토 안 한 주가 끼거나 주가 비면 연속이 아니다 · 해를 넘는 연속은 연속이다", () => {
    const k = { should_be_hot: 1 };
    expect(repeatedKinds([week("2026-W39", "unreviewed", k), week("2026-W40", "reviewed", k)])).toEqual([]);
    expect(repeatedKinds([week("2026-W38", "reviewed", k), week("2026-W40", "reviewed", k)])).toEqual([]);
    expect(repeatedKinds([week("2026-W38", "reviewed", k), week("2026-W39", "unreviewed"), week("2026-W40", "reviewed", k)])).toEqual([]);
    expect(repeatedKinds([week("2026-W53", "reviewed", k), week("2027-W01", "reviewed", k)])).toHaveLength(1);
  });

  it("INV-VR7: 켜진 표시는 검토 안 한 주에 꺼지지 않고, 그 뒤 검토된 주에서 안 나오면 꺼진다", () => {
    const pair = [week("2026-W39", "reviewed", { [K]: 1 }), week("2026-W40", "reviewed", { [K]: 1 })];
    expect(repeatedKinds([...pair, week("2026-W41", "unreviewed")])).toHaveLength(1);
    expect(repeatedKinds([...pair, week("2026-W41", "reviewed")])).toEqual([]);
    expect(repeatedKinds([...pair, week("2026-W41", "reviewed", { [K]: 2 })])[0]!.weeks).toEqual(["2026-W39", "2026-W40", "2026-W41"]);
  });

  it("INV-VR7: 꺼진 뒤 한 주만 다시 나오면 다시 켜지지 않는다 — 다시 연속 두 주가 필요하다", () => {
    const pair = [week("2026-W39", "reviewed", { [K]: 1 }), week("2026-W40", "reviewed", { [K]: 1 })];
    expect(repeatedKinds([...pair, week("2026-W41", "reviewed"), week("2026-W42", "reviewed", { [K]: 1 })])).toEqual([]);
  });

  it("INV-VR7: 열린 주와 순서 섞인 입력 — 열린 주는 안 보고, 주차 순으로 본다", () => {
    expect(repeatedKinds([week("2026-W40", "reviewed", { [K]: 1 }), week("2026-W41", null), week("2026-W39", "reviewed", { [K]: 1 })])).toHaveLength(1);
  });
});

describe("주와 닫힘", () => {
  it("INV-VR5: 답을 받는 주 — 닫힘 표지·닫힘·7일 경과 중 하나라도 있으면 닫혔다", () => {
    const w = { closingAt: null, status: null, extractedAt: new Date(NOW).toISOString() };
    expect(isAnswerOpen(w, NOW)).toBe(true);
    expect(isAnswerOpen(w, NOW + REVIEW_WINDOW_MS - 1)).toBe(true);
    expect(isAnswerOpen(w, NOW + REVIEW_WINDOW_MS)).toBe(false);
    expect(isAnswerOpen({ ...w, closingAt: "x" }, NOW)).toBe(false);
    expect(isAnswerOpen({ ...w, status: "reviewed" }, NOW)).toBe(false);
    expect(isAnswerOpen({ ...w, extractedAt: "엉터리" }, NOW)).toBe(false);
  });

  it("INV-VR5: 검토 기간은 7일 — DB 함수의 interval 과 같은 값이다", () => {
    expect(REVIEW_WINDOW_MS).toBe(7 * DAY);
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/0012_verdict_review.sql"), "utf8");
    expect(sql).toContain("now() - w.extracted_at >= interval '7 days'");
  });

  it("INV-VR2: 주차는 한국 시간 기준 ISO 주차다", () => {
    expect(isoWeekKst(NOW)).toBe("2026-W40");
    expect(isoWeekKst(Date.parse("2026-09-27T23:30:00+09:00"))).toBe("2026-W39");
    expect(isoWeekKst(Date.parse("2026-09-27T16:00:00Z"))).toBe("2026-W40");
    expect(isoWeekKst(Date.parse("2027-01-01T12:00:00+09:00"))).toBe("2026-W53");
    expect(weekLabel("2026-W39")).toBe("9/21 주");
  });

  it("INV-VR5: 화면이 여는 주 — 답을 받는 주가 있으면 그 주, 없으면 가장 최근 주", () => {
    const open = { ...week("2026-W39", null), extractedAt: new Date(NOW - DAY).toISOString() };
    const closed = week("2026-W40", "unreviewed");
    expect(pickReviewWeek([closed, open], NOW)).toEqual({ week: open, open: true });
    expect(pickReviewWeek([closed, open], NOW + 8 * DAY)).toEqual({ week: closed, open: false });
    expect(pickReviewWeek([], NOW)).toEqual({ week: null, open: false });
  });

  it("INV-VR6: 주별 정확도 막대 — 검토 안 한 주·답이 다 안 모인 이번 주는 값 없음, 지난 주는 셋까지", () => {
    const hist = [
      { ...week("2026-W35", "reviewed"), summary: { ...summarize([]), accuracy: 0.5 } },
      { ...week("2026-W36", "reviewed"), summary: { ...summarize([]), accuracy: 0.9 } },
      week("2026-W37", "unreviewed"),
      { ...week("2026-W38", "reviewed"), summary: { ...summarize([]), accuracy: 0.8 } },
    ];
    const cur = week("2026-W39", null);
    expect(accuracyBars(hist, cur, { total: 20, answered: 7, accuracy: 1 })).toEqual([
      { week: "2026-W36", accuracy: 0.9, note: null },
      { week: "2026-W37", accuracy: null, note: "검토 안 함" },
      { week: "2026-W38", accuracy: 0.8, note: null },
      { week: "2026-W39", accuracy: null, note: "7/20", answered: 7, total: 20 },
    ]);
    expect(accuracyBars([], cur, { total: 20, answered: 20, accuracy: 0.85 })[0]).toMatchObject({ accuracy: 0.85, note: null });
  });

  it("INV-VR3: 판정에 붙을 수 있는 방향 — 핫이슈는 둘, 아님은 하나", () => {
    expect(directionsFor(true)).toEqual(["should_not_be_hot", "wrong_reason"]);
    expect(directionsFor(false)).toEqual(["should_be_hot"]);
  });

});
