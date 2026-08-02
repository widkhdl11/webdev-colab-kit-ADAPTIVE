#!/usr/bin/env node
// 결정론 스캐폴딩 — 멱등: 있는 파일은 건드리지 않는다. 워킹 스켈레톤으로 시작.
// 프로젝트는 projects/<프로젝트명>/ 에 생성된다.
//   node scripts/scaffold.mjs <프로젝트명>   최초 생성(소문자·숫자·하이픈)
//   node scripts/scaffold.mjs                인자 생략 시 projects/ 아래 프로젝트가 하나면 재생성
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = process.cwd();
const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];

// 대상 프로젝트명 결정: argv 우선, 없으면 projects/ 아래 단일 프로젝트를 재생성
function resolveName() {
  const arg = process.argv[2];
  if (arg) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(arg)) {
      console.error(`프로젝트명은 소문자·숫자·하이픈만 허용: '${arg}'`);
      process.exit(1);
    }
    return arg;
  }
  const projectsDir = join(ROOT, "projects");
  const existing = existsSync(projectsDir)
    ? readdirSync(projectsDir).filter((n) => {
        try { return statSync(join(projectsDir, n)).isDirectory(); } catch { return false; }
      })
    : [];
  if (existing.length === 1) return existing[0];
  if (existing.length === 0) {
    console.error("사용법: node scripts/scaffold.mjs <프로젝트명>  → projects/<프로젝트명>/ 에 골격 생성");
    process.exit(1);
  }
  console.error(`projects/ 아래 프로젝트가 여럿(${existing.join(", ")}). 대상 지정: node scripts/scaffold.mjs <프로젝트명>`);
  process.exit(1);
}

const name = resolveName();
const BASE = join("projects", name);
const write = (path, content) => {
  const p = join(ROOT, BASE, path);
  if (existsSync(p)) return console.log(`  유지: ${BASE}/${path}`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log(`  생성: ${BASE}/${path}`);
};

for (const layer of LAYERS) mkdirSync(join(ROOT, BASE, "src", layer), { recursive: true });

write("package.json", JSON.stringify({
  name, private: true, type: "module",
  scripts: {
    dev: "vite",
    build: "tsc --noEmit && vite build",
    preview: "vite preview",
    // 스켈레톤 단계엔 테스트가 없어도 게이트가 막지 않도록 --passWithNoTests.
    // spec-coverage 게이트가 approved 스펙의 INV 테스트 누락은 별도로 강제한다.
    test: "vitest run --passWithNoTests",
    "test:watch": "vitest",
  },
  dependencies: { "@supabase/supabase-js": "^2.45.0" },
  devDependencies: { typescript: "^5.6.0", vite: "^5.4.0", vitest: "^2.1.0" },
}, null, 2) + "\n");

write("tsconfig.json", JSON.stringify({
  compilerOptions: {
    target: "ES2022", module: "ES2022", moduleResolution: "bundler",
    strict: true, skipLibCheck: true, noEmit: false, outDir: "dist",
    baseUrl: ".", paths: { "@/*": ["src/*"] },
  },
  include: ["src"],
}, null, 2) + "\n");

write("src/app/main.ts", `console.log("walking skeleton: ${name}");\n`);
write("index.html", `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><title>${name}</title></head>\n<body><div id="app"></div><script type="module" src="./dist/app/main.js"></script></body></html>\n`);

// 킷 정본 스펙 템플릿을 프로젝트로 복사 (정본: docs/references/spec-template.md).
// 없으면 조용히 건너뛴다 — 스캐폴딩이 정본 유무에 의존해 깨지지 않게.
const specTemplateSrc = join(ROOT, "docs", "references", "spec-template.md");
if (existsSync(specTemplateSrc)) {
  write("docs/specs/_TEMPLATE.md", readFileSync(specTemplateSrc, "utf8"));
} else {
  console.log("  건너뜀: docs/specs/_TEMPLATE.md (정본 docs/references/spec-template.md 없음)");
}

console.log(`\n스캐폴딩 완료: ${BASE}. 검증: node gates/run-gates.mjs`);
