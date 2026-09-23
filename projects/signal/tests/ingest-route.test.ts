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

type IngestArgs = Parameters<(typeof import("@/features/ingestion"))["runIngest"]>[0];
type SaveRunArgs = Parameters<(typeof import("@/features/ingestion"))["saveIngestRunReport"]>[0];

/**
 * 시크릿 픽스처. **대소문자를 섞는다** (2026-08-13 리뷰).
 *
 * 전부 소문자면 비교를 `toLowerCase()` 로 느슨하게 바꿔도 모든 케이스가 통과한다 —
 * 그건 비밀 공간을 크게 줄이는 변경인데 테스트가 아무 말도 안 하는 상태다.
 */
/**
 * 라우트가 서버 전용 모듈(`shared/api/server-env`)을 하나 import 한다 — 이어달리기
 * 목적지를 거기서 읽는다. `server-only` 는 서버 조건에서만 풀리므로 빈 모듈로 바꿔 끼운다
 * (그 파일의 방벽은 빌드가 잡는다 — server-env.test.ts 와 같은 처리다).
 */
vi.mock("server-only", () => ({}));

const SECRET = "Cron-SECRET-test-Xy";

const NO_BUDGET = {
  exhausted: false,
  skippedSources: [],
  skippedTopicChecks: 0,
  skippedExtractions: 0,
  skippedEnrichments: 0,
    skippedKeywords: false,
      skippedHotIssue: false,  skippedKeywordItems: 0,
  skippedHotIssueItems: 0,
  poolTruncated: false,

};

/** 요금 상한에 안 걸린 평소 상태. 상한 자체는 run-ingest.test.ts 가 본다. */
const NO_COST = { capUsd: 10, spentUsd: 0, capped: false, lookupFailed: false };

const NO_TOPIC_FILTER = {
  attempted: 0,
  alreadyKnown: 0,
  notChecked: 0,
  failureReasons: [],
  filtered: 0,
  filteredTitles: [],
  failedOpen: 0,
};

/** 아무것도 안 밀린 평소 리포트. 이어달리기 케이스만 `budget.exhausted` 를 바꿔 쓴다. */
const REPORT: Report = {
  sources: [],
  failedSources: [],
  topicFilter: NO_TOPIC_FILTER,
  extraction: { attempted: 0, succeeded: 0, failed: 0, failedUrls: [], failureReasons: [], error: null },
  summaries: { attempted: 0, succeeded: 0, failed: 0, skippedNoEvidence: 0, failedTitles: [], gaveUpTitles: [], failureReasons: [], error: null },
  titles: { attempted: 0, succeeded: 0, failed: 0, failedTitles: [], failureReasons: [], error: null },
  usage: NO_USAGE,
  enrichUsageBySource: {},
  keywords: null,
    hotIssue: null,
  budget: NO_BUDGET,
  cost: NO_COST,
};

const runIngest = vi.fn(async (_params: IngestArgs): Promise<Report> => REPORT);

// 대시보드 기록은 이 파일의 관심사가 아니다(save-run-report.test.ts 가 따로 본다).
// 여기서는 라우트가 이 호출의 실패를 삼키는지만 본다("저장이 실패해도 200" 케이스).
const saveIngestRunReport = vi.fn(async (_params: SaveRunArgs): Promise<void> => {});

// 팩토리 안에 인라인으로 두면 바깥에서 호출 여부를 못 본다 — 인가 앞에서 포트를 만드는
// 구현을 붙들려면 이름이 있어야 한다(2026-09-19 테스트 감사).
const createIngestPorts = vi.fn(() => ({}));

/**
 * 다음 호출을 실제로 보내는 자리만 가짜로 바꾼다 (INV-CB4).
 *
 * **목적지를 정하는 함수(`buildChainRequest`)는 진짜를 쓴다** — 그게 이 라우트에서
 * 확인할 것이다. 가짜로 바꾸면 "환경변수의 주소로만 간다"가 아무 데서도 안 붙들린다.
 */
const sendChainRequest = vi.fn(async (_req: unknown) => {});

vi.mock("@/features/ingestion", async () => {
  const chaining = await import("@/features/ingestion/lib/chaining");
  return {
    ...chaining,
    sendChainRequest,
    runIngest,
    createIngestPorts,
    saveIngestRunReport,
  };
});

const call = async (headers: Record<string, string> = {}, url = "http://localhost/api/ingest") => {
  const { GET } = await import("@/app/api/ingest/route");
  return GET(new Request(url, { method: "GET", headers }));
};

beforeEach(() => {
  vi.resetModules();
  runIngest.mockClear();
  createIngestPorts.mockClear();
  saveIngestRunReport.mockClear();
  saveIngestRunReport.mockImplementation(async () => {});
  sendChainRequest.mockClear();
  // 기본은 "다 끝냈다" — 이어달리기가 이 파일의 기존 케이스에 끼어들지 않게 한다.
  runIngest.mockImplementation(async () => REPORT);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/ingest — 인가", () => {
  it("INV-IA2 (S5): CRON_SECRET 이 빈 문자열이면 503 으로 **막는다** (열어 두지 않는다)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call({ authorization: "Bearer anything" });
    expect(res.status).toBe(503);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("INV-IA2 (S6): 환경변수 **자체가 없어도** 503 — 배포에서 이름을 빼먹은 상태가 곧 이것이다", async () => {
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

  it("INV-IA1 (S2, 실패경로): authorization 헤더가 없으면 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call();
    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("INV-IA1 (S3, 실패경로): 값이 틀리면 401 — 비용이 드는 일이 시작되지 않는다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: "Bearer wrong-value" });
    expect(res.status).toBe(401);
    // 인가 판정이 runIngest 보다 **앞**이어야 한다. 뒤면 미인가 요청이 Claude 를 부른다.
    expect(runIngest).not.toHaveBeenCalled();
    // 포트 생성도 인가 뒤여야 한다(2026-09-19). runIngest 만 보면 인가 검사 **앞**에
    // `createIngestPorts()` 를 올려도 전부 green 이다 — S3 는 「비용이 드는 일이 시작되지
    // 않는다」이고 클라이언트를 만드는 것도 그 일의 시작이다.
    expect(createIngestPorts).not.toHaveBeenCalled();
  });

  it("INV-IA1 (S4, 실패경로): Bearer 접두사 없이 값만 보내면 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: SECRET });
    expect(res.status).toBe(401);
  });

  it("INV-IA1 (S1): 맞으면 200 이고 보고서를 돌려준다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(runIngest).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({ failedSources: [] });
  });

  it("2026-08-17: 대시보드 기록이 실패해도 200 — 관측이 죽었다고 Cron 까지 실패로 보이면 안 된다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    saveIngestRunReport.mockRejectedValueOnce(new Error("DB 거부"));
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(saveIngestRunReport).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({ failedSources: [] });
  });

  it("2026-08-17: runIngest 가 받은 것과 같은 runId 로 기록한다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    await call({ authorization: `Bearer ${SECRET}` });
    const ingestArg = runIngest.mock.calls[0]![0]!;
    const saveArg = saveIngestRunReport.mock.calls[0]![0]!;
    // 다르면 소스별 대시보드가 "이번 실행이 가져온 글"을 못 찾는다 — item 에는 ingestArg.runId 가
    // 찍혀 있는데 ingest_run 행은 다른 id 로 저장되는 셈이라 서로 못 이어진다.
    expect(saveArg.runId).toBe(ingestArg.runId);
    expect(typeof saveArg.runId).toBe("string");
    expect(saveArg.report).toBe(await runIngest.mock.results[0]!.value);
  });

  it("INV-C4: 일부 소스가 실패해도 200 이다 (Cron 이 재시도로 오해하면 안 된다)", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    runIngest.mockResolvedValueOnce({
      sources: [],
      failedSources: ["hn-frontpage"],
      topicFilter: NO_TOPIC_FILTER,
      extraction: { attempted: 0, succeeded: 0, failed: 0, failedUrls: [], failureReasons: [], error: null },
      summaries: { attempted: 0, succeeded: 0, failed: 0, skippedNoEvidence: 0, failedTitles: [], gaveUpTitles: [], failureReasons: [], error: null },
      titles: { attempted: 0, succeeded: 0, failed: 0, failedTitles: [], failureReasons: [], error: null },
      usage: NO_USAGE,
      enrichUsageBySource: {},
  keywords: null,
    hotIssue: null,
      budget: NO_BUDGET,
  cost: NO_COST,
    });
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ failedSources: ["hn-frontpage"] });
  });
});

describe("GET /api/ingest — 인가 비교의 엄밀함", () => {
  it("INV-IA3 (S7, 실패경로): 비밀 뒤에 뭘 붙여도 401 (접두사 비교로 느슨해지지 않는다)", async () => {
    // `startsWith` 로 바꾸면 위 다섯 케이스는 전부 통과하는데 이건 깨진다.
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET}-extra` });
    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("INV-IA3 (S8, 실패경로): 대소문자가 다르면 401 (대소문자 무시 비교로 느슨해지지 않는다)", async () => {
    // `toLowerCase()` 비교로 바꾸면 다른 케이스는 전부 통과하는데 이건 깨진다.
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET.toLowerCase()}` });
    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("INV-IA3 (S7, 실패경로): 비밀의 앞부분만 보내도 401 (비교를 뒤집어도 안 느슨해진다)", async () => {
    // 2026-09-19: S7·S8 은 「보낸 값이 더 긴」 방향만 봤다. `expected.startsWith(received)` 로
    // 비교를 뒤집은 구현은 그 둘로도 안 잡힌다 — 시크릿 앞 여덟 글자만 아는 호출자가 통과한다.
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await call({ authorization: `Bearer ${SECRET.slice(0, 8)}` });
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
  it("INV-IA4 (S9): GET 을 내보낸다 — Cron 이 부르는 메서드가 이것이다", async () => {
    const mod = await import("@/app/api/ingest/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("INV-IA4: 다른 메서드는 하나도 안 내보낸다 — 로컬에서 도는 길과 Cron 이 도는 길이 갈리면 안 된다", async () => {
    // 진입점이 둘이면 `npm run ingest` 가 통과해도 배포된 Cron 은 405 를 받을 수 있다.
    // 그 실패는 조용하다(Vercel 은 실패한 Cron 을 재시도하지 않는다).
    //
    // 2026-09-19: POST 하나만 보던 검사였다. `export const PUT = GET` 한 줄이면 확인을 거치는
    // 입구 옆에 두 번째 입구가 생기는데 그대로 통과했다. 스펙 S9 는 「내보내는 것을 센다」이므로
    // 목록을 고정한다 — 앞으로 생기는 어떤 메서드 이름도 자동으로 걸린다.
    const mod = await import("@/app/api/ingest/route");
    const methodLike = Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k));
    expect(methodLike).toEqual(["GET"]);
  });
});

/**
 * 이어달리기 — ingest-chaining-budget INV-CB1~CB5 의 라우트 쪽 자리.
 *
 * 여기서 확인하는 것은 **라우트가 목적지를 어디서 가져오는가** 하나다. 목적지를 고르는
 * 규칙 자체는 `chaining.test.ts` 가 보고, 그 함수를 라우트가 실제로 쓰는지를 여기서 본다.
 */
describe("GET /api/ingest — 이어달리기", () => {
  const SELF = "https://signal.example.com";
  /** 시간이 떨어져 남은 일이 있는 리포트. */
  const exhausted: Report = {
    ...REPORT,
    budget: { ...NO_BUDGET, exhausted: true, skippedSources: ["s3"] },
  };

  it("INV-CB1: 남은 일이 있으면 **설정에 적힌 주소**로 다음 호출을 하나 부른다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", SELF);
    runIngest.mockImplementation(async () => exhausted);

    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(sendChainRequest).toHaveBeenCalledTimes(1);

    const req = sendChainRequest.mock.calls[0]![0] as { url: string; headers: Record<string, string> };
    expect(new URL(req.url).origin).toBe(SELF);
    expect(new URL(req.url).searchParams.get("chain")).toBe("2");
    // INV-CB3: 시크릿은 헤더로만 간다 — 주소는 실행 로그에 그대로 남는다.
    expect(req.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(req.url).not.toContain(SECRET);
  });

  it("INV-CB2 실패경로: 설정이 없으면 **요청 헤더의 호스트로 대신 부르지 않는다**", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", "");
    runIngest.mockImplementation(async () => exhausted);

    // 요청은 남의 호스트에서 온 것처럼 보인다 — 그 값으로 목적지를 정하면 안 된다.
    const res = await call({ authorization: `Bearer ${SECRET}` }, "https://남의호스트.example/api/ingest");
    expect(res.status).toBe(200);
    // 부를 데가 없으면 null 이 넘어가고, 보내는 자리가 아무 요청도 안 낸다.
    expect(sendChainRequest).toHaveBeenCalledWith(null);
  });

  it("INV-CB5: 번호를 하나 올려서 넘긴다 — 상한에 닿으면 더 안 부른다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", SELF);
    runIngest.mockImplementation(async () => exhausted);

    await call({ authorization: `Bearer ${SECRET}` }, "http://localhost/api/ingest?chain=7");
    const req = sendChainRequest.mock.calls[0]![0] as { url: string };
    expect(new URL(req.url).searchParams.get("chain")).toBe("8");

    sendChainRequest.mockClear();
    await call({ authorization: `Bearer ${SECRET}` }, "http://localhost/api/ingest?chain=20");
    expect(sendChainRequest).toHaveBeenCalledWith(null);
  });

  it("다 끝냈으면 안 부른다 — 다음 호출은 조회만 하고 끝난다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", SELF);
    runIngest.mockImplementation(async () => REPORT);

    await call({ authorization: `Bearer ${SECRET}` });
    // 보내는 자리는 항상 한 번 지나가되 **보낼 것이 null** 이다 — 그래야 응답의
    // `chain.dispatched` 를 한 자리에서 채울 수 있다. 실제로 나가는 요청은 없다
    // (chaining.test.ts 가 null 이면 fetch 를 안 부르는 것을 붙든다).
    expect(sendChainRequest).toHaveBeenCalledWith(null);
  });

  it("인가에 실패하면 이어달리기까지 못 간다 — 남이 체인을 시작시킬 수 없다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", SELF);
    runIngest.mockImplementation(async () => exhausted);

    const res = await call({ authorization: "Bearer wrong-value" }, "http://localhost/api/ingest?chain=2");
    expect(res.status).toBe(401);
    expect(sendChainRequest).not.toHaveBeenCalled();
  });
});

/**
 * 응답에 이어달리기 결과를 싣는다 (2026-09-22).
 *
 * 왜: 실제 배포에서 다음 바퀴가 안 돌았는데, 리포트만 봐서는 **"부를 데가 없어 안 했다"와
 * "불렀는데 안 닿았다"가 같은 모양**이라 원인을 좁히지 못했다. 고칠 자리는 설정과
 * 네트워크로 전혀 다르다. 요금 상한을 리포트에 남기는 이유(INV-CB8)와 같은 자리다.
 */
describe("GET /api/ingest — 응답의 chain 칸", () => {
  const SELF = "https://signal.example.com";
  // **남은 일이 실제로 있는 모양**이어야 한다 (INV-CB10). `exhausted` 만 참으로 두면
  // 이어달리기는 이 리포트를 「다 했다」로 읽는다 — 그 구별이 이 스펙 개정의 전부다.
  const exhausted: Report = {
    ...REPORT,
    budget: { ...NO_BUDGET, exhausted: true, skippedEnrichments: 4 },
  };

  it("보냈으면 dispatched 가 참이고 몇 번째인지도 남는다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", SELF);
    runIngest.mockImplementation(async () => exhausted);

    const res = await call({ authorization: `Bearer ${SECRET}` }, "http://localhost/api/ingest?chain=3");
    const body = (await res.json()) as {
      chain: { index: number; needed: boolean; dispatched: boolean; hasTarget: boolean };
    };
    expect(body.chain).toEqual({ index: 3, needed: true, dispatched: true, hasTarget: true });
  });

  it("보낼 데가 없으면 needed 는 참인데 dispatched 가 거짓이다 — 이게 설정 문제의 신호다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", "");
    runIngest.mockImplementation(async () => exhausted);

    const res = await call({ authorization: `Bearer ${SECRET}` });
    const body = (await res.json()) as { chain: { needed: boolean; dispatched: boolean } };
    expect(body.chain.needed).toBe(true);
    expect(body.chain.dispatched).toBe(false);
  });

  it("남은 일이 없으면 needed 가 거짓이다 — 위와 구별된다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", SELF);
    runIngest.mockImplementation(async () => REPORT);

    const res = await call({ authorization: `Bearer ${SECRET}` });
    const body = (await res.json()) as { chain: { needed: boolean; dispatched: boolean } };
    expect(body.chain.needed).toBe(false);
    expect(body.chain.dispatched).toBe(false);
  });

  /**
   * `hasTarget` — **시간이 남아도는 날에도 설정을 볼 수 있어야 한다** (2026-09-22).
   *
   * `dispatched` 는 `needed` 가 참일 때만 뜻이 있다. 그래서 상한에 안 걸린 날에는
   * 「목적지를 알고 있나」가 응답 어디에도 안 나온다 — 진단 칸이 정작 사고가 나는
   * 날에만 켜지는 셈이다. 2026-09-22 배포 확인이 여기서 멈췄다.
   */
  it("남은 일이 없어도 설정이 있으면 hasTarget 이 참이다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", SELF);
    runIngest.mockImplementation(async () => REPORT);

    const res = await call({ authorization: `Bearer ${SECRET}` });
    const body = (await res.json()) as { chain: { needed: boolean; hasTarget: boolean } };
    expect(body.chain.needed).toBe(false);
    expect(body.chain.hasTarget).toBe(true);
  });

  it("설정이 없으면 hasTarget 이 거짓이다 — needed·dispatched 가 같은 값이라 이 칸이 가른다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("INGEST_BASE_URL", "");
    runIngest.mockImplementation(async () => REPORT);

    const res = await call({ authorization: `Bearer ${SECRET}` });
    const body = (await res.json()) as {
      chain: { needed: boolean; dispatched: boolean; hasTarget: boolean };
    };
    // 바로 위 케이스와 이 둘은 같다 — 그래서 hasTarget 없이는 구별이 안 된다.
    expect(body.chain.needed).toBe(false);
    expect(body.chain.dispatched).toBe(false);
    expect(body.chain.hasTarget).toBe(false);
  });

  it("주소로 못 읽는 값이면 hasTarget 이 거짓이다 — 설정이 있다고 목적지가 있는 게 아니다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    // 값은 채워져 있지만 오리진이 없다. 이 값으로는 부를 데가 없다 (INV-CB2).
    vi.stubEnv("INGEST_BASE_URL", "/api/ingest");
    runIngest.mockImplementation(async () => REPORT);

    const res = await call({ authorization: `Bearer ${SECRET}` });
    const body = (await res.json()) as { chain: { hasTarget: boolean } };
    expect(body.chain.hasTarget).toBe(false);
  });

  it("리포트의 나머지 칸은 그대로 실려 나간다 — chain 을 덧붙이느라 덮어쓰지 않는다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    runIngest.mockImplementation(async () => exhausted);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    const body = (await res.json()) as Report;
    expect(body.budget.exhausted).toBe(true);
    expect(body.cost).toEqual(NO_COST);
  });
});
