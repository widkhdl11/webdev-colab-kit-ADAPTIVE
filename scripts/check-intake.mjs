#!/usr/bin/env node
// check-intake.mjs — intake 산출물이 계약대로 나왔는지 판정한다.
//
// 무엇을 지키는 검사인가:
//   들여오기는 "코드에서 읽은 것"과 "사람이 승인한 것"을 섞지 않는 것이 전부다. 섞이면
//   지금 동작하는 버그가 불변식으로 승격되고, 아무도 승인하지 않은 것이 승인된 계약이 된다.
//   그 구분은 문장으로만 있으면 매번 다르게 지켜지므로 여기서 기계로 본다.
//
//   판정 (인자로 slug 를 주면 돈다)
//     I1 스펙 전부 status: draft      approved·parked 가 하나라도 있으면 실패
//     I2 스펙 전부 surfaces: []       표면 판정은 승인할 때 사람이 한다
//     I3 [추정] 집계                  리포트 지표의 원본. 숫자를 손으로 적지 않는다
//     I4 경로 참조 0건                docs 에 소스·하네스 경로가 없다
//     I5 src 부재                     v1 경계 — 코드는 옮기지 않는다
//     I6 필수 산출물                  docs 4종 · workspace 5종
//
//   프로브 (인자 없이도 항상 돈다 · 양방향)
//     S1 심은 status: approved 를 I1 이 잡고, draft 로 되돌리면 안 잡는다
//     S2 심은 surfaces: [auth] 를 I2 가 잡고, [] 는 안 잡는다
//     S3 심은 `scripts/build.mjs` 를 I4 가 잡고, "빌드 스크립트"라는 문장은 안 잡는다
//     S4 심은 src/index.ts 를 I5 가 잡고, 없으면 안 잡는다
//     S5 심은 [추정] 태그 2개를 I3 가 2로 세고, 없으면 0으로 센다
//
// **프로브가 이 파일의 핵심이다.** "위반 0건"이라는 보고와 "검사가 아예 안 돌았다"는 겉이 같다.
// 위반을 일부러 심어 잡히는 것을 보지 않으면 둘을 구분할 수 없다. 그리고 한 방향만 보면
// "전부 잡는다"로 고장난 검사도 초록불이라, 심은 것을 되돌리면 안 잡히는 것까지 본다.
//
// 판정하는 코드는 judge() 하나다 — 프로브도 현행 판정도 같은 함수를 부른다. 검사가 자기
// 사본을 검사하면 실제로 도는 코드는 아무도 밟지 않는다.
//
// 프로브는 전부 임시 디렉터리에서 돈다 — 이 레포의 파일은 하나도 건드리지 않는다.
// (심었다 되돌리는 방식은 중간에 끊기면 더럽혀진 파일이 원본으로 읽힌다)
//
// 사용: node scripts/check-intake.mjs [slug] [--built]
//       --built 는 "이 프로젝트는 이미 짓기 시작했다"는 선언이다(I5 의 방향이 뒤집힌다).

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv.slice(2).find((a) => !a.startsWith("--"));
// --built: 이 프로젝트는 들여오기가 끝나고 이미 짓기 시작했다. I5 의 방향이 뒤집힌다.
const BUILT = process.argv.includes("--built");

const REQUIRED_DOCS = ["PRODUCT.md", "design/design-rules.md", "DECISIONS.md", "BACKLOG.md"];
const REQUIRED_WORKSPACE = [
  "CYCLE.md",
  "PENDING.md",
  "DECISION_CANDIDATES.md",
  "PROGRESS.md",
  "reports/INTAKE_REPORT.md",
];
const ESTIMATE_TAG = "[추정 — 확인 필요]";

// docs 에 있으면 안 되는 경로 참조. 이전 리허설(R1·R3)이 잡는 것과 같은 것을 프로젝트 단위로
// 미리 본다 — 리허설은 한 번에 모든 프로젝트를 판정하므로, 여기서 못 걸러 내면 다른 프로젝트
// 검사까지 같이 빨간불이 된다.
// 목록이 리허설·run-gates 와 사본 관계라는 것은 알고 있다(백로그에 등재). 어긋나도 조용하지는
// 않다 — 들여오기 절차가 이 검사 바로 뒤에 리허설을 돌리므로 그때 걸린다.
const PATH_REFS = [
  { re: /(^|[\s(`"'])(?:\.\.\/)*gates\//, what: "게이트 경로" },
  { re: /(^|[\s(`"'])(?:\.\.\/)*scripts\//, what: "스크립트 경로" },
  { re: /(^|[\s(`"'])(?:\.\.\/)*workspace\//, what: "과정 기록 경로" },
  { re: /(^|[\s(`"'])(?:\.\.\/)*\.claude\//, what: "하네스 설정 경로" },
  { re: /\b(run-gates|graph-stop|spec-coverage|propagate|graph)\.mjs\b/, what: "게이트 파일명" },
  { re: /\b(BEFORE_UI|NO_INNERHTML|risk-surface)\b/, what: "게이트 규칙 이름" },
  { re: /^[ \t]*basis:/, what: "사인오프 해시 필드" },
];

// ── 판정 ─────────────────────────────────────────────────────────────────────
function walk(p, out = []) {
  if (!existsSync(p)) return out;
  for (const n of readdirSync(p)) {
    const f = join(p, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

// 계약 1절대로 읽는다: 줄 맨 앞의 `키:` 만 필드로 세고, 값 뒤의 `#` 주석은 잘라 낸다.
// 같은 키가 두 번 있으면 어느 줄이 이기는지 알 수 없으므로 그 자체를 위반으로 본다.
function readSpecFields(src) {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return { status: "", surfaces: [], dup: [], noFrontmatter: true };
  const lines = fm[1].split(/\r?\n/);
  const dup = [];
  const field = (k) => {
    const hits = lines.filter((l) => new RegExp(`^${k}:`).test(l));
    if (hits.length > 1) dup.push(k);
    return hits.length ? hits[0].slice(k.length + 1).split("#")[0].trim() : null;
  };
  const status = field("status") ?? "";
  const raw = field("surfaces");
  let tokens = [];
  if (raw !== null) {
    const br = raw.match(/^\[([^\]]*)\]/);
    if (br) tokens = br[1].split(",");
    else if (raw) tokens = raw.split(",");
    else {
      // 블록 표기: `surfaces:` 다음 줄부터 `- 값`
      const i = lines.findIndex((l) => /^surfaces:/.test(l));
      for (const line of lines.slice(i + 1)) {
        const li = line.match(/^[ \t]*-[ \t]*([A-Za-z-]+)/);
        if (!li) break;
        tokens.push(li[1]);
      }
    }
  }
  const surfaces = tokens.map((x) => x.trim().replace(/['"]/g, "")).filter(Boolean);
  return { status, surfaces, dup, noFrontmatter: false };
}

// 이 검사의 판정 전부. 프로브도 현행 판정도 이 함수 하나를 부른다.
function judge(projDir) {
  const docsDir = join(projDir, "docs");
  const specDir = join(docsDir, "specs");

  const specs = [];
  if (existsSync(specDir)) {
    for (const n of readdirSync(specDir).filter((x) => x.endsWith(".md"))) {
      const f = join(specDir, n);
      if (statSync(f).isDirectory()) continue;
      specs.push({ name: n, ...readSpecFields(readFileSync(f, "utf-8")) });
    }
  }

  const textFiles = walk(docsDir).filter((f) => /\.(md|html|css|txt|json|ya?ml)$/i.test(f));

  let estimates = 0;
  const pathRefs = [];
  for (const f of textFiles) {
    const src = readFileSync(f, "utf-8");
    estimates += src.split(ESTIMATE_TAG).length - 1;
    src.split(/\r?\n/).forEach((line, i) => {
      for (const { re, what } of PATH_REFS)
        if (re.test(line)) {
          pathRefs.push(`${relative(projDir, f).split("\\").join("/")}:${i + 1} — ${what}`);
          break;
        }
    });
  }

  return {
    specs,
    approved: specs.filter((s) => s.status !== "draft"),
    withSurfaces: specs.filter((s) => s.surfaces.length > 0),
    dupKeys: specs.filter((s) => s.dup.length > 0),
    estimates,
    pathRefs,
    hasSrc: existsSync(join(projDir, "src")),
    missing: [
      ...REQUIRED_DOCS.filter((p) => !existsSync(join(docsDir, p))).map((p) => `docs/${p}`),
      ...REQUIRED_WORKSPACE.filter((p) => !existsSync(join(projDir, "workspace", p))).map((p) => `workspace/${p}`),
    ],
    scanned: textFiles.length,
  };
}

// ── 프로브용 픽스처 ──────────────────────────────────────────────────────────
const SPEC = (status = "draft", surfaces = "[]") =>
  `---\nfeature: 표본\nstatus: ${status}\nsurfaces: ${surfaces}\n---\n\n- INV-X1: 표본 불변식. [추정 — 확인 필요]\n`;

function fixture(dir, { status = "draft", surfaces = "[]", body = "", src = false } = {}) {
  const docs = join(dir, "docs");
  mkdirSync(join(docs, "specs"), { recursive: true });
  mkdirSync(join(docs, "design"), { recursive: true });
  mkdirSync(join(dir, "workspace", "reports"), { recursive: true });
  writeFileSync(join(docs, "specs", "sample.md"), SPEC(status, surfaces));
  for (const p of REQUIRED_DOCS) {
    mkdirSync(dirname(join(docs, p)), { recursive: true });
    writeFileSync(join(docs, p), p === "PRODUCT.md" ? `# 표본\n\n${body}\n` : "# 표본\n");
  }
  for (const p of REQUIRED_WORKSPACE) {
    mkdirSync(dirname(join(dir, "workspace", p)), { recursive: true });
    writeFileSync(join(dir, "workspace", p), "# 표본\n");
  }
  if (src) {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), "export {};\n");
  }
  return dir;
}

const results = [];
const ok = (id, name, pass, why = "") => results.push({ id, name, pass, why });

const probeRoot = mkdtempSync(join(tmpdir(), "intake-probe-"));
try {
  const at = (n, opts) => {
    const dir = join(probeRoot, n);
    mkdirSync(dir, { recursive: true });
    return fixture(dir, opts);
  };

  const planted1 = judge(at("s1-planted", { status: "approved" }));
  const clean1 = judge(at("s1-clean", { status: "draft" }));
  ok("S1", "심은 status: approved 를 잡고, draft 는 안 잡는다",
    planted1.approved.length === 1 && clean1.approved.length === 0,
    `심음=${planted1.approved.length} 멀쩡=${clean1.approved.length}`);

  const planted2 = judge(at("s2-planted", { surfaces: "[auth]" }));
  const clean2 = judge(at("s2-clean", { surfaces: "[]" }));
  ok("S2", "심은 surfaces: [auth] 를 잡고, [] 는 안 잡는다",
    planted2.withSurfaces.length === 1 && clean2.withSurfaces.length === 0,
    `심음=${planted2.withSurfaces.length} 멀쩡=${clean2.withSurfaces.length}`);

  const planted3 = judge(at("s3-planted", { body: "빌드는 scripts/build.mjs 로 돈다." }));
  const clean3 = judge(at("s3-clean", { body: "빌드 스크립트로 번들을 만든다." }));
  ok("S3", "심은 소스 경로를 잡고, 풀어 쓴 문장은 안 잡는다",
    planted3.pathRefs.length === 1 && clean3.pathRefs.length === 0,
    `심음=${planted3.pathRefs.length} 멀쩡=${clean3.pathRefs.length}`);

  const planted4 = judge(at("s4-planted", { src: true }));
  const clean4 = judge(at("s4-clean", { src: false }));
  ok("S4", "심은 src/ 를 잡고, 없으면 안 잡는다",
    planted4.hasSrc === true && clean4.hasSrc === false,
    `심음=${planted4.hasSrc} 멀쩡=${clean4.hasSrc}`);

  // 픽스처의 스펙에 태그가 하나 들어 있다 → 심은 하나를 더하면 2, 안 더하면 1.
  const planted5 = judge(at("s5-planted", { body: `대상 독자는 학생이다. ${ESTIMATE_TAG}` }));
  const clean5 = judge(at("s5-clean", { body: "대상 독자는 학생이다." }));
  ok("S5", "심은 [추정] 태그를 세고, 없으면 안 센다",
    planted5.estimates === 2 && clean5.estimates === 1,
    `심음=${planted5.estimates} 멀쩡=${clean5.estimates}`);
} finally {
  rmSync(probeRoot, { recursive: true, force: true });
}

// ── 현행 판정 ────────────────────────────────────────────────────────────────
let estimates = null;
if (slug) {
  const projDir = join(ROOT, "projects", slug);
  if (!existsSync(projDir)) {
    console.error(`projects/${slug} 가 없다.`);
    process.exit(1);
  }
  const r = judge(projDir);
  estimates = r.estimates;

  ok("I1", `스펙 전부 status: draft (스펙 ${r.specs.length}건)`,
    r.specs.length > 0 && r.approved.length === 0 && r.dupKeys.length === 0,
    r.specs.length === 0 ? "스펙이 0건 — 판정이 아무것도 안 봤다"
      : r.approved.length ? `draft 아님: ${r.approved.map((s) => `${s.name}(${s.status || "값 없음"})`).join(", ")}`
      : r.dupKeys.length ? `키 중복: ${r.dupKeys.map((s) => `${s.name}(${s.dup.join(",")})`).join(", ")}` : "");

  ok("I2", "스펙 전부 surfaces: []", r.withSurfaces.length === 0,
    r.withSurfaces.map((s) => `${s.name}[${s.surfaces.join(",")}]`).join(", "));

  ok("I3", `[추정 — 확인 필요] ${r.estimates}건 (docs 파일 ${r.scanned}개)`, true,
    "이 숫자가 리포트 지표의 원본이다 — 손으로 적지 않는다");

  ok("I4", "docs 에 소스·하네스 경로 참조 0건", r.pathRefs.length === 0,
    r.pathRefs.length ? `${r.pathRefs.length}건:\n     ${r.pathRefs.join("\n     ")}` : "");

  // 들여오기 직후에는 src/ 가 없어야 한다. 그 뒤 그 프로젝트를 짓기 시작하면 src/ 가 생기는 것이
  // 정상이라, 그때는 이 항목이 영구 빨간불이 된다 — 빨간불이 상수가 되면 아무도 안 본다.
  // 그래서 국면을 인자로 받는다. 기계가 알아서 판정하지 않는 이유는, 판정할 신호가 프로젝트
  // 문서에 있어야 하는데 그 폴더는 하네스를 몰라야 하기 때문이다.
  if (BUILT)
    ok("I5", `src/ 존재 (들여오기 이후 — 짓는 중이라 정상)`, true,
      r.hasSrc ? "" : "아직 골격이 없다. 들여오기 직후 상태라면 --built 없이 돌려라");
  else
    ok("I5", "src/ 부재 (v1 경계 — 코드는 옮기지 않는다)", r.hasSrc === false,
      r.hasSrc ? `projects/${slug}/src 가 있다 — 게이트가 이 프로젝트 트리 전체를 매번 보게 된다. ` +
        `이 프로젝트를 이미 짓기 시작했다면 --built 를 붙여 돌린다` : "");

  ok("I6", "필수 산출물 (docs 4종 · workspace 5종)", r.missing.length === 0,
    r.missing.length ? `없음: ${r.missing.join(", ")}` : "");
} else {
  console.log("slug 미지정 — 프로브만 돌았다. 현행 판정: node scripts/check-intake.mjs <slug>");
}

console.log();
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.name}${r.why ? `  — ${r.why}` : ""}`);
  if (!r.pass) failed++;
}
if (estimates !== null) console.log(`\n[추정 — 확인 필요] 남은 항목: ${estimates}건`);
console.log(`\ncheck-intake: ${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 2 : 0);
