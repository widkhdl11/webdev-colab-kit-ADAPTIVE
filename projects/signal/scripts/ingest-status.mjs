// 수집이 실제로 얼마나 채워졌는지 **건수만** 본다.
//
// 왜 필요한가: 수집 라우트가 돌려주는 보고는 그 한 번의 실행분이다(BATCH=10).
// "70건 중 요약이 몇 건 있나"는 거기서 안 나오고, 그걸 모르면 몇 바퀴 더 돌려야 하는지도 모른다.
//
// 출력 규칙(check-env.mjs 와 같다): 키·값은 어디에도 찍지 않는다. 건수와 제목 일부만.
// 읽기 전용 publishable 키를 쓴다 — 세는 데 secret 키가 필요할 이유가 없다.

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없다.");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

/**
 * PostgREST 의 Content-Range 헤더로 건수만 받는다 (행은 안 가져온다).
 * col 을 받는 이유: item_tag 는 기본키가 (item_id, tag_id) 라 id 컬럼이 없다.
 */
async function count(table, query = "", col = "id") {
  const res = await fetch(`${url}/rest/v1/${table}?select=${col}${query}`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) throw new Error(`${table}${query} → HTTP ${res.status} ${await res.text()}`);
  // "0-0/70" 또는 "*/0"
  return Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
}

const total = await count("item");
const withTitleKo = await count("item", "&title_ko=not.is.null");
const withSummary = await count("item", "&summary=not.is.null");
const withExcerpt = await count("item", "&source_excerpt=not.is.null&source_excerpt=neq.");
const withBody = await count("item", "&content_html=neq.");
const fallbackDate = await count("item", "&published_at_is_fallback=is.true");
const itemTags = await count("item_tag", "", "item_id");
const tags = await count("tag");

const pct = (n) => (total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`);
const line = (label, n) => console.log(`  ${String(n).padStart(4)} / ${total}  ${pct(n).padStart(4)}  ${label}`);

console.log(`item 총 ${total}건`);
line("한국어 제목 있음 (title_ko)", withTitleKo);
line("AI 요약 있음 (summary)", withSummary);
line("출처 요약글 있음 (source_excerpt)", withExcerpt);
line("본문 있음 (content_html)", withBody);
line("발행시각이 대체값 (published_at_is_fallback)", fallbackDate);

// 태그가 붙은 항목 수는 item_tag 를 항목별로 접어야 나온다 — 연결 건수와 다르다.
const res = await fetch(`${url}/rest/v1/item_tag?select=item_id`, { headers });
const links = res.ok ? await res.json() : [];
const taggedItems = new Set(links.map((r) => r.item_id)).size;
line("태그가 붙은 항목", taggedItems);
console.log(`\n태그 연결 ${itemTags}건 / 태그 종류 ${tags}개`);

// 소스별로도 나눠 본다 — 한쪽 소스만 비어 있는 상태를 총합은 감춘다.
const bySource = await fetch(`${url}/rest/v1/item?select=source_id,summary,content_html`, { headers });
if (bySource.ok) {
  const rows = await bySource.json();
  const acc = new Map();
  for (const r of rows) {
    const a = acc.get(r.source_id) ?? { total: 0, summary: 0, body: 0 };
    a.total += 1;
    if (r.summary) a.summary += 1;
    if (r.content_html) a.body += 1;
    acc.set(r.source_id, a);
  }
  console.log("\n소스별");
  for (const [id, a] of acc) {
    console.log(`  ${id.padEnd(16)} ${a.total}건 · 요약 ${a.summary} · 본문 ${a.body}`);
  }
}
