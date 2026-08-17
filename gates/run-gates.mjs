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
// FSD 정의상 app 과 shared 는 슬라이스가 없고 세그먼트만 있다. 이 두 레이어 안에서는
// 폴더를 가로지르는 import 가 정상이므로 CROSS_SLICE 를 적용하지 않는다.
// (UPWARD_IMPORT 는 그대로 적용된다 — 레이어 사이 방향 규칙은 별개다.)
const SLICELESS_LAYERS = new Set(["app", "shared"]);

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
        !SLICELESS_LAYERS.has(fromLayer) &&
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

// 1''') SQL 재실행 안전: apply-migrations 는 --all 로 폴더의 .sql 을 전부 다시 적용한다(새 DB·리셋에서 필요).
//       조건(where) 없는 UPDATE/DELETE/TRUNCATE 가 파일에 남아 있으면 그때 데이터가 지워진다.
//       일회성 데이터 정정은 파일이 아니라 손으로 한 번 + 주석으로. (retro 2026-08-10, rules/supabase.md)
//       의도한 전역 변경이면 그 줄이나 바로 윗줄에 `-- gate:allow-unconditional` 을 남긴다.
for (const projDir of projectDirs) {
  for (const file of walk(join(projDir, "supabase")).filter((f) => f.endsWith(".sql"))) {
    const src = readFileSync(file, "utf-8");
    // 주석과 함수 본문($$…$$)은 같은 길이의 공백으로 — 오프셋이 보존돼야 줄번호를 원본에서 찾는다.
    // 함수 본문은 마이그레이션 실행 시점의 문장이 아니라 런타임 문장이라 제외한다.
    const code = src
      .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
      .replace(/\$\$[\s\S]*?\$\$/g, (m) => " ".repeat(m.length));
    const lines = src.split("\n");
    // 문장 단위로 자른 뒤 '문장이 그 낱말로 시작하는가'만 본다.
    // 낱말만 찾으면 `for update`·`before update on` 같은 절이 걸린다(오탐 3건 실측).
    let at = 0;
    for (const stmt of code.split(";")) {
      const start = at;
      at += stmt.length + 1;
      if (!/^\s*(?:update|delete\s+from|truncate)\b/i.test(stmt)) continue;
      if (/\bwhere\b/i.test(stmt)) continue;
      const line = code.slice(0, start + stmt.search(/\S/)).split("\n").length;
      const near = [lines[line - 2] ?? "", lines[line - 1] ?? ""].join("\n");
      if (/gate:allow-unconditional/i.test(near)) continue;
      errors.push(
        `[security/SQL_UNCONDITIONAL_WRITE] ${relative(ROOT, file)}:${line} — 조건(where) 없는 파괴적 문장. ` +
          `apply-migrations --all 로 다시 적용되면 데이터가 지워진다. 일회성 정정은 파일이 아니라 손으로 한 번 + 주석으로 (rules/supabase.md)`,
      );
    }
  }
}


// 1'''') 위험 표면: 사고가 나는 코드는 스펙 없이 들어오지 않는다.
//   문서의 "위험 기능 구현 전 스펙 먼저"는 지켜지면 좋은 문장일 뿐이라 확률적으로 새어나간다.
//   여기서 기계로 잡는다 — 인증/결제/권한/동시성 패턴이 코드에 등장했는데 그 표면을 커버하는
//   approved 스펙이 없으면 exit 2.
//   커버 판정: projects/<이름>/docs/specs/*.md 중 status: approved 이고 frontmatter 의
//   surfaces: [auth, payment, authz, concurrency] 에 해당 표면이 들어 있는 스펙이 하나라도 있으면 통과.
//   오탐 예외: 파일 어딘가에 `risk-surface-exempt: <표면> <사유>` 주석을 남기면 그 파일의 그 표면은
//   통과하되 stderr 에 warning 을 남긴다(조용히 통과 없음). 사유가 없으면 예외로 인정하지 않는다.
const RISK_SURFACES = {
  auth: {
    label: "인증/세션",
    rules: [
      { rule: "SUPABASE_AUTH", re: /\bauth\.(signIn[A-Za-z]*|signUp|signOut|admin|getUser|getSession|setSession|refreshSession|exchangeCodeForSession|verifyOtp|resetPasswordForEmail|updateUser|onAuthStateChange)\b/, what: "Supabase auth 호출" },
      { rule: "SIGNIN_CALL", re: /\b(signIn[A-Za-z]*|signUp|signOut)\s*\(/, what: "로그인/가입/로그아웃 호출" },
      { rule: "COOKIE", re: /\bdocument\.cookie\b|['"]Set-Cookie['"]|\bcookies\s*\(\s*\)/, what: "쿠키 직접 처리" },
      { rule: "TOKEN", re: /\b(access_token|refresh_token|id_token|session_token|sessionToken|Bearer|bearer)\b|\bjwt\b/i, what: "토큰/세션 값 처리" },
    ],
  },
  payment: {
    label: "결제",
    rules: [
      { rule: "PAYMENT_ID", re: /\b(payments?|checkout|billing|invoice|refunds?|stripe|tosspayments|iamport|portone|paypal|merchant_uid)\b/i, what: "결제 관련 식별자" },
    ],
  },
  authz: {
    label: "권한/인가",
    rules: [
      { rule: "RLS_POLICY", re: /\bcreate\s+policy\b|\brow\s+level\s+security\b|\bauth\.uid\s*\(\s*\)/i, what: "RLS 정책 / auth.uid()" },
      { rule: "GRANT", re: /\bgrant\s+(select|insert|update|delete|all)\b|\brevoke\s+(select|insert|update|delete|all)\b/i, what: "권한 부여/회수" },
      { rule: "ROLE_CHECK", re: /\b(is_?admin|isAdmin|has_?permission|hasPermission|user_?role|userRole|app_metadata|authoriz(?:e|ation)|unauthorized|forbidden)\b/i, what: "역할/인가 판정" },
      { rule: "ROLE_LITERAL", re: /\brole\s*[:=]\s*['"](admin|owner|teacher|staff|member|manager)['"]/i, what: "역할 값 하드코딩" },
    ],
  },
  concurrency: {
    label: "동시성/시변 상태",
    rules: [
      // `for update` 는 두 뜻이다: select 의 행 잠금(위험 표면)과 create policy/trigger 의 대상 지정(아님).
      // 낱말만 찾으면 RLS 정책이 전부 걸린다(실측 5건) — SQL_UNCONDITIONAL_WRITE 가 겪은 것과 같은 오탐.
      { rule: "ROW_LOCK", re: /\bfor\s+update\b(?!\s+(?:to|using|with)\b)|\block\s+table\b|\bisolation\s+level\b|\bserializable\b|\bpg_advisory(?:_xact)?_lock\b/i, not: /\bcreate\s+(?:policy|trigger|rule)\b/i, what: "행/테이블 잠금·격리수준" },
      { rule: "TXN", re: /\bbegin\s*;|\bcommit\s*;|\brollback\s*;/i, what: "명시적 트랜잭션" },
      { rule: "UPSERT", re: /\.upsert\s*\(|\bon\s+conflict\b/i, what: "upsert / on conflict 경합" },
      { rule: "DERIVED_TRIGGER", re: /\bcreate\s+(?:or\s+replace\s+)?trigger\b/i, what: "트리거로 파생 상태 갱신" },
    ],
  },
};
const SURFACE_KEYS = Object.keys(RISK_SURFACES);

// 스펙 frontmatter 의 surfaces 를 읽는다. 인라인(`surfaces: [auth, authz]`)과
// 블록(`surfaces:` 다음 줄부터 `- auth`) 두 표기 모두 받는다.
function specSurfaces(fmText) {
  const m = fmText.match(/^[ \t]*surfaces:[ \t]*(.*)$/m);
  if (!m) return [];
  const inline = m[1].trim();
  // 값 뒤에 붙는 주석(`surfaces: [auth, authz]  # 왜`)을 값으로 먹으면 마지막 항목이 통째로 어긋난다.
  const clean = (s) => s.split(",").map((x) => x.trim().replace(/['"]/g, "")).filter((x) => /^[a-z-]+$/.test(x));
  const br = inline.match(/^\[([^\]]*)\]/);
  if (br) return clean(br[1]);
  if (inline && !inline.startsWith("#")) return clean(inline.split("#")[0]);
  const rest = fmText.slice(fmText.indexOf(m[0]) + m[0].length).split("\n").slice(1);
  const out = [];
  for (const line of rest) {
    const li = line.match(/^[ \t]*-[ \t]*([A-Za-z-]+)/);
    if (!li) break;
    out.push(li[1]);
  }
  return out;
}
// projects/<이름>/docs/specs/*.md (비재귀, '_' 접두 제외) 중 approved 스펙이 커버하는 표면 집합.
// 비재귀인 이유: 그래프의 spec 노드 글롭(docs/specs/*.md)과 같은 범위를 봐야 planned/ 의 보류 스펙이
// 게이트를 열어버리지 않는다.
function approvedSurfaces(projDir) {
  const dir = join(projDir, "docs", "specs");
  const covered = new Map(); // surface -> 스펙 경로
  let entries;
  try { entries = readdirSync(dir); } catch { return covered; }
  for (const name of entries) {
    if (!name.endsWith(".md") || name.startsWith("_")) continue;
    const p = join(dir, name);
    try { if (!statSync(p).isFile()) continue; } catch { continue; }
    const fm = readFileSync(p, "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm || !/^\s*status:\s*approved\b/m.test(fm[1])) continue;
    for (const s of specSurfaces(fm[1])) if (!covered.has(s)) covered.set(s, relative(ROOT, p));
  }
  return covered;
}
// 파일 단위 예외 주석: `risk-surface-exempt: <표면> <사유>` (//, --, /* */, <!-- --> 어디든).
function exemptions(src) {
  const out = new Map(); // surface -> 사유
  for (const m of src.matchAll(/risk-surface-exempt:[ \t]*([A-Za-z-]+)[ \t]*([^\n*]*)/g)) {
    const surface = m[1];
    const reason = (m[2] ?? "").replace(/-->|\*\//g, "").trim();
    if (reason) out.set(surface, reason);
  }
  return out;
}
// 주석은 근거가 아니다 — 코드 줄만 본다. (예외 주석 자체가 패턴에 걸리는 것도 여기서 막힌다)
function stripLineComment(line, isSql) {
  return isSql ? line.split("--")[0] : line.split("//")[0].replace(/^\s*\*.*$/, "");
}

// ── 예외의 만료: 전제가 깨지면 예외가 스스로 풀려야 한다 ────────────────
// authz 예외는 대개 "이 프로젝트엔 인가 모델이랄 게 없다"를 근거로 삼는다.
// 그런데 쓰기 정책(insert/update/delete, 또는 for 절 없는 = 전체 허용)이 하나라도 생기면
// 그 순간부터 "누가 무엇을 쓸 수 있는가"라는 인가 규칙이 실제로 존재한다 — 예외의 전제가 거짓이 된다.
// 사람이 주석을 읽고 기억해서 푸는 것은 강제가 아니므로, 이 조건만 기계가 본다.
//   for select                          → 읽기 전용 → 전제 유지
//   for insert/update/delete/all, for 없음 → 쓰기 가능 → authz 예외 무효
function writePolicyIn(projDir) {
  for (const file of walk(join(projDir, "supabase")).filter((f) => f.endsWith(".sql"))) {
    const src = readFileSync(file, "utf-8");
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const t = stripLineComment(lines[i], true);
      const m = t.match(/\bcreate\s+policy\b(.*)$/i);
      if (!m) continue;
      // `for` 절은 정책 선언 다음 줄에 오기도 한다(줄바꿈 서식). 선언부 몇 줄을 이어 붙여 본다.
      const decl = [m[1], ...lines.slice(i + 1, i + 4).map((l) => stripLineComment(l, true))].join(" ");
      const forClause = decl.match(/\bfor\s+(select|insert|update|delete|all)\b/i);
      if (forClause && forClause[1].toLowerCase() === "select") continue;   // 읽기 전용
      return { rel: relative(ROOT, file).split("\\").join("/"), line: i + 1, kind: forClause ? forClause[1].toLowerCase() : "all(for 절 없음)" };
    }
  }
  return null;
}

// ── 만료 규칙이 선언된 표면 ──────────────────────────────────────
// 값은 "무엇이 생기면 이 예외가 풀리는가"를 사람 말로 적은 것 — 경고 문장에 그대로 들어간다.
// 여기 없는 표면은 만료 검사가 아예 없다는 뜻이고, 경고가 그 사실을 밝힌다.
// (한 군데 두는 이유: scripts/check-exempt-expiry.mjs 가 이 목록을 읽어 경고와 대조한다.
//  베껴 두면 표면이 늘 때 검사에서 조용히 빠진다 — check-hooks 와 같은 이유)
const EXPIRY_RULES = {
  authz: "supabase 마이그레이션에 쓰기 정책(insert·update·delete·for 절 없음)이 생기면",
};

const riskWarnings = [];
// 프로젝트별로 '코드에 실제로 존재하는 위험 표면'을 모은다 — 스펙이 커버했든 예외를 달았든 상관없이.
// 이건 차단용이 아니라 신고용이다: graph-stop 이 review 사인오프에서 "이 표면인데 리뷰어가 없다"를
// 판정하려면 표면 목록이 게이트 밖으로 나가야 한다.
const detectedByProject = new Map();
for (const projDir of projectDirs) {
  const label = relative(ROOT, projDir).split("\\").join("/");
  const covered = approvedSurfaces(projDir);
  // 표면 -> 예외를 무효로 만드는 사실 (있으면 그 표면의 예외 주석은 warning 이 아니라 error)
  const expired = new Map();
  const wp = covered.has("authz") ? null : writePolicyIn(projDir);
  if (wp) expired.set("authz", `쓰기 정책이 존재한다(${wp.rel}:${wp.line} — for ${wp.kind}). ` +
    `"인가 모델이 없다"는 예외의 전제가 깨졌다 — 누가 무엇을 쓸 수 있는지가 이제 규칙이다`);
  const scanFiles = [
    ...walk(join(projDir, "src")).filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f)),
    ...walk(join(projDir, "supabase")).filter((f) => f.endsWith(".sql")),
  ];
  // surface -> [{rel, line, what, rule}]  (예외 처리 후 남은 것만)
  const hits = new Map(SURFACE_KEYS.map((s) => [s, []]));
  const detected = new Set();
  for (const file of scanFiles) {
    const src = readFileSync(file, "utf-8");
    if (!/risk-surface|auth|payment|role|upsert|conflict|token|cookie|policy|trigger|lock|commit|grant/i.test(src)) continue;
    const rel = relative(ROOT, file).split("\\").join("/");
    const isSql = file.endsWith(".sql");
    const exempt = exemptions(src);
    // \r 를 남기면 JS 정규식의 `.` 이 \r 을 안 먹어 `^\s*\*.*$`(블록 주석 줄) 판정이 빗나간다 —
    // CRLF 파일에서 주석 속 'ON CONFLICT' 가 실제로 걸렸다.
    const lines = src.split(/\r?\n/);
    const seen = new Set(); // 파일당 (표면) 1건만 — 같은 파일에서 수십 줄이 걸려도 신호는 하나다
    for (let i = 0; i < lines.length; i++) {
      const t = stripLineComment(lines[i], isSql);
      if (!t.trim()) continue;
      for (const [surface, def] of Object.entries(RISK_SURFACES)) {
        if (seen.has(surface)) continue;
        for (const { rule, re, not, what } of def.rules) {
          if (!re.test(t) || (not && not.test(t))) continue;
          seen.add(surface);
          detected.add(surface);
          if (covered.has(surface)) break;              // 스펙이 커버 → 조용히 통과
          if (exempt.has(surface) && expired.has(surface)) {
            // 예외는 살아 있는데 그 전제가 깨졌다 → 통과시키지 않는다. 이게 "예외의 만료"다.
            errors.push(
              `[risk-surface/EXPIRED_EXEMPT] ${rel}:${i + 1} — ${def.label}(${what})의 예외가 만료됐다. ` +
                `예외 사유: "${exempt.get(surface)}". 그런데 ${expired.get(surface)}. ` +
                `이제 /spec 으로 불변식을 쓰고 스펙 frontmatter 에 surfaces: [${surface}] 를 적는다 — ` +
                `예외 주석을 고쳐 다는 것으로는 통과하지 않는다.`,
            );
            break;
          }
           if (exempt.has(surface)) {
            const expiryRule = EXPIRY_RULES[surface];
            riskWarnings.push(
              `⚠ [risk-surface/EXEMPT] ${rel}:${i + 1} — ${def.label}(${what}) 예외 처리됨: ${exempt.get(surface)}. ` +
                `예외는 스펙을 대신하지 않는다 — 이 판단이 틀리면 사고는 그대로 난다. ` +
                (expiryRule
                  ? `${expiryRule} 이 예외는 자동으로 만료된다.`
                  : `이 표면에는 만료 검사가 없다 — 전제가 깨져도 예외는 그대로 살아 있으니 사람이 지켜봐야 한다.`),
            );
            break;
          }
          hits.get(surface).push({ rel, line: i + 1, what, rule });
          break;
        }
      }
    }
  }
  if (detected.size > 0) detectedByProject.set(label, [...detected]);
  for (const [surface, list] of hits) {
    if (list.length === 0) continue;
    const def = RISK_SURFACES[surface];
    const head = list[0];
    const more = list.slice(1, 3).map((h) => `      · ${h.rel}:${h.line} — ${h.what}`).join("\n");
    errors.push(
      `[risk-surface/${surface.toUpperCase()}] ${head.rel}:${head.line} — ${def.label} 표면 진입(${head.what}). ` +
        `${label}/docs/specs/ 에 이 표면을 커버하는 스펙이 없다(status: approved + frontmatter surfaces 에 '${surface}'). ` +
        `구현 전에 /spec 으로 불변식부터 쓴다. 오탐이면 그 파일에 \`risk-surface-exempt: ${surface} <사유>\` 주석.` +
        (more ? `\n${more}` : "") +
        (list.length > 3 ? `\n      · 외 ${list.length - 3}건` : ""),
    );
  }
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

// 검사가 '안 돈 것'과 '통과한 것'은 다르다. 설정이 없으면 tsc·테스트는 조용히 건너뛰어졌고,
// 그러면 그 카테고리 에러가 0건이라 graph-stop 이 implement·qa 를 clean 으로 내려 버린다
// (판정은 '에러가 있나' 하나뿐 — gates/graph-stop.mjs 의 gateBlocked).
// 그래서 안 돈 검사를 전용 카테고리의 에러로 남긴다. 그 노드는 clean 이 안 되고,
// 턴 자체는 GATE_KIND 의 낮춤 규칙이 막지 않게 해 준다(graph.mjs).
let ranTsc = 0;
let ranTest = 0;
if (!QUICK) {
  // 2) 프로젝트별 tsc + 테스트 (각 프로젝트 디렉터리를 cwd로)
  for (const projDir of projectDirs) {
    const label = relative(ROOT, projDir);
    if (existsSync(join(projDir, "tsconfig.json"))) {
      ranTsc++;
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
    } else {
      errors.push(
        `[tsc-notrun/NO_TSCONFIG] ${label} — tsconfig.json 이 없어 타입 검사가 아예 돌지 않았다. ` +
          `검사 안 함은 통과가 아니다: tsconfig.json 을 두거나, 타입 검사가 필요 없는 프로젝트면 implement 를 n/a 로 선언해라.`,
      );
    }
    const pkgPath = join(projDir, "package.json");
    let testable = false;
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.test) {
        testable = true;
        ranTest++;
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
    if (!testable)
      errors.push(
        `[test-notrun/NO_TEST_SCRIPT] ${label} — package.json 에 scripts.test 가 없어 테스트가 아예 돌지 않았다. ` +
          `검사 안 함은 통과가 아니다: 테스트를 붙이거나, 이번 작업에 qa 가 해당 없으면 n/a 로 선언해라.`,
      );
  }
  // 3) 스펙 커버리지: approved 스펙의 모든 INV는 테스트가 참조해야 한다
  const sc = spawnSync("node", [join(ROOT, "gates", "spec-coverage.mjs")], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  if (sc.status !== 0)
    errors.push(...(sc.stderr ?? "").trim().split("\n").filter(Boolean));
}

// 위험 표면 예외는 통과시키되 매번 보이게 남긴다 — 예외가 쌓여 아무도 모르게 방벽이 사라지는 걸 막는다.
for (const w of riskWarnings) console.error(w);
// 감지된 표면 신고(차단 아님). graph-stop 이 review 사인오프 판정에 쓴다.
for (const [label, surfaces] of detectedByProject)
  console.log(`ℹ [risk-surface/DETECTED] ${label} — ${surfaces.join(", ")}`);

if (errors.length > 0) {
  console.error(
    `게이트 실패 ${errors.length}건. 새 기능 추가 금지, 아래 위반만 수정:\n` +
      errors.slice(0, 30).join("\n"),
  );
  process.exit(2);
}
// 무엇을 '돌렸는지'까지 말한다 — 통과 메시지가 검사 범위를 숨기면 안 돌린 것과 구별이 안 된다.
const n = projectDirs.length;
console.log(
  `게이트 통과 (${fileCount}개 파일, ${n}개 프로젝트` +
    (QUICK
      ? ", quick — tsc·test 는 안 돌림"
      : ` · tsc ${ranTsc}/${n} · test ${ranTest}/${n}`) +
    `)`,
);
