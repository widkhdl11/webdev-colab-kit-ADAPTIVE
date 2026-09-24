import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STALE_AFTER_HOURS,
  closeStatus,
  drawSample,
  excludeSampled,
  isoWeekKst,
  noticeRows,
  seededRandom,
  summaryLine,
  toCandidate,
} from "../scripts/lib/verdict-sample.mjs";
import {
  QUESTION_LABELS,
  REVIEW_WINDOW_MS,
  directionsFor,
  isClosedView,
  orderItems,
  repeatedKinds,
  summarize,
  weekLabel,
} from "../report/review-model.mjs";
import { DIRECTIONS_FOR, REVIEW_WINDOW_MS as SERVER_WINDOW_MS, isClosed } from "../../../scripts/lib/review-answer.mjs";
import { SIGNAL_STORED_KEYS } from "@/entities/article/lib/summary-format";

/**
 * 판정 검토 — docs/specs/verdict-review.md.
 *
 * 순수 함수를 직접 부른다. 서버 쪽(INV-VR3 거부·VR4 쓰기·VR5 닫힌 주 거부)은
 * verdict-review-server.test.ts 가 실제 서버를 띄워 본다.
 */

const NOW = Date.parse("2026-09-28T07:00:00+09:00"); // 월요일 아침
const HOUR = 3600_000;
const DAY = 24 * HOUR;

type Cand = ReturnType<typeof toCandidate> & object;

function cand(id: string, hot: boolean, source: string, q: string[] = hot ? ["변화"] : []): Cand {
  return {
    id,
    title: `글 ${id}`,
    source,
    source_name: source,
    url: null,
    judged_at: new Date(NOW - DAY).toISOString(),
    verdict: { hot, true_questions: q, reasons: {} },
    summary: { one_line: null, points: [] },
  };
}

function pool(hotBySource: Record<string, number>, notBySource: Record<string, number>): Cand[] {
  const out: Cand[] = [];
  let n = 0;
  for (const [s, k] of Object.entries(hotBySource)) for (let i = 0; i < k; i += 1) out.push(cand(`h${n++}`, true, s));
  for (const [s, k] of Object.entries(notBySource)) for (let i = 0; i < k; i += 1) out.push(cand(`n${n++}`, false, s));
  return out;
}

const countBy = <T,>(xs: T[], f: (x: T) => string) =>
  xs.reduce<Record<string, number>>((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {});

describe("표본 (A)", () => {
  it("INV-VR1: 핫이슈 10 + 아님 10 을 뽑는다", () => {
    // 소스 넷 × 상한 5 = 20. 소스가 셋이면 상한 때문에 15건이 최대다.
    const { items, shortfall } = drawSample(pool({ a: 8, b: 8, c: 8, d: 8 }, { a: 8, b: 8, c: 8, d: 8 }), seededRandom(1));
    const byHot = countBy(items, (i) => String(i.verdict.hot));
    expect(byHot).toEqual({ true: 10, false: 10 });
    expect(shortfall).toEqual({ hot: 0, not_hot: 0 });
  });

  it("INV-VR1: 한 소스가 판정 대부분을 차지해도 표본에서는 5건을 넘지 않는다 (편중을 심어 확인)", () => {
    // 핫이슈 40건 중 36건이 한 매체다. 무작위로만 뽑으면 거의 확실히 5건을 넘는다.
    const skewed = pool({ big: 36, x: 2, y: 2 }, { big: 36, x: 3, y: 3, z: 3 });
    for (let seed = 1; seed <= 30; seed += 1) {
      const { items } = drawSample(skewed, seededRandom(seed));
      const bySource = countBy(items, (i) => i.source);
      expect(Math.max(...Object.values(bySource))).toBeLessThanOrEqual(5);
    }
  });

  it("INV-VR1: 상한 때문에 모자라면 있는 만큼만 뽑고 모자란 수를 적는다", () => {
    // 핫이슈는 소스 하나(a)뿐 — 상한 5 라 5건이 최대다.
    const { items, shortfall } = drawSample(pool({ a: 9 }, { b: 20, c: 20 }), seededRandom(3));
    expect(countBy(items, (i) => String(i.verdict.hot)).true).toBe(5);
    expect(shortfall.hot).toBe(5);
    expect(shortfall.not_hot).toBe(0);
  });

  it("INV-VR1: 무작위다 — 시드가 다르면 다른 글이 뽑힌다", () => {
    const p = pool({ a: 5, b: 5, c: 5, d: 5 }, { a: 5, b: 5, c: 5, d: 5 });
    const ids = (seed: number) => drawSample(p, seededRandom(seed)).items.map((i) => i.id).sort().join();
    expect(ids(1)).not.toBe(ids(2));
    expect(ids(7)).toBe(ids(7));
  });

  it("INV-VR1: 지난 7일 밖의 판정·질문별 답이 없는 판정은 후보가 아니다", () => {
    const row = {
      id: 1, title: "t", source_id: "s", gate: "gate1",
      hot_issue_at: new Date(NOW - 2 * DAY).toISOString(),
      hot_issue_answers: { "변화": true, "방향": false, "기회": true },
      hot_issue_reasons: { "변화": "비용이 준다.", "기회": " " },
    };
    const c = toCandidate(row, NOW);
    expect(c?.verdict).toEqual({ hot: true, true_questions: ["변화", "기회"], reasons: { "변화": "비용이 준다." } });
    expect(toCandidate({ ...row, hot_issue_at: new Date(NOW - 8 * DAY).toISOString() }, NOW)).toBeNull();
    expect(toCandidate({ ...row, hot_issue_answers: null }, NOW)).toBeNull();
    expect(toCandidate({ ...row, hot_issue_at: null }, NOW)).toBeNull();
    expect(toCandidate({ ...row, gate: null }, NOW)?.verdict.hot).toBe(false);
  });

  it("INV-VR2: 주차는 한국 시간 기준 ISO 주차다 — 월요일 아침은 그 주, 일요일 밤은 앞 주", () => {
    expect(isoWeekKst(NOW)).toBe("2026-W40");
    expect(isoWeekKst(Date.parse("2026-09-27T23:30:00+09:00"))).toBe("2026-W39");
    // UTC 로는 일요일인데 한국 시간으로는 월요일 — 한국 시간을 따른다.
    expect(isoWeekKst(Date.parse("2026-09-27T16:00:00Z"))).toBe("2026-W40");
    expect(isoWeekKst(Date.parse("2027-01-01T12:00:00+09:00"))).toBe("2026-W53");
  });
});

// ── 집계 ────────────────────────────────────────────────────────────────

function sampleOf(answers: Record<string, { answer: string; direction?: string; at?: string }>, extractedAt = NOW) {
  const items = [
    cand("1", true, "a", ["변화"]),
    cand("2", true, "a", ["기회"]),
    cand("3", true, "b", ["변화", "기회"]),
    cand("4", false, "b"),
    cand("5", false, "c"),
  ];
  const at = new Date(extractedAt).toISOString();
  return {
    week: isoWeekKst(extractedAt),
    extracted_at: at,
    items,
    answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { at, ...v }])),
  };
}

describe("집계 (C)", () => {
  it("INV-VR6: 정확도는 맞다/(맞다+틀리다) — 모르겠다는 분모에서 빼고 건수만 센다 (수기 계산과 대조)", () => {
    const s = summarize(sampleOf({
      "1": { answer: "correct" },
      "2": { answer: "wrong", direction: "should_not_be_hot" },
      "3": { answer: "wrong", direction: "wrong_reason" },
      "4": { answer: "unsure" },
      "5": { answer: "wrong", direction: "should_be_hot" },
    }));
    // 수기: 맞다 1, 틀리다 3, 모르겠다 1 → 1 / 4 = 25%
    expect(s.accuracy).toBe(0.25);
    expect([s.correct, s.wrong, s.unsure, s.answered, s.total]).toEqual([1, 3, 1, 5, 5]);
    expect(s.byDirection).toEqual({ should_not_be_hot: 1, wrong_reason: 1, should_be_hot: 1 });
    // 질문별은 핫이슈 글의 오류만: 2(기회) + 3(변화·기회)
    expect(s.byQuestion).toEqual({ "기회": 2, "변화": 1 });
    expect(s.bySource).toEqual({ a: 1, b: 1, c: 1 });
    expect(s.kinds).toEqual({ "should_not_be_hot:기회": 1, "wrong_reason:변화": 1, "wrong_reason:기회": 1, should_be_hot: 1 });
  });

  it("INV-VR6: 모르겠다만 있으면 정확도는 값 없음이다 (0% 가 아니다)", () => {
    expect(summarize(sampleOf({ "1": { answer: "unsure" } })).accuracy).toBeNull();
    expect(summarize(sampleOf({})).accuracy).toBeNull();
  });

  it("INV-VR6: 미검토 주의 집계 줄은 정확도가 값 없음이고 건수는 남는다", () => {
    const line = summaryLine(sampleOf({ "1": { answer: "correct" } }), "unreviewed", new Date(NOW).toISOString());
    expect(line.accuracy).toBeNull();
    expect([line.answered, line.correct]).toEqual([1, 1]);
    const done = summaryLine(sampleOf({ "1": { answer: "correct" }, "2": { answer: "wrong" } }), "reviewed", new Date(NOW).toISOString());
    expect(done.accuracy).toBe(0.5);
  });

  it("INV-VR6: 방향 미상은 방향별에는 세고 오류 종류에는 안 센다", () => {
    const s = summarize(sampleOf({ "1": { answer: "wrong", direction: "unknown" } }));
    expect(s.byDirection).toEqual({ unknown: 1 });
    expect(s.kinds).toEqual({});
    expect(s.byQuestion).toEqual({ "변화": 1 });
  });

  it("INV-VR5: 답이 다 있으면 검토됨으로 닫고, 7일이 지나면 미검토로 닫는다", () => {
    const all = Object.fromEntries(["1", "2", "3", "4", "5"].map((id) => [id, { answer: "correct" }]));
    const thisWeek = isoWeekKst(NOW);
    expect(closeStatus(sampleOf(all), [], NOW, thisWeek)).toBe("reviewed");
    expect(closeStatus(sampleOf({ "1": { answer: "correct" } }), [], NOW + 3 * DAY, thisWeek)).toBeNull();
    expect(closeStatus(sampleOf({ "1": { answer: "correct" } }), [], NOW + 7 * DAY, thisWeek)).toBe("unreviewed");
  });

  it("INV-VR5: 지난주 표본은 7일이 몇 초 모자라도 닫는다 — 열린 주가 둘이 되지 않는다", () => {
    const lastWeek = sampleOf({}, NOW - 7 * DAY + 5000);
    expect(closeStatus(lastWeek, [], NOW, isoWeekKst(NOW))).toBe("unreviewed");
  });

  it("INV-VR5: 이미 집계 줄이 있는 주는 다시 닫지 않는다 (같은 주차 줄 두 번 금지)", () => {
    const s = sampleOf({}, NOW - 8 * DAY);
    expect(closeStatus(s, [{ week: s.week }], NOW, isoWeekKst(NOW))).toBeNull();
  });
});

// ── 반영 ────────────────────────────────────────────────────────────────

const line = (week: string, status: string, kinds: Record<string, number>) => ({ week, status, kinds });
const K = "should_not_be_hot:기회";

describe("2주 연속 오류 (C)", () => {
  it("INV-VR7: 같은 종류가 연속한 두 검토됨 주에 나오면 표시한다", () => {
    const r = repeatedKinds([
      line("2026-W39", "reviewed", { [K]: 2, should_be_hot: 1 }),
      line("2026-W40", "reviewed", { [K]: 1 }),
    ]);
    expect(r).toEqual([{ kind: K, weeks: ["2026-W39", "2026-W40"], counts: [2, 1] }]);
    const rows = noticeRows(null, [line("2026-W39", "reviewed", { [K]: 2 }), line("2026-W40", "reviewed", { [K]: 1 })], null);
    expect(rows.some((x: { tone: string; text: string }) => x.tone === "warn" && x.text.includes("잘못 뽑음 · 시한 있음"))).toBe(true);
  });

  it("INV-VR7: 실제 집계 줄로 이어 봐도 표시가 뜬다 (summaryLine → repeatedKinds)", () => {
    // 손으로 만든 줄만 쓰면 summaryLine 이 kinds 를 빠뜨려도 통과한다.
    const wrong2 = { "2": { answer: "wrong", direction: "should_not_be_hot" } };
    const iso = new Date(NOW).toISOString();
    const w39 = summaryLine(sampleOf(wrong2, NOW - 7 * DAY), "reviewed", iso);
    const w40 = summaryLine(sampleOf(wrong2), "reviewed", iso);
    expect(repeatedKinds([w39, w40]).map((r: { kind: string }) => r.kind)).toEqual([K]);
    expect(w40).toMatchObject({ correct: 0, wrong: 1, unsure: 0,
      by_direction: { should_not_be_hot: 1 }, by_question: { "기회": 1 }, by_source: { a: 1 } });
  });

  it("INV-VR7: 한 주만 나온 오류는 표시하지 않는다", () => {
    expect(repeatedKinds([line("2026-W39", "reviewed", {}), line("2026-W40", "reviewed", { should_be_hot: 3 })])).toEqual([]);
    expect(repeatedKinds([line("2026-W40", "reviewed", { should_be_hot: 3 })])).toEqual([]);
  });

  it("INV-VR7: 사이에 검토 안 한 주가 끼거나 주가 비면 연속이 아니다", () => {
    const k = { should_be_hot: 1 };
    expect(repeatedKinds([line("2026-W39", "unreviewed", k), line("2026-W40", "reviewed", k)])).toEqual([]);
    expect(repeatedKinds([line("2026-W38", "reviewed", k), line("2026-W40", "reviewed", k)])).toEqual([]);
    expect(repeatedKinds([line("2026-W38", "reviewed", k), line("2026-W39", "unreviewed", {}), line("2026-W40", "reviewed", k)])).toEqual([]);
    expect(repeatedKinds([line("2026-W53", "reviewed", k), line("2027-W01", "reviewed", k)])).toHaveLength(1);
  });

  it("INV-VR7: 켜진 표시는 검토 안 한 주에 꺼지지 않고, 그 뒤 검토된 주에서 안 나오면 꺼진다", () => {
    const pair = [line("2026-W39", "reviewed", { [K]: 1 }), line("2026-W40", "reviewed", { [K]: 1 })];
    expect(repeatedKinds([...pair, line("2026-W41", "unreviewed", {})])).toHaveLength(1);
    expect(repeatedKinds([...pair, line("2026-W41", "reviewed", {})])).toEqual([]);
    const still = repeatedKinds([...pair, line("2026-W41", "reviewed", { [K]: 2 })]);
    expect(still[0].weeks).toEqual(["2026-W39", "2026-W40", "2026-W41"]);
  });

  it("INV-VR7: 줄 순서가 섞여 있어도 주차 순으로 본다", () => {
    expect(repeatedKinds([line("2026-W40", "reviewed", { [K]: 1 }), line("2026-W39", "reviewed", { [K]: 1 })])).toHaveLength(1);
  });

  it("INV-VR7: 참인 질문이 비어 있는 핫이슈 글의 오류도 방향만으로 한 종류로 센다", () => {
    const s = summarize({ ...sampleOf({}), items: [cand("8", true, "a", [])], answers: { "8": { answer: "wrong", direction: "should_not_be_hot", at: "x" } } });
    expect(s.kinds).toEqual({ should_not_be_hot: 1 });
  });

  it("INV-VR6: 같은 사건이라 빠진 아님 글(질문은 참)의 오류는 질문별에 안 들어간다", () => {
    const s = summarize({ ...sampleOf({}), items: [cand("9", false, "c", ["변화"])], answers: { "9": { answer: "wrong", direction: "should_be_hot", at: "x" } } });
    expect(s.byQuestion).toEqual({});
    expect(s.kinds).toEqual({ should_be_hot: 1 });
  });
});

describe("알림 (D)", () => {
  it("INV-VR8: 열린 주는 언제까지 열려 있는지, 마지막 검토됨 주는 정확도, 실패는 실패 줄로 뜬다", () => {
    const open = sampleOf({ "1": { answer: "correct" } });
    const rows = noticeRows(open, [
      { ...line("2026-W38", "reviewed", {}), accuracy: 0.9, correct: 9, wrong: 1 },
      { ...line("2026-W39", "unreviewed", {}), accuracy: null, correct: 0, wrong: 0 },
    ], "HTTP 500");
    expect(rows.map((r: { text: string }) => r.text)).toEqual([
      "판정 검토 실행 실패 — HTTP 500",
      "9/28 주 판정 표본 5건이 열려 있다 (10/5까지) — 판정 검토 탭",
      "9/14 주 판정 정확도 90% (10건 검토)",
    ]);
    expect(rows.map((r: { tone: string }) => r.tone)).toEqual(["warn", "warn", "info"]);
  });

  it("INV-VR8: 다 답한 열린 주는 열림 줄을 안 띄운다", () => {
    const all = Object.fromEntries(["1", "2", "3", "4", "5"].map((id) => [id, { answer: "correct" }]));
    expect(noticeRows(sampleOf(all), [], null)).toEqual([]);
  });

  it("INV-VR8: 마지막 실행이 8일을 넘으면 대시보드가 「안 돌았을 수 있다」를 띄운다", async () => {
    expect(STALE_AFTER_HOURS).toBe(192);
    const { projectNoticeRows } = await import("../report/render.mjs");
    const sec = (h: number) => ({ "verdict-review": { name: "판정 검토 주간 실행",
      generated_at: new Date(NOW - h * HOUR).toISOString(), stale_after_hours: STALE_AFTER_HOURS, rows: [] } });
    expect(projectNoticeRows(sec(8 * 24 + 1), NOW).some((r: { tone: string }) => r.tone === "warn")).toBe(true);
    expect(projectNoticeRows(sec(8 * 24 - 1), NOW)).toEqual([]);
  });
});

describe("화면과 서버가 같은 판정을 쓴다", () => {
  it("INV-VR3: 화면이 보여 주는 방향은 서버가 받는 방향과 같다", () => {
    for (const hot of [true, false]) {
      const shown = directionsFor({ verdict: { hot } });
      const accepted = DIRECTIONS_FOR[hot ? "hot" : "not_hot"].filter((d: string) => d !== "unknown");
      expect(shown).toEqual(accepted);
    }
  });

  it("INV-VR5: 화면의 「닫힌 주」와 서버의 닫힘 판정이 경계마다 같다", () => {
    expect(REVIEW_WINDOW_MS).toBe(SERVER_WINDOW_MS);
    const s = sampleOf({});
    const cases: [object, object[], number][] = [
      [s, [], NOW], [s, [], NOW + 7 * DAY - 1], [s, [], NOW + 7 * DAY], [s, [{ week: s.week }], NOW],
      [{ ...s, extracted_at: "" }, [], NOW], [{ ...s, extracted_at: "엉터리" }, [], NOW],
    ];
    for (const [sample, lines, now] of cases) expect(isClosedView(sample, lines, now)).toBe(isClosed(sample, lines, now));
  });

  it("주차는 그 주 월요일 날짜로 보인다", () => {
    expect(weekLabel("2026-W39")).toBe("9/21 주");
    expect(weekLabel("2026-W53")).toBe("12/28 주");
  });

  it("목록 순서: 안 답한 것이 위, 답한 것이 아래 — 번호는 표본 순서 그대로", () => {
    const rows = orderItems(sampleOf({ "2": { answer: "correct" }, "4": { answer: "unsure" } }));
    expect(rows.map((r: { no: number }) => r.no)).toEqual([1, 3, 5, 2, 4]);
  });

  it("질문 라벨은 상세 화면과 같고, 저장 키는 판정이 쓰는 키와 같다", () => {
    const view = readFileSync(resolve(process.cwd(), "src/widgets/article-view/ui/article-view.tsx"), "utf8");
    expect(Object.keys(QUESTION_LABELS).sort()).toEqual(Object.values(SIGNAL_STORED_KEYS).sort());
    for (const [key, id] of Object.entries(SIGNAL_STORED_KEYS)) {
      expect(view).toContain(`${key}: "${QUESTION_LABELS[id as keyof typeof QUESTION_LABELS]}"`);
    }
  });
});

describe("표본 (A) — 보강", () => {
  it("INV-VR1: 미래 시각으로 찍힌 판정은 후보가 아니다", () => {
    const row = { id: 1, title: "t", source_id: "s", gate: null, hot_issue_at: new Date(NOW + HOUR).toISOString(), hot_issue_answers: {} };
    expect(toCandidate(row, NOW)).toBeNull();
  });

  it("INV-VR1: 먼저 뽑은 쪽이 출처를 선점해 반대쪽이 모자라면 맞바꿔서 채운다", () => {
    // 아님 후보는 전부 A 8건, 핫이슈는 A·B·C 5건씩. 최선은 아님=A 5건, 핫이슈=B 5 + C 5.
    // 번갈아 뽑기만 하면 핫이슈가 A 를 먼저 가져가서 아님이 5건보다 모자라게 된다.
    for (let seed = 1; seed <= 20; seed += 1) {
      const { items, shortfall } = drawSample(pool({ A: 5, B: 5, C: 5 }, { A: 8 }), seededRandom(seed));
      expect(shortfall).toEqual({ hot: 0, not_hot: 5 });
      expect(Math.max(...Object.values(countBy(items, (i) => i.source)))).toBeLessThanOrEqual(5);
    }
  });

  it("INV-VR1: 지난 표본에 들어간 글은 다시 뽑지 않는다", () => {
    const p = pool({ a: 3 }, { b: 3 });
    const left = excludeSampled(p, [{ items: [p[0], p[4]] }]);
    expect(left.map((c: Cand) => c.id)).toEqual(p.filter((_, i) => i !== 0 && i !== 4).map((c) => c.id));
  });

  it("INV-VR5: 뽑힌 글이 0건인 주는 검토됨으로 닫히지 않는다", () => {
    expect(closeStatus({ ...sampleOf({}), items: [] }, [], NOW, isoWeekKst(NOW))).toBeNull();
  });

  it("INV-VR6: 걸린 시간은 첫 답부터 전부 답한 순간까지다 — 나중에 고친 답은 안 들어간다", () => {
    const s = { ...sampleOf({}), first_answer_at: new Date(NOW).toISOString(), completed_at: new Date(NOW + 15 * 60_000).toISOString(),
      answers: { "1": { answer: "correct", at: new Date(NOW + 5 * DAY).toISOString() } } };
    expect(summaryLine(s, "reviewed", new Date(NOW).toISOString()).answer_minutes).toBe(15);
  });
});

