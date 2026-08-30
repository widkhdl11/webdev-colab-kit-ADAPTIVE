#!/usr/bin/env node
// check-risk-location.mjs — 위험 표면이 '어디서' 감지됐는지가 메시지에 남는지 검사한다.
//
// 왜 필요한가: review 사인오프가 거부될 때 지금은 "코드에 authz 표면이 있는데 security-reviewer 가 없다"
// 까지만 말한다. 표면 이름은 그 코드를 이미 아는 사람에게만 정보다 — 처음 보는 사람은 "그게 어디 있는데"
// 부터 다시 찾아야 하고, 감지 범위가 diff 가 아니라 프로젝트 전체라서 찾기도 쉽지 않다.
// run-gates 는 이미 파일:줄 을 알고 있다(hits 에 담고 EXEMPT 경고에도 찍는다). 신고 줄에서만 버려진다.
//
// 검사 셋:
//   A 신고   run-gates 가 위치를 별도 줄(AT)로 낸다. 이름 줄(DETECTED)의 형식은 그대로다 —
//            이름 줄에 위치를 섞으면 그걸 읽는 옛 graph-stop 이 "authz@경로:줄" 을 표면 이름으로
//            읽어 require_reviewer 대조에 실패한다(= security-reviewer 요구가 조용히 사라진다)
//   B 안내   graph-stop 의 사인오프 대기 안내에 그 위치가 그대로 보인다 (신고→소비까지 이어지나)
//   C 회귀   EXEMPT 경고는 여전히 파일:줄 을 달고 있다 (이 패치가 기존 표시를 안 깨뜨리나)
//
// 검사는 임시 디렉터리에 킷을 복사해 돌린다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용: node scripts/check-risk-location.mjs
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const results = [];
const ok = (name, detail = "") => results.push({ pass: true, name, detail });
const no = (name, detail) => results.push({ pass: false, name, detail });

// 예외 주석을 달아 둔다 — 이 검사가 보려는 건 '차단'이 아니라 '위치 표시'다.
// 예외를 달아도 표면은 그대로 감지된다(run-gates 는 커버·예외 판정보다 먼저 detected 에 넣는다).
const SQL = [
  "-- risk-surface-exempt: authz 검사용 임시 프로젝트다. 인가 모델이 없다",
  "create policy p_read on t for select using (true);",
  "",
].join("\n");

function makeKit() {
  const dir = mkdtempSync(join(tmpdir(), "risk-loc-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  cpSync(join(ROOT, "graph.mjs"), join(dir, "graph.mjs"));
  writeFileSync(join(dir, "ACTIVE"), "probe\n");
  const p = join(dir, "projects", "probe");
  mkdirSync(join(p, "workspace"), { recursive: true });
  mkdirSync(join(p, "docs"), { recursive: true });
  mkdirSync(join(p, "supabase"), { recursive: true });
  mkdirSync(join(p, "src"), { recursive: true });   // run-gates 는 src/ 가 있어야 프로젝트로 친다(파일은 안 둔다)
  writeFileSync(join(p, "docs", "PRODUCT.md"), "# probe\n검사용 임시 프로젝트다.\n");
  // supabase/migrations/ 가 아니라 supabase/ 바로 아래 둔다 — 게이트는 훑지만 그래프의 produces 는
  // 아니라서, 이 파일 때문에 노드가 dirty 로 흔들리지 않는다(상태를 손으로 고정해야 한다).
  writeFileSync(join(p, "supabase", "probe.sql"), SQL);
  return { dir, p };
}
const AT = "projects/probe/supabase/probe.sql:2";   // create policy 가 있는 줄

function runGates(dir) {
  const r = spawnSync("node", [join(dir, "gates", "run-gates.mjs")], { cwd: dir, encoding: "utf-8" });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
function runStop(dir) {
  const r = spawnSync("node", [join(dir, "gates", "graph-stop.mjs")], { cwd: dir, encoding: "utf-8" });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
function handoff(p) {
  const m = readFileSync(join(p, "workspace", "HANDOFF.md"), "utf-8").match(/```json\s*([\s\S]*?)```/);
  return m ? JSON.parse(m[1]) : {};
}
function writeState(p, state) {
  writeFileSync(
    join(p, "workspace", "HANDOFF.md"),
    "# HANDOFF (검사기가 만든 것)\n\n```json\n" + JSON.stringify(state, null, 2) + "\n```\n",
  );
}

// ── A·C: run-gates 의 신고/경고 줄 ────────────────────────────────
{
  const { dir } = makeKit();
  try {
    const { out } = runGates(dir);
    const detected = out.split("\n").find((l) => l.includes("[risk-surface/DETECTED]"));
    const at = out.split("\n").find((l) => l.includes("[risk-surface/AT]"));
    if (!detected) {
      no("A 신고", "DETECTED 줄이 아예 없다 — authz 패턴이 감지되지 않았다(검사 준비 실패)");
    } else if (!at) {
      no("A 신고", `위치 줄(AT)이 없다: ${detected.trim()}`);
    } else if (!at.includes(`authz@${AT}`)) {
      no("A 신고", `AT 줄에 위치가 없다: ${at.trim()}  (기대: authz@${AT})`);
    } else if (detected.includes("@")) {
      // 이름 줄에 위치를 섞으면 옛 graph-stop 이 "authz@경로:줄" 을 표면 이름으로 읽어
      // require_reviewer 대조가 실패한다 — security-reviewer 요구가 조용히 사라진다(실측).
      no("A 신고", `이름 줄에 위치가 섞였다 — 옛 판본에서 표면 이름 대조가 깨진다: ${detected.trim()}`);
    } else {
      ok("A 신고", `${detected.trim()}  ‖  ${at.trim()}`);
    }

    const exempt = out.split("\n").find((l) => l.includes("[risk-surface/EXEMPT]"));
    if (!exempt) no("C 회귀", "EXEMPT 경고가 없다 — 예외 주석이 안 읽혔다(검사 준비 실패)");
    else if (exempt.includes(AT)) ok("C 회귀", "EXEMPT 경고는 여전히 파일:줄 을 달고 있다");
    else no("C 회귀", `EXEMPT 경고에서 위치가 빠졌다: ${exempt.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── B: graph-stop 의 사인오프 대기 안내까지 이어지나 ───────────────
{
  const { dir, p } = makeKit();
  try {
    runStop(dir);                                  // 부트스트랩 — product 해시가 기록된다
    const s = handoff(p);
    // review 만 남기고 상류를 전부 clean 으로 고정한다. 산출물이 없는 노드는 해시가 null 이라
    // 다음 턴의 변경 감지가 건너뛴다 — 상태가 흔들리지 않고 review 가 프론티어에 선다.
    for (const id of Object.keys(s)) if (id !== "product") s[id] = { status: "clean", hash: null };
    s.review = { status: "dirty", hash: null };
    writeState(p, s);
    // 사인오프 마커는 있지만 security-reviewer 가 없다 → 안내가 뜬다.
    writeFileSync(
      join(p, "workspace", "review.md"),
      "---\nstatus: passed\nbasis: 000000000000\nreviewers: [code-reviewer]\n---\n# 검사용\n",
    );
    const { out } = runStop(dir);
    const waiting = out.split("\n").find((l) => l.includes("사인오프 대기"));
    const where = out.split("\n").find((l) => l.includes("감지된 위험 표면"));
    if (!waiting) {
      no("B 안내", `review 사인오프 대기 안내가 안 떴다 — 상태 고정이 실패했다 (출력: ${out.trim().split("\n").slice(-3).join(" / ")})`);
    } else if (!where) {
      no("B 안내", `안내는 떴는데 감지 위치 줄이 없다: ${waiting.trim()}`);
    } else if (!where.includes(AT)) {
      no("B 안내", `위치 줄은 있는데 파일:줄 이 아니다: ${where.trim()}  (기대: ${AT})`);
    } else {
      ok("B 안내", where.trim());
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 보고 ─────────────────────────────────────────────────────────
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.name}  ${r.detail}`);
  if (!r.pass) failed++;
}
console.log(`\ncheck-risk-location: ${results.length - failed}/${results.length} 통과`);
if (failed > 0) {
  console.error("\n실패가 남았다. A 가 실패하면 gates/run-gates.mjs 쪽(detected 를 Map 으로) 이 안 붙었고,");
  console.error("A 는 통과인데 B 가 실패하면 gates/graph-stop.mjs 쪽(@ 로 갈라 읽고 안내에 찍기) 이 안 붙었다.");
  process.exit(1);
}
