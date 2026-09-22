// 종류 판정(뉴스/툴)이 실제로 어떻게 붙었는지 **세고 제목을 보여주기만** 한다 (읽기 전용).
//
// 왜 필요한가: `placeArticle`(hot-issue.md INV-G3)은 종류 × 문턱으로 여섯 칸을 만드는데,
// 그중 두 칸 — `툴 단독`과 `툴 단독 + 문턱 넘음` — 은 화면에 서는 자리가 규칙만으로는
// 정해지지 않는다. 툴 단독이 진짜 "뉴스가 아닌 툴 정보"(문서·튜토리얼)인지, 아니면
// 툴 출시 뉴스인데 모델이 `뉴스` 를 안 붙인 것인지는 **제목을 봐야** 갈린다.
// 건수만으로는 그 둘이 같아 보인다.
//
// 출력 규칙(badge-distribution.mjs 와 같다): 키·값은 어디에도 찍지 않는다.
// 읽기 전용 publishable 키를 쓴다 — 세는 데 secret 키가 필요할 이유가 없다.
//
// 실행: npm run kinds              (툴 단독 제목 전부)
//       npm run kinds -- --limit 20

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없다.");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const argv = process.argv.slice(2);
const at = argv.indexOf("--limit");
const limit = at >= 0 ? Number(argv[at + 1]) : Infinity;
if (at >= 0 && (!Number.isInteger(limit) || limit < 1)) {
  console.error(`--limit 는 1 이상의 정수여야 한다: ${argv[at + 1]}`);
  process.exit(1);
}

/** 남의 서버가 준 글자를 터미널에 그대로 찍지 않는다 (badge-distribution.mjs 와 같은 규칙). */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const plain = (s) => String(s ?? "").replace(CONTROL_CHARS, " ");

/** PostgREST 는 한 번에 1000행까지 준다. `order=` 없이 부르면 페이지 사이에서 행이 샌다. */
async function fetchAll(path) {
  if (!path.includes("order=")) throw new Error(`order= 없이 부르면 안 된다: ${path}`);
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${plain(await res.text())}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const items = await fetchAll(
  "item?select=id,title,title_ko,importance,gate,hot_issue_at,published_at&order=id",
);
const kindLinks = await fetchAll("item_kind?select=item_id,kind&order=item_id,kind");

const kindsOf = new Map();
for (const link of kindLinks) {
  const set = kindsOf.get(link.item_id) ?? new Set();
  set.add(link.kind);
  kindsOf.set(link.item_id, set);
}

// **판정 받은 글만 센다.** `hot_issue_at` 이 비어 있으면 아직 안 물어본 것이라,
// 종류가 없는 것과 "물어봤는데 어느 쪽도 아니었다"가 섞이면 분포를 읽을 수 없다.
const judged = items.filter((i) => i.hot_issue_at !== null);

const bucket = { newsOnly: [], toolOnly: [], both: [], neither: [] };
for (const item of judged) {
  const kinds = kindsOf.get(item.id) ?? new Set();
  const isNews = kinds.has("news");
  const isTool = kinds.has("tool");
  if (isNews && isTool) bucket.both.push(item);
  else if (isNews) bucket.newsOnly.push(item);
  else if (isTool) bucket.toolOnly.push(item);
  else bucket.neither.push(item);
}

const over = (rows) => rows.filter((i) => i.gate !== null);
const under = (rows) => rows.filter((i) => i.gate === null);

console.log(`전체 ${items.length}건 · 판정 받음 ${judged.length}건 · 안 물어봄 ${items.length - judged.length}건`);
console.log("");
console.log("── 종류 × 문턱 (placeArticle 의 여섯 칸) ──");
const row = (label, rows, places) =>
  console.log(`  ${label.padEnd(18)} ${String(rows.length).padStart(4)}건  →  ${places}`);
row("뉴스만 · 넘음", over(bucket.newsOnly), "핫이슈");
row("뉴스만 · 못 넘음", under(bucket.newsOnly), "소식");
row("뉴스+툴 · 넘음", over(bucket.both), "핫이슈 + 스킬·툴");
row("뉴스+툴 · 못 넘음", under(bucket.both), "소식 + 스킬·툴");
row("툴만 · 못 넘음", under(bucket.toolOnly), "스킬·툴");
row("툴만 · 넘음", over(bucket.toolOnly), "핫이슈 + 스킬·툴  ← 확인 대상");
row("어느 쪽도 아님", bucket.neither, "(아무 데도 안 섬)");

const show = (label, rows) => {
  if (rows.length === 0) {
    console.log(`\n── ${label}: 0건 ──`);
    return;
  }
  console.log(`\n── ${label}: ${rows.length}건 ──`);
  for (const item of rows.slice(0, limit)) {
    const title = plain(item.title_ko || item.title);
    console.log(`  [중요도 ${item.importance ?? "-"}] ${title}`);
  }
  if (rows.length > limit) console.log(`  … 외 ${rows.length - limit}건 (--limit 로 조절)`);
};

// 툴 단독은 문턱 위아래를 갈라 보여준다 — 아래는 "스킬·툴에만 서는 것이 맞나",
// 위는 "뉴스가 아닌 글이 핫이슈에 서도 되나"로 질문 자체가 다르다.
show("툴만 · 문턱 넘음 (핫이슈에 서는 비뉴스 글)", over(bucket.toolOnly));
show("툴만 · 문턱 못 넘음 (스킬·툴에만 서는 글)", under(bucket.toolOnly));
show("어느 쪽도 아님 (배치 규칙상 아무 데도 안 서는 글)", bucket.neither);
