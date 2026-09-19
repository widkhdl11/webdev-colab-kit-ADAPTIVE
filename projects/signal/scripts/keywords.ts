// 적재된 항목에 뱃지 키워드를 뽑아 **무엇이 나오는지 본다** (keywords-and-kinds INV-B1·B2·B3).
//
// 왜 필요한가: 뱃지에 쓸 말 목록을 사람이 미리 정하지 않기로 했다(2026-08-15 결정).
// 목록을 손으로 정하면 그건 추측이고, 지금 고정 5개 태그가 실패한 이유가 정확히 그 추측이다.
// 대신 표기 기준만 주고 돌려서, **실제로 어떤 굵기의 말이 나오는지 · 같은 뜻이 몇 갈래로
// 갈리는지**를 보고 목록을 만들지 말지 정한다.
//
// **DB 에 쓰지 않는다.** 이건 재는 실행이다. 저장은 결과를 보고 기준 문장을 손본 뒤에 붙인다 —
// 지금 쓰면 기존 태그 5개와 섞여서, 마음에 안 드는 키워드를 되돌릴 방법이 없어진다.
//
// 실행:
//   npm run keywords -- --limit 5     ← 먼저 이걸로 건당 토큰을 재고 전체 비용을 계산한다
//   npm run keywords                  ← 전체
//   npm run keywords -- --model claude-haiku-4-5-20251001
//
// 지시문은 src/features/ingestion/lib/build-keyword-prompt.ts 에서 그대로 가져온다 —
// 여기서 베끼면 고치는 순간 확인 대상과 실물이 갈린다 (check-topic.ts 와 같은 규칙).

import Anthropic from "@anthropic-ai/sdk";
// 이름 가져오기로 쓴다 — tsx 가 CJS 로 옮기면 기본 가져오기가 undefined 가 된다.
import { loadEnvConfig } from "@next/env";
import { normalizeTagName } from "../src/entities/article/lib/tagging";
import { ARTICLE_TAGS } from "../src/entities/article/model/types";
import { buildKeywordPrompt } from "../src/features/ingestion/lib/build-keyword-prompt";
import { fenceData } from "../src/features/ingestion/lib/data-fence";
// 집계·앵커는 src 에 있다 — 여기 두면 `npm test` 가 안 돌아서, INV-B3 의 "합친다"가
// 실제로 일어나는 자리를 아무도 검증하지 않게 된다(2026-08-16 감사).
import {
  KNOWN_LIMIT,
  anchorList,
  ranked,
  tally,
  type Tally,
} from "../src/features/ingestion/lib/keyword-tally";
import { parseKeywords, type Keywords } from "../src/features/ingestion/lib/parse-keywords";

loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

// api/ports.ts 와 같은 값이어야 한다. 다르면 여기서 본 결과가 실제와 어긋난다.
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 300;
const TIMEOUT_MS = 15_000;
/** 주제 판정과 같은 값 (TOPIC_CONCURRENCY). 한 청크가 끝나야 그 키워드가 다음 청크에 실린다. */
const CONCURRENCY = 8;
/**
 * 근거로 보낼 출처 요약글의 최대 길이.
 *
 * 왜 자르나: VentureBeat 는 요약글에 본문을 통째로 준다(실측 16,000자). 뱃지 키워드는
 * "이 글이 무엇에 대한 글인가"만 보면 되므로 앞부분으로 충분한데, 안 자르면 그 소스 한 곳이
 * 전체 비용의 대부분을 쓴다. 요약(enrich)과 달리 여기서는 정확도를 거의 안 잃는다.
 */
const EVIDENCE_LIMIT = 1200;

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}
const MODEL = flag("model") ?? DEFAULT_MODEL;

/**
 * `--limit N`. 안 주면 전량이다.
 *
 * **잘못 준 값은 전량으로 떨어지면 안 된다** (2026-08-16 리뷰). 예전엔
 * `Number(flag("limit") ?? 0) || 0` 이라 `--limit abc` · `--limit -5` · 값을 빼먹은
 * `--limit` 이 전부 `0`(=전량)이 됐다. 이 파일 머리말이 "먼저 `--limit 5` 로 재라"인데
 * 오타 한 글자가 690건 전량 호출이 되는 셈이라, 안전장치가 반대로 작동했다.
 */
function parseLimit(): number {
  const raw = flag("limit");
  if (raw === undefined) {
    // `--limit` 을 아예 안 쓴 경우와 값을 빼먹은 경우를 가른다.
    if (args.includes("--limit")) {
      console.error("--limit 에 값이 없다. 예: --limit 5");
      process.exit(1);
    }
    return 0;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`--limit 은 양의 정수여야 한다 (받은 값: ${raw})`);
    process.exit(1);
  }
  return n;
}
const LIMIT = parseLimit();

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

interface Item {
  id: string;
  title: string;
  excerpt: string;
}

/** 읽기 전용 키로 항목을 가져온다 — 쓰지 않으므로 secret 키가 필요할 이유가 없다. */
async function loadItems(): Promise<Item[]> {
  const range = LIMIT > 0 ? `&limit=${LIMIT}` : "";
  const res = await fetch(
    `${url}/rest/v1/item?select=id,title,source_excerpt&order=published_at.desc${range}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`item 조회 실패 → HTTP ${res.status} ${await res.text()}`);
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) throw new Error("item 조회 응답이 배열이 아니다.");

  const items: Item[] = [];
  for (const r of rows) {
    if (typeof r !== "object" || r === null) continue;
    const row = r as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.title !== "string") continue;
    const excerpt = typeof row.source_excerpt === "string" ? row.source_excerpt : "";
    items.push({ id: row.id, title: row.title, excerpt: excerpt.slice(0, EVIDENCE_LIMIT) });
  }
  return items;
}

const anthropic = new Anthropic();

interface Outcome {
  title: string;
  /** null 이면 판정 실패 — 빈 값(짚이는 게 없음)과 구별한다. */
  keywords: Keywords | null;
  input: number;
  output: number;
}

async function extract(item: Item, knownFields: string[], knownKinds: string[]): Promise<Outcome> {
  const system = buildKeywordPrompt(knownFields, knownKinds);
  // 제목과 요약글을 **따로** 감싼다 — 이어 붙이면 요약글에 심은 문장이 제목의 일부로 읽힌다.
  const content = item.excerpt
    ? `${fenceData("제목", item.title)}\n${fenceData("출처 요약글", item.excerpt)}`
    : fenceData("제목", item.title);

  const res = await anthropic.messages.create(
    { model: MODEL, max_tokens: MAX_TOKENS, system, messages: [{ role: "user", content }] },
    { timeout: TIMEOUT_MS },
  );

  return {
    title: item.title,
    keywords: parseKeywords({
      stopReason: res.stop_reason,
      text: res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(""),
    }),
    input: res.usage.input_tokens,
    output: res.usage.output_tokens,
  };
}

/** 외부에서 온 문자열을 터미널에 찍기 전에 제어문자를 없앤다 (ingest.mjs 와 같은 규칙). */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const plain = (s: string) => s.replace(CONTROL_CHARS, " ");

async function main() {
  const items = await loadItems();
  console.log(`모델 ${MODEL} · 항목 ${items.length}건 · 동시 ${CONCURRENCY}\n`);

  const fields: Tally = new Map();
  const kinds: Tally = new Map();
  let failed = 0;
  let empty = 0;
  /** 토큰을 실제로 받은 건수. 실패(rejected)는 응답이 없어 토큰도 없다. */
  let answered = 0;
  let inputTotal = 0;
  let outputTotal = 0;
  const failureReasons = new Set<string>();

  const started = Date.now();
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    // 청크마다 다시 만드므로 앞 청크가 만든 키워드가 뒤에 실린다.
    // 축마다 따로 만든다 — 합치면 모델이 축을 헷갈린다.
    const knownFields = anchorList(fields);
    const knownKinds = anchorList(kinds);

    const chunk = items.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((it) => extract(it, knownFields, knownKinds)),
    );

    for (const r of settled) {
      if (r.status === "rejected") {
        failed += 1;
        failureReasons.add(
          String(r.reason instanceof Error ? r.reason.message : r.reason).slice(0, 200),
        );
        continue;
      }
      const { keywords, input, output } = r.value;
      answered += 1;
      inputTotal += input;
      outputTotal += output;
      if (keywords === null) {
        failed += 1;
        failureReasons.add("응답을 읽지 못함(잘렸거나 형식이 깨짐)");
        continue;
      }
      if (keywords.fields.length === 0 && keywords.kinds.length === 0) empty += 1;
      tally(fields, keywords.fields);
      tally(kinds, keywords.kinds);
    }
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, items.length)}/${items.length}`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  for (const [label, counts] of [
    ["분야", fields],
    ["사건종류", kinds],
  ] as const) {
    const rows = ranked(counts);
    console.log(`\n\n${label} ${rows.length}종`);
    for (const { display, n } of rows) {
      console.log(`  ${String(n).padStart(4)}  ${plain(display)}`);
    }
  }

  // 기존 고정 태그와 겹치는 것 — 5개를 지울지 말지의 근거가 된다.
  // **두 축을 다 본다**: `툴` 처럼 사건종류 쪽으로 샐 수 있는 말은 분야만 보면 안 잡힌다.
  const overlap = ARTICLE_TAGS.filter(
    (t) => fields.has(normalizeTagName(t)) || kinds.has(normalizeTagName(t)),
  );
  const n = items.length;
  console.log(
    `\n${seconds}초 · 항목 ${n} · 키워드 없음 ${empty} · 실패 ${failed}` +
      `\n기존 태그 5개 중 다시 나온 것: ${overlap.length ? overlap.join(", ") : "없음"}` +
      `\n토큰  입력 ${inputTotal} · 출력 ${outputTotal}` +
      // 분모는 **토큰을 실제로 받은 건수**다. `n - failed` 로 나누면 파싱 실패분의 토큰이
      // 분자에는 남고 분모에서는 빠져 건당 값이 부풀려진다(2026-08-16 리뷰).
      `\n건당  입력 ${Math.round(inputTotal / Math.max(1, answered))} (응답 받은 ${answered}건 기준)` +
      // `--limit` 으로 잰 값은 전체 비용의 근거가 못 된다: 첫 청크는 앵커 목록이 비어 있고,
      // 전체 실행에서는 항목마다 최대 KNOWN_LIMIT 개가 붙는다.
      (LIMIT > 0
        ? `\n※ --limit 실행이라 앵커 목록이 거의 안 실렸다. 전체 비용은 이 값보다 크다` +
          ` (목록 상한 ${KNOWN_LIMIT}개, 2026-08-10 실측으로 100개가 898토큰).`
        : ""),
  );
  if (failureReasons.size > 0) {
    console.log("\n실패 이유:");
    for (const reason of failureReasons) console.log(`  · ${plain(reason)}`);
  }
}

main().catch((e: unknown) => {
  // 여기 오는 메시지에는 PostgREST 응답 본문이 통째로 실린다(loadItems). 파일 안의 다른
  // 출력은 전부 plain 을 거치는데 여기만 빼면 규칙이 한 군데서 새는 셈이다.
  console.error(plain(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
