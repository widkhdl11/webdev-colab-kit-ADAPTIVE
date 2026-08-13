import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 수집 라우트의 **인가**를 붙든다 (INV-S4 인접).
 *
 * 이 표면에 테스트가 하나도 없었다 — 인가 검사를 통째로 지워도 전 스위트가 green 이었다.
 * 이 시크릿이 막는 것은 남이 우리 Claude 과금을 태우는 일이라, 검사가 조용히 사라지면
 * 증상이 청구서로만 나타난다.
 *
 * **메서드는 GET 이다.** Vercel Cron 은 GET 으로만 부른다("Vercel makes an HTTP GET
 * request to your project's production deployment URL"). POST 만 있으면 Cron 이 405 를 받고,
 * Vercel 은 실패한 Cron 을 재시도하지 않으므로 증상은 "수집이 조용히 0" 이다.
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

/**
 * 시크릿 픽스처. **대소문자를 섞는다** (2026-08-13 리뷰).
 *
 * 전부 소문자면 비교를 `toLowerCase()` 로 느슨하게 바꿔도 모든 케이스가 통과한다 —
 * 그건 비밀 공간을 크게 줄이는 변경인데 테스트가 아무 말도 안 하는 상태다.
 */
const SECRET = "Cron-SECRET-test-Xy";

const NO_BUDGET = {
  exhausted: false,
  skippedSources: [],
  skippedExtractions: 0,
  skippedEnrichments: 0,
};

const NO_TOPIC_FILTER = {
  attempted: 0,
  alreadyKnown: 0,
  notChecked: 0,
  failureReasons: [],
  filtered: 0,
  filteredTitles: [],
  failedOpen: 0,
};

const runIngest = vi.fn(async (_params: IngestArgs): Promise<Report> => ({
  sources: [],
  failedSources: [],
  topicFilter: NO_TOPIC_FILTER,
  extraction: { attempted: 0, succeeded: 0, failed: 0, failedUrls: [], failureReasons: [], error: null },
  summaries: { attempted: 0, succeeded: 0, failed: 0, skippedNoEvidence: 0, failedTitles: [], failureReasons: [], error: null },
  titles: { attempted: 0, succeeded: 0, failed: 0, failedTitles: [], failureReasons: [], error: null },
  usage: NO_USAGE,
  budget: NO_BUDGET,
}));

vi.mock("@/features/ingestion", () => ({
  runIngest,
  createIngestPorts: vi.fn(() => ({})),
}));

const call = async (headers: Record<string, string> = {}) => {
  const { GET } = await import("@/app/api/ingest/route");
  return GET(new Request("http://localhost/api/ingest", { method: "GET", headers }));
};

beforeEach(() => {
  vi.resetModules();
  runIngest.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/ingest — 인가", () => {
  it("CRON_SECRET 이 빈 문자열이면 503 으로 **막는다** (열어 두지 않는다)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call({ authorization: "Bearer anything" });
    expect(res.status).toBe(503);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("환경변수 **자체가 없어도** 503 — 배포에서 이름을 빼먹은 상태가 곧 이것이다", async () => {
    // 빈 문자열만 검사하면(`expected === ""`) 이 케이스가 401 분기로 내려가고,
    // 비교 대상이 `Bearer undefined` 가 되어 그 한 줄로 수집이 열린다.
    // stubEnv 는 값을 넣는 도구라 "없음"을 만들지 못해 직접 지웠다가 되돌린다.
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const res = await call({ authorization: "Bearer undefined" });
      expect(res.status).toBe(503);
      expect(runIngest).not.toHaveBeenCalled();
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });

  it("실패경로: authorization 헤더가 없으면 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call();
    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("실패경로: 값이 틀리면 401 — 비용이 드는 일이 시작되지 않는다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: "Bearer wrong-value" });
    expect(res.status).toBe(401);
    // 인가 판정이 runIngest 보다 **앞**이어야 한다. 뒤면 미인가 요청이 Claude 를 부른다.
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("실패경로: Bearer 접두사 없이 값만 보내면 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: SECRET });
    expect(res.status).toBe(401);
  });

  it("맞으면 200 이고 보고서를 돌려준다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(runIngest).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({ failedSources: [] });
  });

  it("INV-C4: 일부 소스가 실패해도 200 이다 (Cron 이 재시도로 오해하면 안 된다)", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    runIngest.mockResolvedValueOnce({
      sources: [],
      failedSources: ["hn-frontpage"],
      topicFilter: NO_TOPIC_FILTER,
      extraction: { attempted: 0, succeeded: 0, failed: 0, failedUrls: [], failureReasons: [], error: null },
      summaries: { attempted: 0, succeeded: 0, failed: 0, skippedNoEvidence: 0, failedTitles: [], failureReasons: [], error: null },
      titles: { attempted: 0, succeeded: 0, failed: 0, failedTitles: [], failureReasons: [], error: null },
      usage: NO_USAGE,
      budget: NO_BUDGET,
    });
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ failedSources: ["hn-frontpage"] });
  });
});

describe("GET /api/ingest — 인가 비교의 엄밀함", () => {
  it("실패경로: 비밀 뒤에 뭘 붙여도 401 (접두사 비교로 느슨해지지 않는다)", async () => {
    // `startsWith` 로 바꾸면 위 다섯 케이스는 전부 통과하는데 이건 깨진다.
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET}-extra` });
    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("실패경로: 대소문자가 다르면 401 (대소문자 무시 비교로 느슨해지지 않는다)", async () => {
    // `toLowerCase()` 비교로 바꾸면 다른 케이스는 전부 통과하는데 이건 깨진다.
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET.toLowerCase()}` });
    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("소스 목록 **전체**를 넘긴다 — 일부만 넘기면 나머지가 조용히 빠진다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { SOURCES } = await import("@/entities/source");
    await call({ authorization: `Bearer ${SECRET}` });
    const arg = runIngest.mock.calls[0]![0]!;
    // `length > 0` 만 보면 `SOURCES.slice(0, 1)` 변이가 통과한다(13곳이 매일 안 돈다).
    expect(arg.sources).toBe(SOURCES);
  });
});

describe("배포 설정 — 코드와 vercel.json 이 같은 말을 하는가", () => {
  /**
   * 여기서 잡는 것은 **조용한 실패**다. 아래 두 값은 틀려도 테스트·타입·게이트가 전부
   * 통과하고, 증상은 배포된 Cron 이 매일 아무 일도 안 하는 것으로만 나타난다.
   */
  it("maxDuration 이 있고 force-dynamic 이다", async () => {
    const mod = await import("@/app/api/ingest/route");
    // 지우면 기본 10초다. 실측 125초짜리 수집이 매일 중간에 끊긴다.
    expect(mod.maxDuration).toBe(300);
    // 캐시된 응답은 수집을 돌리지 않고 Cron 로그에도 안 남는다.
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("vercel.json 의 cron 경로가 실제 라우트 파일을 가리킨다", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const config = JSON.parse(readFileSync("vercel.json", "utf-8"));
    const cron = config.crons?.[0];
    expect(cron?.path).toBe("/api/ingest");
    // 경로 오타 한 글자면 Cron 이 영영 안 불린다 — 로그에도 안 남는다.
    expect(existsSync("src/app/api/ingest/route.ts")).toBe(true);
    // 하루 1회. Hobby 플랜의 상한이다.
    expect(cron?.schedule).toBe("0 22 * * *");
  });

  it("시간 예산이 Vercel 함수 상한보다 작다 — 리포트를 돌려줄 시간이 남아야 한다", async () => {
    const mod = await import("@/app/api/ingest/route");
    // 배럴(`@/features/ingestion`)은 이 파일에서 가짜로 바꿔 놨으므로 상수 파일을 직접 읽는다.
    const { INGEST_BUDGET_MS } = await import("@/features/ingestion/lib/budgets");
    // 두 값이 따로 있으면 한쪽만 바뀌는 날이 온다. maxDuration 을 60 으로 낮추면 여기서 깨진다.
    expect(INGEST_BUDGET_MS).toBeLessThan(mod.maxDuration * 1000);
  });
});

describe("GET /api/ingest — 진입점은 하나뿐이다", () => {
  it("GET 을 내보낸다 — Cron 이 부르는 메서드가 이것이다", async () => {
    const mod = await import("@/app/api/ingest/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("POST 는 내보내지 않는다 — 로컬에서 도는 길과 Cron 이 도는 길이 갈리면 안 된다", async () => {
    // 진입점이 둘이면 `npm run ingest` 가 통과해도 배포된 Cron 은 405 를 받을 수 있다.
    // 그 실패는 조용하다(Vercel 은 실패한 Cron 을 재시도하지 않는다).
    const mod = await import("@/app/api/ingest/route");
    expect(mod).not.toHaveProperty("POST");
  });
});
