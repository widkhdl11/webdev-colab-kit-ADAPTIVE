#!/usr/bin/env node
// session-size.mjs — Stop 훅. 대화 세션이 길어지면 알린다(루프 밖 대화용).
//
// 크기는 대화 파일(훅 입력의 transcript_path)의 **마지막 응답 기록의 사용량**으로 잰다 —
// 입력 + 캐시 읽기 + 캐시 생성 = 그 응답을 만들 때 모델이 본 컨텍스트 전체다. 훅 입력에는 토큰 수
// 칸이 없어서 이 방법을 쓴다. 바이트나 턴 수로 짐작하지 않는다.
//
// 임계(루프 설정 session_warn_tokens, 기본 120000)를 넘으면:
//   항목 경계(열린 요청이 없거나, 마지막 항목 전환이 「통과」이고 그 항목이 done)
//     → 「항목 완료 · 새 세션 권장」을 사람에게 보이고, report/session-warning.json 을 남긴다(대시보드가 띄운다)
//   항목 중간
//     → 알리기만 한다. 멈추지 않는다. 기록은 boundary:false 로 남겨 대시보드가 안 띄우게 한다.
// 턴을 막지 않는다(언제나 종료 코드 0) — 경고는 판정이 아니다.
//
// 정본: docs/references/run-loop.md 7절

import { readFileSync, writeFileSync, existsSync, openSync, readSync, fstatSync, closeSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
if (process.env.KIT_RUN_LOOP) process.exit(0);

let input = {};
try { input = JSON.parse(readFileSync(0, "utf-8")); } catch { process.exit(0); }
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; } };

/** 파일 끝 몇 MB 만 읽는다. 대화 파일은 수 MB 가 되고 훅은 매 턴 돈다. */
function tail(path, bytes = 4 * 1024 * 1024) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf-8");
  } finally { closeSync(fd); }
}

function contextTokens(transcript) {
  if (!transcript || !existsSync(transcript)) return null;
  const lines = tail(transcript).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let o;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    const u = o?.message?.usage;
    if (o?.type === "assistant" && !o.isSidechain && u) {
      return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    }
  }
  return null;
}

const tokens = contextTokens(input.transcript_path);
if (tokens === null) process.exit(0);

const slug = (() => { try { return readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim(); } catch { return ""; } })();
if (!slug) process.exit(0);
const report = join(ROOT, "projects", slug, "report");
const limit = Number.isInteger(readJson(join(report, "loop", "config.json"))?.session_warn_tokens)
  ? readJson(join(report, "loop", "config.json")).session_warn_tokens : 120000;
if (tokens < limit) process.exit(0);

// 항목 경계인가
const request = readJson(join(report, "request.json"));
const open = request && request.status !== "완료" && request.status !== "중단";
let boundary = !open;
if (open) {
  const rows = (() => { try { return readFileSync(join(report, "transitions.jsonl"), "utf-8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } })();
  const last = [...rows].reverse().find((r) => r?.item != null);
  const it = last && (request.items ?? []).find((i) => i.label === last.item);
  boundary = Boolean(last && last.result === "통과" && it?.done === true) || rows.every((r) => r?.item == null);
}

const k = Math.round(tokens / 1000);
try {
  writeFileSync(join(report, "session-warning.json"),
    `${JSON.stringify({ at: new Date().toISOString(), tokens, limit, boundary, session_id: input.session_id ?? null })}\n`);
} catch { /* 기록 실패가 턴을 막으면 안 된다 */ }

const message = boundary
  ? `항목 완료 · 새 세션 권장 — 대화가 약 ${k}k 토큰이다(기준 ${Math.round(limit / 1000)}k). 세션 랩업(/wrap-up) 뒤 /clear 하고 랩업이 낸 네 줄로 이어 가면 된다.`
  : `대화가 약 ${k}k 토큰이다(기준 ${Math.round(limit / 1000)}k). 지금 항목이 끝나면 새 세션을 권장한다.`;
process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
process.exit(0);
