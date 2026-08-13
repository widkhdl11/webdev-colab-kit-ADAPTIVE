// 수집은 서버에서만 돈다. secret 키와 Claude 키가 여기로 들어온다 (INV-S4).
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { serverSupabase } from "@/shared/api/supabase-server";
import { anthropicApiKey } from "@/shared/api/server-env";
import {
  ARTICLE_TAGS,
  normalizeTagName,
  toOfficialBasis,
  type FeedItemDraft,
} from "@/entities/article";
import { getSourceWeight } from "@/entities/source";
import type { Source } from "@/entities/source";
import { ENRICH_BATCH, ENRICH_POOL, MAX_FETCH_BYTES } from "../lib/budgets";
import { fenceData } from "../lib/data-fence";
import { extractArticleHtml } from "../lib/extract-content";
import { DATA_BOUNDARY, TOPIC_SCOPE } from "../model/prompt-text";
import { buildEnrichPrompt } from "../lib/build-enrich-prompt";
import { parseFeedXml } from "../lib/parse-feed";
import { pickEnrichTargets } from "../lib/pick-enrich-targets";
import { topicVerdict } from "../lib/topic-verdict";
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
/** 주제 판정은 제목 하나만 보내는 짧은 호출이라 요약보다 짧게 잡는다. */
const TOPIC_TIMEOUT_MS = 15_000;
/** 요약에 넘길 근거의 최대 길이. 본문 전체를 넣으면 토큰만 낭비된다. */
const EVIDENCE_LIMIT = 20_000;

/** 후보 풀에서 받아 오는 세 칸. 본문은 여기서 안 받는다 — 한 건이 2만 자다. */
interface PoolRow {
  id: unknown;
  published_at: unknown;
  source_id: unknown;
}

/**
 * 넓게 받은 후보 풀에서 이번 주기에 처리할 id 를 고른다 (INV-R2 와 같은 점수).
 *
 * 추출·요약 두 단계가 **같은 함수를 쓴다** — 다른 기준을 쓰면 본문을 채운 항목과
 * 요약할 항목이 어긋나 예산이 서로를 못 쓴다.
 */
function pickFromPool(pool: readonly PoolRow[]): string[] {
  return pickEnrichTargets({
    pool: pool.map((r) => ({
      id: r.id as string,
      publishedAt: r.published_at as string,
      sourceId: r.source_id as string,
    })),
    now: new Date(),
    weightOf: getSourceWeight,
    limit: ENRICH_BATCH,
  });
}

/**
 * 응답 본문을 **바이트 상한까지만** 읽는다 (2026-08-13 보안 리뷰).
 *
 * `res.text()` 는 서버가 주는 만큼 다 받는다. 타임아웃 15초 안에 수백 MB 를 흘려보내면
 * 함수가 메모리로 죽고, 그다음 JSDOM 파싱은 동기라 더 나쁘다. 공격이 필요한 것도 아니다 —
 * 소스 14곳 중 하나가 큰 파일을 주기만 해도 같은 일이 난다.
 *
 * 넘치면 던진다. 잘라서 파싱하면 깨진 HTML·XML 에서 엉뚱한 결과가 나오고, 그게 조용히
 * 본문으로 저장된다 — "실패했다"가 "이상한 걸 저장했다"보다 낫다.
 */
async function readTextCapped(res: Response, limit = MAX_FETCH_BYTES): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new Error(`응답이 너무 크다 (${declared} > ${limit} 바이트)`);
  }
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        // 남은 것을 계속 받지 않는다 — 상한을 둔 이유가 사라진다.
        await reader.cancel();
        throw new Error(`응답이 너무 크다 (${limit} 바이트 초과)`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * `.in("id", ids)` 는 순서를 보장하지 않는다.
 *
 * 그대로 두면 어렵게 매긴 우선순위가 두 번째 조회에서 사라져, 시간 예산에 걸려 중간에
 * 멈추는 날 **어느 것이 처리됐는지가 우연**이 된다. 없는 id 는 조용히 빠진다.
 */
function orderByIds<T extends { id: unknown }>(rows: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is T => r !== undefined);
}

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
    async judgeTopic(title: string) {
      anthropic ??= new Anthropic({ apiKey: anthropicApiKey() });

      const res = await anthropic.messages.create(
        {
          model: "claude-sonnet-5",
          // "yes"/"no" 한 단어만 받으면 되지만 **모델은 그 앞에 생각을 한다.**
          // 5 로 잡았더니 5토큰을 전부 thinking 블록에 쓰고 텍스트가 0글자로 왔다
          // (2026-08-12 실측: stop=max_tokens, blocks=["thinking"]). 그러면 판정이
          // 매번 실패로 떨어져 필터가 통째로 죽는다. 생각을 끝낸 응답은 32토큰이었다.
          max_tokens: 200,
          system:
            `- ${TOPIC_SCOPE}\n- 제목만 보고 판단한다.\n- ${DATA_BOUNDARY}\n` +
            `- 출력은 "yes" 또는 "no" 한 단어뿐. 다른 말은 쓰지 않는다.`,
          // 제목도 남의 글이다 — 감싸지 않으면 제목에 심은 지시로 주제 필터를 통과할 수 있다.
          // 요약 프롬프트와 같은 경계를 쓴다 — 여기만 감싸기만 하면 제목에 심은
          // `</자료>` 로 판정 지시를 덮어쓸 수 있다(주제 밖 글을 통과시키는 길).
          messages: [{ role: "user", content: fenceData("제목", title) }],
        },
        { timeout: TOPIC_TIMEOUT_MS },
      );

      // 판정 자체는 순수 함수가 한다 (topic-verdict) — 여기 인라인으로 두는 동안
      // 테스트가 하나도 없었고, 그래서 잘린 응답 경로를 아무도 못 봤다.
      const verdict = topicVerdict({
        stopReason: res.stop_reason,
        text: res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join(""),
      });

      // 판정을 못 했으면 **던진다.** 여기서 true 를 돌려주면 결과는 같지만(통과) 리포트에
      // 아무것도 안 남아, 판정이 매 주기 전부 실패해도 "거른 건수 0"으로 정상처럼 보인다.
      // 파이프라인은 이 예외를 failedOpen 으로 세고 그대로 통과시킨다 (INV-F3).
      if (verdict === "unjudged") throw new Error(`주제 판정 실패 (stop=${res.stop_reason})`);
      return {
        onTopic: verdict === "on",
        usage: {
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
          cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
        },
      };
    },

    async fetchFeed(source: Source) {
      // 타임아웃이 없으면 소스 하나가 응답을 안 줄 때 Cron 이 통째로 매달린다.
      const res = await fetch(source.feedUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseFeedXml(await readTextCapped(res));
    },

    async listKnownUrls(canonicalUrls: string[]) {
      if (canonicalUrls.length === 0) return [];
      // 한 번에 묻는다. 항목마다 물으면 소스당 50회 왕복이 되고, 그건 아끼려던 것보다 비싸다.
      const { data, error } = await db
        .from("item")
        .select("canonical_url")
        .in("canonical_url", canonicalUrls);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.canonical_url as string);
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
      // 요약 후보와 **같은 기준으로 고른다** (2026-08-13 리뷰). 여기만 최신순으로 두면
      // 두 단계가 서로 다른 항목에 예산을 쓴다 — 본문을 채운 항목은 요약 후보에 못 들고,
      // 요약할 항목은 근거가 없어 건너뛰어진다(skippedNoEvidence).
      const { data: pool, error: poolError } = await db
        .from("item")
        .select("id, published_at, source_id")
        .eq("content_html", "")
        .order("published_at", { ascending: false })
        .limit(ENRICH_POOL);
      if (poolError) throw new Error(poolError.message);
      if (!pool || pool.length === 0) return [];

      const targetIds = pickFromPool(pool);
      const { data, error } = await db.from("item").select("id, original_url").in("id", targetIds);
      if (error) throw new Error(error.message);
      return orderByIds(data ?? [], targetIds).map((r) => ({
        id: r.id as string,
        url: r.original_url as string,
      }));
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
      return extractArticleHtml(await readTextCapped(res), url);
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
      const CANDIDATE_FILTER =
        "title_ko.is.null,and(summary.is.null,or(content_html.neq.,source_excerpt.not.is.null))";

      // 1단계: **랭킹에 필요한 세 칸만** 넓게 받는다.
      // 본문까지 이만큼 받으면 한 건이 2만 자라 응답이 수 MB 가 된다.
      // 자르는 기준(발행시각)과 고르는 기준(점수)이 다르므로 풀은 넓어야 한다 — budgets.ts 참고.
      const { data: pool, error: poolError } = await db
        .from("item")
        .select("id, published_at, source_id")
        .or(CANDIDATE_FILTER)
        .order("published_at", { ascending: false })
        .limit(ENRICH_POOL);
      if (poolError) throw new Error(poolError.message);
      if (!pool || pool.length === 0) return [];

      // 2단계: 그중 점수 상위 ENRICH_BATCH 건만 본문까지 받는다.
      // 발행시각순으로만 자르면 자주 올리는 매체 하나가 그 주기의 요약 예산을 다 먹는다
      // (2026-08-13 실측: 요약 후보 10건이 전부 한 매체였다).
      const targetIds = pickFromPool(pool);

      const { data, error } = await db
        .from("item")
        .select("id, title, title_ko, content_html, source_excerpt, summary, official_basis")
        .in("id", targetIds);
      if (error) throw new Error(error.message);
      return orderByIds(data ?? [], targetIds).map((r) => ({
        id: r.id as string,
        title: (r.title as string) ?? "",
        titleKo: (r.title_ko as string | null) ?? null,
        contentHtml: (r.content_html as string) ?? "",
        sourceExcerpt: (r.source_excerpt as string | null) ?? null,
        summary: (r.summary as string | null) ?? null,
        // 모르는 값은 none 으로 떨어뜨린다 — 여기서 통과시키면 화면이 판단 못 하는 값을 그린다.
        officialBasis: toOfficialBasis(r.official_basis),
      }));
    },

    async enrich({ title, evidence, needSummary, needTitle }): Promise<EnrichResult> {
      anthropic ??= new Anthropic({ apiKey: anthropicApiKey() });

      // 항목마다 필요한 지시만 조립한다 (INV-P1) — 조립 자체는 순수 함수라 여기서 직접
      // 검증하지 않는다(build-enrich-prompt.test.ts 가 한다).
      const prompt = buildEnrichPrompt({
        title,
        evidence: evidence.slice(0, EVIDENCE_LIMIT),
        needSummary,
        needTitle,
      });

      const res = await anthropic.messages.create(
        {
          model: "claude-sonnet-5",
          // 요약이 길어지고 핵심 항목·제목이 붙어 예전 600 으로는 잘린다.
          // 제목만 부를 때도 200 은 빠듯하다 — 한국어는 글자당 토큰이 커서 긴 제목이면
          // JSON 껍데기까지 넣다 잘리고, 잘리면 닫는 중괄호가 없어 파싱이 실패한다.
          // 그러면 title_ko 가 계속 null 이라 **같은 항목이 매 주기 같은 자리에서 다시 잘린다.**
          max_tokens: needSummary ? 1400 : 500,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
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
        // 응답을 못 읽었으면 공식 여부도 모른다 — 모르는 것은 false 다 (INV-O2 CS9).
        officialByContent: false,
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
          // `true` 하나만 참으로 친다. 문자열 "true"·1 을 받아 주면 모델이 형식을 흘릴 때
          // 공식 표시가 조용히 늘어난다 — 틀린 쪽으로 기울면 안 되는 값이다(INV-O2).
          officialByContent: parsed.official === true,
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
      // 파이프라인이 "덮어도 되는 경우"에만 실어 보낸다 (INV-O2) — 여기서 다시 판단하지 않는다.
      if (patch.officialBasis !== undefined) row.official_basis = patch.officialBasis;

      const { error } = await db.from("item").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
