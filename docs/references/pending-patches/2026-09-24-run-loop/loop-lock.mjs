#!/usr/bin/env node
// loop-lock.mjs — PreToolUse 훅. 자율 실행 루프가 도는 동안 **대화 세션**이 제품 파일을 못 고치게 막는다.
//
// 왜: 루프 회차와 대화 세션이 같은 코드를 만지면 커밋과 그래프 상태가 섞인다. 어느 커밋이 어느 항목의
// 것인지, HANDOFF 가 누구의 상태인지 아무도 모르게 된다.
//
// 막는 것 (살아 있는 루프 잠금 projects/<이름>/report/loop.lock 이 있을 때만):
//   - 그 프로젝트의 제품 파일 편집 — projects/<이름>/ 아래에서 docs/·workspace/·report/ 를 뺀 곳
//   - 셸 명령이 그 제품 파일에 쓰는 것(리다이렉트·sed -i·tee·rm·mv·cp)
//   - git 의 색인·브랜치를 바꾸는 명령(add·commit·stash·reset·checkout·restore·merge·rebase·pull·cherry-pick)
//     — 루프 회차가 커밋하는 사이에 끼어들면 어느 회차의 커밋인지 섞인다
// 막지 않는 것: 킷 파일(scripts·.claude·docs/references 등)·프로젝트 docs·카드 답(report/)·읽기 전부.
// 루프 자신의 회차는 환경 변수 KIT_RUN_LOOP 로 구별한다. 훅은 claude 가 띄우므로 대화 안의 셸 명령이
// 이 값을 바꿔 훅에 넘길 수 없다.
//
// 잠금이 남았는데 프로세스가 없으면(비정상 종료) 막지 않는다 — 막힌 채로 풀 방법이 없어진다.
// 정리는 node scripts/run-loop.mjs --stop.
//
// 정본: docs/references/run-loop.md 2절

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
if (process.env.KIT_RUN_LOOP) process.exit(0);

let input = {};
try { input = JSON.parse(readFileSync(0, "utf-8")); } catch { process.exit(0); }
const ti = input.tool_input ?? {};

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

const projects = join(ROOT, "projects");
const locked = [];
if (existsSync(projects)) {
  for (const slug of readdirSync(projects)) {
    const p = join(projects, slug, "report", "loop.lock");
    if (!existsSync(p)) continue;
    try {
      const lock = JSON.parse(readFileSync(p, "utf-8"));
      if (alive(lock.pid)) locked.push({ slug, lock });
    } catch { /* 깨진 잠금은 잠금이 아니다 */ }
  }
}
if (locked.length === 0) process.exit(0);

const posix = (s) => String(s ?? "").split("\\").join("/");
const productRe = (slug) => new RegExp(`(^|[\\s"'=/])projects/${slug}/(?!(docs|workspace|report)/)[^\\s"'|;&<>]+`);

function block(slug, lock, what) {
  process.stderr.write(
    `자율 실행 루프가 도는 중이다 (프로젝트 ${slug} · 프로세스 ${lock.pid} · 항목 ${lock.item ?? "?"}).\n` +
    `대화 세션은 지금 ${what} 할 수 없다 — 루프 회차와 커밋·그래프 상태가 섞인다.\n` +
    "킷 파일·프로젝트 docs·결정 카드 답은 된다. 멈추려면: node scripts/run-loop.mjs --stop (지금 항목이 끝나면 멈춘다)\n",
  );
  process.exit(2);
}

const file = ti.file_path ?? ti.notebook_path ?? null;
if (file) {
  const rel = posix(relative(ROOT, resolve(input.cwd ?? ROOT, file)));
  for (const { slug, lock } of locked) {
    if (rel.startsWith(`projects/${slug}/`) && !/^projects\/[^/]+\/(docs|workspace|report)\//.test(rel)) {
      block(slug, lock, `제품 파일(${rel})을 고칠`);
    }
  }
  process.exit(0);
}

const cmd = posix(ti.command ?? "");
if (cmd) {
  const gitMutates = /\bgit\s+(?:-c\s+\S+\s+)*(add|commit|stash|reset|checkout|restore|merge|rebase|pull|cherry-pick|switch|am|apply)\b/;
  const writes = /(>>?|\bsed\s+-i|\btee\b|\brm\b|\bmv\b|\bcp\b|\btouch\b|Set-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item)/;
  for (const { slug, lock } of locked) {
    if (gitMutates.test(cmd)) block(slug, lock, "git 색인·브랜치를 바꿀");
    if (writes.test(cmd) && productRe(slug).test(cmd)) block(slug, lock, "셸 명령으로 제품 파일에 쓸");
  }
}
process.exit(0);
