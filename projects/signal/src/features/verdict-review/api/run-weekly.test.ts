import { describe, expect, it } from "vitest";
import type { ReviewItem, ReviewWeek, WeekStatus, WeekSummary } from "@/entities/verdict-review";
import type { Candidate } from "../lib/draw-sample";
import type { ReviewStore } from "./review-store";
import { runWeeklyReview } from "./run-weekly";

/**
 * 판정 검토 주간 실행 — docs/specs/verdict-review.md INV-VR1·VR2·VR5·VR8.
 * DB 는 메모리 가짜로 바꾼다. 가짜는 DB 의 규칙 셋만 흉내 낸다: 주차는 하나(INV-VR2),
 * 닫힘 표지는 한 번, 닫힘은 status 가 비었을 때만. 무슨 순서로 불렀는지를 적어 둔다.
 */

const NOW = new Date("2026-09-28T07:05:00+09:00"); // 월요일 — 2026-W40
const T0 = new Date("2026-09-22T09:00:00+09:00");
const DAY = 86_400_000;

function fakeStore(init: { weeks?: ReviewWeek[]; items?: Record<string, ReviewItem[]>; rows?: unknown[]; failOn?: string } = {}) {
  const weeks = new Map((init.weeks ?? []).map((w) => [w.week, { ...w }]));
  const items = new Map(Object.entries(init.items ?? {}));
  const calls: string[] = [];
  const runs: { ok: boolean; message: string }[] = [];
  // 표지가 커밋된 뒤에 들어온 답을 흉내 낸다 — markClosing 과 다음 읽기 사이에 답 하나가 끝난다
  let onMarked: ((week: string) => void) | null = null;
  const fail = (name: string) => {
    if (init.failOn === name) throw new Error(`${name} 실패`);
  };
  const store: ReviewStore = {
    async listWeeks() {
      calls.push("listWeeks");
      fail("listWeeks");
      return [...weeks.values()].map((w) => ({ ...w }));
    },
    async weekItems(week) {
      calls.push(`weekItems ${week}`);
      return (items.get(week) ?? []).map((i) => ({ ...i }));
    },
    async week(week) {
      const w = weeks.get(week);
      return w ? { ...w } : null;
    },
    async sampledItemIds(ids) {
      const all = new Set([...items.values()].flat().map((i) => i.itemId));
      return new Set(ids.filter((id) => all.has(id)));
    },
    async candidateRows() {
      calls.push("candidateRows");
      fail("candidateRows");
      return init.rows ?? [];
    },
    async createWeek(input) {
      calls.push(`createWeek ${input.week}`);
      if (weeks.has(input.week)) return false;
      weeks.set(input.week, {
        week: input.week, extractedAt: input.extractedAt, poolSize: input.poolSize,
        shortfall: input.shortfall, firstAnswerAt: null, completedAt: null, closingAt: null, status: null, closedAt: null, summary: null,
      });
      items.set(input.week, input.items.map((c: Candidate, i) => ({
        itemId: c.itemId, position: i + 1, hot: c.hot, snapshot: c.snapshot, answer: null, direction: null, answeredAt: null,
      })));
      return true;
    },
    async markClosing(week) {
      calls.push(`markClosing ${week}`);
      const w = weeks.get(week)!;
      if (w.closingAt === null) w.closingAt = NOW.toISOString();
      onMarked?.(week);
    },
    async closeWeek(week, status: WeekStatus, summary: WeekSummary, closedAt) {
      calls.push(`closeWeek ${week} ${status}`);
      fail("closeWeek");
      const w = weeks.get(week)!;
      if (w.status !== null) return;
      Object.assign(w, { status, summary, closedAt });
    },
    async logRun(ok, message) {
      runs.push({ ok, message });
    },
    async answer() {
      throw new Error("주간 실행은 답을 쓰지 않는다");
    },
  };
  return { store, weeks, items, calls, runs, setOnMarked: (f: (w: string) => void) => (onMarked = f) };
}

const openWeek = (week: string, extractedAt: Date): ReviewWeek => ({
  week, extractedAt: extractedAt.toISOString(), poolSize: 3, shortfall: { hot: 0, notHot: 0 },
  firstAnswerAt: null, completedAt: null, closingAt: null, status: null, closedAt: null, summary: null,
});
const reviewItem = (id: string, answer: ReviewItem["answer"], hot = true): ReviewItem => ({
  itemId: id, position: 1, hot,
  snapshot: { title: id, source: "s", sourceName: "s", url: null, judgedAt: "", trueQuestions: hot ? ["기회"] : [], reasons: {}, oneLine: null, points: [] },
  answer, direction: answer === "wrong" ? (hot ? "should_not_be_hot" : "should_be_hot") : null, answeredAt: answer ? "x" : null,
});
const row = (i: number, hot: boolean) => ({
  id: `r${i}`, title: `글 ${i}`, source_id: `s${i % 6}`, source_name: `S${i % 6}`, gate: hot ? "gate1" : null,
  hot_issue_at: new Date(NOW.getTime() - (1 + (i % 5)) * DAY).toISOString(),
  hot_issue_answers: { "변화": hot, "방향": false, "기회": false },
});

describe("주간 실행", () => {
  it("INV-VR1·VR2: 이번 주 표본이 없으면 뽑고, 실행 기록을 남긴다", async () => {
    const rows = [...Array.from({ length: 15 }, (_, i) => row(i, true)), ...Array.from({ length: 15 }, (_, i) => row(100 + i, false))];
    const f = fakeStore({ rows });
    const r = await runWeeklyReview({ store: f.store, now: NOW, seed: 7 });
    expect(r.ok).toBe(true);
    const created = f.items.get("2026-W40")!;
    expect(created).toHaveLength(20);
    expect(created.filter((i) => i.hot)).toHaveLength(10);
    expect(f.runs).toEqual([{ ok: true, message: expect.stringContaining("뽑음 2026-W40 20건") }]);
  });

  it("INV-VR2: 이번 주 표본이 이미 있으면 후보를 읽지도 않는다 — 다시 뽑지 않는다", async () => {
    const f = fakeStore({ weeks: [openWeek("2026-W40", NOW)], items: { "2026-W40": [reviewItem("a", null)] } });
    const r = await runWeeklyReview({ store: f.store, now: NOW });
    expect(r).toEqual({ ok: true, message: "할 일 없음" });
    expect(f.calls).not.toContain("candidateRows");
    expect(f.calls.some((c) => c.startsWith("createWeek"))).toBe(false);
  });

  it("INV-VR1: 지난 표본에 들어간 글은 이번 표본에서 빠진다", async () => {
    const past = { ...openWeek("2026-W39", new Date(NOW.getTime() - 7 * DAY)), status: "reviewed" as const, closingAt: "x", closedAt: "x" };
    const f = fakeStore({ weeks: [past], items: { "2026-W39": [reviewItem("r0", "correct")] }, rows: [row(0, true), row(1, true)] });
    await runWeeklyReview({ store: f.store, now: NOW, seed: 1 });
    expect(f.items.get("2026-W40")!.map((i) => i.itemId)).toEqual(["r1"]);
  });

  it("INV-VR5: 지난주는 닫힘 표지를 먼저 남기고, 그 뒤에 다시 읽은 표본으로 닫는다", async () => {
    const last = openWeek("2026-W39", new Date(NOW.getTime() - 7 * DAY + 60_000)); // 7일이 1분 모자라다
    const f = fakeStore({ weeks: [last], items: { "2026-W39": [reviewItem("a", "correct"), reviewItem("b", null)] }, rows: [] });
    // 표지와 다시 읽기 사이에 마지막 답이 끝난다 — 그 답까지 집계에 들어가야 한다
    f.setOnMarked((w) => {
      f.items.set(w, [reviewItem("a", "correct"), reviewItem("b", "wrong")]);
      // 그 답이 끝나며 주의 시각도 채워졌다 — 닫는 쪽은 표지 뒤에 다시 읽은 시각을 써야 한다
      Object.assign(f.weeks.get(w)!, { firstAnswerAt: T0.toISOString(), completedAt: new Date(T0.getTime() + 12 * 60_000).toISOString() });
    });
    await runWeeklyReview({ store: f.store, now: NOW });
    const order = f.calls.filter((c) => c.includes("2026-W39"));
    expect(order).toEqual(["weekItems 2026-W39", "markClosing 2026-W39", "weekItems 2026-W39", "closeWeek 2026-W39 reviewed"]);
    const closed = f.weeks.get("2026-W39")!;
    expect(closed.summary).toMatchObject({ answered: 2, correct: 1, wrong: 1, accuracy: 0.5, kinds: { "should_not_be_hot:기회": 1 } });
    // INV-VR6: 걸린 시간 — 표지 전에 읽은 낡은 주(시각 없음)를 쓰면 null 로 영구 저장된다
    expect(closed.summary!.answerMinutes).toBe(12);
  });

  it("INV-VR5·VR6: 답이 모자란 지난주는 검토 안 함으로 닫히고 정확도는 값 없음 · 이번 주 표본은 그대로 뽑힌다", async () => {
    const last = openWeek("2026-W39", new Date(NOW.getTime() - 7 * DAY));
    const f = fakeStore({ weeks: [last], items: { "2026-W39": [reviewItem("a", "correct"), reviewItem("b", null)] }, rows: [row(1, true)] });
    await runWeeklyReview({ store: f.store, now: NOW });
    const closed = f.weeks.get("2026-W39")!;
    expect(closed.status).toBe("unreviewed");
    expect(closed.summary).toMatchObject({ answered: 1, correct: 1, accuracy: null });
    expect(f.weeks.has("2026-W40")).toBe(true);
  });

  it("INV-VR5: 이번 주에 아직 답이 모자라면 닫지 않는다", async () => {
    const f = fakeStore({ weeks: [openWeek("2026-W40", NOW)], items: { "2026-W40": [reviewItem("a", null)] } });
    await runWeeklyReview({ store: f.store, now: new Date(NOW.getTime() + 2 * DAY) });
    expect(f.calls.some((c) => c.startsWith("markClosing"))).toBe(false);
  });

  it("INV-VR8: 실패하면 던지지 않고 실패를 기록한다 — 앞에서 한 일도 같이 적는다", async () => {
    const last = openWeek("2026-W39", new Date(NOW.getTime() - 7 * DAY));
    const f = fakeStore({ weeks: [last], items: { "2026-W39": [reviewItem("a", null)] }, failOn: "candidateRows" });
    const r = await runWeeklyReview({ store: f.store, now: NOW });
    expect(r.ok).toBe(false);
    expect(f.runs).toEqual([{ ok: false, message: "닫음 2026-W39 검토 안 함 0/1 · 실패: 뽑기: candidateRows 실패" }]);
  });

  it("INV-VR2·VR8: 지난주 닫기가 실패해도 이번 주 표본은 뽑는다 — 닫기 실패가 뽑기를 며칠씩 막지 않는다", async () => {
    const last = openWeek("2026-W39", new Date(NOW.getTime() - 7 * DAY));
    const f = fakeStore({ weeks: [last], items: { "2026-W39": [reviewItem("a", null)] }, rows: [row(1, true)], failOn: "closeWeek" });
    const r = await runWeeklyReview({ store: f.store, now: NOW });
    expect(r.ok).toBe(false);
    expect(f.weeks.has("2026-W40")).toBe(true);
    expect(r.message).toContain("실패: 닫기: closeWeek 실패");
  });

  it("INV-VR1: 같은 글이 후보에 두 번 와도 한 번만 뽑힌다", async () => {
    const f = fakeStore({ rows: [row(1, true), row(1, true), row(2, false)] });
    await runWeeklyReview({ store: f.store, now: NOW, seed: 3 });
    const ids = f.items.get("2026-W40")!.map((i) => i.itemId);
    expect(ids.sort()).toEqual(["r1", "r2"]);
  });

  it("INV-VR8: 실패를 기록할 자리도 없으면(테이블 없음) 결과로만 돌려준다 — 여전히 던지지 않는다", async () => {
    const f = fakeStore({ failOn: "listWeeks" });
    f.store.logRun = async () => {
      throw new Error("relation does not exist");
    };
    await expect(runWeeklyReview({ store: f.store, now: NOW })).resolves.toMatchObject({ ok: false });
  });
});
