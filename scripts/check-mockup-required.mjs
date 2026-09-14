#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/graph-stop.mjs, graph.mjs
//
// check-mockup-required.mjs — 시안 0장인 승인이 design 노드를 통과시키는지 검사한다.
//
// 무엇을 지키는 검사인가:
//   `design/page-designer` 가 clean 이 되는 조건은 `design-rules.md` 에 `status: approved`
//   가 있는가 **하나뿐**이다. `docs/design/mockups/*.html` 은 `produces` 에만 있고 조건이
//   아니다 — produces 는 해시를 계산하는 목록이지 판정 기준이 아니다.
//
//   그 신호는 design-rules.md 가 **시안 루프의 결과물일 때만** 맞다. signal2(시안 9장)·
//   wama(3장)는 그랬다. 들여오기(intake)가 다른 저장소의 디자인 문서를 옮겨 approved 를
//   붙이면, 시안 0장인 새 프로젝트가 "이미 승인된 방향의 반복 화면"으로 통과한다.
//   2026-09-05 study-mate 에서 실제로 났다 — 시안 0장인데 design 이 clean 이었고,
//   프론티어가 design 을 건너뛰어 implement 로 내려갔다.
//
//   A 현행     승인 + 시안 0장이면 page-designer 가 dirty 다        ← 붙기 전 실패
//   B 심은위반 빈 시안 파일로는 못 속인다(0바이트도 dirty)            ← 붙기 전 실패
//   C 회귀 X   내용 있는 시안이 있으면 지금처럼 clean 이다             ← 붙기 전후 통과
//   E 실물     이 레포의 시안 있는 프로젝트는 영향받지 않는다          ← 붙기 전후 통과
//   D 패치확인 패치를 적용한 사본에서 A·B 가 통과하고 C 는 유지된다    ← 붙기 전에도 통과
//
// **D 가 이 파일의 핵심이다.** graph.mjs 는 보호 파일이라 사용자가 붙이기 전에는 A·B 를
// 통과시킬 수 없다. D 는 패치를 적용한 사본을 임시 폴더에 만들어 거기서 같은 판정을 돌린다.
// A·B 가 실패하고 D 가 통과하면 "지금은 뚫리고, 이 패치를 붙이면 막힌다"가 코드를 안 읽어도
// 판정된다.
//
// **B 가 A 와 각도가 다르다.** 이 패치의 고장 방향은 "파일이 있기만 하면 통과"다.
// A 만 보면 빈 파일 하나로 우회되는 패치도 초록불이다.
// **C·E 도 각도가 다르다.** 이 패치는 차단을 **더하는** 변경이라 반대 방향의 고장은
// 과차단이다 — 시안을 제대로 그린 프로젝트까지 막으면 그것도 실패다.
//
// 검사하지 않는 것 — 밝혀 둔다:
//   화면이 아예 없는 프로젝트(백엔드 전용 등)를 `--na` 로 선언해 푸는 경로는 픽스처로
//   만들지 않았다. n/a 는 graph-stop 의 다른 분기이고 이 패치가 건드리지 않는다.
//   `design/schema-designer` 가 산출물 0개로 clean 이 되는 것(HANDOFF 의 hash: null)은
//   같은 모양의 구멍이지만 **이 패치의 범위가 아니다** — DB 설계는 시안 승인 뒤에 오는
//   단계라 지금 막으면 순서가 거꾸로 걸린다. 별도 항목으로 남긴다.
//
// 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
//
// 사용: node scripts/check-mockup-required.mjs

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const ok = (id, name, pass, why = "") => results.push({ id, name, pass, why });

// ── 패치 — 이 문자열 쌍이 패치 문서의 내용과 같은 것이다 ──────────────────────
const NEEDLE_LINES = [
  '          frontmatter: { path: "docs/design/design-rules.md", require: "status: approved" },',
  "        },",
  "      },",
];

const REPLACEMENT_LINES = [
  '          frontmatter: { path: "docs/design/design-rules.md", require: "status: approved" },',
  "          // 시안이 0장인 승인은 승인으로 치지 않는다. approved 하나만으로는 \"새 방향인가",
  "          // 반복인가\"를 가르지 못한다 — 그 신호는 design-rules.md 가 시안 루프의 결과물일",
  "          // 때만 맞고, 들여오기가 다른 저장소에서 승인을 가져오면 시안 0장인 새 프로젝트가",
  "          // \"이미 승인된 방향의 반복\"으로 통과한다(2026-09-05 study-mate 에서 실제로 났다).",
  "          // 화면이 없는 프로젝트는 --na 로 선언한다 — 조용히 통과하는 것과 구분되어야 한다.",
  '          exists_nonempty: "docs/design/mockups/*.html",',
  "        },",
  "      },",
];

// graph.mjs 는 CRLF 다. 줄바꿈을 고정한 문자열로 찾으면 조용히 못 찾고, 그러면 "패치가
// 안 붙는다"가 "패치가 틀렸다"와 겉이 같아진다. 파일이 쓰는 줄바꿈으로 맞춰서 찾는다.
function applyPatch(src) {
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const needle = NEEDLE_LINES.join(eol);
  if (!src.includes(needle)) return { ok: false, at: NEEDLE_LINES[0].trim().slice(0, 60) };
  return { ok: true, src: src.replace(needle, REPLACEMENT_LINES.join(eol)) };
}

// ── 픽스처: 킷을 복사한 최소 레포 ────────────────────────────────────────────
//   graph-stop 은 cwd 를 ROOT 로 잡고 거기서 run-gates 를 spawn 하므로 킷이 픽스처 안에 있어야 한다.
const RULES_MD = "---\nstatus: approved\n---\n\n# 시각 기준\n\n종이 #f9f7f3 · 잉크 #262019.\n";
const MOCKUP_HTML = '<!doctype html><html lang="ko"><body><h1>홈 시안</h1></body></html>\n';

// mockups: "none" 시안 없음 / "empty" 빈 파일 하나 / "real" 내용 있는 파일 하나
function fixture(mockups) {
  const dir = mkdtempSync(join(tmpdir(), "mockup-req-"));
  cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
  cpSync(join(ROOT, "graph.mjs"), join(dir, "graph.mjs"));
  writeFileSync(join(dir, "ACTIVE"), "home");
  mkdirSync(join(dir, "projects", "home", "workspace"), { recursive: true });
  mkdirSync(join(dir, "projects", "home", "docs", "design", "mockups"), { recursive: true });
  writeFileSync(join(dir, "projects", "home", "docs", "PRODUCT.md"), "# 프로브 제품\n\n한 줄.\n");
  writeFileSync(join(dir, "projects", "home", "docs", "design", "design-rules.md"), RULES_MD);
  const mp = join(dir, "projects", "home", "docs", "design", "mockups", "home.html");
  if (mockups === "empty") writeFileSync(mp, "");
  if (mockups === "real") writeFileSync(mp, MOCKUP_HTML);
  return dir;
}

// graph-stop 을 픽스처에서 돌리고 HANDOFF 의 page-designer 상태를 읽는다.
function statusOf(mockups, { patched = false } = {}) {
  const dir = fixture(mockups);
  try {
    if (patched) {
      const res = applyPatch(readFileSync(join(dir, "graph.mjs"), "utf-8"));
      if (!res.ok) return { status: null, patchFailedAt: res.at };
      writeFileSync(join(dir, "graph.mjs"), res.src);
    }
    const r = spawnSync(process.execPath, [join(dir, "gates", "graph-stop.mjs")], { cwd: dir, encoding: "utf-8" });
    const out = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
    const syntax = out.match(/^\s*(\w*(?:Syntax|Reference|Type)Error: .+)$/m);
    if (syntax) return { status: null, broken: syntax[1] };
    const hp = join(dir, "projects", "home", "workspace", "HANDOFF.md");
    if (!existsSync(hp)) return { status: null, broken: "HANDOFF 가 안 만들어졌다 (exit " + r.status + ")" };
    const json = readFileSync(hp, "utf-8").match(/```json\r?\n([\s\S]*?)```/);
    if (!json) return { status: null, broken: "HANDOFF 에 json 블록이 없다" };
    return { status: JSON.parse(json[1])["design/page-designer"]?.status ?? null, exit: r.status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const alreadyPatched = readFileSync(join(ROOT, "graph.mjs"), "utf-8").includes('exists_nonempty: "docs/design/mockups/*.html"');
const say = (r) => (r.broken ? "그래프가 못 돈다 — " + r.broken : "page-designer = " + r.status);

// ── 현행 판정 ────────────────────────────────────────────────────────────────
const a = statusOf("none");
ok("A", "현행     승인 + 시안 0장이면 page-designer 가 dirty 다", a.status === "dirty",
  a.status === "clean"
    ? "clean 이다 — 시안을 한 장도 안 그렸는데 통과했다(패치 미적용). D 가 통과하면 이 패치가 막는다"
    : say(a));

const b = statusOf("empty");
ok("B", "심은위반 빈 시안 파일로는 못 속인다", b.status === "dirty",
  b.status === "clean" ? "빈 파일 하나로 통과했다 — 껍데기로 우회된다" : say(b));

const c = statusOf("real");
ok("C", "회귀 X   내용 있는 시안이 있으면 지금처럼 clean 이다", c.status === "clean",
  c.status !== "clean" ? say(c) + " — 원래 통과하던 것이 막혔다" : "");

// ── E: 이 레포의 실물 프로젝트가 영향받는가 ─────────────────────────────────
const counted = readdirSync(join(ROOT, "projects")).map((n) => {
  const d = join(ROOT, "projects", n, "docs", "design", "mockups");
  const files = existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".html")) : [];
  const have = files.filter((f) => readFileSync(join(d, f), "utf-8").trim().length > 0).length;
  return { n, have };
});
const willBreak = counted.filter((p) => p.have === 0);
ok("E", "실물     시안이 있는 프로젝트는 영향받지 않는다",
  counted.some((p) => p.have > 0) && willBreak.length <= 1,
  counted.map((p) => p.n + " " + p.have + "장").join(" · ") +
    (willBreak.length ? " → 이 패치로 dirty 가 되는 것: " + willBreak.map((p) => p.n).join(", ") : ""));

// ── D: 패치를 적용한 사본에서 A·B 가 통과하고 C 가 유지되는가 ───────────────
if (alreadyPatched) {
  const held = a.status === "dirty" && b.status === "dirty" && c.status === "clean";
  ok("D", "패치 확인 이미 적용돼 있다(사본 대조 생략)", held,
    held ? "" : "적용된 것으로 보이는데 A·B·C 가 안 맞는다 — 패치가 반쯤 붙었을 수 있다");
} else {
  const da = statusOf("none", { patched: true });
  const db = statusOf("empty", { patched: true });
  const dc = statusOf("real", { patched: true });
  ok("D", "패치 확인 패치를 적용한 사본에서 A·B 가 통과하고 C 가 유지된다",
    da.status === "dirty" && db.status === "dirty" && dc.status === "clean",
    da.patchFailedAt
      ? '패치가 안 붙는다 — 못 찾은 자리: "' + da.patchFailedAt + '…"'
      : "시안없음=" + (da.status ?? da.broken) + "(dirty 여야) / 빈파일=" + (db.status ?? db.broken) +
        "(dirty 여야) / 시안있음=" + (dc.status ?? dc.broken) + "(clean 이어야)");
}

console.log();
let failed = 0;
for (const r of results) {
  console.log((r.pass ? "✓" : "✗") + " " + r.id + " " + r.name + (r.why ? "  — " + r.why : ""));
  if (!r.pass) failed++;
}
console.log("\ncheck-mockup-required: " + (results.length - failed) + "/" + results.length + " 통과" +
  (alreadyPatched ? "" : "  (패치 미적용 — A·B 가 그 신호이고, D 가 붙이면 막힌다는 근거다)"));
process.exit(failed ? 2 : 0);
