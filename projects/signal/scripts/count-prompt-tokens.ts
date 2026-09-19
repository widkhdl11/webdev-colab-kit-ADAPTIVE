// 수집 프롬프트가 실제로 몇 토큰인지 **재는** 스크립트 (개발용).
//
// 왜 필요한가: 프롬프트를 고칠 때마다 비용이 얼마나 움직이는지 추정으로 말하면 틀린다.
// 여기서는 실제 적재된 항목을 근거로 삼아 Anthropic 의 count_tokens 로 직접 센다.
// count_tokens 는 요금이 붙지 않는다 — 세기만 하고 모델을 부르지 않는다.
//
// 출력 규칙(check-env.mjs 와 같다): 키·값은 어디에도 찍지 않는다. 토큰 수와 제목 일부만.
// 읽기 전용 publishable 키로 항목을 읽는다 — 세는 데 secret 키가 필요할 이유가 없다.
//
// 실행: npm run count:tokens
//
// 프롬프트 문장 자체는 src/features/ingestion/model/prompt-text.ts 에서 그대로 가져온다.
// 여기서 베끼면 곧 어긋난다.

import Anthropic from "@anthropic-ai/sdk";
// 이름 가져오기로 쓴다 — tsx 가 CJS 로 옮기면 기본 가져오기가 undefined 가 된다.
import { loadEnvConfig } from "@next/env";
import { ARTICLE_TAGS } from "../src/entities/article/model/types";
import {
  PROMO_RATES,
  STANDARD_FROM_MS,
  STANDARD_RATES,
} from "../src/entities/ingest-run/lib/estimate-cost";
import {
  EVIDENCE_ONLY,
  OFFICIAL_RULE,
  ROLE,
  TITLE_RULE,
  keywordRules,
  summaryRules,
} from "../src/features/ingestion/model/prompt-text";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const MODEL = "claude-sonnet-5";
// 100만 토큰당 단가. 숫자를 여기 다시 적지 않는다 — entities/ingest-run 이 이미 쥐고 있고,
// 대시보드가 실행마다 고르는 단가와 이 스크립트가 어긋나면 두 수치를 대조할 수 없다.
const PRICE = {
  intro: PROMO_RATES,
  standard: STANDARD_RATES,
};
// api/ports.ts 와 같은 값이어야 한다. 다르면 여기서 잰 수치가 실제와 어긋난다.
const EVIDENCE_LIMIT = 20_000;
// 요약이 붙는 호출의 출력 상한. 실제 출력은 이보다 작지만 최악을 같이 보여준다.
const MAX_OUTPUT = 1400;

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

interface Row {
  title: string;
  content_html: string | null;
  source_excerpt: string | null;
}

async function fetchItems(limit: number): Promise<Row[]> {
  const res = await fetch(
    `${url}/rest/v1/item?select=title,content_html,source_excerpt&order=published_at.desc&limit=${limit}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`item 조회 실패: ${res.status}`);
  return (await res.json()) as Row[];
}

/** 지금 돌고 있는 프롬프트 그대로. */
function currentSystem(needSummary: boolean, needTitle: boolean): string {
  const wanted = [
    needTitle ? '"titleKo": "한국어로 옮긴 제목"' : null,
    needSummary ? '"summary": "요약문"' : null,
    needSummary ? '"points": ["핵심 항목", "..."]' : null,
    needSummary ? '"tags": ["..."]' : null,
    needSummary ? '"official": true|false' : null,
  ].filter((l): l is string => l !== null);

  const rules = [ROLE, EVIDENCE_ONLY];
  if (needTitle) rules.push(TITLE_RULE);
  if (needSummary) rules.push(...summaryRules(), OFFICIAL_RULE);
  rules.push(`출력은 JSON 하나: {${wanted.join(", ")}}. 다른 말은 쓰지 않는다.`);
  return rules.map((r) => `- ${r}`).join("\n");
}

/**
 * 아직 스펙으로 확정되지 않은 **초안**이다 (지금은 갈래뿐).
 * 스펙이 승인되면 이 문장들은 prompt-text.ts 로 옮기고 여기서는 지운다.
 *
 * 2026-08-16 정리: 여기 있던 키워드 규칙 세 줄은 **실물이 생겼다**(prompt-text.ts 의
 * `keywordRules`). 베껴 둔 초안을 그대로 두면 이 스크립트가 *실제로 보낼 문장이 아닌 것*을
 * 재게 된다 — 아래 draftSystem 이 실물을 그대로 부른다. 주제 판정 줄도 뺐다:
 * 이제 요약과 **다른 호출**이라 여기 실으면 이미 따로 내는 비용을 두 번 세는 셈이다
 * (그쪽 비용은 `npm run check:topic` 이 찍는다).
 */
const DRAFT_RULES = [
  "갈래는 핫이슈·소식·스킬/툴 중에서 고른다. 해당하면 여러 개를 골라도 된다.",
];
// 공식 표시는 2026-08-11 에 스펙(INV-O2)으로 확정돼 여기서 뺐다 — 이제 currentSystem 이
// OFFICIAL_RULE 로 싣는다. 초안에 남겨 두면 이미 내는 비용을 "추가 비용"으로 두 번 센다.

function draftSystem(keywords: string[]): string {
  const wanted = [
    '"titleKo": "한국어로 옮긴 제목"',
    '"summary": "요약문"',
    '"points": ["핵심 항목", "..."]',
    '"tags": ["..."]',
    '"분야": ["..."]',
    '"사건종류": ["..."]',
    '"갈래": ["핫이슈"|"소식"|"스킬툴"]',
  ];
  const rules = [
    ROLE,
    EVIDENCE_ONLY,
    TITLE_RULE,
    ...summaryRules(),
    // 실물을 그대로 부른다 — 베껴 두면 고치는 순간 재는 것과 보내는 것이 갈린다.
    // 앵커 목록도 실제 조립과 같은 방식으로 실린다(축마다 따로).
    ...keywordRules(keywords, []),
    ...DRAFT_RULES,
    `출력은 JSON 하나: {${wanted.join(", ")}}. 다른 말은 쓰지 않는다.`,
  ];
  return rules.map((r) => `- ${r}`).join("\n");
}

/** 키워드 목록이 없을 때를 재려고 그럴듯한 길이의 가짜 목록을 만든다. */
function fakeKeywords(n: number): string[] {
  const base = [
    "그래프 엔지니어링",
    "MCP",
    "에이전트 하네스",
    "컨텍스트 관리",
    "오픈소스 모델",
    "추론 비용",
    "보안 이슈",
    "벤치마크",
    "RAG",
    "파인튜닝",
  ];
  return Array.from({ length: n }, (_, i) => `${base[i % base.length]}${i < base.length ? "" : i}`);
}

const anthropic = new Anthropic();

async function count(system: string, user: string): Promise<number> {
  const res = await anthropic.messages.countTokens({
    model: MODEL,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.input_tokens;
}

const usd = (tokens: number, perMillion: number) => (tokens / 1_000_000) * perMillion;

async function main() {
  const rows = await fetchItems(8);
  if (rows.length === 0) {
    console.error("잴 항목이 없다. 먼저 수집을 한 번 돌려라.");
    process.exit(1);
  }

  console.log(`모델 ${MODEL} · 항목 ${rows.length}건 (최신순)\n`);
  console.log("항목별 입력 토큰 (지금 / 초안 · 키워드 목록 100개 기준)");

  const keywords = fakeKeywords(100);
  let curTotal = 0;
  let draftTotal = 0;

  for (const row of rows) {
    const evidence = (row.content_html ?? "").trim() || (row.source_excerpt ?? "").trim();
    const user = `제목: ${row.title}\n\n글:\n${evidence.slice(0, EVIDENCE_LIMIT)}`;
    const needSummary = evidence !== "";

    const cur = await count(currentSystem(needSummary, true), needSummary ? user : `제목: ${row.title}`);
    const draft = await count(draftSystem(keywords), user);
    curTotal += cur;
    draftTotal += draft;

    const mark = needSummary ? " " : "·"; // · = 근거 없음(요약 안 함)
    console.log(
      `${mark} ${String(cur).padStart(6)} → ${String(draft).padStart(6)}  ${row.title.slice(0, 42)}`,
    );
  }

  const n = rows.length;
  console.log(`\n평균 입력  지금 ${Math.round(curTotal / n)} → 초안 ${Math.round(draftTotal / n)} 토큰`);
  console.log(`증가분     ${Math.round((draftTotal - curTotal) / n)} 토큰/건`);

  // 프롬프트 자체(근거 없이 지시문만)가 얼마인지 — 캐싱으로 줄일 수 있는 몫이 이만큼이다.
  const sysOnly = await count(draftSystem(keywords), "제목: x");
  const sysNoList = await count(draftSystem([]), "제목: x");
  console.log(`\n지시문만(근거 제외)  ${sysOnly} 토큰 · 그중 키워드 목록 100개가 ${sysOnly - sysNoList} 토큰`);
  console.log(`  → 캐시가 걸리면 이 부분이 0.1 배로 읽힌다 (최소 캐시 길이 1024 토큰)`);

  for (const [label, p] of Object.entries(PRICE)) {
    const inCur = usd(curTotal / n, p.inputPerMTokUsd);
    const inDraft = usd(draftTotal / n, p.inputPerMTokUsd);
    const out = usd(MAX_OUTPUT, p.outputPerMTokUsd);
    console.log(
      `\n[${label}] 건당 입력 $${inCur.toFixed(5)} → $${inDraft.toFixed(5)} · 출력 최대 $${out.toFixed(5)}`,
    );
    console.log(`         하루 40건이면 $${((inDraft + out) * 40).toFixed(3)} · 한 달 $${((inDraft + out) * 40 * 30).toFixed(2)}`);
  }
  // 날짜도 베끼지 않는다 — 경계는 estimate-cost 가 정한다.
  const lastPromoDay = new Date(STANDARD_FROM_MS - 1).toISOString().slice(0, 10);
  console.log(`\n※ 도입가(intro)는 ${lastPromoDay} (UTC) 에 끝난다. 그 뒤는 standard.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
