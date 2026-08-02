#!/usr/bin/env node
// 결정론 게이트. 위반 시 exit 2 (stderr가 모델에 주입됨)
// 사용: node gates/run-gates.mjs [--quick]  (--quick: tsc/테스트/스펙커버리지 생략)
// 프로젝트는 projects/<이름>/ 에 산다. projects/*/src 를 모두 스캔한다.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const PROJECTS = join(ROOT, "projects");
const QUICK = process.argv.includes("--quick");
const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];
const rank = new Map(LAYERS.map((l, i) => [l, i]));

// 전제 검사: projects/<이름>/src 가 아직 없으면 '검사 대상 없음' → 실패가 아니라 skip(통과).
// 스캐폴드 이전 빈 레포에서 매 Stop 훅마다 실패가 재주입되는 루프를 방지한다.
function findProjectDirs() {
  if (!existsSync(PROJECTS)) return [];
  return readdirSync(PROJECTS)
    .map((n) => join(PROJECTS, n))
    .filter((p) => {
      try {
        return statSync(p).isDirectory() && existsSync(join(p, "src"));
      } catch {
        return false;
      }
    });
}
const projectDirs = findProjectDirs();
if (projectDirs.length === 0) {
  console.log(
    "게이트 skip: projects/<이름>/src 아직 없음 (스캐폴드 전). 구조 생성: node scripts/scaffold.mjs <프로젝트명>",
  );
  process.exit(0);
}

const SECURITY_RULES = [
  {
    rule: "NO_EVAL",
    re: /\beval\s*\(|new\s+Function\s*\(/,
    msg: "eval / new Function 금지 — 임의 코드 실행 벡터",
  },
  {
    rule: "NO_INNERHTML",
    re: /\.innerHTML\s*=|dangerouslySetInnerHTML/,
    msg: "innerHTML 할당 금지 — XSS 벡터",
  },
  {
    rule: "NO_HARDCODED_SECRET",
    re: /(sk-[A-Za-z0-9]{16,}|service_role|SUPABASE_SERVICE_ROLE|(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}['"])/i,
    msg: "하드코딩된 시크릿 — 환경변수로 분리",
  },
  {
    rule: "NO_DOCUMENT_WRITE",
    re: /document\.write\s*\(/,
    msg: "document.write 금지",
  },
];

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}
const layerOf = (rel) => {
  const f = rel.split(sep)[0];
  return LAYERS.includes(f) ? f : null;
};
const sliceOf = (rel) => {
  const p = rel.split(sep);
  return p.length >= 2 ? `${p[0]}/${p[1]}` : null;
};

const errors = [];
let fileCount = 0;

// 1) 프로젝트별 FSD 레이어 + 보안 패턴 정적 검사
for (const projDir of projectDirs) {
  const SRC = join(projDir, "src");
  const resolveTarget = (spec, fromFile) => {
    if (spec.startsWith("@/")) return join(SRC, spec.slice(2));
    if (spec.startsWith(".")) return resolve(dirname(fromFile), spec);
    return null;
  };
  const files = walk(SRC).filter((f) => /\.(ts|tsx|js|jsx|html)$/.test(f));
  fileCount += files.length;

  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    const rel = relative(ROOT, file);
    const relSrc = relative(SRC, file);
    src.split("\n").forEach((t, i) => {
      for (const { rule, re, msg } of SECURITY_RULES) {
        if (re.test(t))
          errors.push(`[security/${rule}] ${rel}:${i + 1} — ${msg}`);
      }
    });

    const fromLayer = layerOf(relSrc);
    if (fromLayer === null) continue;
    const importRe =
      /(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(src)) !== null) {
      const target = resolveTarget(m[1], file);
      if (!target) continue;
      const toLayer = layerOf(relative(SRC, target));
      if (toLayer === null) continue;
      const line = src.slice(0, m.index).split("\n").length;
      if (rank.get(toLayer) < rank.get(fromLayer))
        errors.push(
          `[fsd/UPWARD_IMPORT] ${rel}:${line} — '${fromLayer}'가 상위 '${toLayer}'를 import ('${m[1]}'). 의존은 아래로만`,
        );
      else if (
        rank.get(toLayer) === rank.get(fromLayer) &&
        sliceOf(relSrc) !== sliceOf(relative(SRC, target))
      )
        errors.push(
          `[fsd/CROSS_SLICE] ${rel}:${line} — 같은 레이어의 다른 슬라이스 import ('${m[1]}'). 공유는 아래 레이어로`,
        );
    }
  }
}

// 1'') SQL 보안: security definer 함수는 search_path 를 빈 문자열('')로 고정해야 pg_temp 섀도잉을 막는다.
//      create or replace 는 마지막 정의가 실제 적용본 → 함수명별 '마지막 정의'만 판정(옛 정의 오탐 방지).
for (const projDir of projectDirs) {
  const sqlFiles = walk(join(projDir, "supabase"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const lastDef = new Map();
  for (const file of sqlFiles) {
    const src = readFileSync(file, "utf-8");
    for (const chunk of src
      .split(/create\s+(?:or\s+replace\s+)?function/i)
      .slice(1)) {
      const decl = chunk.split(/\bas\s*\$/i)[0];
      const m = chunk.match(
        /^\s*(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/i,
      );
      if (!m) continue;
      const name = m[1].toLowerCase();
      if (!/security\s+definer/i.test(decl)) {
        lastDef.delete(name);
        continue;
      }
      lastDef.set(name, {
        safe: /set\s+search_path\s*(?:=|to)\s*''/i.test(decl),
        file: relative(ROOT, file),
      });
    }
  }
  for (const [name, { safe, file }] of lastDef)
    if (!safe)
      errors.push(
        `[security/DEFINER_SEARCH_PATH] ${file} — 함수 ${name}(): security definer 는 set search_path 를 빈 문자열('')로 고정해야 pg_temp 섀도잉을 막는다`,
      );
}

function isNextProject(projDir) {
  return ["ts", "js", "mjs"].some((ext) =>
    existsSync(join(projDir, `next.config.${ext}`)),
  );
}

// 1') 디자인 국면 강제 (아티팩트 의존): UI 레이어(pages/widgets) 작업은
//     그 프로젝트의 승인된 design-rules.md(status: approved)를 선행해야 한다.
//     - 트리거: projects/<이름>/src/{pages,widgets} 에 파일이 생김 = 화면 작업 시작
//     - 선행 X: projects/<이름>/docs/design/design-rules.md 존재 + status: approved
//     app/main.ts(부트스트랩)·shared/ui/tokens.css(디자인 산출물)는 트리거 아님 → 안 막음.
//     UI 파일이 없으면 조용히 통과(루프 없음). --quick 에서도 돌아 편집 즉시 차단.
function firstUiFile(projDir) {
  for (const layer of ["pages", "widgets"]) {
    const hit = walk(join(projDir, "src", layer)).find((f) =>
      /\.(ts|tsx|jsx|css|html)$/.test(f),
    );
    if (hit) return relative(ROOT, hit);
  }
  if (!isNextProject(projDir)) return null;

  // Next App Router: 화면이 src/app 에 산다. 단 레이어를 통째로 보면 과차단 —
  // root layout·providers·전역 CSS 는 부트스트랩이지 화면이 아니다.
  // 그래서 라우트 화면(page.*)만 본다.
  const routes = walk(join(projDir, "src", "app")).filter((f) =>
    /(^|[\\/])page\.(tsx|jsx|ts|js)$/.test(f),
  );
  // 예외: 라우트 화면이 딱 1장이면 '워킹 스켈레톤'으로 보고 넘어간다.
  // App Router 는 page.* 없이는 라우트가 404 라, 이 예외가 없으면 배포 검증용
  // 스켈레톤조차 못 만든다(디자인 국면 전에 만드는 게 정상인 물건).
  // 2장째가 생기거나 pages·widgets 에 파일이 생기면 = 화면 작업이 실제로 시작된 것.
  if (routes.length >= 2) return relative(ROOT, routes[0]);
  return null;
}
function designApproved(projDir) {
  // const p = join(projDir, "design-rules.md");
  const p = join(projDir, "docs", "design", "design-rules.md");
  // return existsSync(p) && /^---[\s\S]*?status:\s*approved[\s\S]*?---/.test(readFileSync(p, "utf-8"));
  if (!existsSync(p)) return false;
  const src = readFileSync(p, "utf-8");
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/); // frontmatter 블록만
  return !!fm && /^\s*status:\s*approved\b/m.test(fm[1]);
}
for (const projDir of projectDirs) {
  const ev = firstUiFile(projDir);
  if (ev && !designApproved(projDir)) {
    // const drPath = relative(ROOT, join(proㅇjDir, "design-rules.md"));
    const drPath = relative(
      ROOT,
      join(projDir, "docs", "design", "design-rules.md"),
    );
    errors.push(
      `[design/BEFORE_UI] ${ev} — UI 레이어 작업이 시작됐는데 ${drPath} 가 없거나 status: approved 아님. ` +
        `UI 구현 전 디자인 국면(design-interview→시안→checkpoint→design-rules 승인) 필요.`,
    );
  }
}

if (!QUICK) {
  // 2) 프로젝트별 tsc + 테스트 (각 프로젝트 디렉터리를 cwd로)
  for (const projDir of projectDirs) {
    const label = relative(ROOT, projDir);
    if (existsSync(join(projDir, "tsconfig.json"))) {
      const r = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
        cwd: projDir,
        encoding: "utf-8",
        timeout: 120000,
        shell: true,
      });
      if (r.error) {
        errors.push(
          `[tsc/SPAWN] ${label}: tsc 실행 실패: ${r.error.code} — Node에서 npx 실행 불가(shell 옵션 확인)`,
        );
      } else if (r.status !== 0) {
        const out = (r.stdout ?? "") + (r.stderr ?? "");
        const re = /^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm;
        let m,
          found = false;
        while ((m = re.exec(out)) !== null) {
          errors.push(`[tsc/${m[3]}] ${label}/${m[1]}:${m[2]} — ${m[4]}`);
          found = true;
        }
        if (!found) errors.push(`[tsc/FAIL] ${label}: ${out.slice(0, 300)}`);
      }
    }
    const pkgPath = join(projDir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.test) {
        const t = spawnSync("npm", ["test", "--silent"], {
          cwd: projDir,
          encoding: "utf-8",
          timeout: 300000,
          shell: true,
        });
        if (t.status !== 0)
          errors.push(
            `[test/FAIL] ${label}: npm test 실패:\n${((t.stdout ?? "") + (t.stderr ?? "")).slice(-800)}`,
          );
      }
    }
  }
  // 3) 스펙 커버리지: approved 스펙의 모든 INV는 테스트가 참조해야 한다
  const sc = spawnSync("node", [join(ROOT, "gates", "spec-coverage.mjs")], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  if (sc.status !== 0)
    errors.push(...(sc.stderr ?? "").trim().split("\n").filter(Boolean));
}

if (errors.length > 0) {
  console.error(
    `게이트 실패 ${errors.length}건. 새 기능 추가 금지, 아래 위반만 수정:\n` +
      errors.slice(0, 30).join("\n"),
  );
  process.exit(2);
}
console.log(
  `게이트 통과 (${fileCount}개 파일, ${projectDirs.length}개 프로젝트${QUICK ? ", quick" : ""})`,
);
