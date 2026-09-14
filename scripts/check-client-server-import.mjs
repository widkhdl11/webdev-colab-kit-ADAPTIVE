#!/usr/bin/env node
// @check-role: standing
//
// check-client-server-import.mjs — 클라이언트 번들에 서버 전용 모듈이 딸려 들어가는지 정적으로 본다.
//
// 무엇을 막는 검사인가:
//   `"use client"` 파일이 import 를 따라가다 `next/headers` 를 쓰는 모듈에 닿으면 빌드가 죽는다.
//   유닛 검사는 전부 초록불이고, 매번 잡은 것은 `npm run build` 한 번이었다. study-mate 에서만
//   2026-09-05~06 에 네 번 났다 — 미들웨어 상대 경로 · 데이터베이스 직접 접근 ·
//   모집글 길이 상수 · 프로필 이름 상수. 넷 다 원인이 같고, 넷 다 정적으로 보이는 모양이다.
//
// 판정 규칙 셋:
//   ① 씨앗   `next/headers` · `server-only` 를 import 하는 파일은 서버 전용이다.
//   ② 벽     `"use server"` 파일은 지나가지 않는다. 번들러가 그 자리를 원격 호출로 바꾸므로
//            클라이언트가 서버 액션을 import 하는 것은 정상이고 막으면 폼이 전부 걸린다.
//   ③ 타입   `import type` · `export type` 은 컴파일에서 지워지므로 따라가지 않는다.
//
// 쓰는 법:
//   node scripts/check-client-server-import.mjs --scan [--root <폴더>]
//       → 그 폴더의 projects/*/src 를 훑어 위반 줄을 낸다. 위반이 있으면 exit 2.
//         게이트(run-gates)가 이 모드를 부른다.
//   node scripts/check-client-server-import.mjs
//       → 자기 검사. 픽스처로 A~F 를 판정한다 (아래 README 참고).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, cpSync, copyFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// 서버 전용의 씨앗. 늘릴 때는 **클라이언트 번들에서 반드시 깨지는 것만** 넣는다 —
// 과차단이 나면 우회가 값싸지고, 그러면 이 게이트는 없는 것과 같아진다.
const SERVER_ONLY_SPECIFIERS = new Set(["next/headers", "server-only"]);

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// 파일 맨 앞의 주석·공백을 걷어낸 뒤 지시어를 본다. 지시어는 첫 문장이어야 효력이 있으므로
// 파일 아무 데나 있는 "use client" 문자열(주석·설명)을 지시어로 세지 않는다.
function directiveOf(src) {
  let s = src.replace(/^\uFEFF/, "");
  for (;;) {
    const before = s;
    s = s.replace(/^\s+/, "");
    s = s.replace(/^\/\/[^\n]*\n?/, "");
    s = s.replace(/^\/\*[\s\S]*?\*\//, "");
    if (s === before) break;
  }
  const m = s.match(/^["'](use (?:client|server))["']/);
  return m ? m[1] : null;
}

// import / export … from / 동적 import / require 를 한 자리에서 모은다.
// `export … from` 이 들어가는 이유: 배럴(index.ts)이 서버 모듈을 다시 내보내면 그 경로로
// 딸려 들어간다. import 만 보면 배럴을 통과하는 경로가 통째로 안 보인다.
function importsOf(src) {
  const out = [];
  const re =
    /(?:^|[\n;])\s*(import\s+type\b|export\s+type\b|import\b|export\b)([\s\S]*?)from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[3] ?? m[4] ?? m[5];
    if (!spec) continue;
    const head = m[1] ?? "";
    if (/^(?:import|export)\s+type\b/.test(head)) continue; // ③ 타입은 지워진다
    // `export { x }` 처럼 from 이 없는 문장이 위 대안에 걸려 다음 from 까지 삼키는 것을 막는다.
    if (m[2] !== undefined && /[;{}]\s*$/.test(m[2].trim()) === false && /\n\s*\n/.test(m[2])) continue;
    // 문장 앞의 줄바꿈·세미콜론까지 매치에 들어가 있으므로, 위치는 매치 첫 글자가 아니라
    // **앞 문장의 세미콜론까지 건너뛴 자리**다. 그대로 쓰면 줄 번호가 하나씩 밀린다.
    // **앞 문장의 세미콜론까지 건너뛴 자리**다. 그대로 쓰면 줄 번호가 하나씩 밀린다.
    out.push({ spec, index: m.index + Math.max(0, m[0].search(/[^\s;]/)) });
  }
  return out;
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

// `@/x` → src/x, 상대경로는 그대로. 확장자와 index 를 붙여 실제 파일을 찾는다.
function resolveTarget(spec, fromFile, SRC) {
  let base = null;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  const tries = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, "index" + e))];
  for (const t of tries) if (existsSync(t) && statSync(t).isFile()) return t;
  return null;
}

// 한 프로젝트를 훑어 위반 줄을 낸다.
function scanProject(projDir, ROOT) {
  const SRC = join(projDir, "src");
  if (!existsSync(SRC)) return [];
  const files = walk(SRC).filter((f) => EXTS.some((e) => f.endsWith(e)));

  const info = new Map(); // 파일 → { src, directive, imports }
  for (const f of files) {
    const src = readFileSync(f, "utf-8");
    info.set(f, { src, directive: directiveOf(src), imports: importsOf(src) });
  }

  const errors = [];
  for (const entry of files) {
    if (info.get(entry).directive !== "use client") continue;

    // entry 에서 시작해 import 를 따라간다. 벽(`"use server"`)은 넘지 않는다.
    // 경로를 들고 다니는 이유: 어디를 거쳐 닿았는지를 안 보여 주면 고칠 자리를 사람이 다시 찾아야 한다.
    // 위치는 **클라이언트 파일의 그 import 줄**에 찍는다. 씨앗 파일에 찍으면 고칠 자리가
    // 아니라 이미 옳은 파일을 가리키게 된다 — 끊어야 하는 것은 이 경계를 넘는 import 다.
    const short = (f) => relative(ROOT, f).split(sep).join("/");
    const seen = new Set([entry]);
    const queue = [{ file: entry, trail: [], entryLine: null }];
    let reported = false;
    while (queue.length && !reported) {
      const { file, trail, entryLine } = queue.shift();
      const { src, imports } = info.get(file);
      for (const { spec, index } of imports) {
        const here = file === entry ? lineOf(src, index) : entryLine;
        if (SERVER_ONLY_SPECIFIERS.has(spec)) {
          const chain = [short(entry), ...trail.map(short), spec].join(" → ");
          errors.push(
            `[bundle/CLIENT_IMPORTS_SERVER] ${short(entry)}:${here} — "use client" 파일이 서버 전용 모듈에 닿는다 (${chain}). 브라우저 번들이 서버 코드를 끌고 들어가 빌드가 죽는다 — 공유하는 값은 서버 전용 import 가 없는 파일로 떼거나, 서버 접근은 "use server" 액션 뒤로 옮긴다`,
          );
          reported = true;
          break;
        }
        const target = resolveTarget(spec, file, SRC);
        if (!target || seen.has(target)) continue;
        if (!info.has(target)) continue;
        if (info.get(target).directive === "use server") continue; // ② 벽
        seen.add(target);
        queue.push({ file: target, trail: [...trail, target], entryLine: here });
      }
    }
  }
  return errors;
}

function scan(ROOT) {
  const PROJECTS = join(ROOT, "projects");
  if (!existsSync(PROJECTS)) return [];
  const out = [];
  for (const name of readdirSync(PROJECTS)) {
    const p = join(PROJECTS, name);
    if (statSync(p).isDirectory()) out.push(...scanProject(p, ROOT));
  }
  return out;
}

// ── 진입 ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--scan")) {
  const ri = argv.indexOf("--root");
  const root = ri >= 0 ? resolve(argv[ri + 1] ?? ".") : process.cwd();
  const errs = scan(root);
  for (const e of errs) console.error(e);
  process.exit(errs.length ? 2 : 0);
}

// ── 자기 검사 ─────────────────────────────────────────────────────
// 「위반 0건」이라는 보고와 검사가 아예 안 돈 것은 겉이 같다. 그래서 A·D 는 **위반을 일부러
// 심어 잡히는 것을 본다**. B·C·F 는 반대 방향이다 — 이 검사는 조이는 변경이라 과차단이
// 실패 방향이고, 멀쩡한 폼까지 막으면 매 턴 걸려서 우회가 값싸진다.
//
//   A 직접 감지   클라이언트 → 헬퍼 → next/headers 를 잡는다              ← 항상 통과해야 함
//   B 벽          클라이언트 → "use server" 액션 → next/headers 는 안 잡는다
//   C 서버 컴포넌트  "use client" 가 없는 파일의 next/headers 는 안 잡는다
//   D 배럴 경유   클라이언트 → index.ts(re-export) → 서버 모듈을 잡는다   ← 항상 통과해야 함
//   E 배선        `gates/run-gates.mjs --quick` 이 A 를 화면에 낸다        ← 붙기 전 실패
//   F 과차단 없음 이 레포의 실제 코드는 0건이다                            ← 붙기 전후 통과
//
// E 가 붙었는지를 가르는 항목이다. A~D 가 다 통과해도 게이트가 이 검사를 안 부르면
// 아무 일도 일어나지 않는다 — 검사기가 있다는 사실이 검사가 돈다는 뜻은 아니다.
//
// 사용:
//   node scripts/check-client-server-import.mjs
//   node scripts/check-client-server-import.mjs --gate <파일>   ← 붙이기 전 후보를 E 자리에 끼워 확인

const ROOT = process.cwd();
const gi = argv.indexOf("--gate");
const CANDIDATE = gi >= 0 ? resolve(argv[gi + 1] ?? "") : null;
if (gi >= 0 && !existsSync(CANDIDATE ?? "")) {
  console.error("--gate 뒤에 실제 파일 경로가 필요하다");
  process.exit(1);
}

const results = [];
const ok = (name, detail = "") => results.push({ pass: true, name, detail });
const no = (name, detail) => results.push({ pass: false, name, detail });

function w(dir, rel, body) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, "utf-8");
}

// 픽스처 레포 하나를 만든다. projects/probe/src 아래에 네 갈래를 전부 심는다.
function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "client-server-probe-"));
  const S = "projects/probe/src";

  // ① 서버 전용 씨앗
  w(dir, `${S}/shared/api/server-client.ts`, `import { cookies } from "next/headers";\nexport function serverClient() { return cookies(); }\n`);

  // A: 클라이언트 → 헬퍼 → 씨앗. 심은 위반.
  w(dir, `${S}/features/a/model/helper.ts`, `import { serverClient } from "@/shared/api/server-client";\nexport const LIMIT = 80;\nexport const c = serverClient;\n`);
  w(dir, `${S}/features/a/ui/AForm.tsx`, `"use client";\nimport { LIMIT } from "../model/helper";\nexport const A = () => LIMIT;\n`);

  // B: 클라이언트 → "use server" 액션 → 씨앗. 벽이라 안 잡혀야 한다.
  w(dir, `${S}/features/b/api/save.ts`, `"use server";\nimport { serverClient } from "@/shared/api/server-client";\nexport async function save() { return serverClient(); }\n`);
  w(dir, `${S}/features/b/ui/BForm.tsx`, `"use client";\nimport { save } from "../api/save";\nexport const B = () => save;\n`);

  // C: 서버 컴포넌트. 지시어가 없으니 안 잡혀야 한다.
  w(dir, `${S}/app/page.tsx`, `import { serverClient } from "@/shared/api/server-client";\nexport default function P() { return serverClient(); }\n`);

  // D: 클라이언트 → 배럴(export * from) → 씨앗. 심은 위반.
  w(dir, `${S}/entities/thing/index.ts`, `export * from "./model/query";\n`);
  w(dir, `${S}/entities/thing/model/query.ts`, `import { serverClient } from "@/shared/api/server-client";\nexport const q = serverClient;\n`);
  w(dir, `${S}/features/d/ui/DList.tsx`, `"use client";\nimport { q } from "@/entities/thing";\nexport const D = () => q;\n`);

  // 타입만 끌어오는 클라이언트. 지워지는 import 라 안 잡혀야 한다(③).
  w(dir, `${S}/features/e/ui/EView.tsx`, `"use client";\nimport type { Thing } from "@/entities/thing";\nexport const E = (t: Thing) => t;\n`);
  return dir;
}

const fx = makeFixture();
try {
  const lines = scan(fx);
  const hit = (needle) => lines.filter((l) => l.includes(needle));

  const a = hit("features/a/ui/AForm.tsx");
  a.length ? ok("A 직접 감지", a[0].slice(0, 120) + "…") : no("A 직접 감지", "심어 둔 위반을 못 잡았다 — 검사가 아예 안 돌았을 수 있다");

  const b = hit("features/b/ui/BForm.tsx");
  b.length ? no("B 벽", "서버 액션을 지나갔다 — 이대로면 폼이 전부 걸린다: " + b[0].slice(0, 120)) : ok("B 벽", '"use server" 를 안 넘는다');

  const c = hit("app/page.tsx");
  c.length ? no("C 서버 컴포넌트", "지시어 없는 파일을 잡았다: " + c[0].slice(0, 120)) : ok("C 서버 컴포넌트", "안 잡는다");

  const d = hit("features/d/ui/DList.tsx");
  d.length ? ok("D 배럴 경유", d[0].slice(0, 120) + "…") : no("D 배럴 경유", "배럴(export * from)로 딸려 들어가는 경로를 못 잡았다");

  const e = hit("features/e/ui/EView.tsx");
  e.length ? no("③ 타입 import", "지워지는 import 를 잡았다: " + e[0].slice(0, 120)) : ok("③ 타입 import", "안 잡는다");

  // E 배선 — 게이트가 이 검사를 실제로 부르는가. 임시 킷에서 run-gates 를 돌린다.
  const kit = mkdtempSync(join(tmpdir(), "client-server-kit-"));
  cpSync(join(ROOT, "gates"), join(kit, "gates"), { recursive: true });
  mkdirSync(join(kit, "scripts"), { recursive: true });
  copyFileSync(join(ROOT, "scripts", "check-client-server-import.mjs"), join(kit, "scripts", "check-client-server-import.mjs"));
  if (CANDIDATE) copyFileSync(CANDIDATE, join(kit, "gates", "run-gates.mjs"));
  cpSync(join(fx, "projects"), join(kit, "projects"), { recursive: true });
  const r = spawnSync(process.execPath, [join(kit, "gates", "run-gates.mjs"), "--quick"], { cwd: kit, encoding: "utf-8" });
  const out = (r.stdout ?? "") + "\n" + (r.stderr ?? "");
  if (out.includes("[bundle/CLIENT_IMPORTS_SERVER]")) ok("E 배선", "run-gates --quick 이 위반을 화면에 낸다");
  else no("E 배선", CANDIDATE ? "후보 게이트도 이 검사를 안 부른다" : "지금 붙어 있는 게이트가 이 검사를 안 부른다 — 패치를 적용하면 통과한다");
  rmSync(kit, { recursive: true, force: true });

  // F 과차단 없음 — 이 레포의 실제 코드.
  const real = scan(ROOT);
  real.length === 0 ? ok("F 과차단 없음", "레포 실제 코드 0건") : no("F 과차단 없음", real.slice(0, 3).join("\n"));
} finally {
  rmSync(fx, { recursive: true, force: true });
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "✔" : "✘"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 2 : 0);
