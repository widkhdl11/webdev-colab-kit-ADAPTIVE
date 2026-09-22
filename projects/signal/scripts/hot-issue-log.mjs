// 핫이슈로 뽑힌 글과 **왜 뽑혔는지**를 훑는다 (읽기 전용).
//
// 왜 필요한가: 첫 2주 표본 검토가 답해야 하는 질문은 "몇 건 나왔나"가 아니라
// **"질문 셋 중 어느 것이 헐거운가"**다. 화면은 뽑힌 결과만 보여주므로 그걸 못 본다.
// 여기서는 날짜별 건수와 질문별 적중을 같이 놓고, 그날 뽑힌 제목을 근거와 함께 찍는다.
//
// 상한이 없어진 뒤(2026-09-21, INV-N4)부터 **건수 자체가 신호다** — 매일 20건이 넘으면
// 문턱이 헐거운 것이고, 그때 고칠 것은 상한이 아니라 질문이다.
//
// 출력 규칙(badge-distribution.mjs 와 같다): 키·값은 어디에도 찍지 않는다.
// 읽기 전용 publishable 키를 쓴다.
//
// 실행: npm run hot-issue              (최근 7일)
//       npm run hot-issue -- --days 14

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
if (!base || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없다.");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const argv = process.argv.slice(2);
const at = argv.indexOf("--days");
const days = at >= 0 ? Number(argv[at + 1]) : 7;
if (!Number.isInteger(days) || days < 1) {
  console.error(`--days 는 1 이상의 정수여야 한다: ${argv[at + 1]}`);
  process.exit(1);
}

/** 남의 서버가 준 글자를 터미널에 그대로 찍지 않는다. */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const plain = (s) => String(s ?? "").replace(CONTROL_CHARS, " ");

async function fetchAll(path) {
  if (!path.includes("order=")) throw new Error(`order= 없이 부르면 안 된다: ${path}`);
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${plain(await res.text())}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

// KST 고정 — `shared/lib/datetime.ts` 의 dayKey 와 같은 기준이어야 화면과 같은 날로 묶인다.
const SEOUL_OFFSET_MS = 9 * 3600_000;
const dayKey = (iso) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
};

let items;
try {
  items = await fetchAll(
    "item?select=id,title,title_ko,source_id,published_at,importance,gate,hot_issue_at,hot_issue_answers&order=id",
  );
} catch (e) {
  // 마이그레이션을 안 돌렸을 때가 제일 흔하다. 원문 오류(`42703`)만 던지면 사람이
  // 그 코드를 찾아봐야 하므로, 무엇을 하면 되는지까지 같이 적는다.
  if (String(e.message).includes("hot_issue_answers")) {
    console.error(
      [
        "`hot_issue_answers` 칸이 DB 에 없다 — 0009 마이그레이션을 아직 안 돌렸다.",
        "  supabase/migrations/0009_hot_issue_answers.sql 을 Supabase SQL 편집기에 붙여 넣고 실행한다.",
        "  돌린 뒤 확인: npm run test:integration",
      ].join("\n"),
    );
    process.exit(1);
  }
  throw e;
}

const since = Date.now() - days * 86_400_000;
const recent = items.filter((i) => Date.parse(i.published_at) > since);
const judged = recent.filter((i) => i.hot_issue_at !== null);
const picked = judged.filter((i) => i.gate !== null);

console.log(`최근 ${days}일 ${recent.length}건 · 판정 받음 ${judged.length}건 · 핫이슈 ${picked.length}건`);

// ── 날짜별 건수. 상한이 없으므로 이 줄이 그날의 사정을 그대로 나타낸다.
const byDay = new Map();
for (const i of picked) {
  const k = dayKey(i.published_at);
  if (k !== "") byDay.set(k, (byDay.get(k) ?? 0) + 1);
}
console.log("\n── 날짜별 핫이슈 수 (KST) ──");
if (byDay.size === 0) console.log("  없음");
for (const [d, n] of [...byDay.entries()].sort()) {
  console.log(`  ${d}  ${String(n).padStart(3)}건  ${"■".repeat(Math.min(n, 40))}`);
}

// ── 질문별 적중. 한 질문만 계속 참이면 나머지 둘은 일하지 않는 것이다.
const hits = new Map();
let withAnswers = 0;
for (const i of judged) {
  const a = i.hot_issue_answers;
  if (a === null || typeof a !== "object") continue;
  withAnswers += 1;
  for (const [q, v] of Object.entries(a)) {
    if (!hits.has(q)) hits.set(q, { yes: 0, total: 0 });
    const cur = hits.get(q);
    cur.total += 1;
    if (v === true) cur.yes += 1;
  }
}
console.log(`\n── 질문별 적중 (근거가 남은 ${withAnswers}건 기준) ──`);
if (withAnswers === 0) {
  console.log("  근거가 하나도 안 남았다 — 0009 마이그레이션을 돌렸는지, 그 뒤 수집이 한 번 돌았는지 본다.");
} else {
  for (const [q, c] of hits) {
    const pct = ((c.yes / c.total) * 100).toFixed(1);
    console.log(`  ${plain(q).slice(0, 12).padEnd(6)} 참 ${String(c.yes).padStart(4)} / ${c.total}  (${pct}%)`);
  }
  console.log("  * 한 질문만 계속 참이면 나머지 둘은 일하지 않는 것이다.");
  console.log("  * 참 비율이 너무 높은 질문이 곧 헐거운 질문이다 — 고칠 곳은 상한이 아니라 그 문장이다.");
}

// ── 뽑힌 글과 그 근거.
console.log("\n── 핫이슈로 뽑힌 글 (최신순) ──");
const sorted = [...picked].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
for (const i of sorted) {
  const a = i.hot_issue_answers;
  const why =
    a && typeof a === "object"
      ? Object.entries(a)
          .filter(([, v]) => v === true)
          .map(([q]) => plain(q).slice(0, 12))
          .join("+") || "(참인 질문 없음?)"
      : "(근거 없음)";
  console.log(
    `  ${dayKey(i.published_at)} [${String(i.importance ?? "-")}·${why}] ` +
      `${plain(i.title_ko || i.title).slice(0, 48)}  — ${plain(i.source_id)}`,
  );
}

// ── 문턱을 넘었는데 안 뽑힌 글. 상한을 없앤 뒤로는 중복(INV-G4)뿐이어야 한다.
const overButNotPicked = judged.filter(
  (i) => typeof i.importance === "number" && i.importance >= 1 && i.gate === null,
);
console.log(`\n── 문턱은 넘었는데 안 뽑힌 글: ${overButNotPicked.length}건 ──`);
console.log("  상한을 없앤 뒤(2026-09-21)로 여기 남는 이유는 「같은 사건」(INV-G4) 하나여야 한다.");
console.log("  판정 뒤에 상한이 다시 생겼거나 배정이 실패하면 이 수가 늘어난다.");
for (const i of overButNotPicked.slice(0, 20)) {
  console.log(`  [중요도 ${i.importance}] ${plain(i.title_ko || i.title).slice(0, 52)}`);
}
