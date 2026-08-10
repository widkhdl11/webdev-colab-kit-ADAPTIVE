#!/usr/bin/env node
// 세션 브리핑 — SessionStart 훅과 /status가 호출. 사람과 Claude가 같은 그림으로 시작한다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { GRAPH } from "../graph.mjs";
import { topoSort } from "../gates/propagate.mjs";

const ROOT = process.cwd();
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf-8") : "");

// 0. 활성 프로젝트 — 루트 ACTIVE 파일이 가리킨다(한 줄, 프로젝트 이름).
//    ACTIVE 가 없거나 projects/<이름>/ 이 아직 없으면: 스캐폴드 전 상태로 보고 안내 후 정상 종료(exit 0).
//    (게이트의 '검사 대상 없음 → skip' 패턴과 동일 — 빈 레포에서 매 세션 에러로 죽지 않게.)
const active = read("ACTIVE").trim();
const projectDir = active ? join("projects", active) : "";
if (!active || !existsSync(join(ROOT, projectDir))) {
  console.log("── 세션 브리핑 ──");
  console.log("활성 프로젝트 없음 — kickoff로 시작하세요. (루트 ACTIVE 파일에 프로젝트 이름 한 줄을 적으면 브리핑이 붙습니다.)");
  process.exit(0);
}

// 활성 프로젝트 기준 경로
const PROGRESS = `${projectDir}/workspace/PROGRESS.md`;
const PRODUCT = `${projectDir}/docs/PRODUCT.md`;
const SPECS_REL = `${projectDir}/docs/specs`;

// 1. 대기 중인 결정
const pending = [];
const specsDir = join(ROOT, projectDir, "docs", "specs");
if (existsSync(specsDir)) {
  for (const f of readdirSync(specsDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"))) {
    if (/status:\s*draft/.test(read(join(SPECS_REL, f)))) pending.push(`스펙 승인 대기: ${f}`);
  }
}
// wrap-up 은 필드를 `- **멈춘 지점**: …` 꼴로 쓴다. 굵기 표시를 걷어내고 읽는다 —
// 이걸 안 하면 `멈춘 지점:` 정규식이 `멈춘 지점**:` 을 못 맞춰 **PROGRESS 에 다 적혀 있는데도
// 브리핑이 "기록 없음"이라고 말한다**(2026-08-10 발견: 그동안 조용히 그랬다).
const progress = read(PROGRESS).split("**").join("");
const pendingBlock = progress.match(/대기 중인 결정:\s*(.+)/);
if (pendingBlock && !/없음/.test(pendingBlock[1])) pending.push(pendingBlock[1].trim());

// 2. 게이트 신호등
const g = spawnSync("node", [join(ROOT, "gates", "run-gates.mjs"), "--quick"], { cwd: ROOT, encoding: "utf-8" });
const gateLight = g.status === 0 ? "통과" : "실패 — 새 작업 전에 복구 필요";

// 3~4. 멈춘 지점 / 다음 할 일
const stopped = progress.match(/멈춘 지점:\s*(.+)/)?.[1]?.trim() ?? "(기록 없음 — 첫 세션이거나 wrap-up 누락)";
const next = progress.match(/다음 할 일:\s*(.+)/)?.[1]?.trim() ?? "(기록 없음)";

// 4.5. 원칙 가드 — "화면(디자인) 먼저, 그다음 DB/구현" (CLAUDE.md·design-drafting.md).
// "다음 할 일"의 첫 옵션이 데이터 계층인데 화면 대안이 함께 적혀 있으면(= 재량적 순서),
// 순서가 원칙과 어긋날 수 있으니 경보한다. DB가 유일 단계면(화면 언급 없음) 발화하지 않는다.
// 이 가드는 순서만 본다 — 화면 국면의 완료 여부까지 판정하지 않으니, 경보 시 사람이 확인한다.
const firstOption = next.split(/또는|→|then/i)[0];
const dataRe = /\b(DB|Supabase|RLS|migration|스키마|schema|마이그레이션|데이터 ?계층)\b/i;
const uiRe = /(화면|페이지|page|UI|시안|디자인|mockup)/i;
const principleWarn =
  dataRe.test(firstOption) && uiRe.test(next)
    ? "⚠ 순서 점검: '다음 할 일' 1순위가 데이터 계층인데 화면 대안이 함께 있음 — 원칙은 화면(디자인) 먼저. 화면 국면이 남았다면 순서를 뒤집을 것."
    : "";

// 5. 좌표
const plan = read(PRODUCT);
const done = (plan.match(/- \[x\]/g) ?? []).length;
const total = done + (plan.match(/- \[ \]/g) ?? []).length;

// 5.5. 하네스 백로그 — 보류된 업그레이드가 있으면 리마인드(비면 침묵). 승격 트리거는 retro가 판정.
const backlog = read("docs/references/harness-backlog.md");
const pendingUpgrades = (backlog.match(/^- \[ \]/gm) ?? []).length;

// 6. 그래프 프론티어 — HANDOFF state 에서 '지금 작업할 노드' 파생(dirty + 상류 clean).
let frontierLine = "";
const handoff = read(`${projectDir}/workspace/HANDOFF.md`);
const jm = handoff.match(/```json\s*([\s\S]*?)```/);
if (jm) {
  try {
    const st = JSON.parse(jm[1]);
    const fr = topoSort(GRAPH).filter(
      (n) => st[n]?.status === "dirty" && GRAPH[n].depends_on.every((u) => st[u]?.status === "clean")
    );
    frontierLine = fr.length ? fr.join(", ") : "없음 — 전부 clean";
  } catch { /* 손상 무시 */ }
}

console.log(`── 세션 브리핑 (${active}) ──`);
console.log(`▣ 대기 중인 결정: ${pending.length > 0 ? pending.join(" / ") : "없음"}`);
console.log(`● 게이트: ${gateLight}`);
if (frontierLine) console.log(`◆ 지금 작업할 노드(프론티어): ${frontierLine}`);
console.log(`↩ 멈춘 지점: ${stopped}`);
console.log(`→ 다음 할 일: ${next}`);
if (principleWarn) console.log(principleWarn);
if (total > 0) console.log(`▤ 필수 기능 진행: ${done}/${total}`);
if (pendingUpgrades > 0) console.log(`⚙ 보류된 하네스 승격: ${pendingUpgrades}건 (docs/references/harness-backlog.md)`);
