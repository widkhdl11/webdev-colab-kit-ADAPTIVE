#!/usr/bin/env node
// 세션 브리핑 — SessionStart 훅과 /status가 호출. 사람과 Claude가 같은 그림으로 시작한다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { GRAPH } from "../graph.mjs";
import { topoSort, isSatisfied, isPending } from "../gates/propagate.mjs";

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
// 위험 표면 예외(⚠)는 게이트를 통과시키는 판단이라 눈에 안 띄면 그대로 굳는다. 세션 시작 때 한 번 보인다.
const riskExempt = ((g.stdout ?? "") + (g.stderr ?? "")).split("\n").filter((l) => l.startsWith("⚠"));

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

// 5.6. 제품 백로그 — 이 프로젝트에서 "지금 안 하기로 한 것". wrap-up 이 쌓고 여기선 건수만 센다(비면 침묵).
//      본문은 안 읽는다 — 항목 형식이 바뀌어도 안 깨지고, 표시는 harness-backlog·PRODUCT 와 같은 `- [ ]` 다.
//      미룬 것을 PROGRESS "대기 중인 결정"에 쌓으면 그 블록이 세션마다 길어져 다섯 줄이 뭉개진다(파일을 가른 이유).
//      경로를 projectDir(=join) 로 조립하지 않는다 — 윈도우에서 `projects\signal/workspace/…` 처럼 섞여 찍힌다.
const BACKLOG = `projects/${active}/workspace/BACKLOG.md`;
const deferred = (read(BACKLOG).match(/^- \[ \]/gm) ?? []).length;

// 6. 그래프 프론티어 — HANDOFF state 에서 '지금 작업할 노드' 파생(dirty + 상류 clean).
let frontierLine = "";
let naLine = "";
let reworkLine = "";
const handoff = read(`${projectDir}/workspace/HANDOFF.md`);
const jm = handoff.match(/```json\s*([\s\S]*?)```/);
if (jm) {
  try {
    const st = JSON.parse(jm[1]);
    const fr = topoSort(GRAPH).filter(
      (n) => isPending(st[n]?.status) && GRAPH[n].depends_on.every((u) => isSatisfied(st[u]?.status))
    );
    frontierLine = fr.length ? fr.join(", ") : "없음 — 전부 clean";
    // rework 는 "아직 안 함"이 아니라 "했다가 취소됨"이다 — 사유까지 보여야 다음 세션이 왜 되돌아왔는지 안다.
    reworkLine = topoSort(GRAPH)
      .filter((n) => st[n]?.status === "rework")
      .map((n) => `${n}(${st[n].reason ?? "사유 없음"})`)
      .join(", ");
    // n/a 노드는 "비어 있음"이 아니라 "안 하기로 한 것"이다 — 사유까지 같이 보여야 판단을 다시 볼 수 있다.
    naLine = topoSort(GRAPH)
      .filter((n) => st[n]?.status === "n/a")
      .map((n) => `${n}(${st[n].reason ?? "사유 없음"})`)
      .join(", ");
  } catch { /* 손상 무시 */ }
}

console.log(`── 세션 브리핑 (${active}) ──`);
console.log(`▣ 대기 중인 결정: ${pending.length > 0 ? pending.join(" / ") : "없음"}`);
console.log(`● 게이트: ${gateLight}`);
for (const l of riskExempt) console.log(l);
if (frontierLine) console.log(`◆ 지금 작업할 노드(프론티어): ${frontierLine}`);
if (reworkLine) console.log(`↺ rework(통과했다가 취소됨): ${reworkLine}`);
if (naLine) console.log(`○ n/a(이번 작업엔 해당 없음): ${naLine}`);
console.log(`↩ 멈춘 지점: ${stopped}`);
console.log(`→ 다음 할 일: ${next}`);
if (principleWarn) console.log(principleWarn);
if (total > 0) console.log(`▤ 필수 기능 진행: ${done}/${total}`);
if (deferred > 0) console.log(`▦ 백로그(미룬 것): ${deferred}건 (${BACKLOG})`);
if (pendingUpgrades > 0) console.log(`⚙ 보류된 하네스 승격: ${pendingUpgrades}건 (docs/references/harness-backlog.md)`);
