import { describe, expect, it } from "vitest";
import { summarize, type ReviewWeek } from "@/entities/verdict-review";
import { STALE_AFTER_MS, reviewNotices } from "./notices";

/** 「눈여겨볼 것」 — docs/specs/verdict-review.md INV-VR8. */

const NOW = Date.parse("2026-09-29T09:00:00+09:00");
const DAY = 86_400_000;

const week = (w: string, patch: Partial<ReviewWeek> = {}): ReviewWeek => ({
  week: w,
  extractedAt: new Date(NOW - DAY).toISOString(),
  poolSize: 100,
  shortfall: { hot: 0, notHot: 0 },
  firstAnswerAt: null,
  completedAt: null,
  closingAt: null,
  status: null,
  closedAt: null,
  summary: null,
  ...patch,
});
const closed = (w: string, accuracy: number | null, kinds: Record<string, number> = {}): ReviewWeek =>
  week(w, { closingAt: "x", status: "reviewed", closedAt: "x", summary: { ...summarize([]), correct: 9, wrong: 1, accuracy, kinds } });

describe("눈여겨볼 것 (INV-VR8)", () => {
  it("INV-VR8: 열린 주는 몇 건 남았고 언제까지인지, 마지막 검토됨 주는 정확도가 뜬다", () => {
    const rows = reviewNotices({
      weeks: [week("2026-W40"), closed("2026-W38", 0.9)],
      openItems: [{ answer: "correct" }, { answer: null }],
      lastRun: { ranAt: new Date(NOW - DAY).toISOString(), ok: true, message: "뽑음" },
      nowMs: NOW,
    });
    expect(rows).toEqual([
      { tone: "warn", text: "9/28 주 판정 표본 2건 중 1건이 답을 기다린다 (10/5까지) — 판정 검토 탭" },
      { tone: "info", text: "9/14 주 판정 정확도 90% (10건 검토)" },
    ]);
  });

  it("INV-VR8: 마지막 실행이 실패면 그 실패가 먼저 뜬다", () => {
    const rows = reviewNotices({ weeks: [], openItems: null, lastRun: { ranAt: new Date(NOW - DAY).toISOString(), ok: false, message: "실패: 테이블 없음" }, nowMs: NOW });
    expect(rows[0]).toMatchObject({ tone: "warn" });
    expect(rows[0]!.text).toContain("판정 검토 실행 실패");
    expect(rows[0]!.text).toContain("테이블 없음");
  });

  it("INV-VR8: 실행 기록이 8일 넘게 없으면 「안 돌았을 수 있다」가 뜨고, 8일 안이면 안 뜬다", () => {
    expect(STALE_AFTER_MS).toBe(8 * DAY);
    const at = (ms: number) => ({ ranAt: new Date(NOW - ms).toISOString(), ok: true, message: "할 일 없음" });
    expect(reviewNotices({ weeks: [], openItems: null, lastRun: at(8 * DAY + 60_000), nowMs: NOW }).map((r) => r.text)).toEqual([
      "판정 검토 실행 기록이 8일째 없다 — 수집 실행이 안 돌았을 수 있다",
    ]);
    expect(reviewNotices({ weeks: [], openItems: null, lastRun: at(8 * DAY - 60_000), nowMs: NOW })).toEqual([]);
  });

  it("INV-VR8: 다 답한 열린 주는 안 뜬다 · 7일 지난 주는 열린 주가 아니다", () => {
    const recent = { ranAt: new Date(NOW - DAY).toISOString(), ok: true, message: "할 일 없음" };
    expect(reviewNotices({ weeks: [week("2026-W40")], openItems: [{ answer: "correct" }], lastRun: recent, nowMs: NOW })).toEqual([]);
    const old = week("2026-W38", { extractedAt: new Date(NOW - 8 * DAY).toISOString() });
    expect(reviewNotices({ weeks: [old], openItems: [{ answer: null }], lastRun: recent, nowMs: NOW })).toEqual([]);
  });

  it("INV-VR8: 실행 기록이 한 번도 없으면 그 사실을 띄운다 — 「8일째 없다」는 기록이 있어야 셀 수 있다", () => {
    expect(reviewNotices({ weeks: [], openItems: null, lastRun: null, nowMs: NOW })).toEqual([
      { tone: "info", text: "판정 검토 실행 기록이 아직 없다 — 다음 수집 실행(매일 아침 7시)이 첫 표본을 뽑는다" },
    ]);
  });

  it("INV-VR7: 2주 연속 오류면 수정안 필요가 뜬다", () => {
    const k = { "should_not_be_hot:기회": 1 };
    const rows = reviewNotices({ weeks: [closed("2026-W38", 0.9, k), closed("2026-W39", 0.8, k)], openItems: null, lastRun: null, nowMs: NOW });
    expect(rows.some((r) => r.tone === "warn" && r.text.startsWith("판정 수정안 필요 — 「잘못 뽑음 · 시한 있음」"))).toBe(true);
  });
});
