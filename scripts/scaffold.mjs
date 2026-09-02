#!/usr/bin/env node
// 결정론 스캐폴딩 — 멱등: 있는 파일은 건드리지 않는다. 워킹 스켈레톤으로 시작.
// 프로젝트는 projects/<프로젝트명>/ 에 생성된다.
//   node scripts/scaffold.mjs <프로젝트명>              최초 생성(소문자·숫자·하이픈)
//   node scripts/scaffold.mjs                          인자 생략 시 projects/ 아래 프로젝트가 하나면 재생성
//   node scripts/scaffold.mjs <이름> --stack <프로파일>   판정을 덮어쓴다(문서가 아직 없을 때만)
//
// 골격은 아키텍처 프로파일마다 다르다(docs/references/architectures/).
// 스택 가정을 코드에 숨기지 않고 먼저 판정하고 분기한다 — architectures/README.md 의 규칙.
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = process.cwd();

// ── 인자 ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const stackIdx = argv.indexOf("--stack");
const stackArg = stackIdx >= 0 ? argv[stackIdx + 1] : undefined;
// --stack 이 없으면 stackIdx 가 -1 이라 stackIdx+1 이 0 이 된다.
// 그대로 제외 조건에 쓰면 0번 인자(프로젝트명)를 --stack 의 값으로 오인해 지운다.
const stackValueIdx = stackIdx >= 0 ? stackIdx + 1 : -1;
const positional = argv.filter((a, i) => !a.startsWith("--") && i !== stackValueIdx);

// 대상 프로젝트명 결정: argv 우선, 없으면 projects/ 아래 단일 프로젝트를 재생성
function resolveName() {
  const arg = positional[0];
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
const ABS = join(ROOT, BASE);
const write = (path, content) => {
  const p = join(ABS, path);
  if (existsSync(p)) return console.log(`  유지: ${BASE}/${path}`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log(`  생성: ${BASE}/${path}`);
};

// ── 프로파일 판정 ─────────────────────────────────────────────────────────────
// 근거는 확실한 것만 쓴다(문서의 링크 · 설정 파일 존재). 폴더 이름 추측으로 갈라내지 않는다.
// 기본값은 킷 기본형 vite-fsd — 판정에 실패해도 새 스택을 잘못 막지는 않는다.
function nextConfigOnDisk() {
  return ["ts", "js", "mjs"].find((ext) => existsSync(join(ABS, `next.config.${ext}`)));
}

// docs/tech-stack.md 는 인터뷰에서 합의된 스택이 적히는 자리다(setup 스킬 5단계).
// 거기 걸린 architectures/<이름>.md 링크가 프로파일 이름이다.
function profileFromTechStack() {
  const p = join(ABS, "docs", "tech-stack.md");
  if (!existsSync(p)) return null;
  for (const m of readFileSync(p, "utf8").matchAll(/architectures\/([a-z0-9-]+)\.md/g)) {
    if (m[1] in PROFILES) return m[1];   // README.md 같은 비프로파일 링크는 건너뛴다
  }
  return null;
}

function resolveProfile() {
  if (stackArg) {
    if (!(stackArg in PROFILES)) {
      console.error(`모르는 프로파일: '${stackArg}'. 있는 것: ${Object.keys(PROFILES).join(" · ")}`);
      process.exit(1);
    }
    return { profile: stackArg, why: "--stack 인자" };
  }

  const fromDoc = profileFromTechStack();
  const nextCfg = nextConfigOnDisk();

  // 문서와 디스크가 어긋나면 조용히 한쪽을 고르지 않는다 — 사람이 봐야 하는 상태다.
  // (한쪽을 골라 버리면 잘못된 골격이 깔리고, 왜 그렇게 됐는지 나중에 추적이 안 된다)
  if (fromDoc && nextCfg && fromDoc !== "nextjs-fsd") {
    console.error(
      `판정이 어긋난다 — 어느 쪽이 맞는지 사람이 정해야 한다.\n` +
      `  문서: ${BASE}/docs/tech-stack.md 가 '${fromDoc}' 를 가리킨다\n` +
      `  디스크: ${BASE}/next.config.${nextCfg} 가 있다(= Next 프로젝트)\n` +
      `  한쪽을 고친 뒤 다시 돌리거나, --stack <프로파일> 로 지정한다.`,
    );
    process.exit(1);
  }

  if (fromDoc) return { profile: fromDoc, why: `${BASE}/docs/tech-stack.md` };
  if (nextCfg) return { profile: "nextjs-fsd", why: `next.config.${nextCfg} 존재` };
  return { profile: "vite-fsd", why: "기본값(tech-stack.md 없음)" };
}

// ── 프로파일별 골격 ───────────────────────────────────────────────────────────
const PROFILES = {
  // 킷 기본형. SPA, 화면은 src/pages.
  "vite-fsd": {
    layers: ["app", "pages", "widgets", "features", "entities", "shared"],
    emit() {
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
        dependencies: { "@supabase/supabase-js": "^2.112.4" },
        devDependencies: { typescript: "^7.0.2", vite: "^8.2.2", vitest: "^4.1.11" },
      }, null, 2) + "\n");

      write("tsconfig.json", JSON.stringify({
        compilerOptions: {
          target: "ES2022", module: "ES2022", moduleResolution: "bundler",
          strict: true, skipLibCheck: true, noEmit: false, outDir: "dist",
          // baseUrl 은 TypeScript 7 에서 삭제됐다(TS5102). 넣으면 tsc 가 바로 에러다.
          // paths 는 이제 tsconfig 파일 위치 기준으로 해석되므로 baseUrl 없이 그대로 쓴다.
          paths: { "@/*": ["./src/*"] },
        },
        include: ["src"],
      }, null, 2) + "\n");

      write("src/app/main.ts", `console.log("walking skeleton: ${name}");\n`);
      write("index.html", `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><title>${name}</title></head>\n<body><div id="app"></div><script type="module" src="./dist/app/main.js"></script></body></html>\n`);
    },
  },

  // Next App Router + FSD. 화면은 src/app, pages 레이어 없음.
  // 상세·게이트 함의: docs/references/architectures/nextjs-fsd.md
  "nextjs-fsd": {
    // pages 를 안 만든다 — 라우팅은 src/app 에 통일한다(프로파일 「폴더 구조」).
    // 전역 LAYERS 에서 pages 를 빼는 게 아니라 이 프로젝트가 안 만들 뿐이다(빈 레이어는 위반 아님).
    layers: ["app", "widgets", "features", "entities", "shared"],
    emit() {
      write("package.json", JSON.stringify({
        name, private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
          typecheck: "tsc --noEmit",
          // 스켈레톤 단계엔 테스트가 없어도 게이트가 막지 않도록 --passWithNoTests.
          test: "vitest run --passWithNoTests",
          "test:watch": "vitest",
        },
        dependencies: {
          next: "^16.3.3", react: "^19.2.8", "react-dom": "^19.2.8",
          "@supabase/supabase-js": "^2.112.4",
        },
        devDependencies: {
          // Tailwind 4 는 PostCSS 플러그인이 별도 패키지(@tailwindcss/postcss)이고
          // autoprefixer 를 안 쓴다(v4 가 직접 처리). v3 설정을 그대로 두면 빌드가 깨진다.
          "@tailwindcss/postcss": "^4.3.3",
          "@types/node": "^26.4.0", "@types/react": "^19.2.18", "@types/react-dom": "^19.2.5",
          // jsdom 은 30 이 최신이지만 Node ^24.15.0 이상을 요구한다(설치 때 EBADENGINE 경고).
          // 29 는 >=24.0.0 이라 지금 환경(v24.12.0)에서 그대로 돈다. Node 를 24.15+ 로 올리면
          // 30 으로 올려도 된다. 2026-08-31 확인.
          "@vitejs/plugin-react": "^6.1.1", jsdom: "^29.1.1",
          postcss: "^8.5.26", tailwindcss: "^4.3.3", typescript: "^7.0.2", vitest: "^4.1.11",
        },
      }, null, 2) + "\n");

      // 프로파일 「설정 요령」: jsx preserve · moduleResolution bundler · next 플러그인 · noEmit.
      write("tsconfig.json", JSON.stringify({
        compilerOptions: {
          target: "ES2022", lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true, skipLibCheck: true, strict: true, noEmit: true,
          esModuleInterop: true, module: "esnext", moduleResolution: "bundler",
          // Next 16 은 jsx 를 react-jsx 로 강제한다("mandatory changes"). preserve 로 두면
          // 첫 next build 가 이 파일을 말없이 고쳐 놓는다 — 스캐폴딩 산출물이 바로 낡는다.
          resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", incremental: true,
          plugins: [{ name: "next" }],
          // baseUrl 은 TypeScript 7 에서 삭제됐다(TS5102). 넣으면 tsc 가 바로 에러다.
          // paths 는 이제 tsconfig 파일 위치 기준으로 해석되므로 baseUrl 없이 그대로 쓴다.
          paths: { "@/*": ["./src/*"] },
        },
        // .next/dev/types 는 Next 16 이 첫 빌드에서 스스로 덧붙인다 — 미리 넣어 둔다.
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
        exclude: ["node_modules"],
      }, null, 2) + "\n");

      write("next.config.ts", `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n`);

      // 게이트는 next build 없이 tsc --noEmit 만 돌린다. 이 2줄이 없으면 Next 타입 참조가
      // 풀리지 않아 타입체크가 깨지는데, 원인이 '스캐폴딩이 안 만든 파일'이라는 게 안 보인다.
      // (프로파일 「설정 요령」의 next-env.d.ts 수동 생성)
      write("next-env.d.ts", `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`);

      // Tailwind 4 형식. v3 의 `plugins: { tailwindcss: {}, autoprefixer: {} }` 이 아니다.
      // tailwind.config.ts 는 만들지 않는다 — v4 는 설정을 CSS 안에서(@theme) 한다.
      // 아무도 안 읽는 설정 파일을 두면 다음 사람이 거기를 고치고 안 먹는 이유를 못 찾는다.
      write("postcss.config.mjs", `const config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n`);

      // tsconfig 의 paths(@/* → ./src/*)를 테스트 실행기도 알아야 한다.
      // 없으면 소스는 타입체크를 통과하는데 테스트만 import 해석에 실패한다.
      // 확장자가 .mts 인 이유: Next 프로젝트의 package.json 에는 "type": "module" 이 없어서
      // .ts 로 두면 Vite 가 이 파일을 CommonJS 로 읽고 ESM 문법에 경고를 낸다.
      // package.json 전체를 ESM 으로 바꾸는 것보다 이 파일만 .mts 로 두는 쪽이 파급이 작다.
      write("vitest.config.mts", `import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/integration/**"],
  },
});
`);

      // App Router 는 layout + page 가 있어야 라우트가 뜬다.
      // page.* 는 딱 1장만 만든다 — design/BEFORE_UI 가 2장째부터 막기 때문에,
      // 2장을 만들면 디자인 승인 전에 배포 검증용 스켈레톤조차 못 만들게 된다.
      write("src/app/layout.tsx", `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "${name}" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
`);

      write("src/app/page.tsx", `export default function Page() {
  return <main>walking skeleton: ${name}</main>;
}
`);

      // Tailwind 4 는 한 줄. v3 의 @tailwind base/components/utilities 세 줄이 아니다.
      write("src/app/globals.css", `@import "tailwindcss";\n`);
    },
  },
};

// ── 실행 ──────────────────────────────────────────────────────────────────────
const { profile, why } = resolveProfile();
const spec = PROFILES[profile];

// 판정을 매 실행마다 눈에 보이게 찍는다 — 오판정이 조용히 지나가면 잘못된 골격이 그대로 깔린다.
console.log(`프로파일: ${profile}`);
console.log(`  근거: ${why}`);
console.log(`  구조: docs/references/architectures/${profile}.md\n`);

for (const layer of spec.layers) mkdirSync(join(ABS, "src", layer), { recursive: true });
spec.emit();

// 킷 정본 스펙 템플릿을 프로젝트로 복사 (정본: docs/references/spec-template.md).
// 없으면 조용히 건너뛴다 — 스캐폴딩이 정본 유무에 의존해 깨지지 않게.
const specTemplateSrc = join(ROOT, "docs", "references", "spec-template.md");
if (existsSync(specTemplateSrc)) {
  write("docs/specs/_TEMPLATE.md", readFileSync(specTemplateSrc, "utf8"));
} else {
  console.log("  건너뜀: docs/specs/_TEMPLATE.md (정본 docs/references/spec-template.md 없음)");
}

console.log(`\n스캐폴딩 완료: ${BASE} (${profile}). 검증: node gates/run-gates.mjs`);
