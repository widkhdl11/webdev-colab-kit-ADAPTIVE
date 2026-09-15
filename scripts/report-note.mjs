#!/usr/bin/env node
//
// report-note.mjs — 2층(현재 위치 + 전환 이력)을 기록하는 **유일한** 자리.
//
//   node scripts/report-note.mjs --node <노드> --task <식별자> --now "<한 줄>" \
//        [--off-graph "<무슨 작업인지>"] [--item "<요청 항목 label>"] [--delay-reason "<지연 사유 한 줄>"] [--result <통과|반려|실패|...>] [--skill <스킬 이름>] [--blocker <id>=<label>]... [--clear-blockers] [--project <slug>]
//
// 왜 하나뿐인가:
//   규약은 "state.json 을 쓰는 시점마다 transitions.jsonl 에도 한 줄"이다. 쓰는 자리가 둘
//   이상이면 한쪽만 기록하는 경로가 언젠가 생기고, 그때 화면은 멀쩡해 보이면서 체류 시간만
//   조용히 틀린다. 그래서 두 파일을 같이 쓰는 함수 하나만 두고, 다른 자리에서 state.json 을
//   쓰지 않는다는 것을 check-report 가 검사한다.
//
// 기록 시점(규약): 노드 전환 · task 시작/종료 · blocker 발생/해소. 그 외에는 기록하지 않는다.
// result 는 task 종료 전환에만 채운다.
//
// 정본 규약: docs/references/report-contract.md

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { validateState, validateTransition, chainErrors, parseJsonl, NOW_MAX } from "./lib/report-model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 값이 `--` 로 시작하면 값이 아니라 빠뜨린 것이다. 그대로 받으면 `--now --result 통과` 가
// now 에 "--result" 를 기록하고, 화면에는 그 글자가 작업 설명으로 뜬다.
function value(v, flag) {
  if (v === undefined) return undefined;
  if (v.startsWith("--")) {
    console.error(`--${flag} 의 값이 빠졌다 (다음 인자가 ${v} 다).`);
    process.exit(2);
  }
  return v;
}
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? value(process.argv[i + 1], name) : undefined;
}
function argAll(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a !== `--${name}`) return;
    const v = value(process.argv[i + 1], name);
    if (v) out.push(v);
  });
  return out;
}

function activeSlug() {
  try {
    return readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim();
  } catch {
    return "";
  }
}

function readJson(p, fallback) {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return fallback;
  }
}

/**
 * 두 파일을 함께 쓴다. 이 함수 밖에서 state.json 을 쓰지 않는다.
 * 반환: 기록된 전환 줄.
 */
export function note(reportDir, { node, task, now, result = null, blockers, sessionId, skill = null, offGraph, item = null, delayReason = null }) {
  mkdirSync(reportDir, { recursive: true });
  const statePath = join(reportDir, "state.json");
  const transPath = join(reportDir, "transitions.jsonl");

  // workflow.json 이 없으면 여기서 멈춘다. 빈 목록으로 넘어가면 노드 이름 검증이 통째로 꺼져서
  // 아무 문자열이나 노드로 통과한다 — 그때 화면은 에러 없이 "아무 데도 안 빛나는" 모양이 된다.
  const workflow = readJson(join(reportDir, "workflow.json"), null);
  if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    throw new Error(`workflow.json 을 못 읽었다(${reportDir}). 설치가 안 됐거나 파일이 깨졌다 — node scripts/export-workflow.mjs 를 먼저 돌린다.`);
  }

  // 현재 위치의 출처는 state 가 아니라 **이력**이다. state 만 지워진 상태에서 state 를 근거로
  // 삼으면 from_node 가 null 인 줄이 이력 한가운데에 붙고, 그 끊김은 짝 검사를 통과한다.
  const prevRows = existsSync(transPath) ? parseJsonl(readFileSync(transPath, "utf-8")).rows : [];
  const last = prevRows[prevRows.length - 1] ?? null;
  const prev = existsSync(statePath) ? readJson(statePath, null) : null;
  const at = new Date().toISOString();

  // 시각이 뒤로 가면 "마지막 전환"의 뜻이 둘로 갈린다 — 짝 검사는 파일의 마지막 줄을 보고
  // 화면은 시간순으로 정렬한 마지막 줄을 본다. 그래서 뒤로 가는 기록은 아예 받지 않는다.
  if (last && Date.parse(at) < Date.parse(last.at)) {
    throw new Error(`기록 시각(${at})이 마지막 전환(${last.at})보다 이르다. 시계가 뒤로 갔거나 파일이 손으로 고쳐졌다.`);
  }

  const nowBlockers = blockers ?? prev?.blockers ?? [];
  const transition = {
    at,
    from_node: last?.to_node ?? null,
    to_node: node ?? null,
    task,
    now,
    result,
    item,
    // 그 시점의 blocker 를 이력에도 남긴다. state.json 은 덮어쓰기라 "언제 생겨서 언제
    // 풀렸나"가 아무 데도 안 남는다 — 지연 진단이 그 구간을 계산할 유일한 자리가 여기다.
    blockers: nowBlockers,
  };
  const state = {
    session_id: sessionId ?? prev?.session_id ?? randomUUID(),
    current_node: node ?? null,
    task,
    now,
    since: at,
    blockers: nowBlockers,
  };
  // skill 은 언제나 적는다 — 안 쓰는 중이면 null 이다. 앞 상태에서 물려받지 않는다:
  // 물려받으면 끝난 스킬이 화면에서 계속 실행 중으로 남는다.
  state.skill = skill || null;
  // 지연 사유는 **지금 항목에 대한** 자기 신고다. 항목이 바뀌면 앞 항목의 사유가 남아 있으면
  // 안 되므로 기계로 null 로 돌린다 — 사람이 지우는 것에 맡기면 안 지워지는 날이 온다.
  // 사유를 이번에 명시적으로 주면 그것이 이긴다(항목이 바뀌는 그 줄에서 적을 일은 없지만,
  // 적었다면 그건 새 항목에 대한 사유다).
  //
  // 비교 상대는 **마지막 줄이 아니라 마지막으로 항목이 적힌 줄**이다. 규약상 그래프 밖 작업과
  // 항목과 무관한 전환은 item 이 null 이라, 마지막 줄과 비교하면 「항목 A → 그래프 밖 한 줄 →
  // 다시 항목 A」에서 A 의 사유가 사라진다. 항목은 바뀐 적이 없는데 그렇다.
  const lastItem = [...prevRows].reverse().find((r) => (r.item ?? null) !== null)?.item ?? null;
  const itemChanged = item !== null && item !== lastItem;
  state.delay_reason = delayReason || (itemChanged ? null : prev?.delay_reason ?? null);
  // 그래프 밖이면 무슨 작업인지 한 줄. 이 줄이 없으면 "밖"과 "안 적었다"가 구별되지 않는다.
  if (!node) state.off_graph = offGraph || "제품 그래프 밖의 작업";

  const problems = [
    ...validateTransition(transition, workflow, prevRows.length),
    ...validateState(state, workflow),
    ...chainErrors([...prevRows, transition]),
  ];
  if (problems.length > 0) {
    const err = new Error(problems.join("\n"));
    err.problems = problems;
    throw err;
  }

  appendFileSync(transPath, `${JSON.stringify(transition)}\n`, "utf-8");
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  return transition;
}

/**
 * 설치 시 1회. 빈 activity.jsonl 을 만들어 첫 fetch 가 404 로 깨지지 않게 하고,
 * 첫 상태를 **note() 로** 기록한다.
 *
 * 왜 state.json 을 직접 안 쓰나: 그러면 전환 줄 없이 state 만 있는 상태가 만들어지고,
 * 그게 바로 짝 규칙이 금지하는 모양이다. 설치 직후만 예외로 두면 "한쪽만 기록된 상태"가
 * 정상으로 보이는 자리가 하나 생기고, 검사는 그 자리를 영영 못 잡는다.
 * 설치도 전환 하나로 친다 — from_node 가 null 인 첫 줄이 그것이다.
 */
export function seed(reportDir, { node, task, now, sessionId }) {
  mkdirSync(reportDir, { recursive: true });
  // 화면이 fetch 하는 jsonl 은 전부 빈 파일로 미리 만든다. 없으면 4초마다 404 가 찍히고,
  // 그 소음 속에서 진짜 오류가 안 보인다.
  for (const name of ["activity.jsonl", "subagents.jsonl", "requests-history.jsonl"]) {
    const p = join(reportDir, name);
    if (!existsSync(p)) writeFileSync(p, "", "utf-8");
  }
  const statePath = join(reportDir, "state.json");
  if (existsSync(statePath)) return readJson(statePath, null);
  note(reportDir, { node, task, now, sessionId });
  return readJson(statePath, null);
}

// ── CLI ────────────────────────────────────────────────────────────────
if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  const slug = (arg("project") ?? activeSlug()).trim();
  const offGraph = arg("off-graph");
  const isOff = offGraph !== undefined || process.argv.includes("--off-graph");
  const node = isOff ? null : arg("node");
  const task = arg("task");
  const now = arg("now");
  if (!slug || (!node && !isOff) || !task || !now) {
    console.error("사용: node scripts/report-note.mjs --node <노드> --task <식별자> --now \"<한 줄>\"");
    console.error("  제품 그래프 밖의 일이면 --node 대신 --off-graph \"<무슨 작업인지>\" 를 준다.");
    console.error(`  --now 는 ${NOW_MAX}자 이내 한 줄이다. 산문 보고를 쓰는 자리가 아니다.`);
    process.exit(2);
  }
  const blockerArgs = argAll("blocker");
  const blockers = process.argv.includes("--clear-blockers")
    ? []
    : blockerArgs.length > 0
      ? blockerArgs.map((s) => {
          const at = s.indexOf("=");
          return at < 0 ? { id: s, label: s } : { id: s.slice(0, at), label: s.slice(at + 1) };
        })
      : undefined;

  const reportDir = join(ROOT, "projects", slug, "report");
  try {
    const t = note(reportDir, { node, task, now, result: arg("result") ?? null, blockers, skill: arg("skill"), offGraph, item: arg("item") ?? null, delayReason: arg("delay-reason") ?? null });
    const { rows } = parseJsonl(readFileSync(join(reportDir, "transitions.jsonl"), "utf-8"));
    console.log(`기록: ${t.from_node ?? "(시작)"} → ${t.to_node ?? "(그래프 밖)"} · ${t.now}${t.result ? ` · ${t.result}` : ""} (전환 ${rows.length}건)`);
  } catch (e) {
    console.error(`기록 거부 — 스키마 위반:\n${e.message}`);
    process.exit(2);
  }
}
