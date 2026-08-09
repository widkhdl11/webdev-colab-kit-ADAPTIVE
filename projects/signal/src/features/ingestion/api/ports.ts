// 수집은 서버에서만 돈다. secret 키와 Claude 키가 여기로 들어온다 (INV-S4).
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { serverSupabase } from "@/shared/api/supabase-server";
import { anthropicApiKey } from "@/shared/api/server-env";
import { ARTICLE_TAGS, type FeedItemDraft } from "@/entities/article";
import type { Source } from "@/entities/source";
import { extractArticleHtml } from "../lib/extract-content";
import { parseFeedXml } from "../lib/parse-feed";
import type {
  ExtractionCandidate,
  IngestPorts,
  SummaryCandidate,
  SummaryResult,
} from "../lib/ports";

/**
 * 포트의 실제 구현 — 바깥 세계에 닿는 곳은 전부 여기다.
 *
 * 파이프라인(`runIngest`)은 이 파일을 몰라도 되고, 그래서 격리 규칙(INV-C4·S2·S5)을
 * 실제 서버 없이 확인할 수 있다. 이 파일 자체는 통합 테스트와 실제 수집에서 검증된다.
 */

const FETCH_TIMEOUT_MS = 15_000;
const SUMMARY_TIMEOUT_MS = 30_000;
/** 한 번에 처리할 최대 건수. 첫 수집에서 수백 건을 한꺼번에 부르면 비용·시간이 튄다. */
const BATCH = 10;
/** 요약에 넘길 근거의 최대 길이. 본문 전체를 넣으면 토큰만 낭비된다. */
const EVIDENCE_LIMIT = 20_000;

export function createIngestPorts(): IngestPorts {
  const db = serverSupabase();
  // 키를 모듈 최상위에서 읽지 않는다 — import 만 해도 던지면 라우트 전체가 죽는다.
  let anthropic: Anthropic | null = null;

  /** 태그 이름 → 행 id. 없으면 만든다 (INV-T2: 정규화된 이름이 유일성 키). */
  async function tagIds(names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const rows = names.map((name) => ({ name, normalized_name: name.trim().toLowerCase() }));
    const { data, error } = await db
      .from("tag")
      .upsert(rows, { onConflict: "normalized_name" })
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.id as string);
  }

  /** 목록 안의 태그만 항목에 붙인다 (INV-T3). */
  async function attachTags(itemId: string, tags: string[]): Promise<void> {
    const allowed = tags.filter((t) => (ARTICLE_TAGS as readonly string[]).includes(t));
    const ids = await tagIds(allowed);
    if (ids.length === 0) return;
    // 이미 붙어 있으면 기본키(item_id, tag_id)가 막는다 — 조용히 넘긴다.
    const { error } = await db
      .from("item_tag")
      .upsert(ids.map((tag_id) => ({ item_id: itemId, tag_id })), { ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  return {
    async fetchFeed(source: Source) {
      // 타임아웃이 없으면 소스 하나가 응답을 안 줄 때 Cron 이 통째로 매달린다.
      const res = await fetch(source.feedUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseFeedXml(await res.text());
    },

    async upsertItems(items: FeedItemDraft[]) {
      const { data, error } = await db
        .from("item")
        .upsert(
          items.map((i) => ({
            canonical_url: i.canonicalUrl,
            original_url: i.originalUrl,
            title: i.title,
            // summary(=AI 요약)는 여기서 건드리지 않는다. 재수집이 덮으면 다음 주기에 또 부르게 되고
            // INV-S3(1회 생성)이 무너진다. 출처가 준 글은 다른 칸에 넣는다.
            source_excerpt: i.sourceExcerpt,
            content_html: i.contentHtml,
            source_id: i.sourceId,
            source_name: i.sourceName,
            published_at: i.publishedAt,
            published_at_is_fallback: i.publishedAtIsFallback,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "canonical_url" },
        )
        .select("id, canonical_url");
      if (error) throw new Error(error.message);

      // 규칙으로 고른 태그를 붙인다 (INV-T3 의 절반. 나머지 절반은 요약 단계의 AI 분류).
      const idByUrl = new Map((data ?? []).map((r) => [r.canonical_url as string, r.id as string]));
      for (const item of items) {
        const id = idByUrl.get(item.canonicalUrl);
        if (id && item.tags.length > 0) await attachTags(id, item.tags);
      }
      return items.length;
    },

    async listExtractionCandidates(): Promise<ExtractionCandidate[]> {
      const { data, error } = await db
        .from("item")
        .select("id, original_url")
        .eq("content_html", "")
        .order("published_at", { ascending: false })
        .limit(BATCH);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: r.id as string, url: r.original_url as string }));
    },

    async extractContent(url: string) {
      // 브라우저처럼 보이는 헤더를 준다 — 봇 차단이 흔해서 기본 UA 로는 403 이 많다.
      // (2026-08-09 실측: OpenAI 는 이래도 403 이다. 그건 정상 실패로 둔다 — INV-S5.)
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      // PDF·이미지를 추출기에 넣어 봐야 시간만 쓴다.
      if (!type.includes("html")) throw new Error(`HTML 이 아님 (${type.split(";")[0]})`);
      return extractArticleHtml(await res.text(), url);
    },

    async saveContent(id: string, contentHtml: string) {
      const { error } = await db
        .from("item")
        .update({ content_html: contentHtml, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },

    async listSummaryCandidates(): Promise<SummaryCandidate[]> {
      // INV-S3: 재생성 대상은 summary 가 비어 있는 것뿐. 근거 유무는 파이프라인이 다시 판정한다.
      const { data, error } = await db
        .from("item")
        .select("id, title, content_html, source_excerpt, summary")
        .is("summary", null)
        .order("published_at", { ascending: false })
        .limit(BATCH);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        title: (r.title as string) ?? "",
        contentHtml: (r.content_html as string) ?? "",
        sourceExcerpt: (r.source_excerpt as string | null) ?? null,
        summary: (r.summary as string | null) ?? null,
      }));
    },

    async summarize({ title, evidence }): Promise<SummaryResult> {
      anthropic ??= new Anthropic({ apiKey: anthropicApiKey() });
      const res = await anthropic.messages.create(
        {
          model: "claude-sonnet-5",
          max_tokens: 600,
          system:
            "너는 AI·IT 소식을 한국어로 요약하고 분류한다.\n" +
            "- 요약은 두세 문장. 무엇이 새로운지와 왜 중요한지를 쓰고, 한계나 조건이 있으면 한 문장 덧붙인다.\n" +
            "- **주어진 글에 없는 내용을 지어내지 않는다.** 근거가 얇으면 얇은 만큼만 쓴다.\n" +
            `- 태그는 다음 목록에서만 고른다: ${ARTICLE_TAGS.join(", ")}. 해당 없으면 빈 배열.\n` +
            '- 출력은 JSON 하나: {"summary": "...", "tags": ["..."]}. 다른 말은 쓰지 않는다.',
          messages: [
            {
              role: "user",
              content: `제목: ${title}\n\n글:\n${evidence.slice(0, EVIDENCE_LIMIT)}`,
            },
          ],
        },
        { timeout: SUMMARY_TIMEOUT_MS },
      );

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      // JSON 이 아니면 빈 요약으로 돌려보낸다 — 파이프라인이 실패로 세고 다음 주기에 다시 한다.
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      try {
        const parsed = JSON.parse(json) as { summary?: unknown; tags?: unknown };
        return {
          summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
          tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : [],
        };
      } catch {
        return { summary: "", tags: [] };
      }
    },

    async saveSummary(id: string, summary: string, tags: string[]) {
      const { error } = await db
        .from("item")
        .update({ summary, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      // 태그 저장이 실패하면 던진다. 요약은 이미 저장됐지만, 다음 주기에 이 항목은
      // 요약 후보가 아니라서 태그를 다시 붙일 기회가 없다 — 조용히 넘기면 영영 안 붙는다.
      await attachTags(id, tags);
    },
  };
}
