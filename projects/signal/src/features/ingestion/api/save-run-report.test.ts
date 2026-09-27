import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestReport } from "../lib/ports";

// server-only 는 서버 조건에서만 풀린다 — 빈 모듈로 바꿔 끼운다(그 방벽은 빌드가 잡는다).
vi.mock("server-only", () => ({}));

const selectItemsByUrl = vi.fn(async (_urls: string[]) => ({
  data: [] as { source_id: string; original_url: string }[],
  error: null as { message: string } | null,
}));
const insertRun = vi.fn(async (_row: unknown) => ({ error: null as { message: string; code?: string } | null }));

vi.mock("@/shared/api/supabase-server", () => ({
  serverSupabase: () => ({
    from(table: string) {
      if (table === "item") {
        return {
          select: () => ({
            in: (_col: string, urls: string[]) => selectItemsByUrl(urls),
          }),
        };
      }
      if (table === "ingest_run") {
        return { insert: (row: unknown) => insertRun(row) };
      }
      throw new Error(`예상 못 한 테이블: ${table}`);
    },
  }),
}));

const NO_TOPIC_FILTER = {
  attempted: 0,
  alreadyKnown: 0,
  notChecked: 0,
  failureReasons: [],
  filtered: 0,
  filteredTitles: [],
  failedOpen: 0,
};

const NO_USAGE = {
  calls: 0,
  topicCalls: 0,
  topicInputTokens: 0,
  topicOutputTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  maxInputTokens: 0,
  stageMs: {
    feedMs: 0,
    topicMs: 0,
    storeMs: 0,
    hotIssueMs: 0,
    extractionMs: 0,
    enrichmentMs: 0,
    keywordsMs: 0,
  },
  hotIssueCalls: 0,
  hotIssueInputTokens: 0,
  hotIssueOutputTokens: 0,
  keywordCalls: 0,
  keywordInputTokens: 0,
  keywordOutputTokens: 0,
  models: {
    topic: "claude-haiku-4-5",
    hotIssue: "claude-sonnet-5",
    enrich: "claude-sonnet-5",
    keywords: "claude-haiku-4-5",
  },
};

const NO_TOPIC_USAGE = { calls: 0, inputTokens: 0, outputTokens: 0 };

function report(over: Partial<IngestReport> = {}): IngestReport {
  return {
    sources: [
      {
        sourceId: "a",
        fetched: 3,
        stored: 2,
        dropped: 0,
        error: null,
        topicFilter: { ...NO_TOPIC_FILTER, filtered: 1, filteredTitles: ["걸러진 제목"] },
        topicUsage: NO_TOPIC_USAGE,
      },
      {
        sourceId: "b",
        fetched: 1,
        stored: 1,
        dropped: 0,
        error: null,
        topicFilter: NO_TOPIC_FILTER,
        topicUsage: NO_TOPIC_USAGE,
      },
    ],
    failedSources: [],
    topicFilter: { ...NO_TOPIC_FILTER, filtered: 1, filteredTitles: ["걸러진 제목"] },
    extraction: { attempted: 0, succeeded: 0, failed: 0, failedUrls: [], failureReasons: [], error: null },
    summaries: { attempted: 0, succeeded: 0, failed: 0, skippedNoEvidence: 0, failedTitles: [], gaveUpTitles: [], failureReasons: [], error: null },
    titles: { attempted: 0, succeeded: 0, failed: 0, failedTitles: [], failureReasons: [], error: null },
    usage: NO_USAGE,
    enrichUsageBySource: {},
  keywords: null,
    hotIssue: null,
    budget: {
      exhausted: false,
      skippedSources: [],
      skippedTopicChecks: 0,
      skippedExtractions: 0,
      skippedEnrichments: 0,
    skippedKeywords: false,
      skippedHotIssue: false,  skippedKeywordItems: 0,
  skippedHotIssueItems: 0,
  poolTruncated: false,

    },
    // 요금 상한은 이 파일의 관심사가 아니다 — 안 걸린 평소 상태로 채운다.
    cost: { capUsd: 10, spentUsd: 0, capped: false, lookupFailed: false },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectItemsByUrl.mockResolvedValue({ data: [], error: null });
  insertRun.mockResolvedValue({ error: null });
});

describe("saveIngestRunReport", () => {
  it("실패한 원문 주소가 없으면 item 조회를 아예 안 한다", async () => {
    const { saveIngestRunReport } = await import("./save-run-report");
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-08-17T00:00:00.000Z"),
      elapsedMs: 1234,
      report: report(),
    });
    expect(selectItemsByUrl).not.toHaveBeenCalled();
  });

  it("본문 추출 실패를 소스별로 되짚어 저장한다", async () => {
    selectItemsByUrl.mockResolvedValueOnce({
      data: [
        { source_id: "a", original_url: "https://ex.com/1" },
        { source_id: "a", original_url: "https://ex.com/2" },
        { source_id: "b", original_url: "https://ex.com/3" },
      ],
      error: null,
    });
    const { saveIngestRunReport } = await import("./save-run-report");
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-08-17T00:00:00.000Z"),
      elapsedMs: 1234,
      report: report({
        extraction: {
          attempted: 3,
          succeeded: 0,
          failed: 3,
          failedUrls: ["https://ex.com/1", "https://ex.com/2", "https://ex.com/3"],
          failureReasons: ["HTTP 403"],
          error: null,
        },
      }),
    });

    const row = insertRun.mock.calls[0]![0] as { sources: { sourceId: string; extractionFailed: number }[] };
    expect(row.sources.find((s) => s.sourceId === "a")?.extractionFailed).toBe(2);
    expect(row.sources.find((s) => s.sourceId === "b")?.extractionFailed).toBe(1);
    // 되짚는 조회 자체가 실제 실패 목록을 받았는지도 본다 — 이게 없으면 되짚기가
    // 엉뚱한 배열로 불려도(예: 항상 빈 배열) 목(mock)이 같은 값을 돌려줘 테스트가 그냥 통과한다.
    expect(selectItemsByUrl).toHaveBeenCalledWith([
      "https://ex.com/1",
      "https://ex.com/2",
      "https://ex.com/3",
    ]);
  });

  it("소스별 걸러진 개수·제목을 그대로 옮겨 담는다 (합계가 아니라 그 소스 몫)", async () => {
    const { saveIngestRunReport } = await import("./save-run-report");
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-08-17T00:00:00.000Z"),
      elapsedMs: 1234,
      report: report(),
    });

    const row = insertRun.mock.calls[0]![0] as {
      sources: { sourceId: string; filtered: number; filteredTitles: string[] }[];
    };
    expect(row.sources.find((s) => s.sourceId === "a")).toMatchObject({
      filtered: 1,
      filteredTitles: ["걸러진 제목"],
    });
    expect(row.sources.find((s) => s.sourceId === "b")).toMatchObject({
      filtered: 0,
      filteredTitles: [],
    });
  });

  it("runId·시작시각·소요시간·예산 상세를 그대로 담는다", async () => {
    const { saveIngestRunReport } = await import("./save-run-report");
    const budget = {
      exhausted: true,
      skippedSources: ["c"],
      skippedTopicChecks: 2,
      skippedExtractions: 0,
      skippedEnrichments: 0,
    skippedKeywords: false,
      skippedHotIssue: false,  skippedKeywordItems: 0,
  skippedHotIssueItems: 0,
  poolTruncated: false,

    };
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-08-17T00:00:00.000Z"),
      elapsedMs: 4321,
      report: report({ budget }),
    });
    // exhausted 하나만 보면 "떨어졌다"만 알고 어느 소스·단계가 잘렸는지는 모른다 —
    // 이 화면을 만든 이유의 절반이라 상세를 통째로 넘긴다.
    expect(insertRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "run-1",
        started_at: "2026-08-17T00:00:00.000Z",
        elapsed_ms: 4321,
        budget,
      }),
    );
  });

  it("2026-08-17: 주제판정 토큰과 요약·번역 토큰을 소스별로 합쳐 tokensUsed 로 저장한다", async () => {
    const { saveIngestRunReport } = await import("./save-run-report");
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-08-17T00:00:00.000Z"),
      elapsedMs: 1234,
      report: report({
        sources: [
          {
            sourceId: "a",
            fetched: 3,
            stored: 2,
            dropped: 0,
            error: null,
            topicFilter: NO_TOPIC_FILTER,
            // 주제판정 100(입력)+20(출력) = 120
            topicUsage: { calls: 3, inputTokens: 100, outputTokens: 20 },
          },
          {
            sourceId: "b",
            fetched: 1,
            stored: 1,
            dropped: 0,
            error: null,
            topicFilter: NO_TOPIC_FILTER,
            topicUsage: NO_TOPIC_USAGE,
          },
        ],
        // a 는 요약·번역에서 500(입력)+50(출력) 을 더 썼다 — 합쳐서 120+550=670.
        // b 는 요약·번역 후보가 없어 이 맵에 아예 안 실린다 — 조회 실패가 아니라 0건이어야 한다.
        enrichUsageBySource: { a: { inputTokens: 500, outputTokens: 50 } },
      }),
    });

    const row = insertRun.mock.calls[0]![0] as {
      sources: { sourceId: string; tokensUsed: number }[];
    };
    expect(row.sources.find((s) => s.sourceId === "a")?.tokensUsed).toBe(670);
    expect(row.sources.find((s) => s.sourceId === "b")?.tokensUsed).toBe(0);
  });

  it("2026-08-17: 예산 초과로 이번 실행에 없던 소스가 밀린 글로 토큰을 썼으면 표에 따로 남긴다", async () => {
    const { saveIngestRunReport } = await import("./save-run-report");
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-08-17T00:00:00.000Z"),
      elapsedMs: 1234,
      report: report({
        // "c" 는 이번 실행에서 예산이 떨어져 건너뛴 소스라 report.sources 에 없다 —
        // 그래도 밀린 글이 후처리 풀에 섞여 들어와 토큰을 썼다.
        enrichUsageBySource: { c: { inputTokens: 300, outputTokens: 30 } },
      }),
    });

    const row = insertRun.mock.calls[0]![0] as {
      sources: { sourceId: string; tokensUsed: number; fetched: number }[];
    };
    const c = row.sources.find((s) => s.sourceId === "c");
    expect(c?.tokensUsed).toBe(330);
    expect(c?.fetched).toBe(0);
  });

  it("2026-09-27: 단계별 실패 이유를 모아 failures 로 저장한다 — 본문 긁기는 통째로 죽은 것만", async () => {
    const { saveIngestRunReport } = await import("./save-run-report");
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-09-27T00:00:00.000Z"),
      elapsedMs: 1,
      report: report({
        topicFilter: { ...NO_TOPIC_FILTER, attempted: 30, failedOpen: 30, failureReasons: ["400 credit balance is too low"] },
        extraction: { attempted: 1, succeeded: 0, failed: 1, failedUrls: [], failureReasons: ["HTTP 403"], error: null },
        summaries: {
          attempted: 2, succeeded: 0, failed: 2, skippedNoEvidence: 0, failedTitles: [], gaveUpTitles: [],
          failureReasons: ["400 credit balance is too low"], error: null,
        },
      }),
    });
    const row = insertRun.mock.calls[0]![0] as { failures: unknown };
    // 본문 긁기의 한 건 실패(HTTP 403)는 남의 사이트 사정이라 담지 않는다 — 담으면 매일이 실패로 보인다
    // 단계의 시도·실패 건수를 같이 담는다 — 읽는 쪽이 「한 건 실패」와 「전부 실패」를 가른다
    expect(row.failures).toEqual([
      { stage: "topic", reason: "400 credit balance is too low", whole: false, attempted: 30, failed: 30 },
      { stage: "summary", reason: "400 credit balance is too low", whole: false, attempted: 2, failed: 2 },
    ]);
  });

  it("2026-09-27: 단계가 통째로 죽은 것(error)은 whole 로 표시해 담는다", async () => {
    const { saveIngestRunReport } = await import("./save-run-report");
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-09-27T00:00:00.000Z"),
      elapsedMs: 1,
      report: report({
        extraction: { attempted: 0, succeeded: 0, failed: 0, failedUrls: [], failureReasons: [], error: "DB 조회 실패" },
      }),
    });
    const row = insertRun.mock.calls[0]![0] as { failures: unknown };
    expect(row.failures).toEqual([
      { stage: "extraction", reason: "DB 조회 실패", whole: true, attempted: 0, failed: 0 },
    ]);
  });

  it("2026-09-27: failures 칸이 아직 없으면(0013 전) 그 칸만 빼고 다시 저장한다 — 실행 기록을 잃지 않는다", async () => {
    insertRun.mockResolvedValueOnce({ error: { message: "Could not find the 'failures' column", code: "PGRST204" } });
    const { saveIngestRunReport } = await import("./save-run-report");
    await saveIngestRunReport({
      runId: "run-1",
      startedAt: new Date("2026-09-27T00:00:00.000Z"),
      elapsedMs: 1,
      report: report(),
    });
    expect(insertRun).toHaveBeenCalledTimes(2);
    expect(insertRun.mock.calls[0]![0]).toHaveProperty("failures");
    expect(insertRun.mock.calls[1]![0]).not.toHaveProperty("failures");
    expect(insertRun.mock.calls[1]![0]).toMatchObject({ id: "run-1" });
  });

  it("실패경로: 저장이 거부되면 던진다 — 부르는 쪽(route.ts)이 삼킬지 정한다", async () => {
    insertRun.mockResolvedValueOnce({ error: { message: "DB 거부" } });
    const { saveIngestRunReport } = await import("./save-run-report");
    await expect(
      saveIngestRunReport({
        runId: "run-1",
        startedAt: new Date("2026-08-17T00:00:00.000Z"),
        elapsedMs: 1,
        report: report(),
      }),
    ).rejects.toThrow("DB 거부");
  });
});
