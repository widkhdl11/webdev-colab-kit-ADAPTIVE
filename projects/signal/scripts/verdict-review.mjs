// 판정 검토 주간 실행 (spec: docs/specs/verdict-review.md). 모델을 부르지 않는다.
//
// 하는 일, 순서대로:
//   1. 닫힐 주를 닫는다 — 답이 다 있으면 「검토됨」, 추출 후 7일이 지났거나 지난주면 「검토 안 함」.
//      닫을 때 report/review-summary.jsonl 에 한 줄 덧붙인다(INV-VR5).
//   2. 이번 주 표본이 없으면 뽑는다 — 지난 7일 판정 중 핫이슈 10 + 아님 10, 출처당 5 이하(INV-VR1).
//      이미 있으면 손대지 않는다(INV-VR2). 지난 표본에 들어간 글은 다시 안 뽑는다.
//   3. 대시보드 특이사항에 띄울 줄을 report/notices.json 의 제 칸에 쓴다(INV-VR8).
//      실패해도 이 칸에 실패를 적고 끝낸다 — 무인 실행의 실패는 여기 말고는 볼 데가 없다.
//
// **표본 파일에는 쓰지 않는다**(새로 만들 때 한 번만). 답은 대시보드 서버만 쓴다 — 두 프로세스가
// 같은 파일을 쓰면 서로의 쓰기를 덮는다. 닫힘은 집계 줄로 적는다.
//
// 실행: npm run review            (매주 월요일 08:00 Windows 작업 스케줄러가 부른다)
// 검사용: --now <ISO 시각> · --report-dir <경로> · --rows-file <DB 행 JSON 경로>(DB 대신)

import { readFile, writeFile, rename, readdir, mkdir, appendFile, link, unlink, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WEEK_RE } from "../../../scripts/lib/review-answer.mjs";
import {
  isoWeekKst, seededRandom, toCandidate, drawSample, excludeSampled, closeStatus, summaryLine, noticeRows,
  SAMPLE_WINDOW_MS, STALE_AFTER_HOURS,
} from "./lib/verdict-sample.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const nowMs = opt("now") ? Date.parse(opt("now")) : Date.now();
if (Number.isNaN(nowMs)) {
  console.error(`--now 가 시각이 아니다: ${opt("now")}`);
  process.exit(2);
}
const nowIso = new Date(nowMs).toISOString();
const REPORT = opt("report-dir") ? resolve(opt("report-dir")) : resolve(HERE, "..", "report");
const SAMPLES = join(REPORT, "review-samples");
const SUMMARY = join(REPORT, "review-summary.jsonl");
const NOTICES = join(REPORT, "notices.json");
const LOCK = join(REPORT, ".verdict-review.lock");
const NOTICE_KEY = "verdict-review";
/** 잠금이 이보다 오래됐으면 죽은 실행이 남긴 것으로 보고 넘겨받는다. 한 번 실행은 몇 초다. */
const LOCK_STALE_MS = 30 * 60_000;
/** 닫힘 표지를 남긴 뒤 이만큼 기다린다 — 서버가 표지를 보기 전에 이미 검증을 마친 쓰기가 끝나도록. */
const CLOSING_SETTLE_MS = 300;

async function readJsonl(path) {
  try {
    return (await readFile(path, "utf-8")).split(/\r?\n/).filter((l) => l.trim())
      .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  } catch {
    return [];
  }
}

/** 임시 파일에 쓰고 이름을 바꾼다 — 대시보드가 반쯤 쓴 JSON 을 읽지 않게. */
async function writeAtomic(path, obj) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  await rename(tmp, path);
}

/**
 * 새 파일을 **원자적으로, 덮지 않고** 만든다. 임시 파일에 다 쓴 뒤 link 로 붙인다 — link 는 대상이
 * 있으면 실패하므로 `wx` 와 같은 효과이고, 쓰다가 죽어도 반쯤 쓴 표본이 남지 않는다.
 * (반쯤 쓴 표본이 남으면 다음 실행은 못 읽어 건너뛰고, 다시 만들려다 이미 있어서 그 주 내내 실패한다.)
 */
async function createAtomic(path, obj) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  try { await link(tmp, path); } finally { await unlink(tmp).catch(() => {}); }
}

/** notices.json 은 여러 스크립트가 제 칸만 쓰는 파일이다(report-contract 16절). 남의 칸은 그대로 둔다. */
async function writeNotices(rows) {
  let all = {};
  try { all = JSON.parse(await readFile(NOTICES, "utf-8")); } catch { /* 처음이다 */ }
  if (typeof all !== "object" || all === null || Array.isArray(all)) all = {};
  all[NOTICE_KEY] = { name: "판정 검토 주간 실행", generated_at: nowIso, stale_after_hours: STALE_AFTER_HOURS, rows };
  await writeAtomic(NOTICES, all);
}

async function loadSamples() {
  let names = [];
  try { names = await readdir(SAMPLES); } catch { return []; }
  const out = [];
  for (const n of names) {
    const week = n.replace(/\.json$/, "");
    if (!n.endsWith(".json") || !WEEK_RE.test(week)) continue;
    try { out.push(JSON.parse(await readFile(join(SAMPLES, n), "utf-8"))); } catch { /* 깨진 파일 — 이번 주면 아래 만들기가 실패로 드러낸다 */ }
  }
  return out.sort((a, b) => a.week.localeCompare(b.week));
}

const COLUMNS = "id,title,title_ko,source_id,source_name,original_url,gate,hot_issue_at,hot_issue_answers,hot_issue_reasons,one_line,summary_points";

/** 지난 7일 판정된 글. 읽기 전용 publishable 키를 쓴다(hot-issue-log.mjs 와 같다). */
async function fetchRows() {
  const file = opt("rows-file");
  if (file) return JSON.parse(await readFile(resolve(file), "utf-8"));
  const nextEnv = (await import("@next/env")).default;
  nextEnv.loadEnvConfig(resolve(HERE, ".."), true, { info: () => {}, error: () => {} });
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!base || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없다");
  const since = new Date(nowMs - SAMPLE_WINDOW_MS).toISOString();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const url = `${base}/rest/v1/item?select=${COLUMNS}&hot_issue_at=gte.${encodeURIComponent(since)}&order=id`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`item 조회 실패: HTTP ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

/**
 * 한 번에 한 실행만. 작업 스케줄러 실행과 손으로 친 `npm run review` 가 겹치면 둘 다 「그 주 줄이
 * 없다」고 보고 같은 줄을 두 번 덧붙인다(INV-VR5 위반).
 */
async function acquireLock() {
  try {
    await writeFile(LOCK, `${process.pid} ${nowIso}\n`, { flag: "wx" });
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const age = Date.now() - (await stat(LOCK)).mtimeMs;
    if (age < LOCK_STALE_MS) return false;
    await unlink(LOCK).catch(() => {});
    await writeFile(LOCK, `${process.pid} ${nowIso}\n`, { flag: "wx" });
    return true;
  }
}

/** 이 주를 닫는다. 표지 → 잠깐 기다림 → 다시 읽기 → 줄 — 서버가 그 사이 받은 답도 줄에 들어간다. */
async function closeWeek(week, lines) {
  const marker = join(SAMPLES, `${week}.closing`);
  await writeFile(marker, nowIso, "utf-8");
  await new Promise((r) => setTimeout(r, CLOSING_SETTLE_MS));
  const fresh = JSON.parse(await readFile(join(SAMPLES, `${week}.json`), "utf-8"));
  const status = closeStatus(fresh, lines, nowMs, isoWeekKst(nowMs));
  if (status === null) { await unlink(marker).catch(() => {}); return null; }
  const line = summaryLine(fresh, status, nowIso);
  await appendFile(SUMMARY, JSON.stringify(line) + "\n", "utf-8");
  // 표지는 남겨 둔다 — 줄이 생겼으니 닫힘 판정은 같고, 지우는 순간과 줄 사이에 틈을 만들 이유가 없다.
  return line;
}

async function main() {
  await mkdir(SAMPLES, { recursive: true });
  const samples = await loadSamples();
  const lines = await readJsonl(SUMMARY);

  // 1. 닫힐 주를 닫는다
  const week = isoWeekKst(nowMs);
  for (const s of samples) {
    if (closeStatus(s, lines, nowMs, week) === null) continue;
    const line = await closeWeek(s.week, lines);
    if (line === null) continue;
    lines.push(line);
    console.log(`닫음: ${s.week} — ${line.status === "reviewed" ? "검토됨" : "검토 안 함"} (${line.answered}/${line.total} 답함)`);
  }

  // 2. 이번 주 표본
  let current = samples.find((s) => s.week === week) ?? null;
  if (current === null) {
    const candidates = excludeSampled((await fetchRows()).map((r) => toCandidate(r, nowMs)).filter((c) => c !== null), samples);
    const seed = Math.floor(Math.random() * 2 ** 31);
    const { items, shortfall } = drawSample(candidates, seededRandom(seed));
    current = { week, extracted_at: nowIso, seed, pool_size: candidates.length, shortfall, items, answers: {} };
    await createAtomic(join(SAMPLES, `${week}.json`), current); // 이미 있으면 실패한다(INV-VR2)
    samples.push(current);
    const short = shortfall.hot + shortfall.not_hot > 0 ? ` · 모자람 핫이슈 ${shortfall.hot}·아님 ${shortfall.not_hot}` : "";
    console.log(`뽑음: ${week} — ${items.length}건 (후보 ${candidates.length}건${short})`);
  } else {
    console.log(`이번 주(${week}) 표본은 이미 있다 — 그대로 둔다`);
  }

  // 화면이 어느 주를 열지 — 정적 서버는 폴더 목록을 못 준다.
  const closedWeeks = new Set(lines.map((l) => l.week));
  const open = closedWeeks.has(current.week) ? null : current;
  await writeAtomic(join(SAMPLES, "index.json"), { weeks: samples.map((s) => s.week).sort(), open: open?.week ?? null });

  // 3. 특이사항
  await writeNotices(noticeRows(open, lines, null));
}

let locked = false;
try {
  await mkdir(REPORT, { recursive: true });
  locked = await acquireLock();
  if (!locked) {
    console.log("다른 판정 검토 실행이 돌고 있다 — 이번 실행은 건너뛴다");
  } else {
    await main();
  }
} catch (e) {
  const msg = String(e?.message ?? e).slice(0, 160);
  console.error(`판정 검토 실행 실패: ${msg}`);
  try {
    // 실패해도 열려 있는 주의 안내는 그대로 둔다 — 실패 줄 하나 때문에 검토 안내가 사라지면 안 된다.
    const lines = await readJsonl(SUMMARY);
    const closed = new Set(lines.map((l) => l.week));
    const open = (await loadSamples()).filter((s) => !closed.has(s.week)).pop() ?? null;
    const at = new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
    await writeNotices(noticeRows(open, lines, `${at} · ${msg}`));
  } catch { /* 적을 자리도 없으면 종료 코드로만 남는다 */ }
  process.exitCode = 1;
} finally {
  if (locked) await unlink(LOCK).catch(() => {});
}
