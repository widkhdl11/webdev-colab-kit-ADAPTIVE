import { describe, expect, it, vi } from "vitest";
import type { FeedItemDraft } from "@/entities/article";
import type { Source } from "@/entities/source";
import { MAX_ITEMS_PER_SOURCE, runIngest } from "./run-ingest";
import type { ExtractionCandidate, IngestPorts, SummaryCandidate } from "./ports";

/**
 * 수집 파이프라인 — INV-C4(소스 격리) · INV-S2(요약 실패 격리) · INV-S3(재생성 조건).
 *
 * 검증 대상(파이프라인)은 모킹하지 않는다. 바깥 세계(네트워크·DB·LLM)만 가짜로 바꾼다.
 */

const NOW = new Date("2026-08-09T05:00:00.000Z");

const source = (id: string): Source => ({
  id,
  name: id,
  weight: 1,
  feedUrl: `https://ex.com/${id}.xml`,
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
    upsertItems: vi.fn(async (items) => items.length),
    listExtractionCandidates: vi.fn(async () => [] as ExtractionCandidate[]),
    extractContent: vi.fn(async () => "<p>추출된 본문</p>"),
    saveContent: vi.fn(async () => {}),
    listSummaryCandidates: vi.fn(async () => [] as SummaryCandidate[]),
    summarize: vi.fn(async () => ({ summary: "요약", tags: ["MCP"] })),
    saveSummary: vi.fn(async () => {}),
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

describe("runIngest — INV-S2·S3 요약", () => {
  const candidate = (id: string, summary: string | null): SummaryCandidate => ({
    id,
    title: `제목 ${id}`,
    contentHtml: `<p>본문 ${id}</p>`,
    sourceExcerpt: null,
    summary,
  });

  it("INV-S3 (S11): 요약이 이미 있는 항목은 다시 부르지 않는다", async () => {
    // 판정을 우리 코드가 한다 — 조회 계층이 골라 준 것을 그대로 믿으면
    // 그 필터를 지워도 테스트가 통과한다(그게 알리바이다).
    const ports = makePorts({
      listSummaryCandidates: vi.fn(async () => [
        candidate("has", "이미 있는 요약"),
        candidate("none", null),
      ]),
    });

    const report = await runIngest({ sources: [], ports, now: NOW });

    expect(vi.mocked(ports.summarize)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ports.summarize).mock.calls[0][0].title).toBe("제목 none");
    expect(report.summaries.attempted).toBe(1);
  });

  it("INV-S3: 빈 문자열 요약도 '없음'으로 본다", async () => {
    const ports = makePorts({
      listSummaryCandidates: vi.fn(async () => [candidate("empty", "")]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.summarize)).toHaveBeenCalledTimes(1);
  });

  it("INV-S2 (S10) 실패경로: 요약이 타임아웃해도 수집은 계속되고 항목은 남는다", async () => {
    const saved: string[] = [];
    const ports = makePorts({
      listSummaryCandidates: vi.fn(async () => [candidate("a", null), candidate("b", null)]),
      summarize: vi.fn(async ({ title }) => {
        if (title.endsWith("a")) throw new Error("timeout");
        return { summary: "b 의 요약", tags: [] };
      }),
      saveSummary: vi.fn(async (id) => {
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
      listSummaryCandidates: vi.fn(async () => [candidate("a", null), candidate("b", null)]),
      saveSummary: vi.fn(async (id) => {
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
      listSummaryCandidates: vi.fn(async () => [candidate("a", null)]),
      summarize: vi.fn(async () => ({ summary: "   ", tags: [] })),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveSummary)).not.toHaveBeenCalled();
    expect(report.summaries.failed).toBe(1);
  });

  it("INV-S2 (S10): 요약 단계가 통째로 죽어도 적재 결과는 유지된다", async () => {
    const ports = makePorts({
      fetchFeed: vi.fn(async () => [feedItem("x")]),
      listSummaryCandidates: vi.fn(async () => {
        throw new Error("요약 대상 조회 실패");
      }),
    });
    const report = await runIngest({ sources: [source("s")], ports, now: NOW });
    expect(report.sources[0].stored).toBe(1);
    expect(report.summaries.error).toContain("요약 대상 조회 실패");
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
      listSummaryCandidates: vi.fn(async () => [
        { id: "s", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null },
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
      listSummaryCandidates: vi.fn(async () => {
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
      listSummaryCandidates: vi.fn(async () => [
        { id: "a", title: "Dithered QR Codes", contentHtml: "", sourceExcerpt: null, summary: null },
      ]),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.summarize)).not.toHaveBeenCalled();
    expect(report.summaries.skippedNoEvidence).toBe(1);
    // 실패와 구분한다 — 재시도해도 소용없는 것과 다시 해볼 만한 것은 다르다.
    expect(report.summaries.failed).toBe(0);
    expect(report.summaries.attempted).toBe(0);
  });

  it("INV-S3: 본문이 없어도 출처 요약글이 있으면 그것을 근거로 부른다", async () => {
    const ports = makePorts({
      listSummaryCandidates: vi.fn(async () => [
        {
          id: "a",
          title: "제목",
          contentHtml: "",
          sourceExcerpt: "OpenAI 가 새 평가 결과를 공개했다.",
          summary: null,
        },
      ]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.summarize).mock.calls[0][0].evidence).toBe(
      "OpenAI 가 새 평가 결과를 공개했다.",
    );
  });

  it("INV-S3: 본문이 있으면 본문을 근거로 쓴다 (요약글보다 낫다)", async () => {
    const ports = makePorts({
      listSummaryCandidates: vi.fn(async () => [
        { id: "a", title: "제목", contentHtml: "<p>긴 본문</p>", sourceExcerpt: "짧은 요약글", summary: null },
      ]),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.summarize).mock.calls[0][0].evidence).toBe("<p>긴 본문</p>");
  });
});

describe("runIngest — INV-T3 태그는 요약과 함께 저장된다", () => {
  it("INV-T3 (S21): AI 가 고른 태그를 요약과 같이 넘긴다", async () => {
    const ports = makePorts({
      listSummaryCandidates: vi.fn(async () => [
        { id: "a", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null },
      ]),
      summarize: vi.fn(async () => ({ summary: "요약문", tags: ["MCP", "툴"] })),
    });
    await runIngest({ sources: [], ports, now: NOW });
    expect(vi.mocked(ports.saveSummary)).toHaveBeenCalledWith("a", "요약문", ["MCP", "툴"]);
  });

  it("INV-T3 실패경로: 태그 저장이 실패하면 요약 단계 실패로 센다", async () => {
    // 조용히 넘기면 이 항목은 다음 주기에 요약 후보가 아니라서 태그를 붙일 기회가 없다.
    const ports = makePorts({
      listSummaryCandidates: vi.fn(async () => [
        { id: "a", title: "제목", contentHtml: "<p>본문</p>", sourceExcerpt: null, summary: null },
      ]),
      saveSummary: vi.fn(async () => {
        throw new Error("태그 저장 실패");
      }),
    });
    const report = await runIngest({ sources: [], ports, now: NOW });
    expect(report.summaries.failed).toBe(1);
  });
});
