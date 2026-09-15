#!/usr/bin/env node
//
// report-subagent.mjs — 서브에이전트 시작·종료를 한 줄로 남긴다.
//
// **이 파일이 정본이다.** 설치하면 .claude/hooks/report-subagent.mjs 로 복사되고
// 도는 것은 그 사본이다. 둘이 갈라지면 check-report 가 잡는다.
//
// 이벤트 배선(사용자가 settings.json 에 반영):
//   PreToolUse  (서브에이전트를 띄우는 툴) → start
//   SubagentStop                           → end
//   PostToolUse (같은 툴)                  → 아무것도 안 쓴다
//
// **PostToolUse 는 종료가 아니다.** 그 이벤트는 서브에이전트가 끝난 시점이 아니라 그것을
// 띄우는 툴 호출이 돌아온 시점에 뛴다. 배경으로 도는 에이전트에서는 그게 시작 직후여서,
// start 0.4초 뒤에 end 가 찍히고 화면은 영영 「대기」로 남는다(2026-09-15 실측:
// 리뷰어 둘을 파견했더니 02:49:33 에 end, 실제 종료는 02:54:21·02:55:28 이었다).
// 같은 실측에서 SubagentStop 이 그 두 시각에 에이전트 이름과 함께 뛰는 것을 확인했다.
//
// 어느 이벤트로 왔는지는 hook 입력의 hook_event_name 으로 가른다. 필드명을 추측하지 않고
// 실제 입력에서 읽는다 — 못 읽으면 아무것도 안 쓰고 조용히 끝낸다(exit 0).
//
// 모델 컨텍스트에는 아무것도 넣지 않는다. 실패해도 조용히 끝낸다 —
// 관찰하려고 넣은 것이 관찰 대상을 망가뜨리면 안 된다.

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BRIEF_MAX = 80;

// 서브에이전트를 띄우는 툴의 이름은 하네스마다 다를 수 있다. 이름을 하나로 박지 않고,
// "에이전트 종류처럼 보이는 필드가 입력에 있는가"로 판별한다.
const AGENT_FIELDS = ["subagent_type", "agent_type", "agentType", "subagentType", "agent"];
const PROMPT_FIELDS = ["prompt", "description", "instructions", "task"];

function pick(obj, fields) {
  for (const f of fields) {
    const v = obj?.[f];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function firstLine(text) {
  const line = String(text ?? "").split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const t = line.trim();
  return t.length > BRIEF_MAX ? `${t.slice(0, BRIEF_MAX - 1)}…` : t;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf-8")); } catch { return; }

  const root = input.cwd;
  if (!root) return;
  let slug = "";
  try { slug = readFileSync(join(root, "ACTIVE"), "utf-8").trim(); } catch { return; }
  if (!slug) return;
  const dir = join(root, "projects", slug, "report");
  if (!existsSync(dir)) return; // 설치 안 된 프로젝트는 건드리지 않는다

  const ti = input.tool_input ?? {};
  const event = String(input.hook_event_name ?? "");

  // 에이전트 이름이 없으면 서브에이전트 호출이 아니다. SubagentStop 은 tool_input 이
  // 없을 수 있으므로 입력 전체에서도 찾는다.
  const agent = pick(ti, AGENT_FIELDS) ?? pick(input, AGENT_FIELDS);
  if (!agent) return;

  // PostToolUse 로 온 것은 버린다 — 시작 직후에 뛰는 이벤트라 종료로 쓸 수 없다.
  if (event !== "PreToolUse" && event !== "SubagentStop") return;
  const kind = event === "PreToolUse" ? "start" : "end";
  const brief = kind === "start" ? firstLine(pick(ti, PROMPT_FIELDS) ?? "") : "";

  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, "subagents.jsonl"),
    `${JSON.stringify({ at: new Date().toISOString(), event: kind, agent, brief })}\n`,
    "utf-8",
  );
}

try { main(); } catch { /* 조용히 */ }
process.exit(0);
