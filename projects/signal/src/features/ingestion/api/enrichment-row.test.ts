import { describe, expect, it } from "vitest";
import { toEnrichmentRow } from "./enrichment-row";

const NOW = "2026-09-23T00:00:00.000Z";

describe("요약 저장 줄 (ingestion-ranking INV-S8)", () => {
  it("INV-S8 (S27): 한 줄 요약·핵심·표가 각자 칸으로 간다", () => {
    const table = { head: ["a", "b"], rows: [["1", "2"]] };
    const row = toEnrichmentRow(
      { summary: "한 줄.", oneLine: "한 줄.", points: ["가.", "나.", "다."], table },
      NOW,
    );
    expect(row).toMatchObject({
      summary: "한 줄.",
      one_line: "한 줄.",
      summary_points: ["가.", "나.", "다."],
      summary_table: table,
    });
  });

  it("INV-S8: 표가 없으면 null 로 쓴다 — 칸을 비운다", () => {
    expect(toEnrichmentRow({ summary: "한 줄.", oneLine: "한 줄.", table: null }, NOW).summary_table).toBeNull();
  });

  it("INV-S3 실패경로: 번역만 성공한 항목은 요약 칸을 건드리지 않는다", () => {
    const row = toEnrichmentRow({ titleKo: "제목" }, NOW);
    expect(row).toEqual({ updated_at: NOW, title_ko: "제목" });
  });

  it("INV-S3 (S32): 요약 불합격 횟수는 summary_failures 칸으로 가고 요약 칸은 안 건드린다", () => {
    // 이 줄이 빠지면 한도가 영영 안 차서 같은 글에 매 주기 요금이 나간다.
    expect(toEnrichmentRow({ summaryFailures: 2 }, NOW)).toEqual({ updated_at: NOW, summary_failures: 2 });
  });
});
