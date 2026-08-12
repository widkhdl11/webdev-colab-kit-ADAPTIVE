import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 수집 라우트의 **인가**를 붙든다 (INV-S4 인접).
 *
 * 이 표면에 테스트가 하나도 없었다 — 인가 검사를 통째로 지워도 전 스위트가 green 이었다.
 * 이 시크릿이 막는 것은 남이 우리 Claude 과금을 태우는 일이라, 검사가 조용히 사라지면
 * 증상이 청구서로만 나타난다.
 *
 * 파이프라인은 여기서 검증하지 않는다(run-ingest.test.ts 가 한다). 바깥 세계로 나가는
 * 모듈만 가짜로 바꾼다 — 진짜를 부르면 server-only 와 API 키가 필요해진다.
 */
// 타입을 붙여 둔다 — 안 붙이면 빈 배열이 never[] 로 굳어 나중 케이스가 컴파일되지 않는다.
type Report = import("@/features/ingestion").IngestReport;
/** 이 파일은 라우트만 본다 — 토큰 합계는 run-ingest.test.ts 가 검증한다. */
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
};

type IngestArgs = Parameters<(typeof import("@/features/ingestion"))["runIngest"]>[0];

const NO_TOPIC_FILTER = { attempted: 0, alreadyKnown: 0, filtered: 0, filteredTitles: [], failedOpen: 0 };

const runIngest = vi.fn(async (_params: IngestArgs): Promise<Report> => ({
  sources: [],
  failedSources: [],
  topicFilter: NO_TOPIC_FILTER,
  extraction: { attempted: 0, succeeded: 0, failed: 0, failedUrls: [], error: null },
  summaries: { attempted: 0, succeeded: 0, failed: 0, skippedNoEvidence: 0, failedTitles: [], error: null },
  titles: { attempted: 0, succeeded: 0, failed: 0, failedTitles: [], error: null },
  usage: NO_USAGE,
}));

vi.mock("@/features/ingestion", () => ({
  runIngest,
  createIngestPorts: vi.fn(() => ({})),
}));

const post = async (headers: Record<string, string> = {}) => {
  const { POST } = await import("@/app/api/ingest/route");
  return POST(new Request("http://localhost/api/ingest", { method: "POST", headers }));
};

beforeEach(() => {
  vi.resetModules();
  runIngest.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/ingest — 인가", () => {
  it("CRON_SECRET 이 설정되지 않으면 503 으로 **막는다** (열어 두지 않는다)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await post({ authorization: "Bearer anything" });
    expect(res.status).toBe(503);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("실패경로: authorization 헤더가 없으면 401", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const res = await post();
    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("실패경로: 값이 틀리면 401 — 비용이 드는 일이 시작되지 않는다", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const res = await post({ authorization: "Bearer wrong-value" });
    expect(res.status).toBe(401);
    // 인가 판정이 runIngest 보다 **앞**이어야 한다. 뒤면 미인가 요청이 Claude 를 부른다.
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("실패경로: Bearer 접두사 없이 값만 보내면 401", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const res = await post({ authorization: "cron-secret-test" });
    expect(res.status).toBe(401);
  });

  it("맞으면 200 이고 보고서를 돌려준다", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const res = await post({ authorization: "Bearer cron-secret-test" });
    expect(res.status).toBe(200);
    expect(runIngest).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({ failedSources: [] });
  });

  it("INV-C4: 일부 소스가 실패해도 200 이다 (Cron 이 재시도로 오해하면 안 된다)", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    runIngest.mockResolvedValueOnce({
      sources: [],
      failedSources: ["hn-frontpage"],
      topicFilter: NO_TOPIC_FILTER,
      extraction: { attempted: 0, succeeded: 0, failed: 0, failedUrls: [], error: null },
      summaries: { attempted: 0, succeeded: 0, failed: 0, skippedNoEvidence: 0, failedTitles: [], error: null },
      titles: { attempted: 0, succeeded: 0, failed: 0, failedTitles: [], error: null },
      usage: NO_USAGE,
    });
    const res = await post({ authorization: "Bearer cron-secret-test" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ failedSources: ["hn-frontpage"] });
  });
});

describe("POST /api/ingest — 인가 비교의 엄밀함", () => {
  it("실패경로: 비밀 뒤에 뭘 붙여도 401 (접두사 비교로 느슨해지지 않는다)", async () => {
    // `startsWith` 로 바꾸면 위 다섯 케이스는 전부 통과하는데 이건 깨진다.
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const res = await post({ authorization: "Bearer cron-secret-test-extra" });
    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("소스 목록을 실제로 넘긴다 (빈 배열이면 아무것도 수집 안 된다)", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    await post({ authorization: "Bearer cron-secret-test" });
    const arg = runIngest.mock.calls[0]![0]!;
    expect(arg.sources.length).toBeGreaterThan(0);
  });
});
