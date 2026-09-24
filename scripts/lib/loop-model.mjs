// loop-model.mjs — 자율 실행 루프(run-loop)의 판정. 파일도 시계도 프로세스도 안 보는 순수 함수만 둔다.
//
// 루프가 답하는 질문은 셋뿐이다: 다음에 무엇을 하나, 멈춰야 하나, 멈췄으면 왜인가.
// 그 셋을 여기 모아 두는 이유는 스크립트(run-loop)·항목 끝 검사(check-wrapup)·
// 결정 답 기록(report-decision)·대시보드가 같은 답을 내야 하기 때문이다. 같은 계산이
// 두 벌이면 한쪽은 "결정 대기"라 하고 다른 쪽은 "다음 항목 진행"이라 하는 날이 온다.
//
// 정본 규약: docs/references/run-loop.md

/** 멈춤 종류. 대시보드와 state.json 의 status 가 이 말을 그대로 쓴다. */
export const LOOP_STOP = ["요청 완료", "결정 대기", "항목 실패", "상한 도달", "리허설 실패", "정지 요청"];
export const LOOP_RUNNING = "실행 중";
export const LOOP_STATUS = [LOOP_RUNNING, ...LOOP_STOP];

/**
 * 설정 기본값. 파일(report/loop/config.json)에 없는 칸은 이 값을 쓴다.
 *
 * - permission_mode 는 **언제나 명시해서 넘긴다.** 안 넘기면 사용자 전역 설정의 기본 모드를
 *   물려받는데, 그 값은 이 레포 밖에서 바뀐다. 무인 실행의 권한이 레포 밖 설정 한 줄에
 *   조용히 달려 있으면 안 된다.
 * - autostart 는 기본 꺼짐. 시험 단계에서는 사람이 직접 띄운다.
 */
export const LOOP_DEFAULTS = Object.freeze({
  max_rounds: 10,
  max_minutes: 120,
  retries_per_item: 1,
  autostart: false,
  permission_mode: "auto",
  max_turns: null,
  rehearsal: true,
  rehearsal_token_limit: 30000,
  // 대화 세션 길이 경고 임계(토큰). 경고 훅(보호 파일)이 이 칸을 읽는다 — 루프 밖 대화용.
  session_warn_tokens: 120000,
  // 테스트가 가짜 프로세스로 바꿔 끼우는 자리. null 이면 ["claude"].
  claude_cmd: null,
  // 항목 끝 검사 6번이 부르는 게이트. 테스트가 바꿔 끼운다.
  gates_cmd: ["node", "gates/run-gates.mjs", "--quick"],
});

const PERMISSION_MODES = ["default", "acceptEdits", "auto", "dontAsk", "plan", "bypassPermissions"];

/** 설정 파일 값을 기본값과 합치고 판정한다. 반환: { config, errors } */
export function mergeLoopConfig(raw) {
  const errors = [];
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const config = { ...LOOP_DEFAULTS };
  for (const [k, v] of Object.entries(src)) {
    if (!(k in LOOP_DEFAULTS)) { errors.push(`모르는 설정 칸: ${k}`); continue; }
    config[k] = v;
  }
  const posInt = (k) => Number.isInteger(config[k]) && config[k] > 0;
  for (const k of ["max_rounds", "max_minutes", "rehearsal_token_limit", "session_warn_tokens"]) {
    if (!posInt(k)) errors.push(`${k} 는 1 이상의 정수다 (지금: ${config[k]})`);
  }
  if (!Number.isInteger(config.retries_per_item) || config.retries_per_item < 0) {
    errors.push(`retries_per_item 은 0 이상의 정수다 (지금: ${config.retries_per_item})`);
  }
  if (config.max_turns !== null && !posInt("max_turns")) errors.push("max_turns 는 null 이거나 1 이상의 정수다");
  if (typeof config.autostart !== "boolean") errors.push("autostart 는 참/거짓이다");
  if (typeof config.rehearsal !== "boolean") errors.push("rehearsal 은 참/거짓이다");
  // bypassPermissions 는 받지 않는다. 무인 루프에서 훅 밖의 권한 확인을 통째로 끄는 값이라,
  // 설정 파일 한 줄로 켜지면 허용 목록(보호 파일)을 둔 의미가 사라진다.
  if (config.permission_mode === "bypassPermissions") errors.push("permission_mode 에 bypassPermissions 는 쓸 수 없다");
  else if (!PERMISSION_MODES.includes(config.permission_mode)) errors.push(`permission_mode 가 알 수 없는 값이다: ${config.permission_mode}`);
  for (const k of ["claude_cmd", "gates_cmd"]) {
    const v = config[k];
    if (v === null && k === "claude_cmd") continue;
    if (!Array.isArray(v) || v.length === 0 || v.some((s) => typeof s !== "string" || s === "")) {
      errors.push(`${k} 는 비지 않은 문자열 배열이다`);
    }
  }
  return { config, errors };
}

/**
 * 항목의 의존. `deps` 가 있으면 그것만, 없으면 **바로 앞 항목 하나**다.
 *
 * 왜 기본이 "앞 항목"인가: 항목 순서는 방향 결정에서 정한 작업 순서다. 순서를 정했다는 것은
 * 대개 앞 것이 끝나야 뒤 것을 한다는 뜻이고, 그렇지 않은 항목만 `deps` 로 풀어 준다.
 * 반대로 기본을 "의존 없음"으로 두면, 적는 걸 잊은 항목이 앞 항목보다 먼저 돈다.
 */
export function itemDeps(items, index) {
  const it = items[index];
  if (Array.isArray(it?.deps)) return it.deps;
  return index > 0 ? [items[index - 1].id] : [];
}

/**
 * 열린 결정 카드가 막는 항목 id 집합.
 *
 * 카드에 `item` 이 있으면 그 항목 하나를, 없으면 **전부**를 막는다. 어느 항목에 걸린
 * 결정인지 모르는 카드를 한 항목에만 걸면, 사실은 전체 방향을 묻는 카드인데 루프가
 * 나머지 항목을 계속 진행한다 — 답을 받고 나서 되돌릴 일이 생긴다.
 */
export function blockedByDecision(items, decision) {
  if (!decision || decision.status !== "대기") return new Set();
  const ids = (items ?? []).map((i) => i.id);
  if (typeof decision.item === "string" && ids.includes(decision.item)) return new Set([decision.item]);
  return new Set(ids);
}

/**
 * 다음에 할 항목.
 *
 * 반환 셋 중 하나:
 *   { kind: "item", item }                     진행할 항목
 *   { kind: "stop", status: "요청 완료" }
 *   { kind: "stop", status: "결정 대기", waiting } 남은 항목 전부가 카드에 (직접·의존으로) 걸렸다
 *
 * `skip` 은 이번 루프에서 이미 포기한 항목 id — 재시도까지 실패한 항목은 여기 들어와 다시 안 고른다.
 */
export function pickNextItem(request, decision, skip = new Set()) {
  const items = Array.isArray(request?.items) ? request.items : [];
  const left = items.filter((i) => !i.done);
  if (left.length === 0) return { kind: "stop", status: "요청 완료" };
  const blocked = blockedByDecision(items, decision);
  const done = new Set(items.filter((i) => i.done).map((i) => i.id));
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.done || blocked.has(it.id) || skip.has(it.id)) continue;
    if (itemDeps(items, i).every((d) => done.has(d))) return { kind: "item", item: it };
  }
  return { kind: "stop", status: "결정 대기", waiting: left.length };
}

/**
 * 새 회차를 열어도 되나. 상한은 회차를 **열기 전에만** 본다 — 항목 중간에 끊지 않는다.
 * 반환: 열어도 되면 null, 아니면 상한 도달 사유 한 줄.
 */
export function limitReason({ roundsDone, startedMs, nowMs, config }) {
  if (roundsDone >= config.max_rounds) return `회차 상한 ${config.max_rounds}회에 닿았다`;
  const min = (nowMs - startedMs) / 60000;
  if (min >= config.max_minutes) return `실행 시간 상한 ${config.max_minutes}분에 닿았다 (${Math.floor(min)}분)`;
  return null;
}

/**
 * 결정 답이 루프를 띄워야 하나. 사람 답이 유일한 방아쇠다 — 에이전트가 스스로 띄우는 길은 없다.
 *
 *   - 설정 autostart 가 꺼져 있으면 언제나 아니다.
 *   - 이미 도는 루프가 있으면 아니다.
 *   - 카드가 `starts_loop` 이고 첫 선택지(착수 쪽)를 골랐으면 띄운다.
 *   - 루프가 「결정 대기」로 멈춰 있으면, 답이 무엇이든 다시 띄운다 — 그 답을 기다리던 것이다.
 */
export function shouldAutostart({ card, answer, loopState, lockAlive, config }) {
  if (!config?.autostart) return false;
  if (lockAlive) return false;
  if (card?.starts_loop === true && Array.isArray(card.answer_options) && answer === card.answer_options[0]) return true;
  return loopState?.status === "결정 대기";
}

/** 루프 state.json 이 대시보드에 띄울 한 줄. 도는 중이면 info, 끝(요청 완료)도 info, 나머지 멈춤은 warn. */
export function loopNotice(loop) {
  if (!loop || !LOOP_STATUS.includes(loop.status)) return null;
  // 리허설 입력이 기준을 넘었으면 같은 줄 끝에 붙인다 — HANDOFF·PROGRESS 가 새 대화에 싣기엔 크다는 신호다.
  const big = loop.rehearsal?.over_limit ? ` · 리허설 입력 약 ${Math.round((loop.rehearsal.tokens ?? 0) / 1000)}k 토큰 — 인수인계 파일이 크다` : "";
  const n = `항목 ${loop.done ?? 0}/${loop.total ?? 0} · ${loop.round ?? 0}회차${big}`;
  if (loop.status === LOOP_RUNNING) {
    const stop = loop.stop_requested ? " · 멈춤 요청됨 — 지금 항목이 끝나면 정지" : "";
    return { tone: "info", text: `루프 실행 중 · ${n}${stop}` };
  }
  if (loop.status === "요청 완료") return { tone: "info", text: `루프 끝 — 요청 완료 · ${n}` };
  const why = loop.stop_detail ? ` (${loop.stop_detail})` : "";
  return { tone: "warn", text: `루프 멈춤 — ${loop.status}${why} · ${n}` };
}

/**
 * 회차 기록의 실패 요약 한 줄. 항목이 끝났거나 카드를 열고 넘어간 회차면 null 이다.
 *
 * 회차 기록에는 끝 검사 id(`wrapup_failed`)·종료 코드·권한 거부가 칸마다 따로 있어서, 사람이 왜
 * 실패했는지 알려면 `<n>.wrapup.json` 까지 열어 맞춰 봐야 한다. 대시보드·알림은 이 한 줄을 그대로 쓴다.
 * 이유는 원인에 가까운 순서로 적는다 — 프로세스가 못 떴으면 끝 검사 실패는 그 결과일 뿐이다.
 *
 * @param r.outcome      회차 결과(「항목 완료」·「결정 카드를 열고 넘어감」·「항목 미완」)
 * @param r.spawnError   프로세스를 못 띄웠을 때의 메시지(없으면 null)
 * @param r.exit         종료 코드
 * @param r.result       parseStreamJson 의 result(없으면 null — 결과 줄을 못 냈다)
 * @param r.checks       끝 검사 결과 [{ id, ok, detail }]
 * @param r.itemDone     회차 뒤 그 항목이 done 인가
 */
export function roundFailureSummary({ outcome, spawnError = null, exit = null, result = null, checks = [], itemDone = false }) {
  if (outcome !== "항목 미완") return null;
  const cut = (s, n = 80) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const parts = [];
  if (spawnError) parts.push(`프로세스를 못 띄웠다: ${cut(spawnError)}`);
  else if (exit !== 0 && exit !== null) parts.push(`종료 코드 ${exit}`);
  else if (exit === null) parts.push("프로세스가 종료 코드 없이 끝났다");
  if (!spawnError && !result) parts.push("결과 줄이 없다");
  else if (result?.is_error) parts.push(`결과가 오류로 끝났다(${result.subtype ?? "?"})`);
  const denials = result?.permission_denials ?? [];
  if (denials.length) parts.push(`권한 거부 ${denials.length}건(${[...new Set(denials)].slice(0, 3).join(", ")})`);
  if (!itemDone) parts.push("항목이 닫히지 않았다");
  for (const c of checks) if (!c.ok) parts.push(`${c.id} ${cut(c.detail || c.name)}`);
  return parts.length ? parts.join(" · ") : "항목 미완 — 원인 기록 없음";
}

/**
 * 회차 지시문을 채운다. 틀은 scripts/loop-item-prompt.md 에 있고 여기서는 자리만 바꾼다.
 * 자리 표시가 남으면 실패한다 — 채우지 못한 지시문을 그대로 보내면 모델이 `{{item_id}}` 를
 * 항목 이름으로 읽는다.
 */
export function fillItemPrompt(template, vars) {
  const out = String(template).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  const left = out.match(/\{\{\w+\}\}/g);
  if (left) throw new Error(`지시문 자리가 안 채워졌다: ${[...new Set(left)].join(", ")}`);
  return out;
}

/**
 * stream-json 출력 한 덩어리에서 회차 결과를 뽑는다.
 *
 * 비대화 모드는 권한을 묻지 않는다 — 허용 안 된 도구는 거부하고 계속 가며, 종료 코드는 0,
 * 결과는 success 다(2026-09-24 실측). 그래서 **거부 목록을 안 읽으면 권한 문제가 안 보인다.**
 * 쓴 도구 목록도 같이 모은다 — 허용 목록(보호 파일)을 만들 재료다.
 */
export function parseStreamJson(text) {
  const tools = [];
  let result = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    let ev;
    try { ev = JSON.parse(s); } catch { continue; }
    if (ev.type === "assistant") {
      for (const c of ev.message?.content ?? []) {
        if (c?.type === "tool_use") tools.push(toolKey(c.name, c.input));
      }
    } else if (ev.type === "result") {
      result = ev;
    }
  }
  return {
    tools,
    result: result && {
      subtype: result.subtype ?? null,
      is_error: result.is_error === true,
      num_turns: result.num_turns ?? null,
      session_id: result.session_id ?? null,
      total_cost_usd: result.total_cost_usd ?? null,
      permission_denials: (result.permission_denials ?? []).map((d) => toolKey(d.tool_name, d.tool_input)),
    },
  };
}

/** 도구 호출 하나를 허용 목록 표기에 가까운 한 줄로. 셸은 명령의 첫 낱말까지만 — 인자까지 적으면 목록이 끝없이 는다. */
export function toolKey(name, input) {
  if ((name === "Bash" || name === "PowerShell") && typeof input?.command === "string") {
    const first = input.command.trim().split(/\s+/)[0] ?? "";
    return `${name}(${first}:*)`;
  }
  return String(name ?? "?");
}
