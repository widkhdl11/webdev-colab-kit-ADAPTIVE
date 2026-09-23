import { describe, expect, it, vi } from "vitest";
import type { FeedItemDraft } from "@/entities/article";
import type { Source } from "@/entities/source";
import {
  ENRICH_MODEL,
  ENRICH_POOL,
  HOT_ISSUE_MODEL,
  KEYWORD_MODEL,
  MAX_TITLE_LENGTH,
  TOPIC_MODEL,
} from "./budgets";
import { MAX_ITEMS_PER_SOURCE, TOPIC_CONCURRENCY, runIngest } from "./run-ingest";
import type {
  EnrichCandidate,
  ExtractionCandidate,
  HotIssueCandidate,
  IngestPorts,
  KeywordCandidate,
} from "./ports";

/**
 * 수집 파이프라인 — INV-C4(소스 격리) · INV-S2(요약 실패 격리) · INV-S3(재생성 조건).
 *
 * 검증 대상(파이프라인)은 모킹하지 않는다. 바깥 세계(네트워크·DB·LLM)만 가짜로 바꾼다.
 */

const NOW = new Date("2026-08-09T05:00:00.000Z");

/** 가짜 호출 하나가 쓴 토큰. 값 자체는 뜻이 없고 합계가 맞는지만 본다. */
const USAGE = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 };
/** 주제 판정 한 번이 쓴 토큰. 요약과 다른 값을 써야 합계가 섞였을 때 드러난다. */
const TOPIC_USAGE = { inputTokens: 7, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 };
/** 키워드 한 번이 쓴 토큰. 앞의 둘과 또 달라야 세 칸이 섞였을 때 드러난다. */
const KEYWORD_USAGE = { inputTokens: 11, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
/** 판정 결과를 포트 모양으로 감싼다. */
const verdict = (onTopic: boolean) => ({ onTopic, usage: TOPIC_USAGE });

const source = (id: string): Source => ({
  id,
  name: id,
  weight: 1,
  feedUrl: `https://ex.com/${id}.xml`,
  // 기본 픽스처는 판정을 건다 — 기존 INV-F1·F2·F3 테스트가 전부 이 전제 위에 있다.
  needsTopicCheck: true,
  tier: "daily",
});

const feedItem = (n: string) => ({
  title: `제목 ${n}`,
  link: `https://ex.com/${n}`,
  pubDate: "2026-08-09T09:00:00+09:00",
  contentHtml: `<p>본문 ${n}</p>`,
});

function makePorts(over: Partial<IngestPorts> = {}): IngestPorts {
  return {
    // 기본은 "오늘 아직 안 썼다" — 상한이 평소에 끼어들지 않는 상태다.
    // 상한이 주인공인 테스트만 이 값을 바꾼다.
    loadTodaySpendUsd: vi.fn(async () => 0),
    fetchFeed: vi.fn(async () => []),
    judgeTopic: vi.fn(async () => verdict(true)),
    listKnownUrls: vi.fn(async () => [] as string[]),
    // 핫이슈 판정은 기본 픽스처에서 **후보 0건**이다. 이 파일의 기존 테스트들은 이 단계가
    // 생기기 전에 쓰였고, 후보를 주면 그 테스트들이 판정 호출까지 세게 된다.
    // 이 단계 자체는 run-hot-issue.test.ts 가 따로 본다.
    listHotIssueCandidates: vi.fn(async () => [] as HotIssueCandidate[]),
    listPickedTitlesToday: vi.fn(async () => [] as string[]),
    judgeHotIssue: vi.fn(async () => ({ verdict: null, usage: USAGE })),
    saveHotIssue: vi.fn(async () => {}),
    assignGates: vi.fn(async () => {}),
    upsertItems: vi.fn(async (items) => items.length),
    listExtractionCandidates: vi.fn(async () => [] as ExtractionCandidate[]),
    extractContent: vi.fn(async () => "<p>추출된 본문</p>"),
    saveContent: vi.fn(async () => {}),
    listEnrichCandidates: vi.fn(async () => [] as EnrichCandidate[]),
    enrich: vi.fn(async () => ({
      summary: "요약",
      points: ["항목"],
      titleKo: "한국어 제목",
      officialByContent: false, usage: USAGE,
    })),
    saveEnrichment: vi.fn(async () => {}),
    // 뱃지 키워드 단계 — 이 파일의 관심사는 아니라 기본은 "후보 없음"이다.
    // 단계 자체의 규칙은 run-keywords.test.ts 가 본다.
    listKeywordCandidates: vi.fn(async () => [] as KeywordCandidate[]),
    loadKeywordAnchors: vi.fn(async () => ({ fields: [], kinds: [] })),
    extractKeywords: vi.fn(async () => ({
      keywords: { fields: ["보안"], kinds: [] },
      usage: KEYWORD_USAGE,
    })),
    attachKeywords: vi.fn(async () => {}),
    ...over,
  };
}

/**
 * 2026-08-26: 설정의 `feedTimezone` 이 실제 적재값까지 흐르는지.
 *
 * 타입만으로는 못 붙든다 — `parseFeedItem` 에 넘기는 줄을 지워도 컴파일은 통과하고
 * (선택 필드라 `undefined` 가 유효하다) 나머지 스위트도 전부 green 이다. 그러면
 * 설정에 시간대를 적어 놨는데 조용히 UTC 로 읽히는 상태로 돌아간다.
 */
describe("runIngest — INV-C5 소스의 시간대가 적재값까지 간다", () => {
  const noTzFeedItem = {
    title: "제목",
    link: "https://ex.com/a",
    // 아이타임스가 주는 실제 형식 — 타임존이 없는 한국시간 벽시계값.
    pubDate: "2026-08-26 17:42:25",
    contentHtml: "<p>본문</p>",
  };

  it("INV-C5: 설정에 Asia/Seoul 이면 한국시간으로 읽어 UTC 로 적재한다", async () => {
    const upserted: FeedItemDraft[] = [];
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [noTzFeedItem]),
      upsertItems: vi.fn(async (items) => {
        upserted.push(...items);
        return items.length;
      }),
    });
    await runIngest({
      sources: [{ ...source("aitimes"), feedTimezone: "Asia/Seoul" }],
      ports,
      now: NOW,
    });
    expect(upserted).toHaveLength(1);
    expect(upserted[0].publishedAt).toBe("2026-08-26T08:42:25.000Z");
    expect(upserted[0].publishedAtIsFallback).toBe(false);
  });

  it("INV-C5: 설정에 시간대가 없으면 예전대로 UTC 로 읽는다", async () => {
    const upserted: FeedItemDraft[] = [];
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [noTzFeedItem]),
      upsertItems: vi.fn(async (items) => {
        upserted.push(...items);
        return items.length;
      }),
    });
    await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(upserted[0].publishedAt).toBe("2026-08-26T17:42:25.000Z");
  });
});

describe("runIngest — INV-C4 한 소스의 실패가 다른 소스를 막지 않는다", () => {
  it("INV-C4 (S4): 소스 A 가 던져도 B 는 적재되고 파이프라인은 끝까지 간다", async () => {
    const stored: string[] = [];
    const ports = makePorts({
      fetchFeed: vi.fn(async (s: Source) => {
        if (s.id === "a") throw new Error("500 Server Error");
        return [feedItem("b1"), feedItem("b2")];
      }),
      upsertItems: vi.fn(async (items: FeedItemDraft[]) => {
        stored.push(...items.map((i) => i.canonicalUrl));
        return items.length;
      }),
    });

    const report = await runIngest({
      sources: [source("a"), source("b")],
      ports,
      now: NOW,
    });

    expect(stored).toEqual(["https://ex.com/b1", "https://ex.com/b2"]);
    expect(report.sources.find((r) => r.sourceId === "b")?.stored).toBe(2);
  });

  it("INV-C4: 실패는 삼키지 않고 보고에 남긴다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async (s: Source) => {
        if (s.id === "a") throw new Error("500 Server Error");
        return [];
      }),
    });

    const report = await runIngest({ sources: [source("a"), source("b")], ports, now: NOW });
    const a = report.sources.find((r) => r.sourceId === "a");
    expect(a?.error).toContain("500 Server Error");
    expect(a?.stored).toBe(0);
    expect(report.sources.find((r) => r.sourceId === "b")?.error).toBeNull();
    expect(report.failedSources).toEqual(["a"]);
  });

  it("INV-C4 실패경로: 모든 소스가 실패해도 던지지 않고 보고를 돌려준다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => {
        throw new Error("네트워크 끊김");
      }),
    });
    const report = await runIngest({ sources: [source("a"), source("b")], ports, now: NOW });
    expect(report.failedSources).toEqual(["a", "b"]);
    expect(report.sources).toHaveLength(2);
  });

  it("INV-C4 실패경로: 적재(upsert)가 실패해도 다음 소스로 넘어간다", async () => {
    // 네트워크만 격리하고 DB 실패를 안 막으면 소스 하나의 적재 오류가 전체를 세운다.
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("x")]),
      upsertItems: vi.fn(async (items) => {
        if (items[0].sourceId === "a") throw new Error("DB 거부");
        return items.length;
      }),
    });
    const report = await runIngest({ sources: [source("a"), source("b")], ports, now: NOW });
    expect(report.failedSources).toEqual(["a"]);
    expect(report.sources.find((r) => r.sourceId === "b")?.stored).toBe(1);
  });

  it("INV-C3 연계: 버려진 항목은 적재되지 않고 건수로 보고된다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("ok"), { title: "", link: "" }, { nope: 1 }]),
    });
    const report = await runIngest({ sources: [source("a")], ports, now: NOW });
    expect(report.sources[0].fetched).toBe(3);
    expect(report.sources[0].stored).toBe(1);
    expect(report.sources[0].dropped).toBe(2);
  });

  it("소스 하나가 아카이브 전체를 줘도 상한까지만, 최신 것부터 가져간다", async () => {
    // OpenAI 피드는 1115건을 준다(2026-08-09 확인). 그대로 넣으면 첫 수집에 천 건이 쌓이고
    // 요약 대기열도 그만큼 길어진다.
    const many = Array.from({ length: MAX_ITEMS_PER_SOURCE + 20 }, (_, i) => ({
      title: `제목 ${i}`,
      link: `https://ex.com/${i}`,
      // i 가 클수록 최신.
      pubDate: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    }));
    const ports = makePorts({ fetchFeed: vi.fn(async () => many) });

    const report = await runIngest({ sources: [source("s")], ports, now: NOW });

    expect(report.sources[0].fetched).toBe(many.length);
    expect(report.sources[0].stored).toBe(MAX_ITEMS_PER_SOURCE);
    const upserted = vi.mocked(ports.upsertItems).mock.calls[0][0];
    // 잘린 쪽이 오래된 것이어야 한다 — 최신이 잘리면 새 소식이 안 보인다.
    expect(upserted[0].title).toBe(`제목 ${many.length - 1}`);
    expect(upserted.some((i) => i.title === "제목 0")).toBe(false);
  });

  it("INV-C1 연계: 한 번에 들어온 같은 canonical_url 은 한 건으로 접는다", async () => {
    // 같은 배치에 중복이 있으면 upsert 한 문장 안에서 같은 키를 두 번 건드리게 된다.
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [
        { ...feedItem("a"), link: "https://ex.com/a?utm_source=rss" },
        { ...feedItem("a"), link: "https://ex.com/a#top" },
      ]),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.sources[0].stored).toBe(1);
    const upserted = vi.mocked(ports.upsertItems).mock.calls[0][0];
    expect(upserted.map((i) => i.canonicalUrl)).toEqual(["https://ex.com/a"]);
  });
});

describe("runIngest — INV-F1·F2·F3 주제 선별", () => {
  it("INV-F1 (CS1): 주제 판정은 제목만 보고, 추출·요약 후보 조회보다 먼저 불린다", async () => {
    const order: string[] = [];
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("cocktail")]),
      judgeTopic: vi.fn(async (title: string) => {
        order.push(`판정:${title}`);
        return verdict(true);
      }),
      listExtractionCandidates: vi.fn(async () => {
        order.push("추출후보조회");
        return [];
      }),
      listEnrichCandidates: vi.fn(async () => {
        order.push("요약후보조회");
        return [];
      }),
    });

    await runIngest({ sources: [source("s")], ports, now: NOW });

    // 인자가 문자열 하나뿐이라는 것 자체가 "본문이 안 들어간다"는 증거다.
    expect(vi.mocked(ports.judgeTopic).mock.calls[0]).toEqual(["제목 cocktail"]);
    expect(order[0]).toBe("판정:제목 cocktail");
    expect(order.indexOf("판정:제목 cocktail")).toBeLessThan(order.indexOf("추출후보조회"));
  });

  it("INV-F1 (CS2): 주제 밖으로 판정된 항목에는 요약·추출을 시도하지 않는다", async () => {
    // listExtractionCandidates·listEnrichCandidates 를 실제로 저장된 것에서 유도한다 —
    // 고정값을 돌려주면 "적재 안 됐으니 후보에도 없다"는 걸 이 테스트가 증명하지 못한다.
    const stored: FeedItemDraft[] = [];
    const extractCalls: string[] = [];
    const enrichCalls: string[] = [];
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("cocktail"), feedItem("ok")]),
      judgeTopic: vi.fn(async (title: string) => verdict(!title.includes("cocktail"))),
      upsertItems: vi.fn(async (items) => {
        stored.push(...items);
        return items.length;
      }),
      listExtractionCandidates: vi.fn(async () =>
        stored.map((i) => ({ id: i.canonicalUrl, url: i.canonicalUrl })),
      ),
      extractContent: vi.fn(async (url: string) => {
        extractCalls.push(url);
        return "<p>본문</p>";
      }),
      listEnrichCandidates: vi.fn(async () =>
        stored.map((i) => ({
          id: i.canonicalUrl,
          title: i.title,
          titleKo: "번역됨",
          contentHtml: "<p>본문</p>",
          sourceExcerpt: null,
          summary: null,
          officialBasis: "none" as const,
          sourceId: i.sourceId,
        })),
      ),
      enrich: vi.fn(async ({ title }) => {
        enrichCalls.push(title);
        return { summary: "", points: [], tags: [], titleKo: null, officialByContent: false, usage: USAGE };
      }),
    });

    await runIngest({ sources: [source("s")], ports, now: NOW });

    expect(stored.map((i) => i.canonicalUrl)).toEqual(["https://ex.com/ok"]);
    expect(extractCalls).toEqual(["https://ex.com/ok"]);
    expect(enrichCalls).toEqual(["제목 ok"]);
  });

  it("INV-F2 (CS3): 주제 밖 항목은 적재하지 않고, 건수와 제목을 리포트에 남긴다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [
        feedItem("off1"),
        feedItem("off2"),
        feedItem("on1"),
        feedItem("on2"),
        feedItem("on3"),
      ]),
      judgeTopic: vi.fn(async (title: string) => verdict(!title.includes("off"))),
    });

    const report = await runIngest({ sources: [source("s")], ports, now: NOW });

    expect(report.sources[0].stored).toBe(3);
    expect(report.topicFilter.attempted).toBe(5);
    expect(report.topicFilter.filtered).toBe(2);
    expect(report.topicFilter.filteredTitles).toHaveLength(2);
    expect(report.topicFilter.filteredTitles).toEqual(
      expect.arrayContaining(["제목 off1", "제목 off2"]),
    );
  });

  it("INV-F3 (CS4) 실패경로: 판정 호출이 실패하면 거르지 않고 적재한다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("x")]),
      judgeTopic: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });

    const report = await runIngest({ sources: [source("s")], ports, now: NOW });

    expect(report.sources[0].stored).toBe(1);
    expect(report.topicFilter.filtered).toBe(0);
    expect(report.topicFilter.failedOpen).toBe(1);
  });
});

describe("runIngest — INV-S2·S3 요약", () => {
  const candidate = (id: string, summary: string | null): EnrichCandidate => ({
    id,
    title: `제목 ${id}`,
    // 이미 번역돼 있다고 둔다 — 이 블록은 요약 조건만 본다.
    titleKo: `번역 ${id}`,
    contentHtml: `<p>본문 ${id}</p>`,
    sourceExcerpt: null,
    summary,
    officialBasis: "none" as const,
    sourceId: "s",
  });

  it("INV-S3 (S11): 요약이 이미 있는 항목은 다시 부르지 않는다", async () => {
    // 판정을 우리 코드가 한다 — 조회 계층이 골라 준 것을 그대로 믿으면
    // 그 필터를 지워도 테스트가 통과한다(그게 알리바이다).
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        candidate("has", "이미 있는 요약"),
        candidate("none", null),
      ]),
    });

    const report = await runIngest({ sources: [], ports, now: NOW });

    expect(vi.mocked(ports.enrich)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ports.enrich).mock.calls[0][0].title).toBe("제목 none");
    expect(report.summaries.attempted).toBe(1);
    // 이미 요약이 있는 항목을 '근거 없음'으로 세면 보고서가 거짓말을 한다.
    expect(report.summaries.skippedNoEvidence).toBe(0);
  });

  it("INV-S3: 빈 문자열·공백뿐인 요약도 '없음'으로 본다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [candidate("empty", ""), candidate("blank", "   ")]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich)).toHaveBeenCalledTimes(2);
  });

  it("INV-S3 실패경로: 공백뿐인 본문은 근거로 치지 않는다", async () => {
    // 트림을 지우면 공백 본문이 근거가 돼 제목만 보고 지어내게 된다(INV-S1 위반).
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        { id: "a", title: "제목", titleKo: "번역됨", contentHtml: "   ", sourceExcerpt: null, summary: null, officialBasis: "none" as const, sourceId: "s" },
      ]),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich)).not.toHaveBeenCalled();
    expect(report.summaries.skippedNoEvidence).toBe(1);
  });

  it("INV-S2 (S10) 실패경로: 요약이 타임아웃해도 수집은 계속되고 항목은 남는다", async () => {
    const saved: string[] = [];
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [candidate("a", null), candidate("b", null)]),
      enrich: vi.fn(async ({ title }) => {
        if (title.endsWith("a")) throw new Error("timeout");
        return { summary: "b 의 요약", points: [], tags: [], titleKo: null, officialByContent: false, usage: USAGE };
      }),
      saveEnrichment: vi.fn(async (id) => {
        saved.push(id);
      }),
    });

    const report = await runIngest({ sources: [], ports, now: NOW });

    // 실패한 a 는 저장하지 않는다 — summary=null 로 남아야 다음 주기의 재시도 대상이 된다.
    expect(saved).toEqual(["b"]);
    expect(report.summaries).toMatchObject({ attempted: 2, succeeded: 1, failed: 1, error: null });
  });

  it("INV-S2 실패경로: 요약 저장이 실패해도 나머지 항목을 계속 처리한다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [candidate("a", null), candidate("b", null)]),
      saveEnrichment: vi.fn(async (id) => {
        if (id === "a") throw new Error("DB 거부");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.succeeded).toBe(1);
    expect(report.summaries.failed).toBe(1);
  });

  it("INV-S2 실패경로: 빈 요약이 돌아오면 저장하지 않는다 (재시도 대상으로 남긴다)", async () => {
    // 빈 문자열을 저장하면 S3 의 재시도 조건에서 빠져나가 영원히 요약 없는 항목이 된다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [candidate("a", null)]),
      enrich: vi.fn(async () => ({ summary: "   ", points: [], tags: [], titleKo: null, officialByContent: false, usage: USAGE })),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveEnrichment)).not.toHaveBeenCalled();
    expect(report.summaries.failed).toBe(1);
  });

  it("INV-S7: 핵심 항목은 요약과 함께 저장된다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [candidate("a", null)]),
      enrich: vi.fn(async () => ({
        summary: "요약문",
        points: ["항목1", "항목2"],
        tags: ["MCP"],
        titleKo: null,
        officialByContent: false, usage: USAGE,
      })),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveEnrichment).mock.calls[0][1]).toMatchObject({
      summary: "요약문",
      points: ["항목1", "항목2"],
    });
  });

  it("INV-S2 (S10): 요약 단계가 통째로 죽어도 적재 결과는 유지된다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("x")]),
      listEnrichCandidates: vi.fn(async () => {
        throw new Error("요약 대상 조회 실패");
      }),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.sources[0].stored).toBe(1);
    expect(report.summaries.error).toContain("요약 대상 조회 실패");
    // 같은 조회를 공유하므로 번역 단계도 같은 오류를 안고 멈춘다.
    expect(report.titles.error).toContain("요약 대상 조회 실패");
  });
});

describe("runIngest — INV-S6 제목 번역", () => {
  const cand = (over: Partial<EnrichCandidate> = {}): EnrichCandidate => ({
    id: "a",
    title: "English title",
    titleKo: null,
    contentHtml: "",
    sourceExcerpt: null,
    summary: null,
    officialBasis: "none" as const,
    sourceId: "s",
    ...over,
  });

  it("INV-S6 (S24) 실패경로: 근거가 없어 요약을 못 만들어도 제목은 번역한다", async () => {
    // 이게 이 기능의 핵심이다. 요약과 같은 조건으로 묶으면 본문도 출처글도 없는 항목이
    // (지금 대부분이다) 영어 제목으로 영영 남는다.
    const ports = makePorts({ listEnrichCandidates: vi.fn(async () => [cand()]) });

    const report = await runIngest({ sources: [], ports, now: NOW });

    expect(vi.mocked(ports.enrich)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ports.enrich).mock.calls[0][0]).toMatchObject({
      needSummary: false,
      needTitle: true,
    });
    expect(vi.mocked(ports.saveEnrichment).mock.calls[0][1]).toEqual({ titleKo: "한국어 제목" });
    expect(report.titles).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    // 요약은 시도조차 하지 않았고, 근거 없음으로 따로 셌다.
    expect(report.summaries).toMatchObject({ attempted: 0, skippedNoEvidence: 1 });
  });

  it("INV-S6 (S25) 실패경로: 이미 번역된 항목은 다시 부르지 않는다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        cand({ id: "done", titleKo: "이미 번역됨", summary: "요약 있음" }),
      ]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich)).not.toHaveBeenCalled();
  });

  it("INV-S6 실패경로: 공백뿐인 번역이 오면 저장하지 않는다 (다음 주기에 다시 잡히게)", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand()]),
      enrich: vi.fn(async () => ({ summary: "", points: [], tags: [], titleKo: "   ", officialByContent: false, usage: USAGE })),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveEnrichment)).not.toHaveBeenCalled();
    expect(report.titles.failed).toBe(1);
  });

  it("INV-S6: 근거가 있으면 한 번의 호출로 요약과 번역을 같이 받는다", async () => {
    // 나눠 부르면 같은 근거를 두 번 보내고 비용이 배가 된다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand({ contentHtml: "<p>본문</p>" })]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ports.enrich).mock.calls[0][0]).toMatchObject({
      needSummary: true,
      needTitle: true,
    });
    expect(vi.mocked(ports.saveEnrichment).mock.calls[0][1]).toMatchObject({
      summary: "요약",
      titleKo: "한국어 제목",
    });
  });

  it("INV-S3: 번역만 성공하면 summary 는 패치에 없다 (재시도 신호를 지우지 않는다)", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand({ contentHtml: "<p>본문</p>" })]),
      enrich: vi.fn(async () => ({ summary: "", points: [], tags: [], titleKo: "번역", officialByContent: false, usage: USAGE })),
    });
    await runIngest({ sources: [], ports, now: NOW });
    const patch = vi.mocked(ports.saveEnrichment).mock.calls[0][1];
    expect(patch).toEqual({ titleKo: "번역" });
    expect(Object.keys(patch)).not.toContain("summary");
  });

  it("실패를 두 번 세지 않는다: 빈 요약 + 저장 실패", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand({ contentHtml: "<p>본문</p>" })]),
      enrich: vi.fn(async () => ({ summary: "", points: [], tags: [], titleKo: "번역", officialByContent: false, usage: USAGE })),
      saveEnrichment: vi.fn(async () => {
        throw new Error("DB 거부");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.failed).toBe(1);
    expect(report.titles.failed).toBe(1);
  });
});

describe("runIngest — INV-S5 본문 추출", () => {
  const cand = (id: string) => ({ id, url: `https://ex.com/${id}` });

  it("INV-S5: 본문이 없는 항목의 본문을 뽑아 저장한다", async () => {
    const ports = makePorts({
      listExtractionCandidates: vi.fn(async () => [cand("a")]),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveContent)).toHaveBeenCalledWith("a", "<p>추출된 본문</p>");
    expect(report.extraction).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
  });

  it("INV-S5 (S20) 실패경로: 403 이 나도 다른 항목은 계속 뽑는다", async () => {
    const ports = makePorts({
      listExtractionCandidates: vi.fn(async () => [cand("blocked"), cand("ok")]),
      extractContent: vi.fn(async (url: string) => {
        if (url.endsWith("blocked")) throw new Error("HTTP 403");
        return "<p>본문</p>";
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.extraction).toMatchObject({ attempted: 2, succeeded: 1, failed: 1 });
    expect(vi.mocked(ports.saveContent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ports.saveContent).mock.calls[0][0]).toBe("ok");
  });

  it("INV-S5 실패경로: 빈 본문은 저장하지 않는다", async () => {
    const ports = makePorts({
      listExtractionCandidates: vi.fn(async () => [cand("a")]),
      extractContent: vi.fn(async () => "   "),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveContent)).not.toHaveBeenCalled();
    expect(report.extraction.failed).toBe(1);
  });

  it("INV-S5 실패경로: 추출 단계가 통째로 죽어도 적재와 요약은 계속된다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("x")]),
      listExtractionCandidates: vi.fn(async () => {
        throw new Error("후보 조회 실패");
      }),
      listEnrichCandidates: vi.fn(async () => [
        { id: "s", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null, titleKo: "번역됨", officialBasis: "none" as const, sourceId: "s" },
      ]),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.sources[0].stored).toBe(1);
    expect(report.extraction.error).toContain("후보 조회 실패");
    expect(report.summaries.succeeded).toBe(1);
  });

  it("추출이 요약보다 먼저 돈다 — 이번에 채운 본문이 곧 요약 근거다", async () => {
    const order: string[] = [];
    const ports = makePorts({
      listExtractionCandidates: vi.fn(async () => {
        order.push("추출");
        return [];
      }),
      listEnrichCandidates: vi.fn(async () => {
        order.push("요약");
        return [];
      }),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(order).toEqual(["추출", "요약"]);
  });
});

describe("runIngest — INV-S3 근거가 없으면 요약하지 않는다", () => {
  it("INV-S3 (S18) 실패경로: 본문도 요약글도 없으면 호출하지 않는다", async () => {
    // 제목만 주고 요약시키면 모델이 지어낸다 — INV-S1 위반이다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        { id: "a", title: "Dithered QR Codes", contentHtml: "", sourceExcerpt: null, summary: null, titleKo: "번역됨", officialBasis: "none" as const, sourceId: "s" },
      ]),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich)).not.toHaveBeenCalled();
    expect(report.summaries.skippedNoEvidence).toBe(1);
    // 실패와 구분한다 — 재시도해도 소용없는 것과 다시 해볼 만한 것은 다르다.
    expect(report.summaries.failed).toBe(0);
    expect(report.summaries.attempted).toBe(0);
  });

  it("INV-S3: 본문이 없어도 출처 요약글이 있으면 그것을 근거로 부른다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        {
          id: "a",
          title: "제목",
          contentHtml: "",
          sourceExcerpt: "OpenAI 가 새 평가 결과를 공개했다.",
          summary: null, titleKo: "번역됨", officialBasis: "none" as const,
          sourceId: "s",
        },
      ]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich).mock.calls[0][0].evidence).toBe(
      "OpenAI 가 새 평가 결과를 공개했다.",
    );
  });

  it("INV-S3: 본문이 있으면 본문을 근거로 쓴다 (요약글보다 낫다)", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        { id: "a", title: "제목", contentHtml: "<p>긴 본문</p>", sourceExcerpt: "짧은 요약글", summary: null, titleKo: "번역됨", officialBasis: "none" as const, sourceId: "s" },
      ]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich).mock.calls[0][0].evidence).toBe("<p>긴 본문</p>");
  });
});

describe("runIngest — 요약 저장 (태그는 여기서 안 만든다)", () => {
  it("요약과 핵심 항목만 넘긴다 — 태그 칸이 없다", async () => {
    // 옛 INV-T3 폐기(2026-08-30): 요약 호출에 "고정 5개 중에 골라라"가 실려 있었다.
    // 뱃지 키워드가 그 자리를 물려받았고 별도 단계(runKeywords)로 돈다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        { id: "a", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null, titleKo: "번역됨", officialBasis: "none" as const, sourceId: "s" },
      ]),
      enrich: vi.fn(async () => ({
        summary: "요약문",
        points: [],
        titleKo: null,
        officialByContent: false, usage: USAGE,
      })),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveEnrichment)).toHaveBeenCalledWith("a", {
      summary: "요약문",
      points: [],
    });
  });

  it("실패경로: 요약 저장이 실패하면 요약 단계 실패로 센다", async () => {
    // 조용히 넘기면 이 항목은 다음 주기에 요약 후보가 아니라서 태그를 붙일 기회가 없다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        { id: "a", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null, titleKo: "번역됨", officialBasis: "none" as const, sourceId: "s" },
      ]),
      saveEnrichment: vi.fn(async () => {
        throw new Error("태그 저장 실패");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.failed).toBe(1);
  });
});

// 개발용 계측 — 불변식이 아니라 "이상한 게 있으면 눈에 띄게" 하는 숫자다.
// 그래서 검증도 규칙이 아니라 **합계가 실제 호출과 어긋나지 않는지**를 본다.
describe("runIngest — 토큰 사용량 보고", () => {
  const item = (id: string) => ({
    id,
    title: `제목 ${id}`,
    titleKo: `번역 ${id}`,
    contentHtml: `<p>본문 ${id}</p>`,
    sourceExcerpt: null,
    summary: null,
    officialBasis: "none" as const,
    sourceId: "s",
  });

  it("실패한 호출의 토큰도 합계에 들어간다", async () => {
    // 여기가 이 계측의 존재 이유다. 성공 분기에서만 세면 "요약은 하나도 안 늘었는데
    // 요금만 나간 주기"가 보고서에서 사라진다 — 정확히 그때 알아야 하는데.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [item("a")]),
      enrich: vi.fn(async () => ({
        summary: "", // 빈 요약 = 실패로 처리된다
        points: [],
        tags: [],
        titleKo: null,
        officialByContent: false,
        usage: { inputTokens: 4000, outputTokens: 12, cacheReadTokens: 0, cacheWriteTokens: 0 },
      })),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });

    expect(report.summaries.succeeded).toBe(0);
    expect(report.summaries.failed).toBe(1);
    expect(report.usage.calls).toBe(1);
    expect(report.usage.inputTokens).toBe(4000);
    expect(report.usage.outputTokens).toBe(12);
  });

  it("여러 건이면 합산하고, 한 건의 최대 입력을 따로 남긴다", async () => {
    // 합계만 보면 "한 항목의 근거가 비정상적으로 컸다"와 "고르게 늘었다"가 구분되지 않는다.
    const sizes: Record<string, number> = { a: 300, b: 9000 };
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [item("a"), item("b")]),
      enrich: vi.fn(async ({ title }) => ({
        summary: "요약문",
        points: [],
        tags: [],
        titleKo: null,
        officialByContent: false,
        usage: {
          inputTokens: sizes[title.slice(-1)] ?? 0,
          outputTokens: 10,
          cacheReadTokens: 5,
          cacheWriteTokens: 7,
        },
      })),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });

    expect(report.usage.calls).toBe(2);
    expect(report.usage.inputTokens).toBe(9300);
    expect(report.usage.outputTokens).toBe(20);
    expect(report.usage.cacheReadTokens).toBe(10);
    expect(report.usage.cacheWriteTokens).toBe(14);
    expect(report.usage.maxInputTokens).toBe(9000);
  });

  it("호출이 던지면 그 건은 세지 않는다 (받은 적 없는 토큰을 지어내지 않는다)", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [item("a")]),
      enrich: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });

    expect(report.summaries.failed).toBe(1);
    expect(report.usage.calls).toBe(0);
    expect(report.usage.inputTokens).toBe(0);
  });

  it("부를 일이 없으면 전부 0 이다", async () => {
    // 시계를 멈춰 둔다 — 단계별 시간은 실제 경과라 진짜 시계로 재면 0 일 때도 있고
    // 1 일 때도 있다. 멈춘 시계면 "아무 일도 안 했으면 전부 0"을 그대로 단언할 수 있다.
    const report = await runIngest({
      sources: [],
      ports: makePorts(),
      now: NOW,
      monotonicNow: () => 0,
    });
    expect(report.usage).toEqual({
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
      // 부른 모델은 **0 이 아니라 이름**이다 — 아무것도 안 했어도 어느 모델로 돌 뻔했는지는
      // 남아야 한다. 이 칸이 비면 그 실행의 요금을 나중에 계산할 수 없다.
      models: {
        topic: TOPIC_MODEL,
        hotIssue: HOT_ISSUE_MODEL,
        enrich: ENRICH_MODEL,
        keywords: KEYWORD_MODEL,
      },
    });
  });
});

/**
 * 공식 여부의 근거 — content-selection INV-O2.
 *
 * 주소 근거(byUrl)는 적재 때 순수 함수가 정하고(INV-O3), 여기서 다루는 것은 **내용 근거**다.
 * 규칙은 둘: 모델이 공식이라고 하면 `byContent` 로 남기고, **이미 주소 근거가 있으면 건드리지
 * 않는다.** 덮으면 기계가 확인한 사실이 모델 판단으로 격하된다.
 */
describe("runIngest — INV-O2 공식 여부의 근거", () => {
  const cand = (over: Partial<EnrichCandidate> = {}): EnrichCandidate => ({
    id: "a",
    title: "제목",
    titleKo: "번역됨",
    contentHtml: "<p>본문</p>",
    sourceExcerpt: null,
    summary: null,
    officialBasis: "none" as const,
    sourceId: "s",
    ...over,
  });

  const enrichWith = (officialByContent: boolean) =>
    vi.fn(async () => ({
      summary: "요약문",
      points: [],
      tags: [],
      titleKo: null,
      officialByContent,
      usage: USAGE,
    }));

  it("INV-O2: 모델이 공식이라고 하면 byContent 로 남긴다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand()]),
      enrich: enrichWith(true),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveEnrichment).mock.calls[0][1]).toMatchObject({
      officialBasis: "byContent",
    });
  });

  it("INV-O2 (CS9) 실패경로: 모델이 공식이라고 하지 않으면 아무것도 쓰지 않는다", async () => {
    // 여기서 "none" 을 써 버리면 다음 주기의 주소 근거까지 덮을 수 있다.
    // 안 쓴다 = 컬럼 기본값 그대로 남는다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand()]),
      enrich: enrichWith(false),
    });
    await runIngest({ sources: [], ports, now: NOW });
    const patch = vi.mocked(ports.saveEnrichment).mock.calls[0][1];
    expect(patch).not.toHaveProperty("officialBasis");
  });

  it("INV-O2: 주소 근거가 이미 있으면 모델 판단으로 덮지 않는다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand({ officialBasis: "byUrl" })]),
      enrich: enrichWith(true),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveEnrichment).mock.calls[0][1]).not.toHaveProperty("officialBasis");
  });

  it("INV-O2 실패경로: 요약이 비면 공식 판정도 쓰지 않는다", async () => {
    // 2026-08-12 정정. 처음엔 "요약이 비어도 공식 판정만으로 저장한다"로 만들었는데,
    // **같은 근거를 주고도 요약을 못 만든 응답의 공식 판단은 믿을 이유가 약하다**(리뷰 지적).
    // 안 써도 잃는 게 없다 — 그 항목은 summary 가 비어 있어 다음 주기에 다시 잡힌다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand()]),
      enrich: vi.fn(async () => ({
        summary: "",
        points: [],
        tags: [],
        titleKo: null,
        officialByContent: true,
        usage: USAGE,
      })),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveEnrichment)).not.toHaveBeenCalled();
  });

  it("INV-O2 (CS2 연계): 번역만 하는 항목에는 공식 판정을 요청하지 않는다", async () => {
    // 근거(본문·출처 요약글)가 없으면 공식 여부도 지어내게 된다 — 요약과 같은 조건이다.
    // 번역은 성공시킨다 — 저장 자체가 안 일어나면 "안 실렸다"를 증명하지 못한다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        cand({ titleKo: null, contentHtml: "", sourceExcerpt: null }),
      ]),
      enrich: vi.fn(async () => ({
        summary: "",
        points: [],
        tags: [],
        titleKo: "번역",
        officialByContent: true,
        usage: USAGE,
      })),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich).mock.calls[0][0].needSummary).toBe(false);
    expect(vi.mocked(ports.saveEnrichment).mock.calls[0][1]).toEqual({ titleKo: "번역" });
  });
});

/**
 * 실패한 항목이 무엇인지 리포트에 남긴다.
 *
 * 건수만 남기면 같은 항목이 매 주기 조용히 실패해도 보고서는 "실패 1"만 반복한다 —
 * 주제 판정이 걸러진 제목을 남기는 것(INV-F2)과 같은 이유다. 실제 수집에서
 * 요약 1건·번역 1건이 실패했는데 어느 항목인지 알 방법이 없었다(2026-08-12).
 */
describe("runIngest — 실패한 항목을 지목한다", () => {
  const cand = (id: string, over: Partial<EnrichCandidate> = {}): EnrichCandidate => ({
    id,
    title: `제목 ${id}`,
    titleKo: null,
    contentHtml: `<p>본문 ${id}</p>`,
    sourceExcerpt: null,
    summary: null,
    officialBasis: "none" as const,
    sourceId: "s",
    ...over,
  });

  it("요약이 빈 값으로 돌아오면 그 항목의 제목이 남는다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand("a"), cand("b")]),
      enrich: vi.fn(async ({ title }) => ({
        summary: title.endsWith("a") ? "" : "요약문",
        points: [],
        tags: [],
        titleKo: "번역",
        officialByContent: false,
        usage: USAGE,
      })),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.failedTitles).toEqual(["제목 a"]);
    // 성공한 항목이 섞여 들어오면 목록이 거짓말을 한다.
    expect(report.summaries.failedTitles).not.toContain("제목 b");
  });

  it("호출 자체가 죽으면 요약·번역 양쪽 목록에 남는다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand("a")]),
      enrich: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.failedTitles).toEqual(["제목 a"]);
    expect(report.titles.failedTitles).toEqual(["제목 a"]);
  });

  it("건수와 목록이 어긋나지 않는다", async () => {
    // 세는 곳과 적는 곳이 따로면 한쪽만 고치는 날 보고서가 조용히 틀린다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [cand("a"), cand("b"), cand("c")]),
      enrich: vi.fn(async ({ title }) => ({
        summary: title.endsWith("c") ? "요약문" : "",
        points: [],
        tags: [],
        titleKo: title.endsWith("a") ? "" : "번역",
        officialByContent: false,
        usage: USAGE,
      })),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.failed).toBe(report.summaries.failedTitles.length);
    expect(report.titles.failed).toBe(report.titles.failedTitles.length);
    expect(report.summaries.failedTitles.sort()).toEqual(["제목 a", "제목 b"]);
    expect(report.titles.failedTitles).toEqual(["제목 a"]);
  });

  it("추출은 제목이 없으니 주소를 남긴다", async () => {
    const ports = makePorts({
      listExtractionCandidates: vi.fn(async () => [
        { id: "a", url: "https://ex.com/a" },
        { id: "b", url: "https://ex.com/b" },
      ]),
      extractContent: vi.fn(async (u: string) => {
        if (u.endsWith("a")) throw new Error("HTTP 403");
        return "<p>본문</p>";
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.extraction.failedUrls).toEqual(["https://ex.com/a"]);
    expect(report.extraction.failed).toBe(1);
  });

  it("실패가 없으면 목록도 비어 있다", async () => {
    const report = await runIngest({ sources: [], ports: makePorts(), now: NOW });
    expect(report.summaries.failedTitles).toEqual([]);
    expect(report.titles.failedTitles).toEqual([]);
    expect(report.extraction.failedUrls).toEqual([]);
  });
});

describe("runIngest — 적재가 실패해도 판정 기록은 남는다 (INV-F2)", () => {
  it("upsert 가 던져도 걸러낸 제목과 건수가 리포트에 남는다", async () => {
    // 여기서 리포트가 사라지면 하필 DB 가 흔들린 주기에 "무엇을 걸렀나"를 못 본다.
    // 판정 호출은 이미 나갔으므로 요금도 이미 썼다 — 기록만 없어지는 셈이다.
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("cocktail"), feedItem("ok")]),
      judgeTopic: vi.fn(async (title: string) => verdict(!title.includes("cocktail"))),
      upsertItems: vi.fn(async () => {
        throw new Error("DB 거부");
      }),
    });

    const report = await runIngest({ sources: [source("s")], ports, now: NOW });

    expect(report.sources[0].error).toContain("DB 거부");
    expect(report.topicFilter.attempted).toBe(2);
    expect(report.topicFilter.filtered).toBe(1);
    expect(report.topicFilter.filteredTitles).toEqual(["제목 cocktail"]);
  });
});

/**
 * 이미 적재된 항목은 다시 판정하지 않는다 (INV-F1 의 목적은 "적재하지 않는다"다).
 *
 * OpenAI 아카이브는 최신 50건이 매 주기 같다. 판정이 실제로 돌기 시작한 뒤로는
 * 그 50건이 매번 다시 호출돼 요금만 나갔다 — 이미 있는 항목은 판정 결과가 off 로 나와도
 * DB 에서 사라지지 않으므로 그 호출은 아무 효과가 없다.
 */
describe("runIngest — 이미 아는 항목은 판정하지 않는다", () => {
  it("이미 적재된 주소는 judgeTopic 을 부르지 않는다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("old"), feedItem("new")]),
      listKnownUrls: vi.fn(async () => ["https://ex.com/old"]),
    });

    await runIngest({ sources: [source("s")], ports, now: NOW });

    const judged = vi.mocked(ports.judgeTopic).mock.calls.map((c) => c[0]);
    expect(judged).toEqual(["제목 new"]);
  });

  it("이미 아는 항목도 적재는 한다 (본문·요약글이 새로 올 수 있다)", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("old"), feedItem("new")]),
      listKnownUrls: vi.fn(async () => ["https://ex.com/old"]),
    });

    const report = await runIngest({ sources: [source("s")], ports, now: NOW });

    const upserted = vi.mocked(ports.upsertItems).mock.calls[0][0].map((i) => i.canonicalUrl);
    expect(upserted.sort()).toEqual(["https://ex.com/new", "https://ex.com/old"]);
    expect(report.sources[0].stored).toBe(2);
  });

  it("건너뛴 건수를 리포트에 남긴다", async () => {
    // 남기지 않으면 "판정 2건"이 "새 글이 2건뿐"인지 "필터가 죽었는지" 구별되지 않는다.
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a"), feedItem("b"), feedItem("c")]),
      listKnownUrls: vi.fn(async () => ["https://ex.com/a", "https://ex.com/b"]),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.topicFilter.attempted).toBe(1);
    expect(report.topicFilter.alreadyKnown).toBe(2);
  });

  it("실패경로: 조회가 실패하면 전부 새 항목으로 보고 판정한다", async () => {
    // 여기서 던지면 그 소스의 수집이 통째로 죽는다. 모르면 판정하는 쪽이 안전하다 —
    // 돈은 더 쓰지만 새 글을 놓치지 않는다.
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a"), feedItem("b")]),
      listKnownUrls: vi.fn(async () => {
        throw new Error("DB 조회 실패");
      }),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(vi.mocked(ports.judgeTopic)).toHaveBeenCalledTimes(2);
    expect(report.sources[0].error).toBeNull();
    expect(report.topicFilter.alreadyKnown).toBe(0);
  });

  it("주제 밖으로 걸러진 것과 이미 아는 것은 다른 칸이다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("known"), feedItem("cocktail"), feedItem("ok")]),
      listKnownUrls: vi.fn(async () => ["https://ex.com/known"]),
      judgeTopic: vi.fn(async (title: string) => verdict(!title.includes("cocktail"))),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.topicFilter).toMatchObject({
      attempted: 2,
      filtered: 1,
      filteredTitles: ["제목 cocktail"],
      alreadyKnown: 1,
    });
    // 걸러진 것만 빠진다 — 이미 아는 항목은 적재 대상으로 남는다.
    expect(report.sources[0].stored).toBe(2);
  });
});

describe("runIngest — 주제 판정 토큰도 센다", () => {
  it("판정 호출의 토큰이 요약과 **다른 칸**에 쌓인다", async () => {
    // 합치면 어느 쪽이 튀는지 안 보인다. 판정은 건당 작고 건수가 많고, 요약은 반대다.
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a"), feedItem("b")]),
    });

    const report = await runIngest({ sources: [source("s")], ports, now: NOW });

    expect(report.usage.topicCalls).toBe(2);
    expect(report.usage.topicInputTokens).toBe(TOPIC_USAGE.inputTokens * 2);
    expect(report.usage.topicOutputTokens).toBe(TOPIC_USAGE.outputTokens * 2);
    // 요약 칸에는 섞이지 않는다.
    expect(report.usage.calls).toBe(0);
    expect(report.usage.inputTokens).toBe(0);
  });

  it("판정을 건너뛴 항목은 토큰도 안 쓴다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a"), feedItem("b")]),
      listKnownUrls: vi.fn(async () => ["https://ex.com/a", "https://ex.com/b"]),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.usage.topicCalls).toBe(0);
    expect(report.usage.topicInputTokens).toBe(0);
  });

  it("적재가 실패해도 이미 쓴 판정 토큰은 보고에 남는다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a")]),
      upsertItems: vi.fn(async () => {
        throw new Error("DB 거부");
      }),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.usage.topicCalls).toBe(1);
  });
});

/**
 * 판정을 **동시에** 보낸다.
 *
 * 왜 테스트가 필요한가: 순차 루프로도 결과는 똑같이 나온다. 달라지는 건 걸리는 시간뿐이라
 * 다른 테스트가 전부 green 인 채로 조용히 순차로 되돌아갈 수 있다. 실측이 건당 3.8초라
 * 소스 14곳의 첫 수집이 29분이 되고, Vercel 은 300초에서 함수를 끊는다 —
 * 그러면 배열 앞쪽 소스만 적재되고 뒤쪽은 매일 통째로 빠진다(에러 없이).
 */
describe("runIngest — INV-F1 판정은 동시에 나간다", () => {
  it("앞 건의 답을 기다렸다가 다음 건을 보내지 않는다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const ports = makePorts({
      fetchFeed: vi.fn(async () => Array.from({ length: 8 }, (_, i) => feedItem(`c${i}`))),
      judgeTopic: vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 0));
        inFlight -= 1;
        return verdict(true);
      }),
    });
    await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("INV-F1 (CS15): 한꺼번에 다 보내지는 않는다 — 동시 건수에 상한이 있다", async () => {
    // 상한이 없으면 소스 하나가 50건을 한 번에 던져 429(요청 과다)를 맞는다.
    // INV-F3 때문에 판정 실패는 **통과**로 처리되므로, 그 순간 필터가 조용히 열린다.
    let inFlight = 0;
    let maxInFlight = 0;
    const ports = makePorts({
      fetchFeed: vi.fn(async () => Array.from({ length: TOPIC_CONCURRENCY * 3 }, (_, i) => feedItem(`c${i}`))),
      judgeTopic: vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 0));
        inFlight -= 1;
        return verdict(true);
      }),
    });
    await runIngest({ sources: [source("s")], ports, now: NOW });
    // `toBeLessThanOrEqual(TOPIC_CONCURRENCY)` 는 자기 자신을 기준으로 삼는 단언이라
    // 상한을 100 으로 키워도 통과한다(항목이 50건이라 50 ≤ 100). 정확한 값을 요구한다.
    expect(maxInFlight).toBe(TOPIC_CONCURRENCY);
    // 상한 자체가 조용히 커지는 것은 budgets.test.ts 가 값을 못 박아 잡는다.
  });

  it("동시에 보내도 적재 순서는 피드 순서 그대로다", async () => {
    // 순서가 섞이면 MAX_ITEMS_PER_SOURCE 로 자를 때 최신순 정렬이 무너진다.
    const ports = makePorts({
      fetchFeed: vi.fn(async () => Array.from({ length: 6 }, (_, i) => feedItem(`c${i}`))),
      judgeTopic: vi.fn(async (title: string) => {
        // 뒤 항목일수록 빨리 답한다 — 도착 순서로 적재하면 뒤집힌다.
        const n = Number(title.replace(/\D/g, ""));
        await new Promise((r) => setTimeout(r, (6 - n) * 2));
        return verdict(true);
      }),
    });
    await runIngest({ sources: [source("s")], ports, now: NOW });
    const stored = vi.mocked(ports.upsertItems).mock.calls[0]![0]!;
    expect(stored.map((i) => i.title)).toEqual(["제목 c0", "제목 c1", "제목 c2", "제목 c3", "제목 c4", "제목 c5"]);
  });
});

/**
 * INV-F4 — 판정을 거는 소스는 소스 설정이 정한다.
 *
 * AI 전용 피드(AI타임스·TechCrunch AI 섹션·DeepMind 블로그 등)에 "이거 AI 글 맞아?"를
 * 묻는 것은 답이 정해진 질문에 건당 3.8초와 요금을 쓰는 일이다. 주제가 섞이는 소스
 * (Hacker News·GeekNews)에만 건다.
 */
describe("runIngest — INV-F4 판정을 거는 소스는 설정이 정한다", () => {
  it("INV-F4 (CS13): needsTopicCheck 가 false 인 소스는 judgeTopic 을 부르지 않고 전부 적재한다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a"), feedItem("b")]),
    });
    const report = await runIngest({
      sources: [{ ...source("ai-only"), needsTopicCheck: false }],
      ports,
      now: NOW,
    });
    expect(ports.judgeTopic).not.toHaveBeenCalled();
    expect(report.sources[0]!.stored).toBe(2);
  });

  it("INV-F4 (CS14) 실패경로: needsTopicCheck 가 true 인 소스는 판정한다 — 플래그를 무시하지 않는다", async () => {
    // 위 케이스만 있으면 "판정을 통째로 없앴다"도 통과한다.
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a"), feedItem("cocktail")]),
      judgeTopic: vi.fn(async (title: string) => verdict(!title.includes("cocktail"))),
    });
    const report = await runIngest({
      sources: [{ ...source("mixed"), needsTopicCheck: true }],
      ports,
      now: NOW,
    });
    expect(ports.judgeTopic).toHaveBeenCalledTimes(2);
    expect(report.sources[0]!.stored).toBe(1);
  });

  it("판정을 건너뛴 건수를 리포트에 남긴다 (notChecked)", async () => {
    // 이게 없으면 "판정 2건 중 0건 걸러냄"이 **새 글이 2건뿐인 것**인지
    // **300건을 판정 없이 통과시킨 것**인지 구별되지 않는다. alreadyKnown 을 따로 세는 이유와 같다.
    const ports = makePorts({
      fetchFeed: vi.fn(async (s: Source) =>
        s.id === "ai-only" ? [feedItem("x"), feedItem("y"), feedItem("z")] : [feedItem("a")],
      ),
    });
    const report = await runIngest({
      sources: [
        { ...source("ai-only"), needsTopicCheck: false },
        { ...source("mixed"), needsTopicCheck: true },
      ],
      ports,
      now: NOW,
    });
    expect(report.topicFilter.notChecked).toBe(3);
    expect(report.topicFilter.attempted).toBe(1);
  });
});

/**
 * 실패한 **이유**를 리포트에 남긴다.
 *
 * 2026-08-13 실행에서 요약·번역이 10건 전부 실패했는데 리포트에는 제목만 남아,
 * 원인(Anthropic 크레딧 소진, HTTP 400)을 알아내는 데 API 를 직접 찔러 봐야 했다.
 * 배포된 Cron 에서는 터미널이 없어 더 나쁘다 — 이유가 안 남으면 Vercel 로그를 뒤져야 한다.
 *
 * 이유는 **서로 다른 것만** 모은다. 같은 이유로 10건이 실패하면 한 줄이면 된다
 * (실패한 제목은 이미 따로 남는다).
 */
describe("runIngest — 실패 이유를 남긴다", () => {
  it("요약이 실패하면 그 이유가 리포트에 남는다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        { id: "1", title: "T1", titleKo: null, contentHtml: "<p>근거</p>", sourceExcerpt: null, summary: null, officialBasis: "none" as const, sourceId: "s" },
      ]),
      enrich: vi.fn(async () => {
        throw new Error("400 크레딧 잔액이 부족합니다");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.failureReasons).toContain("400 크레딧 잔액이 부족합니다");
  });

  it("같은 이유로 여러 건이 실패해도 한 번만 남는다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () =>
        ["1", "2", "3"].map((id) => ({
          id, title: `T${id}`, titleKo: null, contentHtml: "<p>근거</p>",
          sourceExcerpt: null, summary: null, officialBasis: "none" as const, sourceId: "s",
        })),
      ),
      enrich: vi.fn(async () => {
        throw new Error("같은 오류");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.failureReasons).toEqual(["같은 오류"]);
    // 제목은 그대로 3건 다 남는다 — 어느 항목이 실패했는지는 여전히 알아야 한다.
    expect(report.summaries.failedTitles).toHaveLength(3);
  });

  it("판정이 실패하면 그 이유도 남는다 (INV-F3 는 통과시키지만 조용히는 아니다)", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a")]),
      judgeTopic: vi.fn(async () => {
        throw new Error("주제 판정 실패 (stop=max_tokens)");
      }),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.topicFilter.failedOpen).toBe(1);
    expect(report.topicFilter.failureReasons).toContain("주제 판정 실패 (stop=max_tokens)");
  });

  it("본문 추출이 실패해도 이유가 남는다", async () => {
    const ports = makePorts({
      listExtractionCandidates: vi.fn(async () => [{ id: "1", url: "https://ex.com/a" }]),
      extractContent: vi.fn(async () => {
        throw new Error("HTTP 403");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.extraction.failureReasons).toContain("HTTP 403");
  });
});

describe("runIngest — 번역 실패 이유도 남는다", () => {
  it("호출이 죽으면 요약뿐 아니라 **번역** 목록에도 이유가 남는다", async () => {
    // noteFailure(titles.failureReasons, e) 한 줄을 지워도 전 스위트가 green 이었다.
    // 네 단계(요약·판정·추출·번역) 중 번역만 이유가 비는 상태다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        {
          id: "1",
          title: "Title",
          titleKo: null,
          contentHtml: "<p>본문</p>",
          sourceExcerpt: null,
          summary: null,
          officialBasis: "none" as const,
          sourceId: "s",
        },
      ]),
      enrich: vi.fn(async () => {
        throw new Error("credit balance too low");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.titles.failureReasons).toEqual(["credit balance too low"]);
    expect(report.summaries.failureReasons).toEqual(["credit balance too low"]);
  });

  it("실패 이유는 개수와 **한 줄 길이**를 둘 다 막는다", async () => {
    // 개수만 막으면 절반이다 — 남의 서버가 준 헤더에 응답 본문이 실리면 한 줄이 수 KB 가 된다.
    const long = "x".repeat(5_000);
    const ports = makePorts({
      listExtractionCandidates: vi.fn(async () =>
        Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, url: `https://ex.com/${i}` })),
      ),
      extractContent: vi.fn(async (url: string) => {
        throw new Error(`${url} ${long}`);
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.extraction.failureReasons).toHaveLength(5);
    for (const reason of report.extraction.failureReasons) {
      expect(reason.length).toBeLessThanOrEqual(200);
    }
  });
});

describe("runIngest — 한 청크 안에서 일부만 실패해도 나머지 판정은 살아 있다", () => {
  it("INV-F3 (CS16) 실패경로: 8건 중 1건이 죽어도 나머지 7건의 판정 결과가 그대로 쓰인다", async () => {
    // 청크 단위로 try 를 올리면(개별 try/catch 제거) 이 케이스에서만 깨진다:
    // 한 건의 타임아웃이 같은 청크의 주제 밖 글까지 통과시켜 버린다(INV-F2 가 막으려던 상태).
    const items = Array.from({ length: 8 }, (_, i) => feedItem(`c${i}`));
    const ports = makePorts({
      fetchFeed: vi.fn(async () => items),
      judgeTopic: vi.fn(async (title: string) => {
        if (title === "제목 c3") throw new Error("timeout");
        if (title === "제목 c5") return verdict(false);
        return verdict(true);
      }),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });

    expect(report.topicFilter.attempted).toBe(8);
    expect(report.topicFilter.failedOpen).toBe(1);
    // 실패한 c3 은 통과(INV-F3), 주제 밖인 c5 는 **여전히** 걸러진다.
    expect(report.topicFilter.filtered).toBe(1);
    expect(report.topicFilter.filteredTitles).toEqual(["제목 c5"]);
    expect(report.sources[0]!.stored).toBe(7);
    // 실패한 호출은 토큰을 못 받으므로 성공한 7건만 센다.
    expect(report.usage.topicCalls).toBe(7);
    expect(report.topicFilter.failureReasons).toEqual(["timeout"]);
  });

  it("INV-F2: 걸러진 제목은 남기되 **한 줄 길이를 막는다**", async () => {
    // 제목은 남의 서버가 준 문자열이고, 그대로 Cron 응답 본문과 Vercel 로그에 들어간다.
    // 개수는 못 막는다 — INV-F2 가 걸러진 것 전부의 제목을 요구한다.
    // **리터럴로 쓴다.** `MAX_TITLE_LENGTH + 50` 처럼 상수에서 파생하면 값을 5000 으로
    // 바꿔도 관계가 유지돼 그대로 통과한다 — 2026-08-16 변이 확인에서 실제로 green 이었다.
    // (`MAX_RATIO` 10→100 과 같은 형태. 이 저장소에서 세 번째다.)
    expect(MAX_TITLE_LENGTH).toBe(120);
    const long = "가".repeat(170);
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [{ ...feedItem("x"), title: long }]),
      judgeTopic: vi.fn(async () => verdict(false)),
    });

    const report = await runIngest({ sources: [source("s")], ports, now: NOW });

    expect(report.topicFilter.filteredTitles).toHaveLength(1);
    expect(report.topicFilter.filteredTitles[0]).toHaveLength(120);
    // 자르기만 확인하면 절반이다 — 짧은 제목이 멀쩡히 남는 것도 본다.
    const short = makePorts({
      fetchFeed: vi.fn(async () => [{ ...feedItem("y"), title: "짧은 제목" }]),
      judgeTopic: vi.fn(async () => verdict(false)),
    });
    const r2 = await runIngest({ sources: [source("s")], ports: short, now: NOW });
    expect(r2.topicFilter.filteredTitles).toEqual(["짧은 제목"]);
  });
});

describe("runIngest — 시간 예산 (Vercel 300초에서 잘리지 않는다)", () => {
  /**
   * 예산이 없으면 함수가 죽어 **응답 본문이 통째로 사라진다** — 실패 이유도 토큰 계측도
   * 안 남고 요금만 나간다. 시계를 주입해 실제로 기다리지 않고 확인한다.
   */
  /**
   * 처음 `freeCalls` 번은 0 을 주고 그 뒤로는 `jumpMs` 로 건너뛴다.
   * **첫 호출은 마감 시각 계산에 쓰인다** — 그다음부터가 루프의 예산 확인이다.
   */
  const clockAfter = (freeCalls: number, jumpMs: number) => {
    let calls = 0;
    return () => (calls++ < freeCalls ? 0 : jumpMs);
  };

  it("예산이 떨어지면 남은 소스를 건너뛰고 **리포트를 정상 반환**한다", async () => {
    const ports = makePorts({ fetchFeed: vi.fn(async () => [feedItem("a")]) });
    const report = await runIngest({
      sources: [source("s1"), source("s2"), source("s3")],
      ports,
      now: NOW,
      budgetMs: 1000,
      // 마감 계산 1 + s1 확인 1 = 2번까지만 예산 안이다.
      monotonicNow: clockAfter(2, 5000),
    });

    expect(report.sources.map((r) => r.sourceId)).toEqual(["s1"]);
    expect(report.budget.skippedSources).toEqual(["s2", "s3"]);
    expect(report.budget.exhausted).toBe(true);
    // 던지지 않는다 — 여기까지 왔다는 것 자체가 리포트가 돌아왔다는 뜻이다.
    expect(report.failedSources).toEqual([]);
  });

  it("예산이 떨어지면 후처리도 멈추고 건너뛴 건수를 남긴다", async () => {
    const candidates = Array.from({ length: 4 }, (_, i) => ({
      id: `${i}`,
      title: `Title ${i}`,
      titleKo: null,
      contentHtml: "<p>본문</p>",
      sourceExcerpt: null,
      summary: null,
      officialBasis: "none" as const,
      sourceId: "s",
    }));
    const ports = makePorts({ listEnrichCandidates: vi.fn(async () => candidates) });
    const report = await runIngest({
      sources: [],
      ports,
      now: NOW,
      budgetMs: 1000,
      // 마감 계산 1 + 후처리 2건 확인 = 3번까지 예산 안. 나머지 2건은 건너뛴다.
      monotonicNow: clockAfter(3, 5000),
    });

    // 건너뛴 것은 반드시 센다 — 안 세면 "요약 2건"이 후보가 2건인 것으로 보인다.
    expect(report.budget.skippedEnrichments).toBeGreaterThan(0);
    expect(report.summaries.succeeded + report.budget.skippedEnrichments).toBe(4);
    expect(report.budget.exhausted).toBe(true);
  });

  /** 요약 후보 n 건. 칸 내용은 판정과 무관하므로 최소한만 채운다. */
  const enrichPool = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      title: `Title ${i}`,
      titleKo: null,
      contentHtml: "<p>본문</p>",
      sourceExcerpt: null,
      summary: null,
      officialBasis: "none" as const,
      sourceId: "s",
    }));

  /**
   * INV-CB12 — 리포트에는 **아직 처리 안 된 건수**가 남는다.
   *
   * 처리한 건수만 남기면 「요약 10건」이 그날 전부인지 마흔 건 중 열 건인지 구별이 안 된다.
   * 2026-09-22 에 실제로 그 빈칸 때문에 「다 처리했다」로 읽었다.
   */
  it("INV-CB12: 남은 건수가 리포트에 남는다 — 처리한 수만으로는 다 했는지 알 수 없다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => enrichPool(4)),
    });
    const report = await runIngest({
      sources: [],
      ports,
      now: NOW,
      budgetMs: 1000,
      monotonicNow: clockAfter(3, 5000),
    });

    // 처리한 수와 남은 수를 더하면 후보 전부가 된다. 이 등식이 깨지면 어딘가로 조용히 샌다.
    expect(report.budget.skippedEnrichments).toBeGreaterThan(0);
    expect(report.summaries.succeeded + report.budget.skippedEnrichments).toBe(4);
  });

  it("INV-CB12 실패경로: 후보 조회가 잘리면 그 사실이 남는다 — 예산은 하나도 안 썼는데 일은 남는다", async () => {
    // 풀 상한만큼 받아 오면 **더 있는데 못 본 것**이다. 시간도 돈도 안 썼으므로 다른 칸은
    // 전부 0 이고, 이 칸이 없으면 그 상태가 「다 했다」와 같은 모양이 된다.
    const ports = makePorts({ listEnrichCandidates: vi.fn(async () => enrichPool(ENRICH_POOL)) });
    const report = await runIngest({ sources: [], ports, now: NOW, monotonicNow: () => 0 });

    expect(report.budget.poolTruncated).toBe(true);
    expect(report.budget.exhausted).toBe(true);
  });

  it("INV-CB12: 단계 **안에서** 멈춘 건수도 리포트로 옮겨 온다", async () => {
    // 키워드 단계가 스스로 센 「밀린 건수」가 budget 으로 안 넘어오면 이어달리기 판정이
    // (INV-CB10) 그 일을 못 본다 — 단계 리포트에는 남아 있는데 아무도 안 읽는 상태가 된다.
    // 여기서는 단계가 **돌기는 했고**(null 이 아니다) 그 안에서 전부 밀린 상태를 만든다.
    const ports = makePorts({
      listKeywordCandidates: vi.fn(async () =>
        Array.from({ length: 16 }, (_, i) => ({
          id: `k${i}`,
          title: `T${i}`,
          evidence: "본문",
        })),
      ),
    });
    const report = await runIngest({
      sources: [],
      ports,
      now: NOW,
      budgetMs: 60_000,
      monotonicNow: clockAfter(8, 100_000),
    });

    // 통째로 건너뛴 것이 아니다 — 그랬다면 `skippedKeywords` 쪽이고 다른 칸이다.
    expect(report.budget.skippedKeywords).toBe(false);
    expect(report.budget.skippedKeywordItems).toBe(16);
    // 단계가 센 값이 그대로 와야 한다. 여기가 0 으로 굳어 있으면 남은 일이 안 보인다.
    expect(report.budget.skippedKeywordItems).toBe(report.keywords?.skipped);
  });

  it("예산이 넉넉하면 아무것도 건너뛰지 않는다 — 가드가 평소에 끼어들지 않는다", async () => {
    const ports = makePorts({ fetchFeed: vi.fn(async () => [feedItem("a")]) });
    const report = await runIngest({
      sources: [source("s1"), source("s2")],
      ports,
      now: NOW,
      monotonicNow: () => 0,
    });
    expect(report.budget).toEqual({
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
    });
    expect(report.sources).toHaveLength(2);
  });

  it("단계마다 걸린 시간을 따로 남긴다 (2026-09-22)", async () => {
    // 왜 이 테스트가 있나: 지금까지 남는 것이 총 소요시간 하나뿐이었다. 244초가 나와도
    // 그중 주제 판정이 얼마고 요약이 얼마인지 알 길이 없어서, 한 바퀴를 어떻게 나눌지를
    // **추정으로** 정하게 돼 있었다. 칸이 있어도 아무도 안 채우면 전부 0 으로 남는다.
    //
    // 시계는 부를 때마다 10 씩 간다 — 재기 전후로 한 번씩 읽으므로 실제로 잰 단계만 0 보다 커진다.
    let t = 0;
    const tick = () => (t += 10);
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a")]),
      listKeywordCandidates: vi.fn(async () => [
        { id: "k1", title: "제목", evidence: "근거" },
      ]),
    });

    const report = await runIngest({
      sources: [source("s1")],
      ports,
      now: NOW,
      monotonicNow: tick,
    });

    // 실제로 돈 단계는 시간이 남는다.
    expect(report.usage.stageMs.feedMs).toBeGreaterThan(0);
    expect(report.usage.stageMs.topicMs).toBeGreaterThan(0);
    expect(report.usage.stageMs.storeMs).toBeGreaterThan(0);
    expect(report.usage.stageMs.enrichmentMs).toBeGreaterThan(0);
    expect(report.usage.stageMs.keywordsMs).toBeGreaterThan(0);
    // 후보가 없어 아무것도 안 뽑은 단계도 **돌기는 했다** — 0 이 아니다.
    // 그래야 "돌았는데 할 일이 없었다"와 "아예 안 돌았다"가 갈린다.
    expect(report.usage.stageMs.hotIssueMs).toBeGreaterThan(0);
  });

  it("건너뛴 단계는 시간이 0 이다 — 「할 일이 없었다」와 「못 돌았다」를 가른다", async () => {
    const ports = makePorts({ fetchFeed: vi.fn(async () => [feedItem("a")]) });
    const report = await runIngest({
      sources: [source("s1")],
      ports,
      now: NOW,
      budgetMs: 1000,
      // 마감 계산 1 + 소스 확인 1 = 2번까지 예산 안. 소스부터 통째로 밀린다.
      monotonicNow: clockAfter(2, 5000),
    });

    expect(report.budget.skippedKeywords).toBe(true);
    expect(report.usage.stageMs.keywordsMs).toBe(0);
    expect(report.usage.stageMs.hotIssueMs).toBe(0);
  });

  it("INV-F5: 예산이 떨어지면 **판정 청크 사이에서도** 멈추고, 남은 건 통과시킨다(INV-F3)", async () => {
    // 왜 이 테스트가 있나 (2026-08-16 리뷰): 예산 확인이 소스 루프 머리에만 있었다.
    // 소스 하나가 시작 시점만 통과하면 최대 50건(7묶음)을 끝까지 돌린다 — 판정이
    // 타임아웃으로 떨어지면 묶음당 15초라, 한 소스가 예산을 100초 넘게 더 쓸 수 있었다.
    // 넘기면 Vercel 이 함수를 죽여 응답 본문이 통째로 사라진다(예산 가드를 만든 이유 자체).
    const items = Array.from({ length: TOPIC_CONCURRENCY * 2 }, (_, i) => feedItem(`i${i}`));
    const judgeTopic = vi.fn(async () => verdict(true));
    const ports = makePorts({ fetchFeed: vi.fn(async () => items), judgeTopic });

    const report = await runIngest({
      sources: [source("s1")],
      ports,
      now: NOW,
      // 한 묶음의 최악치(15초)보다는 넉넉해야 첫 묶음이 시작된다 (INV-CB9).
      budgetMs: 20_000,
      // 마감 계산 1 + 소스 확인 1 + 피드 재기 2 + 첫 청크 확인 1 + 첫 청크 재기 2 = 7번까지
      // 0 초. 둘째 청크 확인(8번째)이 6초 시점인데, 남은 14초는 한 묶음의 최악치(15초)보다
      // **적다** — 마감까지 시간이 남았는데도 끊는다. 그게 INV-CB9 다.
      // **단계를 재는 것도 시계를 읽는다**(2026-09-22) — 재기 전후로 한 번씩이다.
      monotonicNow: clockAfter(7, 6000),
    });

    // 첫 묶음만 물었다 — 예산이 판정 도중에 실제로 걸렸다는 뜻이다.
    expect(judgeTopic).toHaveBeenCalledTimes(TOPIC_CONCURRENCY);
    // 안 물어본 것은 **통과**시킨다 (INV-F3: 모르면 거르지 않는다).
    expect(report.sources[0]!.stored).toBe(items.length);
    expect(report.topicFilter.filtered).toBe(0);
    // 건너뛴 것은 반드시 센다. `notChecked`(소스 설정) 와 **다른 칸**이어야 한다 —
    // 합치면 "판정을 안 걸기로 한 것"과 "시간이 없어 못 문 것"이 구별되지 않는다.
    expect(report.budget.skippedTopicChecks).toBe(TOPIC_CONCURRENCY);
    expect(report.topicFilter.notChecked).toBe(0);
    expect(report.budget.exhausted).toBe(true);
  });

  it("기본 예산이 걸려 있다 — budgetMs 를 안 주면 무제한이 되면 안 된다", async () => {
    // 인자를 깜빡하면 가드가 사라지는 구조면 안 된다.
    const ports = makePorts({ fetchFeed: vi.fn(async () => [feedItem("a")]) });
    const report = await runIngest({
      sources: [source("s1"), source("s2")],
      ports,
      now: NOW,
      // 기본 예산(240초)을 훌쩍 넘긴 시각을 준다.
      monotonicNow: clockAfter(2, 999_999),
    });
    expect(report.budget.skippedSources).toEqual(["s2"]);
  });
});

describe("runIngest — 2026-08-17: 실행 id · 소스별 주제판정 (대시보드용)", () => {
  it("같은 실행 안의 모든 upsertItems 호출이 같은 runId 를 받는다", async () => {
    const seen: string[] = [];
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a")]),
      upsertItems: vi.fn(async (items: FeedItemDraft[], runId: string) => {
        seen.push(runId);
        return items.length;
      }),
    });
    await runIngest({ sources: [source("s1"), source("s2")], ports, now: NOW, runId: "run-x" });
    expect(seen).toEqual(["run-x", "run-x"]);
  });

  it("runId 를 안 주면 무작위로 생성한다 — 매 실행이 서로 다른 값이다", async () => {
    const seen: string[] = [];
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("a")]),
      upsertItems: vi.fn(async (items: FeedItemDraft[], runId: string) => {
        seen.push(runId);
        return items.length;
      }),
    });
    await runIngest({ sources: [source("s1")], ports, now: NOW });
    await runIngest({ sources: [source("s1")], ports, now: NOW });
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("소스별 SourceReport 에 그 소스만의 주제판정 결과가 붙는다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async (s: Source) => {
        if (s.id === "a") return [feedItem("a1"), feedItem("a2")];
        return [feedItem("b1")];
      }),
      judgeTopic: vi.fn(async (title: string) => verdict(title !== "제목 a2")),
    });
    const report = await runIngest({ sources: [source("a"), source("b")], ports, now: NOW });

    const a = report.sources.find((r) => r.sourceId === "a")!;
    const b = report.sources.find((r) => r.sourceId === "b")!;
    // 소스 a 만 하나 걸렀다 — 합계(report.topicFilter)가 아니라 그 소스 몫만 봐야 한다.
    expect(a.topicFilter.filtered).toBe(1);
    expect(a.topicFilter.filteredTitles).toEqual(["제목 a2"]);
    expect(b.topicFilter.filtered).toBe(0);
    // 합계는 소스별 값을 더한 것과 같아야 한다 — 따로 계산하면 어긋날 수 있다.
    expect(report.topicFilter.filtered).toBe(a.topicFilter.filtered + b.topicFilter.filtered);
  });
});

/**
 * 하루 요금 상한 — ingest-chaining-budget INV-CB6·CB7·CB8·CB9.
 *
 * 붙드는 것은 **무엇이 멈추고 무엇이 계속 도는가**다. 가르는 기준은 "요약이냐"가 아니라
 * "멈추면 화면이 틀리느냐"다 — 판정이 멈추면 그날 글이 전부 조용히 「소식」으로 간다.
 */
describe("runIngest — 하루 요금 상한", () => {
  const cappedPorts = (over: Partial<IngestPorts> = {}) =>
    makePorts({
      // 저장된 오늘 합계가 이미 상한이다 (INV-CB6: 기록에서 읽는다).
      loadTodaySpendUsd: vi.fn(async () => 10),
      listHotIssueCandidates: vi.fn(async () => [
        {
          id: "h1",
          title: "핫이슈 후보",
          evidence: "근거",
          sourceId: "s",
          publishedAt: NOW.toISOString(),
        },
      ]),
      listExtractionCandidates: vi.fn(async () => [{ id: "e1", url: "https://ex.com/e1" }]),
      listEnrichCandidates: vi.fn(async () => [
        {
          id: "n1",
          title: "Title",
          titleKo: null,
          contentHtml: "<p>본문</p>",
          sourceExcerpt: null,
          summary: null,
          officialBasis: "none" as const,
          sourceId: "s",
        },
      ]),
      listKeywordCandidates: vi.fn(async () => [{ id: "k1", title: "제목", evidence: "근거" }]),
      ...over,
    });

  it("INV-CB8: 상한에 닿으면 판정 둘은 계속 돌고, 본문·요약·번역·키워드는 안 돈다", async () => {
    const ports = cappedPorts();
    const report = await runIngest({
      sources: [source("s")],
      ports: makePortsWith(ports, { fetchFeed: vi.fn(async () => [feedItem("a")]) }),
      now: NOW,
    });

    // 계속 도는 쪽 — 멈추면 화면이 **틀린다**.
    expect(ports.judgeTopic).toHaveBeenCalled();
    expect(ports.judgeHotIssue).toHaveBeenCalled();
    // 멈추는 쪽 — 비거나 얇아질 뿐이다.
    expect(ports.extractContent).not.toHaveBeenCalled();
    expect(ports.enrich).not.toHaveBeenCalled();
    expect(ports.extractKeywords).not.toHaveBeenCalled();
    expect(report.keywords).toBeNull();
    expect(report.hotIssue).not.toBeNull();
  });

  it("INV-CB8 실패경로: 멈춘 사실과 그때의 합계가 리포트에 남는다", async () => {
    const report = await runIngest({ sources: [], ports: cappedPorts(), now: NOW });
    expect(report.cost.capped).toBe(true);
    expect(report.cost.spentUsd).toBeGreaterThanOrEqual(report.cost.capUsd);
    expect(report.cost.lookupFailed).toBe(false);
    // 안 남기면 "그날 글이 없었다"와 "상한에 걸렸다"가 리포트에서 같은 모양이 된다.
    expect(report.budget.skippedKeywords).toBe(true);
    expect(report.budget.skippedEnrichments).toBeGreaterThan(0);
    expect(report.budget.skippedExtractions).toBeGreaterThan(0);
  });

  it("INV-CB7: 상한을 넘었으면 모델을 **한 번도** 부르지 않는다 (요약·키워드)", async () => {
    const ports = cappedPorts();
    await runIngest({ sources: [], ports, now: NOW });
    expect(ports.enrich).toHaveBeenCalledTimes(0);
    expect(ports.extractKeywords).toHaveBeenCalledTimes(0);
  });

  it("상한 아래면 평소대로 다 돈다 — 가드가 평소에 끼어들지 않는다", async () => {
    const ports = makePorts({
      loadTodaySpendUsd: vi.fn(async () => 2.19),
      listEnrichCandidates: vi.fn(async () => [
        {
          id: "n1",
          title: "Title",
          titleKo: null,
          contentHtml: "<p>본문</p>",
          sourceExcerpt: null,
          summary: null,
          officialBasis: "none" as const,
          sourceId: "s",
        },
      ]),
      listKeywordCandidates: vi.fn(async () => [{ id: "k1", title: "제목", evidence: "근거" }]),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(ports.enrich).toHaveBeenCalled();
    expect(ports.extractKeywords).toHaveBeenCalled();
    expect(report.cost.capped).toBe(false);
  });

  it("INV-CB6 실패경로: 오늘 합계를 못 읽으면 상한에 닿은 것으로 본다", async () => {
    // 0 으로 보면 조회가 깨진 날 상한이 통째로 사라진다 — 그게 이 조항이 막으려던 상태다.
    const ports = makePorts({
      loadTodaySpendUsd: vi.fn(async () => {
        throw new Error("DB 안 됨");
      }),
      listEnrichCandidates: vi.fn(async () => [
        {
          id: "n1",
          title: "Title",
          titleKo: null,
          contentHtml: "<p>본문</p>",
          sourceExcerpt: null,
          summary: null,
          officialBasis: "none" as const,
          sourceId: "s",
        },
      ]),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.cost.capped).toBe(true);
    // **"돈을 다 썼다"와 "못 읽었다"는 다르다** — 한 칸에 섞으면 조회가 깨진 날이
    // 돈을 다 쓴 날처럼 보인다.
    expect(report.cost.lookupFailed).toBe(true);
    expect(ports.enrich).not.toHaveBeenCalled();
  });

  it("INV-CB7: 이번 바퀴가 상한을 넘기면 그 다음 건부터 모델을 안 부른다", async () => {
    // 저장된 합계는 상한 아래인데, 이 바퀴의 요약 호출이 상한을 넘긴다.
    // 이번 바퀴 지출을 안 세면 한 호출이 상한을 통째로 넘길 수 있다.
    const candidates = Array.from({ length: 4 }, (_, i) => ({
      id: `n${i}`,
      title: `Title ${i}`,
      titleKo: null,
      contentHtml: "<p>본문</p>",
      sourceExcerpt: null,
      summary: null,
      officialBasis: "none" as const,
      sourceId: "s",
    }));
    const enrich = vi.fn(async () => ({
      summary: "요약",
      points: ["항목"],
      titleKo: "한국어 제목",
      officialByContent: false,
      // 한 번에 $10 어치(출력 100만 토큰 × $10/MTok)를 쓴다.
      usage: { inputTokens: 0, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }));
    const ports = makePorts({
      loadTodaySpendUsd: vi.fn(async () => 0),
      listEnrichCandidates: vi.fn(async () => candidates),
      enrich,
    });
    const report = await runIngest({ sources: [], ports, now: NOW });

    expect(enrich).toHaveBeenCalledTimes(1);
    expect(report.budget.skippedEnrichments).toBe(3);
    expect(report.cost.capped).toBe(true);
  });

  it("INV-CB9 실패경로: 다음 호출은 번호가 아니라 **아직 안 된 것**을 DB 에서 다시 찾는다", async () => {
    // 번호로 이어받으면 그 사이에 새 글이 앞에 들어왔을 때 줄이 밀려 중간이 통째로
    // 건너뛰어진다. 아무 오류도 안 나고 리포트도 정상이라 알 길이 없다.
    const pending = ["a", "b", "c"];
    const asCandidate = (id: string) => ({
      id,
      title: `Title ${id}`,
      titleKo: null,
      contentHtml: "<p>본문</p>",
      sourceExcerpt: null,
      summary: null,
      officialBasis: "none" as const,
      sourceId: "s",
    });
    const done: string[] = [];
    // 요약 한 건이 40초씩 걸리는 시계. 호출 횟수가 아니라 **쓴 시간**으로 끊어야
    // 이 테스트가 보는 것이 INV-CB9(한 건의 최악치만큼 남았나)가 된다.
    let clock = 0;
    const ports = makePorts({
      enrich: vi.fn(async () => {
        clock += 40_000;
        return {
          summary: "요약",
          points: ["항목"],
          titleKo: "한국어 제목",
          officialByContent: false,
          usage: USAGE,
        };
      }),
      // 아직 안 된 것만 돌려준다 (DB 조회가 하는 일 그대로).
      listEnrichCandidates: vi.fn(async () => pending.filter((id) => !done.includes(id)).map(asCandidate)),
      saveEnrichment: vi.fn(async (id: string) => {
        done.push(id);
      }),
    });

    // 첫 호출: 두 건만 처리할 시간이 있다.
    await runIngest({
      sources: [],
      ports,
      now: NOW,
      // 두 건(80초)까지는 들어가고, 세 번째는 남은 20초가 한 건의 최악치(30초)보다
      // 적어서 시작하지 않는다 — 마감까지 시간이 남았는데도 끊는다.
      budgetMs: 100_000,
      monotonicNow: () => clock,
    });
    expect(done).toEqual(["a", "b"]);

    // 그 사이 새 글이 **앞에** 들어왔다.
    pending.unshift("new");
    await runIngest({ sources: [], ports, now: NOW });

    // 새 글과 밀린 c 가 둘 다 처리됐다 — 번호로 이어받았다면 c 가 통째로 건너뛰어진다.
    expect(done).toEqual(["a", "b", "new", "c"]);
  });
});

/** 이미 만든 포트 묶음에 몇 개만 덮어쓴다 — 호출 횟수를 보는 스파이를 그대로 유지하려고. */
function makePortsWith(base: IngestPorts, over: Partial<IngestPorts>): IngestPorts {
  return { ...base, ...over };
}

