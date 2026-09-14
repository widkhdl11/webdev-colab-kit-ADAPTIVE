#!/usr/bin/env node
// @check-role: standing
//
// check-hooks-on-edit.mjs — `.claude/` 아래를 편집했을 때만 check-hooks 를 돌린다.
//
// 왜 (2026-08-16 관찰 · 2026-09-04 트리거 발동): `check-hooks` 는 도구는 있고 트리거가 없었다.
// 손으로 돌려야 해서, 보호 5개 중 4개가 죽어 있던 것을 한참 뒤에 발견했다. 보류 이유는
// "아직 하네스를 엔지니어링하는 중이라 `.claude/` 를 자주 만지는데 편집마다 2초가 붙으면 느리다"
// 였고, 승격 트리거는 "하네스 변경이 잦아드는 시점". 2026-09-04 에 사용자가 그 시점을 선언했다.
//
// 이 파일이 `check-hooks.mjs` 안이 아니라 따로 있는 이유: settings.json 이 부르는 명령은
// 훅 페이로드를 stdin 으로 받는데, `check-hooks` 는 사람이 손으로도 부르는 검사기다.
// 한 파일이 두 호출 규약을 들면 어느 쪽으로 불렸는지에 따라 동작이 갈린다.
//
// 실패 방향: 입력을 못 읽거나 대상이 `.claude/` 밖이면 **아무 말 없이 통과**한다.
// 편집 뒤에 도는 훅이라 여기서 막아 봐야 편집은 이미 끝났고, 시끄러우면 사람이 훅을 뗀다.
// 반대로 검사가 실제로 실패했으면 exit 2 로 올린다 — 그때는 조용하면 안 되는 자리다.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

/** 편집 대상이 `.claude/` 아래인가. 경로 구분자·상대/절대 어느 쪽으로 와도 같은 답을 낸다. */
export function isClaudeDir(filePath, cwd = process.cwd()) {
  if (typeof filePath !== "string" || filePath.trim() === "") return false;
  const rel = relative(cwd, resolve(cwd, filePath)).split("\\").join("/");
  return rel === ".claude" || rel.startsWith(".claude/");
}

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf-8"));
  } catch {
    return null;   // 훅 입력이 없거나 깨졌다 — 판단할 근거가 없으니 통과시킨다
  }
}

const payload = readPayload();
const target = payload?.tool_input?.file_path ?? "";
if (!isClaudeDir(target)) process.exit(0);

// 중첩 방지 — check-hooks 의 배선 프로브가 이 파일을 다시 부른다.
// 그 프로브만 건너뛰게 표시하고, 배선 판정 자체(파일 읽기)는 중첩 실행에서도 그대로 돈다.
const childEnv = { ...process.env };
childEnv.CHECK_HOOKS_NESTED = "1";
const r = spawnSync(process.execPath, ["scripts/check-hooks.mjs"], {
  encoding: "utf-8",
  env: childEnv,
});
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
const summary = out.split("\n").filter((l) => /통과/.test(l)).pop() ?? "";

if (r.status === 0) {
  console.log(`check-hooks (.claude/ 편집: ${target}) — ${summary.trim() || "통과"}`);
  process.exit(0);
}

// 실패는 Claude 가 읽어야 한다. PostToolUse 에서 종료 코드 2 가 stderr 를 모델에 전달한다.
console.error(`check-hooks 실패 (.claude/ 편집: ${target}) — 새 기능 없이 이것부터 고친다\n${out}`);
process.exit(2);
