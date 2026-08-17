#!/usr/bin/env node
// 검사 대상: dev/.claude/settings.json + dev/.claude/hooks/protect-kit.mjs
//
// 배경: 이 킷(webdeb-colab-kit-ADAPTIVE) 자체의 .claude/settings.json은 세션을 킷 폴더
// 안에서 열었을 때만 읽힌다. 상위 폴더(dev/)에서 세션을 열면 그 설정이 통째로 안 읽혀서
// gates/·graph.mjs·.claude/hooks/·.claude/settings.json 이 무방비가 된다(2026-08-15/16
// 두 차례 실제로 관찰됨). dev/.claude/settings.json 을 신설해 이 킷 경로만 겨냥한 훅으로
// 그 구멍을 막는다 — 다른 프로젝트(특히 이름이 거의 같은 webdev-colab-kit-GRAPH)는
// 건드리지 않아야 한다.
//
// 이 검사는 파일 존재만 보지 않는다 — 훅을 실제로 실행시켜(자식 프로세스, dev/ 를 cwd로)
// ① 이 킷의 보호 경로는 막히고 ② 다른 킷·무관한 프로젝트는 안 막히는지 동작으로 확인한다.
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const KIT_ROOT = process.cwd();                 // 이 스크립트는 킷 안에서 돈다
const DEV_ROOT = resolve(KIT_ROOT, "..");
const KIT_NAME = "webdeb-colab-kit-ADAPTIVE";
const SETTINGS = resolve(DEV_ROOT, ".claude/settings.json");
const HOOK = resolve(DEV_ROOT, ".claude/hooks/protect-kit.mjs");

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!existsSync(SETTINGS)) fail(`${SETTINGS} 없음 — dev/.claude/settings.json 을 아직 안 만들었다.`);
if (!existsSync(HOOK)) fail(`${HOOK} 없음 — dev/.claude/hooks/protect-kit.mjs 를 아직 안 만들었다.`);

let settingsJson;
try {
  settingsJson = JSON.parse(readFileSync(SETTINGS, "utf-8"));
} catch (e) {
  fail(`dev/.claude/settings.json 이 JSON으로 안 읽힌다: ${e.message}`);
}
const registered = JSON.stringify(settingsJson).includes("protect-kit.mjs");
if (!registered) fail(`dev/.claude/settings.json 의 PreToolUse 훅 목록에 protect-kit.mjs 가 없다.`);

// 훅을 실제로 실행 — settings.json이 있는 폴더(dev/)를 cwd로 삼는다(실제 훅 실행 방식과 동일).
function run(toolInput) {
  const payload = JSON.stringify({ tool_input: toolInput });
  const r = spawnSync("node", [HOOK], { cwd: DEV_ROOT, input: payload, encoding: "utf-8" });
  return r.status;
}

const cases = [
  {
    name: "이 킷의 gates/ 파일 Edit",
    input: { file_path: resolve(DEV_ROOT, KIT_NAME, "gates/run-gates.mjs") },
    want: 2,
  },
  {
    name: "이 킷의 .claude/hooks/ 를 bash rm",
    input: { command: `rm -r ${KIT_NAME}/.claude/hooks/` },
    want: 2,
  },
  {
    name: "이 킷의 graph.mjs Edit",
    input: { file_path: resolve(DEV_ROOT, KIT_NAME, "graph.mjs") },
    want: 2,
  },
  {
    name: "이 킷의 무관한 소스 파일 Edit (과차단 금지)",
    input: { file_path: resolve(DEV_ROOT, KIT_NAME, "projects/signal/src/app/page.tsx") },
    want: 0,
  },
  {
    name: "다른 킷(webdev-colab-kit-GRAPH)의 gates/ 파일 Edit — 이 킷 전용이라 통과해야 함",
    input: { file_path: resolve(DEV_ROOT, "webdev-colab-kit-GRAPH/gates/run-gates.mjs") },
    want: 0,
  },
  {
    name: "무관한 프로젝트(study-mate)의 아무 파일 Edit",
    input: { file_path: resolve(DEV_ROOT, "study-mate/src/index.ts") },
    want: 0,
  },
];

let allPass = true;
for (const c of cases) {
  const got = run(c.input);
  const ok = got === c.want;
  if (!ok) allPass = false;
  console.error(`  ${ok ? "✓" : "✗"} ${c.name} — 기대 exit ${c.want}, 실제 ${got}`);
}

if (!allPass) fail("동작 검증 실패 — 위 표에서 ✗ 난 항목을 확인.");

console.error(`✓ dev/.claude/settings.json 이 ${KIT_NAME} 의 보호 경로만 겨냥해서 막는다 ` +
  `(다른 킷·무관한 프로젝트·킷 안 무관한 파일은 안 막힘).`);
process.exit(0);
