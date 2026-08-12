import { describe, expect, it, vi } from "vitest";
import type { FeedItemDraft } from "@/entities/article";
import type { Source } from "@/entities/source";
import { MAX_ITEMS_PER_SOURCE, runIngest } from "./run-ingest";
import type { EnrichCandidate, ExtractionCandidate, IngestPorts } from "./ports";

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
/** 판정 결과를 포트 모양으로 감싼다. */
const verdict = (onTopic: boolean) => ({ onTopic, usage: TOPIC_USAGE });

const source = (id: string): Source => ({
  id,
  name: id,
  weight: 1,
  feedUrl: `https://ex.com/${id}.xml`,
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
    fetchFeed: vi.fn(async () => []),
    judgeTopic: vi.fn(async () => verdict(true)),
    listKnownUrls: vi.fn(async () => [] as string[]),
    upsertItems: vi.fn(async (items) => items.length),
    listExtractionCandidates: vi.fn(async () => [] as ExtractionCandidate[]),
    extractContent: vi.fn(async () => "<p>추출된 본문</p>"),
    saveContent: vi.fn(async () => {}),
    listEnrichCandidates: vi.fn(async () => [] as EnrichCandidate[]),
    enrich: vi.fn(async () => ({
      summary: "요약",
      points: ["항목"],
      tags: ["MCP"],
      titleKo: "한국어 제목",
      officialByContent: false, usage: USAGE,
    })),
    saveEnrichment: vi.fn(async () => {}),
    ...over,
  };
}

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
        { id: "a", title: "제목", titleKo: "번역됨", contentHtml: "   ", sourceExcerpt: null, summary: null, officialBasis: "none" as const },
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
        { id: "s", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null, titleKo: "번역됨", officialBasis: "none" as const },
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
        { id: "a", title: "Dithered QR Codes", contentHtml: "", sourceExcerpt: null, summary: null, titleKo: "번역됨", officialBasis: "none" as const },
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
        { id: "a", title: "제목", contentHtml: "<p>긴 본문</p>", sourceExcerpt: "짧은 요약글", summary: null, titleKo: "번역됨", officialBasis: "none" as const },
      ]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.enrich).mock.calls[0][0].evidence).toBe("<p>긴 본문</p>");
  });
});

describe("runIngest — INV-T3 태그는 요약과 함께 저장된다", () => {
  it("INV-T3 (S21): AI 가 고른 태그를 요약과 같이 넘긴다", async () => {
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        { id: "a", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null, titleKo: "번역됨", officialBasis: "none" as const },
      ]),
      enrich: vi.fn(async () => ({
        summary: "요약문",
        points: [],
        tags: ["MCP", "툴"],
        titleKo: null,
        officialByContent: false, usage: USAGE,
      })),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveEnrichment)).toHaveBeenCalledWith("a", {
      summary: "요약문",
      points: [],
      tags: ["MCP", "툴"],
    });
  });

  it("INV-T3 실패경로: 태그 저장이 실패하면 요약 단계 실패로 센다", async () => {
    // 조용히 넘기면 이 항목은 다음 주기에 요약 후보가 아니라서 태그를 붙일 기회가 없다.
    const ports = makePorts({
      listEnrichCandidates: vi.fn(async () => [
        { id: "a", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null, titleKo: "번역됨", officialBasis: "none" as const },
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
    const report = await runIngest({ sources: [], ports: makePorts(), now: NOW });
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
