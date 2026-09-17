#!/usr/bin/env node
// 세션 브리핑 — SessionStart 훅과 /status가 호출. 사람과 Claude가 같은 그림으로 시작한다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, posix } from "node:path";
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

// 1. 대기 중인 결정 (+ 보류 스펙 건수)
// status 는 frontmatter 의 구조화된 필드다 — 본문에 같은 글자가 나와도 값으로 오인하지 않게
// 블록을 먼저 떼고 줄 시작 앵커로 본다(다른 판정기 셋이 이미 그렇게 한다. retro 2026-08-02).
const pending = [];
let parkedSpecs = 0;
const specsDir = join(ROOT, projectDir, "docs", "specs");
if (existsSync(specsDir)) {
  for (const f of readdirSync(specsDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"))) {
    const fm = read(join(SPECS_REL, f)).match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    if (/^\s*status:\s*draft\b/m.test(fm[1])) pending.push(`스펙 승인 대기: ${f}`);
    // parked = 승인은 됐지만 지금 만들 계약은 아닌 스펙. 대기 중인 '결정'이 아니므로 위 목록에 넣지 않는다 —
    // 대신 건수만 띄운다. 폴더(planned/)로 감추던 때는 아무 데도 안 보여서, 활성화된 뒤에도
    // 그 사실을 아무도 모른 채 낡은 참조가 남았다(2026-08-30 실측 3건).
    else if (/^\s*status:\s*parked\b/m.test(fm[1])) parkedSpecs++;
  }
}
// wrap-up 은 필드를 `- **멈춘 지점**: …` 꼴로 쓴다. 굵기 표시를 걷어내고 읽는다 —
// 이걸 안 하면 `멈춘 지점:` 정규식이 `멈춘 지점**:` 을 못 맞춰 **PROGRESS 에 다 적혀 있는데도
// 브리핑이 "기록 없음"이라고 말한다**(2026-08-10 발견: 그동안 조용히 그랬다).
// PROGRESS 는 편집기에서도 읽는 파일이라 파일 참조를 마크다운 링크로 적는다
// (`[패치 문서](../../../docs/references/...)`). 링크 대상은 **문서 위치 기준**이라
// 터미널에 그대로 찍으면 `../../../` 가 무엇 기준인지 안 보이고 복사해도 안 열린다.
// 그래서 여기서 레포 루트 기준 경로로 바꿔 찍는다 — 편집기에서는 클릭되고,
// 터미널에서는 그대로 열 수 있는 경로가 된다. 링크가 없으면 아무것도 안 바뀐다.
// 외부 URL 과 문서 내 앵커(#)는 경로가 아니므로 글자만 남긴다.
// **경로를 먼저 `/` 로 통일한다.** projectDir 이 join() 산물이라 Windows 에서
// `projects\signal2/workspace/PROGRESS.md` 처럼 섞여 있고, 그대로 세면 `projects\signal2` 가
// 한 조각으로 잡혀 `../` 하나를 덜 먹는다(문서의 링크는 맞는데 브리핑만 엉뚱한 데를 가리킨다).
const PROGRESS_POSIX = PROGRESS.split("\\").join("/");
const PROGRESS_DIR = PROGRESS_POSIX.slice(0, PROGRESS_POSIX.lastIndexOf("/"));
const unlinkRefs = (s) =>
  s.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_whole, text, href) =>
    /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")
      ? text
      : posix.normalize(posix.join(PROGRESS_DIR, href.split("#")[0])));
const progressRaw = read(PROGRESS);
const progress = unlinkRefs(progressRaw.split("**").join(""));

// "현재 상태" 블록의 링크는 브리핑이 읽어 주는 다섯 줄에 그대로 실린다. 대상이 사라지면
// 없는 경로를 가리키면서 있는 것처럼 보인다 — 이 레포가 줄 번호 참조로 이미 여러 번 겪은
// 형태다. 그래서 여기서만 존재를 확인한다(로그 절은 안 본다 — 과거 기록은 낡는 게 정상이다).
const stateBlock = progressRaw.split("## 현재 상태")[1]?.split("## 로그")[0] ?? "";
const deadRefs = [];
for (const m of stateBlock.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
  const href = m[1];
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
  const target = posix.normalize(posix.join(PROGRESS_DIR, href.split("#")[0]));
  if (!existsSync(join(ROOT, target))) deadRefs.push(target);
}
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
// 무엇이 먼저 적혔는지로 판정한다. 예전에는 `또는|→|then` 으로 잘라 첫 조각만 봤는데,
// 구분자가 없는 문장에서는 첫 조각이 곧 문장 전체라 **둘이 같이 언급되기만 하면** 순서와
// 무관하게 떴다. 2026-09-02 에 "화면 먼저, Supabase 는 그 뒤다"라고 적었더니 경고가 떴다 —
// 원칙을 지킨 문장을 원칙 위반이라고 말하는 검사는 무시하는 법부터 가르친다.
// `\b` 는 ASCII 낱말 경계라 한글 앞뒤에서는 절대 안 맞는다 — 예전 판에서 `스키마`·`마이그레이션`·
// `데이터 계층` 세 낱말이 죽어 있었고(영문만 걸렸다) 아무도 몰랐다. 한글은 경계 없이 그대로 찾는다.
const dataRe = /(\b(DB|Supabase|RLS|migration|schema)\b|스키마|마이그레이션|데이터 ?계층)/i;
const uiRe = /(화면|페이지|page|UI|시안|디자인|mockup)/i;
const dataAt = next.search(dataRe);
const uiAt = next.search(uiRe);
const principleWarn =
  dataAt >= 0 && uiAt >= 0 && dataAt < uiAt
    ? "⚠ 순서 점검: '다음 할 일'에 데이터 계층이 화면보다 먼저 적혀 있다 — 원칙은 화면(디자인) 먼저. 화면 국면이 남았다면 순서를 뒤집을 것."
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
const BACKLOG = `projects/${active}/docs/BACKLOG.md`;
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

// 6.5. 기록된 지금 위치 — 프론티어와 **다른 것**이다.
//      프론티어는 「다음에 해야 할 노드」(그래프에서 파생)이고, 이 줄은 「마지막으로 기록된
//      내가 있던 자리」(report/state.json)다. 둘이 어긋나면 기록이 멈춘 것이고, 그 어긋남이
//      보이는 자리가 여기 말고는 없다 — 화면(대시보드)은 켜 놓은 사람만 본다.
//      result 는 마지막 전환 줄에서 읽는다(state 에는 없는 필드다).
let placeLine = "";
try {
  const st = JSON.parse(read(`${projectDir}/report/state.json`));
  const rows = read(`${projectDir}/report/transitions.jsonl`)
    .split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  // 판정에는 **언제**를 같이 붙인다. 날짜 없이 「마지막 판정 통과」만 있으면 며칠 전 판정이
  // 방금 난 것처럼 읽힌다 — 실제로 여기 붙는 값은 대개 옛 줄이다(자동 기록의 result 는 null).
  const resultRow = [...rows].reverse().find((r) => r.result) ?? null;
  const where = st.current_node ?? `그래프 밖(${st.off_graph ?? "사유 없음"})`;
  placeLine =
    `▶ 기록된 지금 위치: ${where} · ${st.task ?? "task 없음"} — ${st.now ?? "기록 없음"}` +
    (resultRow ? ` · 마지막 판정 ${resultRow.result}(${String(resultRow.at).slice(5, 10)}, ${resultRow.task})` : "");
} catch { /* 대시보드를 안 깐 프로젝트 — 조용히 넘어간다 */ }

console.log(`── 세션 브리핑 (${active}) ──`);
if (placeLine) console.log(placeLine);
console.log(`▣ 대기 중인 결정: ${pending.length > 0 ? pending.join(" / ") : "없음"}`);
console.log(`● 게이트: ${gateLight}`);
for (const l of riskExempt) console.log(l);
if (frontierLine) console.log(`◆ 지금 작업할 노드(프론티어): ${frontierLine}`);
if (reworkLine) console.log(`↺ rework(통과했다가 취소됨): ${reworkLine}`);
if (naLine) console.log(`○ n/a(이번 작업엔 해당 없음): ${naLine}`);
console.log(`↩ 멈춘 지점: ${stopped}`);
console.log(`→ 다음 할 일: ${next}`);
if (principleWarn) console.log(principleWarn);
if (deadRefs.length > 0)
  console.log(`⚠ 위 줄이 가리키는 파일이 없다: ${deadRefs.join(" · ")} — PROGRESS 의 링크가 낡았다.`);
if (total > 0) console.log(`▤ 필수 기능 진행: ${done}/${total}`);
if (parkedSpecs > 0)
  console.log(`◇ 보류 스펙(status: parked): ${parkedSpecs}건 — 합의는 됐고 지금 만들 계약이 아닌 것 (${SPECS_REL})`);
if (deferred > 0) console.log(`▦ 백로그(미룬 것): ${deferred}건 (${BACKLOG})`);
if (pendingUpgrades > 0) console.log(`⚙ 보류된 하네스 승격: ${pendingUpgrades}건 (docs/references/harness-backlog.md)`);

// 7. 미커밋 작업 — 남의 미완 작업 위에서 새 작업을 시작하면 diff 가 한 덩어리가 된다.
//    (2026-09-02: v3.2 착수 시 미커밋 192개가 있었고 그중 둘이 그 작업이 고칠 게이트 파일이었다.
//     브리핑은 침묵했다 — git status 를 안 쳤으면 남의 작업과 섞인 채로 커밋했다)
//    소음을 막으려고 임계값을 둔다: 보호 파일이 걸렸거나 건수가 많을 때만 띄운다.
//    판정 레이어가 미커밋인 것은 건수와 무관하게 알린다 — 그 상태에서 낸 패치는 기준선이 없다.
{
  const st = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf-8" });
  const lines = (st.stdout ?? "").split("\n").filter(Boolean);
  const path = (l) => l.slice(3).split(" -> ").pop().split("\\").join("/").replace(/^"|"$/g, "");
  const guarded = lines.filter((l) =>
    /^(gates\/|graph\.mjs|\.claude\/(hooks|settings)|docs\/LESSONS\.md)/.test(path(l)),
  );
  if (guarded.length > 0)
    console.log(
      `✎ 미커밋 ${lines.length}건 — 그중 판정 레이어 ${guarded.length}건: ${guarded.slice(0, 3).map(path).join(", ")}` +
        `${guarded.length > 3 ? " 외" : ""}. 새 작업 전에 커밋할지 정할 것 (기준선이 없으면 내 diff 가 남의 작업과 섞인다)`,
    );
  else if (lines.length >= 30)
    console.log(`✎ 미커밋 ${lines.length}건 — 새 작업 전에 커밋할지 정할 것 (git status)`);
}
