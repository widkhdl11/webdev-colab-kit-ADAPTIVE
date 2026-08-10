// 수집은 서버에서만 돈다. secret 키와 Claude 키가 여기로 들어온다 (INV-S4).
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { serverSupabase } from "@/shared/api/supabase-server";
import { anthropicApiKey } from "@/shared/api/server-env";
import {
  ARTICLE_TAGS,
  normalizeTagName,
  type FeedItemDraft,
} from "@/entities/article";
import type { Source } from "@/entities/source";
import { extractArticleHtml } from "../lib/extract-content";
import { EVIDENCE_ONLY, ROLE, TITLE_RULE, summaryRules } from "../model/prompt-text";
import { parseFeedXml } from "../lib/parse-feed";
import { upsertBatches } from "../lib/upsert-rows";
import type {
  EnrichCandidate,
  EnrichResult,
  ExtractionCandidate,
  IngestPorts,
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

  /**
   * 태그 이름 → 행 id (INV-T2: 정규화된 이름이 유일성 키).
   *
   * 같은 정규화 이름이 한 문장에 두 번 들어가면 Postgres 가 거절한다
   * ("ON CONFLICT DO UPDATE command cannot affect row a second time").
   * AI 가 같은 태그를 두 번 고를 수 있으므로 여기서 접고 들어간다.
   */
  async function tagIdsByName(names: string[]): Promise<Map<string, string>> {
    const byNormalized = new Map<string, string>();
    for (const name of names) {
      const normalized = normalizeTagName(name);
      if (normalized !== "" && !byNormalized.has(normalized)) byNormalized.set(normalized, name);
    }
    if (byNormalized.size === 0) return new Map();

    const rows = [...byNormalized].map(([normalized_name, name]) => ({ name, normalized_name }));
    const { data, error } = await db
      .from("tag")
      .upsert(rows, { onConflict: "normalized_name" })
      .select("id, name");
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((r) => [r.name as string, r.id as string]));
  }

  /**
   * 목록 안의 태그만 항목에 붙인다 (INV-T3).
   *
   * 항목마다 부르지 않고 배치로 받는다 — 소스당 최대 50건인데 태그 종류는 다섯뿐이라,
   * 항목마다 부르면 같은 이름을 50번 다시 upsert 하며 왕복이 100회가 된다.
   */
  async function attachTagsBatch(pairs: { itemId: string; tags: string[] }[]): Promise<void> {
    const allowed = pairs.map((p) => ({
      itemId: p.itemId,
      tags: p.tags.filter((t) => (ARTICLE_TAGS as readonly string[]).includes(t)),
    }));
    const idByName = await tagIdsByName(allowed.flatMap((p) => p.tags));
    if (idByName.size === 0) return;

    const links: { item_id: string; tag_id: string }[] = [];
    const seen = new Set<string>();
    for (const { itemId, tags } of allowed) {
      for (const tag of tags) {
        const tagId = idByName.get(tag);
        if (!tagId) continue;
        const key = `${itemId}:${tagId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ item_id: itemId, tag_id: tagId });
      }
    }
    if (links.length === 0) return;

    // 이미 붙어 있으면 기본키(item_id, tag_id)가 막는다 — 조용히 넘긴다.
    const { error } = await db.from("item_tag").upsert(links, { ignoreDuplicates: true });
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
      // 페이로드는 순수 함수가 만든다 (upsert-rows). 핵심은 **빈 값인 컬럼을 빼는 것** —
      // 안 그러면 재수집이 직전에 추출한 본문을 지운다. 컬럼 구성이 다르면 배치도 갈린다.
      const idByUrl = new Map<string, string>();
      for (const batch of upsertBatches(items, new Date().toISOString())) {
        const { data, error } = await db
          .from("item")
          .upsert(batch, { onConflict: "canonical_url" })
          .select("id, canonical_url");
        if (error) throw new Error(error.message);
        for (const r of data ?? []) idByUrl.set(r.canonical_url as string, r.id as string);
      }

      // 규칙으로 고른 태그를 붙인다 (INV-T3 의 절반. 나머지 절반은 후처리 단계의 AI 분류).
      const pairs: { itemId: string; tags: string[] }[] = [];
      for (const item of items) {
        const itemId = idByUrl.get(item.canonicalUrl);
        if (itemId && item.tags.length > 0) pairs.push({ itemId, tags: [...item.tags] });
      }
      await attachTagsBatch(pairs);

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

    async listEnrichCandidates(): Promise<EnrichCandidate[]> {
      // 두 조건의 합집합이다:
      //   - 요약(INV-S3): summary 가 비어 있고 **근거가 있는** 것. 근거 조건을 여기서 걸지 않으면
      //     근거 없는 항목이 최신 10건을 채워 그 주기의 요약이 0건이 되고, 다음 주기에도
      //     같은 10건이 뽑혀 영원히 굶는다.
      //   - 번역(INV-S6): title_ko 가 비어 있는 것. **근거는 안 본다** — 번역의 근거는 제목이다.
      const { data, error } = await db
        .from("item")
        .select("id, title, title_ko, content_html, source_excerpt, summary")
        .or(
          "title_ko.is.null," +
            "and(summary.is.null,or(content_html.neq.,source_excerpt.not.is.null))",
        )
        .order("published_at", { ascending: false })
        .limit(BATCH);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        title: (r.title as string) ?? "",
        titleKo: (r.title_ko as string | null) ?? null,
        contentHtml: (r.content_html as string) ?? "",
        sourceExcerpt: (r.source_excerpt as string | null) ?? null,
        summary: (r.summary as string | null) ?? null,
      }));
    },

    async enrich({ title, evidence, needSummary, needTitle }): Promise<EnrichResult> {
      anthropic ??= new Anthropic({ apiKey: anthropicApiKey() });

      // 필요한 것만 요청한다. 근거 없는 항목은 제목만 오므로 요약을 시키면 지어낸다(INV-S1).
      const wanted = [
        needTitle ? '"titleKo": "한국어로 옮긴 제목"' : null,
        needSummary ? '"summary": "요약문"' : null,
        needSummary ? '"points": ["핵심 항목", "..."]' : null,
        needSummary ? '"tags": ["..."]' : null,
      ].filter((line): line is string => line !== null);

      // 말투·요약 방식은 model/prompt-text.ts 에 있다 — 고칠 일이 있으면 거기만 열면 된다.
      // **아래 마지막 줄(출력 형식)만 여기 남는다**: 키 이름이 어긋나면 파싱이 전부 실패하고,
      // 그 실패는 조용하다(빈 결과로 돌아가 매 주기 재시도만 반복된다).
      const rules = [ROLE, EVIDENCE_ONLY];
      if (needTitle) rules.push(TITLE_RULE);
      if (needSummary) rules.push(...summaryRules(ARTICLE_TAGS));
      rules.push(`출력은 JSON 하나: {${wanted.join(", ")}}. 다른 말은 쓰지 않는다.`);

      const res = await anthropic.messages.create(
        {
          model: "claude-sonnet-5",
          // 요약이 길어지고 핵심 항목·제목이 붙어 예전 600 으로는 잘린다.
          // 제목만 부를 때도 200 은 빠듯하다 — 한국어는 글자당 토큰이 커서 긴 제목이면
          // JSON 껍데기까지 넣다 잘리고, 잘리면 닫는 중괄호가 없어 파싱이 실패한다.
          // 그러면 title_ko 가 계속 null 이라 **같은 항목이 매 주기 같은 자리에서 다시 잘린다.**
          max_tokens: needSummary ? 1400 : 500,
          system: rules.map((r) => `- ${r}`).join("\n"),
          messages: [
            {
              role: "user",
              content: needSummary
                ? `제목: ${title}\n\n글:\n${evidence.slice(0, EVIDENCE_LIMIT)}`
                : `제목: ${title}`,
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

      // 토큰은 **응답을 어떻게 쓰든 상관없이** 담는다 — 파싱에 실패해도 요금은 이미 나갔고,
      // 그 경우가 바로 보고서에서 봐야 할 자리다(호출은 늘었는데 성공은 안 느는 상태).
      // 캐시 필드는 캐싱을 안 쓰면 응답에 없다 — 없으면 0.
      const usage = {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      };

      // JSON 이 아니면 빈 값으로 돌려보낸다 — 파이프라인이 실패로 세고 다음 주기에 다시 한다.
      const empty: EnrichResult = {
        summary: "",
        points: [],
        tags: [],
        titleKo: null,
        usage,
      };

      // 잘린 응답은 파싱이 우연히 성공할 수도 있어서(닫는 중괄호가 앞쪽에 있으면) 먼저 거른다.
      // 여기서 안 거르면 반쪽짜리 요약이 저장돼 다음 주기 재시도 대상에서 빠진다(INV-S3).
      if (res.stop_reason === "max_tokens") return empty;
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const strings = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
        return {
          summary,
          // 핵심 항목은 요약의 부속이다 (INV-S7) — 요약이 비면 항목도 버린다.
          points: summary === "" ? [] : strings(parsed.points).map((p) => p.trim()).filter(Boolean),
          tags: strings(parsed.tags),
          titleKo: typeof parsed.titleKo === "string" ? parsed.titleKo.trim() || null : null,
          usage,
        };
      } catch {
        return empty;
      }
    },

    async saveEnrichment(id, patch) {
      // **태그를 먼저 붙인다.** 순서가 규칙이다: summary 를 먼저 쓰면 그 항목은 다음 주기에
      // 후보가 아니게 되고, 태그 저장이 실패했을 때 다시 붙일 기회가 영영 없다.
      // 태그를 먼저 하면 실패 시 summary 가 비어 남아 다음 주기에 둘 다 재시도된다.
      if (patch.tags && patch.tags.length > 0) {
        await attachTagsBatch([{ itemId: id, tags: patch.tags }]);
      }

      // 주지 않은 필드는 건드리지 않는다 — 번역만 성공한 항목의 summary 를 덮으면
      // 재시도 신호(비어 있음)가 사라진다 (INV-S3).
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.summary !== undefined) row.summary = patch.summary;
      if (patch.points !== undefined) row.summary_points = patch.points;
      if (patch.titleKo !== undefined) row.title_ko = patch.titleKo;

      const { error } = await db.from("item").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
