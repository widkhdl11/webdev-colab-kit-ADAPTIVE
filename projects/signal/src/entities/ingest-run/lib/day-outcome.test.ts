import { describe, expect, it } from "vitest";
import type { IngestRunFailure, IngestRunRecord, IngestRunSourceStat } from "../model/types";
import { explainFailure, summarizeDays } from "./day-outcome";

const USAGE: IngestRunRecord["usage"] = {
  calls: 0,
  topicCalls: 0,
  topicInputTokens: 0,
  topicOutputTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  maxInputTokens: 0,
  stageMs: null,
  hotIssueCalls: 0,
  hotIssueInputTokens: 0,
  hotIssueOutputTokens: 0,
  keywordCalls: 0,
  keywordInputTokens: 0,
  keywordOutputTokens: 0,
  models: null,
};

const source = (sourceId: string, error: string | null = null): IngestRunSourceStat => ({
  sourceId,
  fetched: 3,
  stored: 3,
  dropped: 0,
  error,
  filtered: 0,
  filteredTitles: [],
  extractionFailed: 0,
  tokensUsed: 0,
});

/** 실패 한 줄. 기본은 「20건 중 1건 실패」(한 건짜리) — 매일 흔히 나는 모양이다. */
const fail = (
  stage: IngestRunFailure["stage"],
  reason: string,
  over: Partial<IngestRunFailure> = {},
): IngestRunFailure => ({ stage, reason, whole: false, attempted: 20, failed: 1, ...over });

const run = (startedAt: string, over: Partial<IngestRunRecord> = {}): IngestRunRecord => ({
  id: startedAt,
  startedAt,
  elapsedMs: 1000,
  cost: { capUsd: 3, spentUsd: 0.5, capped: false, lookupFailed: false },
  failures: [],
  budget: {
    exhausted: false,
    skippedSources: [],
    skippedTopicChecks: 0,
    skippedExtractions: 0,
    skippedEnrichments: 0,
    skippedKeywords: false,
    skippedHotIssue: false,
    skippedKeywordItems: 0,
    skippedHotIssueItems: 0,
    poolTruncated: false,
  },
  usage: USAGE,
  sources: [source("openai"), source("anthropic")],
  ...over,
});

// 실제 SDK 가 내는 모양 그대로 — 상태 코드 뒤에 본문 JSON 이 붙는다.
// risk-surface-exempt: payment Anthropic 의 「크레딧 부족」 오류 원문을 예시로 담았을 뿐이다 — 결제·청구 코드가 아니고, 이 파일은 오류 문구를 사람 말로 바꾸는지만 본다
const CREDIT_ERROR =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';

const NOW = new Date("2026-09-27T12:00:00+09:00");
const today = (runs: IngestRunRecord[], now = NOW) => summarizeDays(runs, now, 3)[0]!;

describe("그날 처리 결과 — 모든 단계가 성공해야 성공 (2026-09-27 사용자 지시)", () => {
  const OVERLOADED = '529 {"type":"error","error":{"type":"overloaded_error"}}';

  it("실패가 하나도 없으면 성공이고, 시각은 그날 첫 실행이다", () => {
    // 오래된 것이 앞에 오게 넣는다 — 조회 순서에 기대면 정렬을 지워도 통과한다
    const d = today([run("2026-09-27T07:02:00+09:00"), run("2026-09-27T07:20:00+09:00")]);
    expect(d.status).toBe("ok");
    expect(d.reasons).toEqual([]);
    expect(d.runCount).toBe(2);
    expect(d.firstStartedAt).toBe("2026-09-27T07:02:00+09:00");
    // 아래 상세 표는 그날 가장 늦은 실행을 그린다
    expect(d.latestRun?.startedAt).toBe("2026-09-27T07:20:00+09:00");
  });

  it("한 단계에서 한 건만 실패해도 실패이고, 그 단계와 건수·이유를 적는다", () => {
    const d = today([
      run("2026-09-27T07:02:00+09:00", {
        failures: [fail("hotIssue", "응답을 읽지 못함(잘렸거나 형식이 깨짐)", { attempted: 120, failed: 1 })],
      }),
    ]);
    expect(d.status).toBe("fail");
    expect(d.reasons).toEqual(["핫이슈 판정 — 120건 중 1건 실패 (응답을 읽지 못함(잘렸거나 형식이 깨짐))"]);
  });

  it("API 요금이 떨어지면 단계마다 한 줄씩, 이유는 사람 말로 적는다", () => {
    const d = today([
      run("2026-09-27T07:02:00+09:00", {
        failures: [
          fail("topic", CREDIT_ERROR, { attempted: 30, failed: 30 }),
          fail("summary", CREDIT_ERROR, { attempted: 8, failed: 8 }),
        ],
      }),
    ]);
    expect(d.status).toBe("fail");
    expect(d.reasons).toEqual([
      "주제 판정 — 30건 중 30건 실패 (API 요금(크레딧) 부족)",
      "요약 — 8건 중 8건 실패 (API 요금(크레딧) 부족)",
    ]);
  });

  it("단계 순서는 파이프라인이 도는 순서다 — 저장 순서와 무관하다", () => {
    const d = today([
      run("2026-09-27T07:02:00+09:00", {
        failures: [fail("keywords", OVERLOADED), fail("topic", OVERLOADED)],
        sources: [source("openai", "HTTP 403"), source("anthropic")],
      }),
    ]);
    expect(d.reasons.map((r) => r.split(" — ")[0])).toEqual(["피드 받기", "주제 판정", "키워드"]);
  });

  it("같은 단계에 이유가 둘이어도 건수는 한 번만 더하고 이유는 둘 다 적는다", () => {
    const d = today([
      run("2026-09-27T07:02:00+09:00", {
        failures: [
          fail("hotIssue", "응답을 읽지 못함", { attempted: 120, failed: 12 }),
          fail("hotIssue", OVERLOADED, { attempted: 120, failed: 12 }),
        ],
      }),
    ]);
    expect(d.reasons).toEqual(["핫이슈 판정 — 120건 중 12건 실패 (응답을 읽지 못함, API 서버 과부하)"]);
  });

  it("여러 바퀴의 실패는 합친다 — 앞 바퀴 실패도 그날 실패다", () => {
    const d = today([
      run("2026-09-27T07:02:00+09:00", { failures: [fail("summary", OVERLOADED, { attempted: 8, failed: 2 })] }),
      run("2026-09-27T07:08:00+09:00", { failures: [fail("summary", OVERLOADED, { attempted: 5, failed: 1 })] }),
    ]);
    expect(d.status).toBe("fail");
    expect(d.reasons).toEqual(["요약 — 13건 중 3건 실패 (API 서버 과부하)"]);
  });

  it("단계가 통째로 멈춘 것은 건수 대신 「단계 전체가 멈춤」으로 적는다", () => {
    const d = today([
      run("2026-09-27T07:02:00+09:00", {
        failures: [fail("extraction", "connection refused", { whole: true, attempted: 0, failed: 0 })],
      }),
    ]);
    expect(d.reasons).toEqual(["본문 긁기 — 단계 전체가 멈춤 (네트워크 연결 실패)"]);
  });

  it("이유 없이 건수만 남은 실패도 실패다 — 건수만 적는다", () => {
    const d = today([run("2026-09-27T07:02:00+09:00", { failures: [fail("summary", "", { attempted: 10, failed: 1 })] })]);
    expect(d.status).toBe("fail");
    expect(d.reasons).toEqual(["요약 — 10건 중 1건 실패"]);
  });

  it("피드 소스가 하나라도 실패하면 실패다 — 여러 바퀴에서 같은 소스는 한 번만 센다", () => {
    const d = today([
      run("2026-09-27T07:02:00+09:00", { sources: [source("openai", "HTTP 403"), source("anthropic")] }),
      run("2026-09-27T07:08:00+09:00", { sources: [source("openai", "HTTP 403"), source("anthropic")] }),
    ]);
    expect(d.status).toBe("fail");
    expect(d.reasons).toEqual(["피드 받기 — 소스 1곳 실패 (openai)"]);
  });

  it("이유 칸이 없던 옛 실행도 본문 긁기 실패는 소스별 건수로 잡는다", () => {
    const old = run("2026-09-27T07:02:00+09:00", {
      failures: null,
      sources: [{ ...source("openai"), extractionFailed: 3 }, source("anthropic")],
    });
    const d = today([old]);
    expect(d.status).toBe("fail");
    expect(d.reasons).toEqual(["본문 긁기 — 3건 실패"]);
    expect(d.notes.some((n) => n.includes("실패 이유를 저장하기 전"))).toBe(true);
  });

  it("그날 마지막 실행에 남은 일이 있으면 실패다 — 이어받을 바퀴가 없었다", () => {
    const leftover = run("2026-09-26T07:02:00+09:00", {
      budget: { ...run("x").budget, exhausted: true, skippedEnrichments: 5 },
    });
    const yesterday = summarizeDays([leftover], NOW, 3)[1]!;
    expect(yesterday.status).toBe("fail");
    expect(yesterday.reasons[0]).toContain("처리 못 한 일이 남은 채 끝남");
  });

  it("이어달리기가 생기기 전(요금 기록 없음)의 남은 일은 참고다 — 그때는 다음 날로 넘기는 게 정상이었다", () => {
    const old = run("2026-09-26T07:02:00+09:00", {
      cost: null,
      budget: { ...run("x").budget, exhausted: true, skippedEnrichments: 5 },
    });
    const yesterday = summarizeDays([old], NOW, 3)[1]!;
    expect(yesterday.status).toBe("ok");
    expect(yesterday.notes).toContain("남은 일이 있는 채 끝났다 — 이어달리기가 생기기 전의 실행이다");
  });

  it("오늘은 마지막 실행 뒤 30분 안이면 남은 일을 실패로 치지 않는다 — 다음 바퀴가 올 수 있다", () => {
    const leftover = run("2026-09-27T11:50:00+09:00", { budget: { ...run("x").budget, poolTruncated: true } });
    expect(today([leftover]).status).toBe("ok");
    expect(today([leftover], new Date("2026-09-27T12:30:00+09:00")).status).toBe("fail");
  });

  it("하루 요금 상한에 닿으면 실패다", () => {
    const d = today([
      run("2026-09-27T07:02:00+09:00", { cost: { capUsd: 3, spentUsd: 3.1, capped: true, lookupFailed: false } }),
    ]);
    expect(d.status).toBe("fail");
    expect(d.reasons).toEqual(["하루 요금 상한($3.00)에 닿아 요약·키워드를 멈춤"]);
  });

  it("요금을 못 읽어 멈춘 것은 상한에 닿은 것과 다른 이유로 적는다", () => {
    // 못 읽으면 상한에 닿은 것으로 보므로 capped 도 참이다 — 그래도 「돈을 다 썼다」로 적으면 안 된다.
    const d = today([
      run("2026-09-27T07:02:00+09:00", { cost: { capUsd: 3, spentUsd: 3, capped: true, lookupFailed: true } }),
    ]);
    expect(d.status).toBe("fail");
    expect(d.reasons).toEqual(["오늘 쓴 요금을 읽지 못해 요약·키워드를 멈춤"]);
  });

  it("실행이 없는 지난 날은 실패다 — 안 돈 날이 목록에서 사라지면 안 된다", () => {
    const days = summarizeDays([run("2026-09-27T07:02:00+09:00")], NOW, 3);
    expect(days.map((d) => d.day)).toEqual(["2026-09-27", "2026-09-26", "2026-09-25"]);
    expect(days[1]!.status).toBe("fail");
    expect(days[1]!.reasons[0]).toContain("실행 기록 없음");
  });

  it("날짜는 한국 자정에서 갈린다 — 23:59 와 00:00 은 다른 날이다", () => {
    const days = summarizeDays([run("2026-09-26T23:59:00+09:00"), run("2026-09-27T00:00:00+09:00")], NOW, 3);
    expect(days[0]!.runCount).toBe(1);
    expect(days[1]!.runCount).toBe(1);
  });

  it("오늘 예약 시각(7시) 전이면 실패가 아니라 실행 전이다", () => {
    expect(today([], new Date("2026-09-27T07:10:00+09:00")).status).toBe("pending");
    expect(today([], new Date("2026-09-27T07:40:00+09:00")).status).toBe("fail");
  });

  it("날짜는 한국 시간으로 가른다 — UTC 로는 전날인 아침 7시 실행이 오늘에 들어간다", () => {
    const d = today([run("2026-09-26T22:02:00.000Z")]);
    expect(d.day).toBe("2026-09-27");
    expect(d.runCount).toBe(1);
  });
});

describe("오류 원문 → 사람이 읽을 이유", () => {
  it.each([
    [CREDIT_ERROR, "API 요금(크레딧) 부족"],
    ['401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', "API 키 인증 실패"],
    ['429 {"type":"error","error":{"type":"rate_limit_error"}}', "API 요청 한도 초과"],
    ['529 {"type":"error","error":{"type":"overloaded_error"}}', "API 서버 과부하"],
    ["Request timed out.", "응답 시간 초과"],
  ])("%s", (raw, expected) => {
    expect(explainFailure(raw)).toBe(expected);
  });

  it("모르는 오류는 이름을 지어 붙이지 않고 원문 앞부분을 둔다", () => {
    expect(explainFailure("요약 출력이 비어 있음")).toBe("요약 출력이 비어 있음");
    expect(explainFailure("x".repeat(300))).toHaveLength(121);
  });
});
