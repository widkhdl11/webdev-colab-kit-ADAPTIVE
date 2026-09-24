#!/usr/bin/env node
//
// loop-rehearsal.mjs — "이 파일들만으로 새 대화가 이어서 시작할 수 있나"를 실제로 물어본다.
//
// 새 대화(claude -p)에 HANDOFF·PROGRESS·request.json 만 주고 네 가지를 답하게 한다:
//   지금 위치(노드) / 다음 할 항목 / 열린 결정 / 주의할 것
// 앞의 셋은 파일에서 기계로 뽑은 값과 대조한다. 넷째(자유 문장)는 대조하지 않고 기록만 한다.
// 하나라도 다르면 HANDOFF 가 새 대화에 필요한 것을 못 싣고 있다는 뜻이다.
//
// 언제 도나: 루프 시작 직전 한 번 · 세션 랩업에서 한 번. 회차마다 돌리지 않는다(회차가 곧 새 대화다).
//
// 사용: node scripts/loop-rehearsal.mjs [--project <slug>] [--root <경로>]
// 종료 코드: 일치 0 · 불일치 1 · 실행 실패 2
//
// 정본 규약: docs/references/run-loop.md 4절

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pickNextItem } from "./lib/loop-model.mjs";
import { loopPaths, loadLoopConfig, readJson } from "./lib/loop-files.mjs";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readText = (p) => { try { return readFileSync(p, "utf-8"); } catch { return ""; } };

/**
 * 입력 크기 추정(토큰). 한국어는 UTF-8 로 한 글자 3바이트이고 대개 한 글자가 한 토큰 안팎이라
 * 바이트/3 이 한국어에서는 맞고, 영문(4글자≈1토큰)에서는 넉넉하게 크게 나온다. 상한 판정에는
 * 크게 나오는 쪽이 안전하다 — 넘었는데 안 넘었다고 하는 것보다 낫다.
 */
export const estimateTokens = (text) => Math.ceil(Buffer.byteLength(String(text ?? ""), "utf-8") / 3);

/** HANDOFF 머리말의 프론티어 값. 없으면 null. */
export function handoffFrontier(text) {
  const m = String(text ?? "").match(/프론티어\(지금 작업할 노드, 파생값\):\s*(.+)/);
  return m ? m[1].trim() : null;
}

/** 파일에서 기계로 뽑은 기대값. */
export function expectedAnswer({ handoffText, request, decision }) {
  const next = pickNextItem(request, decision);
  return {
    now_node: handoffFrontier(handoffText),
    next_item_id: next.kind === "item" ? next.item.id : null,
    open_decision_id: decision && decision.status === "대기" ? decision.id : null,
  };
}

const norm = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || /^(없음|null|none|n\/a)$/i.test(s) ? null : s;
};

/** 답에서 JSON 한 덩어리를 뽑는다. 앞뒤 설명·코드 울타리가 섞여 있어도 첫 { … 마지막 } 을 본다. */
export function parseAnswer(text) {
  const s = String(text ?? "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

/** 대조. 반환: 다른 칸 목록(빈 배열이면 일치) */
export function compareAnswer(expected, answer) {
  if (!answer) return ["답에서 JSON 을 못 읽었다"];
  const diffs = [];
  for (const k of ["now_node", "next_item_id", "open_decision_id"]) {
    if (norm(expected[k]) !== norm(answer[k])) diffs.push(`${k}: 기대 ${expected[k] ?? "없음"} · 답 ${answer[k] ?? "없음"}`);
  }
  return diffs;
}

const PROMPT = (files) => `다음은 어떤 작업의 인수인계 파일 셋이다. 이 파일만 보고 답한다. 도구는 쓰지 마라.

${files}

아래 JSON 하나만 출력한다(설명 없이):
{"now_node": "<HANDOFF 가 말하는 지금 작업할 노드 — 없으면 null>",
 "next_item_id": "<열린 요청에서 다음에 할 항목 id — done 이 아니고, 앞 항목(또는 deps)이 끝났고, 열린 결정 카드가 막지 않는 첫 항목. 없으면 null>",
 "open_decision_id": "<답을 기다리는 결정 카드 id — 없으면 null>",
 "cautions": ["<주의할 것 한 줄씩, 최대 3개>"]}`;

export function runRehearsal({ root = KIT_ROOT, slug, config = null }) {
  const p = loopPaths(root, slug);
  const cfg = config ?? loadLoopConfig(root, slug).config;
  const ws = join(root, "projects", slug, "workspace");
  const handoffText = readText(join(ws, "HANDOFF.md"));
  const progressText = readText(join(ws, "PROGRESS.md"));
  const requestText = readText(join(p.report, "request.json"));
  const decisionRaw = readJson(join(p.report, "decision.json"));
  const decision = decisionRaw && decisionRaw.status === "대기" ? decisionRaw : null;
  const lessonsTail = readText(join(root, "docs", "LESSONS.md")).split(/\r?\n/).filter((l) => l.trim()).slice(-3).join("\n");

  const files = [
    ["HANDOFF.md", handoffText], ["PROGRESS.md", progressText], ["request.json", requestText || "(열린 요청 없음)"],
    ["decision.json", decision ? JSON.stringify(decision, null, 2) : "(열린 결정 없음)"],
    ["LESSONS 최근 3줄", lessonsTail],
  ].map(([n, t]) => `=== ${n} ===\n${t}`).join("\n\n");
  const tokens = estimateTokens(files);
  const expected = expectedAnswer({ handoffText, request: readJson(join(p.report, "request.json")), decision });

  const [cmd, ...pre] = cfg.claude_cmd ?? ["claude"];
  const r = spawnSync(cmd, [...pre, "-p", "--output-format", "json", "--permission-mode", "plan", "--max-turns", "2"], {
    cwd: root, input: PROMPT(files), encoding: "utf-8", env: { ...process.env, KIT_RUN_LOOP: "rehearsal" },
    maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  });
  let answerText = r.stdout ?? "";
  try { answerText = JSON.parse(r.stdout).result ?? answerText; } catch { /* 가짜 프로세스는 바로 답을 낸다 */ }
  const answer = parseAnswer(answerText);
  const diffs = r.status === 0 ? compareAnswer(expected, answer) : [`리허설 프로세스 실패(exit ${r.status}): ${String(r.stderr ?? "").trim().slice(0, 200)}`];

  const out = {
    at: new Date().toISOString(),
    ok: diffs.length === 0,
    diffs,
    expected,
    answer,
    input_tokens_estimate: tokens,
    over_limit: tokens > cfg.rehearsal_token_limit,
    limit: cfg.rehearsal_token_limit,
  };
  mkdirSync(p.dir, { recursive: true });
  writeFileSync(join(p.dir, "rehearsal.json"), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const root = resolve(arg("root") ?? KIT_ROOT);
  const slug = (arg("project") ?? readText(join(root, "ACTIVE"))).trim();
  if (!slug || !existsSync(join(root, "projects", slug))) { console.error("프로젝트를 못 정했다."); process.exit(2); }
  const out = runRehearsal({ root, slug });
  console.log(`지금 위치: ${out.answer?.now_node ?? "?"} · 다음 항목: ${out.answer?.next_item_id ?? "?"} · 열린 결정: ${out.answer?.open_decision_id ?? "?"}`);
  for (const c of out.answer?.cautions ?? []) console.log(`주의: ${c}`);
  console.log(`입력 약 ${out.input_tokens_estimate} 토큰${out.over_limit ? ` — 상한 ${out.limit} 초과: HANDOFF·PROGRESS 가 너무 크다` : ""}`);
  console.log(out.ok ? "리허설 일치" : `리허설 불일치 — HANDOFF 보강 필요:\n- ${out.diffs.join("\n- ")}`);
  process.exit(out.ok ? 0 : 1);
}
