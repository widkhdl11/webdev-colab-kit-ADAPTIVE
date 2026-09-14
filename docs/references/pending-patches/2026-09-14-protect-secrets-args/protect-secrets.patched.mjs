#!/usr/bin/env node
// 시크릿 노출 차단 (PreToolUse: Read|Bash|PowerShell)
//
// 2026-09-14 패치 — 명령문 전체가 아니라 **인자**를 본다.
//   전에는 `/\.env(\.[\w.-]+)?\b/` 가 명령문 아무 데나 걸렸다. 그래서
//   `node -e '... process.env.X ...'` 와 `grep '\.env\.example' docs/….md` 가 막혔다.
//   막고 싶은 것(환경파일의 내용을 찍는 것)은 못 막고 정상 작업만 막는 모양이었다.
//   이제 명령을 토큰으로 갈라, **토큰 하나가 환경파일 경로일 때만** 막는다.
//   `process.env` 는 `.env` 앞이 `s` 라 경로 판정을 통과하지 못한다(막히지 않는다).
//
// 그리고 값이 없는 견본 파일(.env.example·.sample·.template)은 시크릿이 아니라 문서다.
//   배포에 필요한 변수 **이름**을 코드 옆에 적는 파일이라 읽고 쓸 수 있어야 한다.
//   ⚠ settings.json 의 `Read(./.env*)` deny 규칙은 이 훅보다 먼저 걸린다 — Read 로 견본을
//     열려면 그 줄도 같이 좁혀야 한다(README 의 「곁들이는 한 줄」 참고).
import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf-8"));
const tool = input.tool_name ?? "";
const path = input.tool_input?.file_path ?? "";
const cmd = input.tool_input?.command ?? "";

const norm = (p) => p.replace(/\\/g, "/");
// 경로의 **마지막 조각**이 .env 또는 .env.<무엇> 일 때만 환경파일이다.
const isEnv = (p) => /(^|\/)\.env(\.[\w.-]+)?$/.test(norm(p));
// 값이 없는 견본은 시크릿이 아니다.
const isTemplate = (p) => /(^|\/)\.env\.(example|sample|template|dist)$/.test(norm(p));
const isSecretFile = (p) => isEnv(p) && !isTemplate(p);

// 명령을 토큰으로 가른다. 셸 구두점을 경계로 삼고 따옴표는 벗긴다 —
// `$(cat .env)` 의 `.env)` 도 `.env` 로 떨어져야 잡힌다.
const tokens = (c) =>
  c
    .split(/[\s;|&()<>{}]+/)
    .map((t) => t.replace(/^['"]+|['"]+$/g, ""))
    .filter(Boolean);

const block = (m) => {
  console.error(`시크릿 보호: ${m}`);
  process.exit(2);
};

if (tool === "Read" && isSecretFile(path)) block(".env 읽기 차단");
if (tool === "Bash" || tool === "PowerShell") {
  const READERS = /\b(cat|less|more|head|tail|nl|grep|rg|type|Get-Content|gc|sort|xxd|od|strings|awk|sed|Select-String|sls)\b/i;
  if (READERS.test(cmd) && tokens(cmd).some(isSecretFile)) block(".env 내용 출력 차단");
  if (/SUPABASE_TOKEN/.test(cmd)) block("SUPABASE_TOKEN 참조 차단");
  if (/\bprintenv\b/.test(cmd)) block("환경변수 덤프 차단");
  if (/(Get-ChildItem|Get-Item|gci|gi|ls|dir)\s+env:/i.test(cmd)) block("env: 덤프 차단");
}
