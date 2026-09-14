#!/usr/bin/env node
// @check-role: on-change
// @check-guards: scripts/scaffold.mjs
//
// scaffold.mjs 가 아키텍처 프로파일별로 맞는 골격을 만드는지 검사한다.
//
// 왜 필요한가: 게이트는 "이미 있는 파일"을 검사하지, "스캐폴딩이 무엇을 안 만들었나"는 못 본다.
// Next 프로젝트에 Vite 골격이 깔려도 게이트는 조용히 통과한다 — 안 만들어진 next-env.d.ts 는
// tsc 가 깨질 때까지 아무도 모르고, 그때는 원인이 스캐폴딩이라는 게 안 보인다.
//
// 실행: node scripts/check-scaffold-profile.mjs
// 격리: 임시 디렉터리에 cwd 를 두고 scaffold 를 돌린다. 이 레포의 projects/ 는 안 건드린다.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCAFFOLD = fileURLToPath(new URL("./scaffold.mjs", import.meta.url));
const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

// 임시 레포 하나를 만들고 그 안에서 scaffold 를 돌린다.
// techStack 이 주어지면 projects/<name>/docs/tech-stack.md 를 먼저 깔아 둔다(인터뷰 산출물 흉내).
function runScaffold({ project, techStack, args = [] }) {
  const root = mkdtempSync(join(tmpdir(), "scaffold-check-"));
  if (techStack !== undefined) {
    const d = join(root, "projects", project, "docs");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "tech-stack.md"), techStack);
  }
  const r = spawnSync(process.execPath, [SCAFFOLD, project, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  return { root, base: join(root, "projects", project), stdout: r.stdout ?? "", status: r.status };
}

const has = (base, p) => existsSync(join(base, p));
const read = (base, p) => (has(base, p) ? readFileSync(join(base, p), "utf8") : "");

// ── 1) Next 프로젝트: tech-stack.md 가 nextjs-fsd 를 가리킨다 ──────────────────
{
  const NEXT_TECH_STACK = `---
status: approved
---
# 기술 스택 — tproj

> 아키텍처 프로파일: [nextjs-fsd](../../../docs/references/architectures/nextjs-fsd.md)
`;
  const { root, base, stdout } = runScaffold({ project: "tproj", techStack: NEXT_TECH_STACK });

  check("[next] 판정된 프로파일을 출력에 찍는다", /nextjs-fsd/.test(stdout), stdout.trim().split("\n")[0] || "(출력 없음)");

  // nextjs-fsd.md 「설정 요령」: 게이트가 next build 없이 tsc --noEmit 만 돌리므로
  // next-env.d.ts 가 없으면 타입체크가 깨진다. 스캐폴딩이 안 만들면 아무도 원인을 모른다.
  check("[next] next-env.d.ts 를 만든다", has(base, "next-env.d.ts"), "없으면 tsc --noEmit 이 깨진다");

  // App Router 는 page.* 없이는 404. layout 도 필수.
  check("[next] src/app/layout.tsx 를 만든다", has(base, "src/app/layout.tsx"));
  check("[next] src/app/page.tsx 를 만든다", has(base, "src/app/page.tsx"));
  check("[next] next.config.ts 를 만든다", has(base, "next.config.ts"), "게이트의 isNextProject() 판정 근거");

  // Vite 전용 산출물이 섞이면 안 된다 (죽은 파일).
  check("[next] index.html 을 만들지 않는다", !has(base, "index.html"), "Vite 진입점 — Next 에선 죽은 파일");
  check("[next] src/app/main.ts 를 만들지 않는다", !has(base, "src/app/main.ts"), "Vite 부트스트랩 — Next 에선 죽은 코드");

  // nextjs-fsd.md 「폴더 구조」: pages 레이어 없음. 라우팅은 src/app 에 통일.
  check("[next] src/pages 레이어를 만들지 않는다", !has(base, "src/pages"), "프로파일이 '안 만들면 된다'고 정한 레이어");

  const pkg = read(base, "package.json");
  check("[next] package.json 이 Next 를 쓴다", /"next"\s*:/.test(pkg) && /next dev/.test(pkg), "dev 스크립트와 의존성");
  check("[next] package.json 에 vite 가 없다", !/"vite"\s*:/.test(pkg));

  const tsconfig = read(base, "tsconfig.json");
  // Next 16 은 jsx 를 react-jsx 로 강제한다. preserve 면 첫 빌드가 파일을 말없이 고친다.
  check("[next] tsconfig 가 jsx: react-jsx · noEmit 이다", /"jsx"\s*:\s*"react-jsx"/.test(tsconfig) && /"noEmit"\s*:\s*true/.test(tsconfig));
  // baseUrl 은 TypeScript 7 에서 삭제됐다(TS5102) — 남아 있으면 tsc 가 바로 깨진다.
  check("[next] tsconfig 에 baseUrl 이 없다", !/"baseUrl"/.test(tsconfig), "TS7 에서 삭제된 옵션 — 있으면 tsc 가 에러");
  check("[vite→next] paths 는 남아 있다", /"@\/\*"/.test(tsconfig), "baseUrl 을 빼도 별칭은 살아 있어야 한다");

  // Tailwind 4 는 v3 와 설정 모양이 다르다. v3 형식으로 되돌아가면 빌드가 깨지는데,
  // 스캐폴딩이 만든 파일이라 원인이 안 보인다 — 그래서 형식을 여기 못 박는다.
  const postcss = read(base, "postcss.config.mjs");
  check("[next·tw4] postcss 가 @tailwindcss/postcss 를 쓴다", /@tailwindcss\/postcss/.test(postcss), "v3 의 `tailwindcss: {}` 가 아니다");
  check("[next·tw4] postcss 에 autoprefixer 가 없다", !/autoprefixer/.test(postcss), "v4 가 직접 처리한다");
  check("[next·tw4] package.json 에 @tailwindcss/postcss 가 있다", /"@tailwindcss\/postcss"\s*:/.test(pkg));
  check("[next·tw4] package.json 에 autoprefixer 가 없다", !/"autoprefixer"\s*:/.test(pkg));

  const globals = read(base, "src/app/globals.css");
  check("[next·tw4] globals.css 가 @import \"tailwindcss\" 다", /@import\s+["']tailwindcss["']/.test(globals), "v3 의 @tailwind base/components/utilities 가 아니다");
  check("[next·tw4] globals.css 에 @tailwind 지시어가 없다", !/@tailwind\s/.test(globals));

  check("[next·tw4] tailwind.config.ts 를 만들지 않는다", !has(base, "tailwind.config.ts"), "v4 는 설정을 CSS 안에서(@theme) 한다 — 아무도 안 읽는 파일이 된다");

  // design/BEFORE_UI 는 라우트 화면이 2장 이상일 때만 막는다(1장은 워킹 스켈레톤 예외).
  // 스캐폴딩이 2장을 만들면 디자인 승인 전에 골격조차 못 만든다.
  const routes = ["src/app/page.tsx", "src/app/(main)/page.tsx", "src/app/about/page.tsx"].filter((p) => has(base, p));
  check("[next] 라우트 화면을 딱 1장만 만든다", routes.length === 1, `만든 page.*: ${routes.length}장 — 2장부터 design/BEFORE_UI 가 막는다`);

  rmSync(root, { recursive: true, force: true });
}

// ── 2) Vite 프로젝트: tech-stack.md 가 없으면 킷 기본형 (기존 동작 유지) ────────
{
  const { root, base, stdout } = runScaffold({ project: "tproj", techStack: undefined });

  check("[vite] 판정된 프로파일을 출력에 찍는다", /vite-fsd/.test(stdout), stdout.trim().split("\n")[0] || "(출력 없음)");
  check("[vite] index.html 을 만든다", has(base, "index.html"), "기존 동작 — 회귀하면 안 된다");
  check("[vite] src/app/main.ts 를 만든다", has(base, "src/app/main.ts"), "기존 동작 — 회귀하면 안 된다");
  check("[vite] src/pages 레이어를 만든다", has(base, "src/pages"), "Vite 는 화면이 src/pages 에 산다");
  check("[vite] next-env.d.ts 를 만들지 않는다", !has(base, "next-env.d.ts"), "Next 전용 산출물이 새면 안 된다");
  check("[vite] package.json 이 vite 를 쓴다", /"vite"\s*:/.test(read(base, "package.json")));
  check("[vite] tsconfig 에 baseUrl 이 없다", !/"baseUrl"/.test(read(base, "tsconfig.json")), "TS7 에서 삭제된 옵션 — 있으면 tsc 가 에러");

  rmSync(root, { recursive: true, force: true });
}

// ── 3) 문서와 디스크가 어긋나면 조용히 한쪽을 고르지 않는다 ────────────────────
{
  const VITE_TECH_STACK = `---
status: approved
---
> 아키텍처 프로파일: [vite-fsd](../../../docs/references/architectures/vite-fsd.md)
`;
  const root = mkdtempSync(join(tmpdir(), "scaffold-check-"));
  const base = join(root, "projects", "tproj");
  mkdirSync(join(base, "docs"), { recursive: true });
  writeFileSync(join(base, "docs", "tech-stack.md"), VITE_TECH_STACK);
  // 문서는 vite 라는데 디스크에는 next.config.ts 가 있다 — 사람이 봐야 하는 상태다.
  writeFileSync(join(base, "next.config.ts"), "export default {};\n");

  const r = spawnSync(process.execPath, [SCAFFOLD, "tproj"], { cwd: root, encoding: "utf8" });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  check(
    "[충돌] tech-stack.md 와 next.config.* 가 어긋나면 멈춘다",
    r.status !== 0 && /어긋/.test(out),
    `exit=${r.status} · ${out.trim().split("\n").pop() || "(출력 없음)"}`,
  );

  rmSync(root, { recursive: true, force: true });
}

// ── 결과 ──────────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail && !r.ok ? `\n    ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
