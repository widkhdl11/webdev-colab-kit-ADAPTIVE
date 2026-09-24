// 요약·번역 호출을 **실제로 불러서** 속도와 출력 토큰을 재는 스크립트 (개발용, 요금이 나간다).
//
// 왜 필요한가: 요약 호출의 출력 상한(ENRICH_MAX_TOKENS)과 시간 상한(ENRICH_TIMEOUT_MS)은
// "초당 몇 토큰 나오나"에 기대는데, 그 수를 모델마다 재지 않으면 상한이 추정으로 정해진다
// (2026-09-24 리뷰: 초당 95토큰은 sonnet 실측이었고 opus 는 안 쟀다).
//
// **실제 호출과 같은 것을 부른다** — 프롬프트 조립(buildEnrichPrompt)·모델·effort·상한을
// 전부 수집 코드에서 가져온다. 여기서 베끼면 재는 것과 보내는 것이 갈린다.
// 시간 상한만 일부러 넉넉히 준다: 끊기면 "얼마나 걸리는지"를 못 잰다.
//
// 출력 규칙(check-env.mjs 와 같다): 키·값은 찍지 않는다. 숫자와 제목 일부만.
// 실행: npm run probe:enrich [-- 건수]   (기본 4건 · 요약 4번 + 제목만 4번)

import Anthropic from "@anthropic-ai/sdk";
import { loadEnvConfig } from "@next/env";
import { stageCostUsd } from "../src/entities/ingest-run/lib/estimate-cost";
import {
  ENRICH_EVIDENCE_LIMIT,
  ENRICH_MAX_TOKENS,
  ENRICH_MODEL,
  ENRICH_TIMEOUT_MS,
  ENRICH_TITLE_MAX_TOKENS,
} from "../src/features/ingestion/lib/budgets";
import { buildEnrichPrompt } from "../src/features/ingestion/lib/build-enrich-prompt";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없다.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY 가 없다.");
  process.exit(1);
}

const count = Math.max(1, Math.min(10, Number(process.argv[2]) || 4));

interface Row {
  title: string;
  content_html: string | null;
  source_excerpt: string | null;
}

async function fetchItems(limit: number): Promise<Row[]> {
  // 본문이 있는 글만 — 요약 호출은 근거가 있을 때만 나간다.
  const res = await fetch(
    `${url}/rest/v1/item?select=title,content_html,source_excerpt&content_html=neq.&order=published_at.desc&limit=${limit}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`item 조회 실패: ${res.status}`);
  return (await res.json()) as Row[];
}

const anthropic = new Anthropic({ maxRetries: 0 });

interface Probe {
  ms: number;
  outputTokens: number;
  inputTokens: number;
  stop: string | null;
  textChars: number;
}

async function probe(row: Row, needSummary: boolean): Promise<Probe> {
  const evidence = (row.content_html ?? "").trim() || (row.source_excerpt ?? "").trim();
  const prompt = buildEnrichPrompt({
    title: row.title,
    evidence: evidence.slice(0, ENRICH_EVIDENCE_LIMIT),
    needSummary,
    needTitle: true,
  });
  const started = Date.now();
  const res = await anthropic.messages.create(
    {
      model: ENRICH_MODEL,
      max_tokens: needSummary ? ENRICH_MAX_TOKENS : ENRICH_TITLE_MAX_TOKENS,
      output_config: { effort: "medium" },
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    },
    { timeout: 180_000 },
  );
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    ms: Date.now() - started,
    outputTokens: res.usage.output_tokens,
    inputTokens: res.usage.input_tokens,
    stop: res.stop_reason,
    textChars: text.trim().length,
  };
}

function line(label: string, p: Probe): string {
  const perSec = p.outputTokens / (p.ms / 1000);
  return (
    `  ${label}  ${(p.ms / 1000).toFixed(1).padStart(5)}초 · 출력 ${String(p.outputTokens).padStart(4)}토큰` +
    ` · 초당 ${perSec.toFixed(0).padStart(3)} · stop=${p.stop} · 글자 ${p.textChars}`
  );
}

async function main() {
  const rows = await fetchItems(count);
  if (rows.length === 0) {
    console.error("본문이 있는 글이 없다.");
    process.exit(1);
  }
  console.log(
    `모델 ${ENRICH_MODEL} · effort medium · 상한 요약 ${ENRICH_MAX_TOKENS} / 제목만 ${ENRICH_TITLE_MAX_TOKENS} · 운영 시간 상한 ${ENRICH_TIMEOUT_MS / 1000}초\n`,
  );

  const summaries: Probe[] = [];
  const titles: Probe[] = [];
  let cost = 0;
  for (const row of rows) {
    console.log(row.title.slice(0, 50));
    const s = await probe(row, true);
    const t = await probe(row, false);
    summaries.push(s);
    titles.push(t);
    cost += stageCostUsd(ENRICH_MODEL, s.inputTokens + t.inputTokens, s.outputTokens + t.outputTokens);
    console.log(line("요약  ", s));
    console.log(line("제목만", t));
  }

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const rate = sum(summaries.map((p) => p.outputTokens)) / (sum(summaries.map((p) => p.ms)) / 1000);
  console.log(`\n요약 평균 초당 ${rate.toFixed(0)}토큰 · 이 속도로 ${ENRICH_TIMEOUT_MS / 1000}초면 ${Math.round(rate * ENRICH_TIMEOUT_MS / 1000)}토큰`);
  console.log(`요약 최장 ${(Math.max(...summaries.map((p) => p.ms)) / 1000).toFixed(1)}초 · 출력 최대 ${Math.max(...summaries.map((p) => p.outputTokens))}토큰`);
  console.log(`제목만 출력 최대 ${Math.max(...titles.map((p) => p.outputTokens))}토큰 (상한 ${ENRICH_TITLE_MAX_TOKENS})`);
  console.log(`이번 실측 요금 약 $${cost.toFixed(3)}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
