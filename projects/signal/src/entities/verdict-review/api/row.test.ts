import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { summarize } from "../lib/aggregate";
import type { ReviewSnapshot } from "../model/types";
import { readReviewItems, readReviewWeeks } from "./read";
import { toReviewItem, toReviewWeek, toSnapshotRow, toSummaryRow } from "./row";

/**
 * DB 행 ↔ 도메인 값 — verdict-review INV-VR5·VR6·VR7.
 * 쓰는 쪽(toSummaryRow·toSnapshotRow)과 읽는 쪽(toReviewWeek·toReviewItem)의 칸 이름이 하나라도 어긋나면
 * 닫힌 주가 목록에서 빠져 정확도·수정안 표시가 조용히 꺼진다. 왕복으로 붙든다.
 */

const snap: ReviewSnapshot = {
  title: "제목", source: "s", sourceName: "S", url: "https://ex.com/1", judgedAt: "2026-09-22T00:00:00Z",
  trueQuestions: ["변화"], reasons: { "변화": "근거" }, oneLine: "한 줄", points: ["a"],
};

const weekRow = {
  week: "2026-W39", extracted_at: "2026-09-24T09:54:17Z", pool_size: 335, shortfall: { hot: 0, not_hot: 1 },
  first_answer_at: null, completed_at: null, closing_at: "x", status: "reviewed", closed_at: "x",
};

describe("행 왕복", () => {
  it("INV-VR6: 저장한 집계를 다시 읽으면 같은 집계다", () => {
    const s = { ...summarize([]), correct: 9, wrong: 1, accuracy: 0.9, byDirection: { should_be_hot: 1 }, byQuestion: { "변화": 1 }, bySource: { s: 1 }, kinds: { should_be_hot: 1 }, answerMinutes: 14 };
    const w = toReviewWeek({ ...weekRow, summary: toSummaryRow(s) });
    expect(w?.summary).toEqual(s);
    expect(w?.shortfall).toEqual({ hot: 0, notHot: 1 });
  });

  it("INV-VR2: 저장한 표본 사본을 다시 읽으면 같은 사본이다", () => {
    const i = toReviewItem({ item_id: "u", position: 1, hot: true, snapshot: toSnapshotRow(snap), answer: null, direction: null, answered_at: null });
    expect(i?.snapshot).toEqual(snap);
  });
});

/** from().select()…() 사슬을 흉내 내는 최소 가짜 — 마지막에 {data, error} 를 돌려준다. */
function fakeDb(rows: unknown[]): SupabaseClient {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "limit"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (ok: (v: unknown) => unknown) => ok({ data: rows, error: null });
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("모양이 틀린 행은 조용히 버리지 않는다", () => {
  it("INV-VR5: 표본 행 하나라도 모양이 틀리면 읽기가 실패한다 — 버리면 「전부 답함」이 거짓으로 참이 된다", async () => {
    const good = { item_id: "u", position: 1, hot: true, snapshot: toSnapshotRow(snap), answer: "correct", direction: null, answered_at: "x" };
    await expect(readReviewItems(fakeDb([good]), "2026-W39")).resolves.toHaveLength(1);
    await expect(readReviewItems(fakeDb([good, { ...good, item_id: "v", answer: "모름" }]), "2026-W39")).rejects.toThrow(/모양이 틀리다/);
  });

  it("INV-VR7: 주 행이 틀리면 읽기가 실패한다 — 버리면 닫힌 주가 사라져 수정안 표시가 조용히 꺼진다", async () => {
    await expect(readReviewWeeks(fakeDb([{ ...weekRow, summary: null, status: "reviewed" }, { week: 1 }]), 12)).rejects.toThrow(/모양이 틀리다/);
  });
});
