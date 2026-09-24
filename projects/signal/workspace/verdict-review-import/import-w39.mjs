// 한 번만 쓰는 옮기기: 파일로 뽑아 둔 9/21 주(2026-W39) 표본 20건을 판정 검토 테이블로 옮긴다.
// 실행: node <이 파일> <signal 프로젝트 경로> <W39-sample.json 경로> [--dry]
// 값(키)은 어디에도 찍지 않는다. 이미 그 주가 있으면 아무것도 안 바꾸고 멈춘다(INV-VR2).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [projectDir, samplePath] = process.argv.slice(2);
const dry = process.argv.includes("--dry");
const require = createRequire(join(projectDir, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const nextEnv = require("@next/env");
nextEnv.loadEnvConfig(projectDir, true, { info: () => {}, error: () => {} });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 없다");

const s = JSON.parse(readFileSync(samplePath, "utf8"));
if (Object.keys(s.answers ?? {}).length > 0) throw new Error("이미 답이 있는 파일이다 — 답까지 옮기는 것은 이 스크립트의 일이 아니다");

const week = {
  week: s.week,
  extracted_at: s.extracted_at,
  seed: s.seed,
  pool_size: s.pool_size,
  shortfall: { hot: s.shortfall.hot, not_hot: s.shortfall.not_hot },
};
const items = s.items.map((i, n) => ({
  week: s.week,
  item_id: i.id,
  position: n + 1,
  hot: i.verdict.hot === true,
  snapshot: {
    title: i.title,
    source: i.source,
    source_name: i.source_name,
    url: i.url,
    judged_at: i.judged_at,
    true_questions: i.verdict.true_questions,
    reasons: i.verdict.reasons,
    one_line: i.summary.one_line,
    points: i.summary.points,
  },
}));
console.log(`${s.week}: ${items.length}건 (핫이슈 ${items.filter((i) => i.hot).length}) · 추출 ${s.extracted_at}`);
if (dry) process.exit(0);

const db = createClient(url, key, { auth: { persistSession: false } });
const w = await db.from("verdict_review_week").insert(week);
if (w.error) throw new Error(`주 넣기 실패: ${w.error.code} ${w.error.message}`);
const it = await db.from("verdict_review_item").insert(items);
if (it.error) {
  await db.from("verdict_review_week").delete().eq("week", s.week);
  throw new Error(`표본 넣기 실패(주는 되돌림): ${it.error.message}`);
}
const check = await db.from("verdict_review_item").select("item_id", { count: "exact", head: true }).eq("week", s.week);
console.log(`옮김: ${s.week} ${check.count}건`);
