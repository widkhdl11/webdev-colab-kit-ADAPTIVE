#!/usr/bin/env node
//
// report-install-hook.mjs — 대시보드 훅들을 settings.json 에 넣은 결과를 **출력만** 한다.
//
//   node scripts/report-install-hook.mjs [--settings <경로>]
//
// 쓰지 않는 이유: `.claude/settings.json` 과 `.claude/hooks/` 는 사용자가 직접 고치는 자리다.
// 그래서 병합된 JSON 을 stdout 으로 내놓고 끝낸다 — 붙이는 것은 사람이 한다.
//
// 병합의 약속:
//   - 기존 hooks 항목을 **하나도 지우지 않는다.**
//   - 같은 명령이 이미 있으면 더하지 않는다(두 번 돌려도 두 벌이 안 생긴다).
//   - matcher 를 넓힐 때도 기존 명령은 그 자리에 그대로 둔다.

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 활동 훅이 볼 툴. 서브에이전트를 띄우는 툴이 여기 없어서 2026-09-14 까지 그 호출이
// 활동 기록에 한 줄도 안 남았다 — 훅이 죽은 게 아니라 matcher 가 좁았다.
export const ACTIVITY_MATCHER = "Edit|Write|MultiEdit|Bash|PowerShell|Task|Agent";
// 서브에이전트를 띄우는 툴 이름은 하네스마다 다르다. 둘 다 걸어 둔다 —
// 훅 자체는 이름이 아니라 "에이전트 종류 필드가 있나"로 판별하므로 헛불려도 조용히 끝난다.
export const SUBAGENT_MATCHER = "Task|Agent";

const cmd = (root, file) => `node "${root.split("\\").join("/")}/.claude/hooks/${file}"`;
export const activityCommand = (root) => cmd(root, "report-activity.mjs");
export const subagentCommand = (root) => cmd(root, "report-subagent.mjs");

function addTo(settings, event, matcher, command) {
  const changes = [];
  settings.hooks = settings.hooks ?? {};
  const list = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
  settings.hooks[event] = list;

  if (list.some((g) => (g.hooks ?? []).some((h) => h.command === command))) return changes;

  const group = matcher === null
    ? list.find((g) => g.matcher === undefined)
    : list.find((g) => g.matcher === matcher);
  if (group) {
    group.hooks = [...(group.hooks ?? []), { type: "command", command }];
    changes.push(`${event}(${matcher ?? "전체"}) 그룹에 명령 하나를 더했다`);
  } else {
    list.push(matcher === null ? { hooks: [{ type: "command", command }] } : { matcher, hooks: [{ type: "command", command }] });
    changes.push(`${event}(${matcher ?? "전체"}) 그룹을 새로 만들었다`);
  }
  return changes;
}

/**
 * 순수 함수. settings 객체를 받아 훅들이 들어간 새 객체를 돌려준다. 입력은 바꾸지 않는다.
 * 반환: { settings, changes } — changes 가 비면 이미 다 들어 있었다는 뜻이다.
 */
export function mergeDashboardHooks(settings, root) {
  const next = JSON.parse(JSON.stringify(settings ?? {}));
  const changes = [];

  // ① 활동 훅: matcher 를 넓힌다. 기존 명령은 그 자리에 그대로 둔다.
  const act = activityCommand(root);
  for (const event of ["PostToolUse"]) {
    for (const g of next.hooks?.[event] ?? []) {
      if (!(g.hooks ?? []).some((h) => h.command === act)) continue;
      if (g.matcher !== ACTIVITY_MATCHER) {
        changes.push(`활동 훅 matcher 를 넓혔다: ${g.matcher} → ${ACTIVITY_MATCHER}`);
        g.matcher = ACTIVITY_MATCHER;
      }
    }
  }
  changes.push(...addTo(next, "PostToolUse", ACTIVITY_MATCHER, act));

  // ② 서브에이전트 훅: 시작과 끝. SubagentStop 은 툴 결과보다 먼저 끝나는 경우를 받는다.
  const sub = subagentCommand(root);
  changes.push(...addTo(next, "PreToolUse", SUBAGENT_MATCHER, sub));
  changes.push(...addTo(next, "PostToolUse", SUBAGENT_MATCHER, sub));
  changes.push(...addTo(next, "SubagentStop", null, sub));

  return { settings: next, changes };
}

/** 옛 이름. 활동 훅 하나만 다루던 때의 호출자를 위해 남긴다. */
export function mergeActivityHook(settings, command, matcher = ACTIVITY_MATCHER) {
  const next = JSON.parse(JSON.stringify(settings ?? {}));
  const changes = addTo(next, "PostToolUse", matcher, command);
  return { settings: next, added: changes.length > 0 };
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  const i = process.argv.indexOf("--settings");
  const path = i >= 0 ? process.argv[i + 1] : join(ROOT, ".claude", "settings.json");
  let current;
  try {
    current = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    console.error(`settings 를 못 읽었다: ${path}\n${e.message}`);
    process.exit(2);
  }
  const { settings, changes } = mergeDashboardHooks(current, ROOT);
  if (changes.length === 0) console.error("이미 다 들어 있다 — 아래 출력은 지금 파일과 같다.");
  else for (const c of changes) console.error(`· ${c}`);
  console.log(JSON.stringify(settings, null, 2));
}
