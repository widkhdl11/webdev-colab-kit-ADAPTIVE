// Supabase Management API 로 마이그레이션 SQL 을 호스팅 DB 에 적용한다.
//
// 보안: Management 토큰은 조직 전체를 건드릴 수 있는 강력 키다. 이 스크립트는 토큰을
//   **오직 process.env.SUPABASE_TOKEN 에서만** 읽고, 파일(.env)에서 읽지 않으며, 어떤 경로로도
//   값을 출력하지 않는다(로그·에러 메시지에 토큰을 넣지 않음). 토큰은 저장소 밖(OS 사용자 환경변수)에
//   두는 것을 전제로 한다 → 저장소에 토큰 담긴 파일이 없어 도구가 읽을 대상 자체가 없다.
//
// 사용(토큰은 셸이 아니라 OS 사용자 환경변수로 미리 설정된 상태여야 함):
//   node scripts/apply-migrations.mjs --project signal 0001_init
//   node scripts/apply-migrations.mjs --project wama 0005_subject 0006_student_schedule ...
//   --project 를 빼면 루트 ACTIVE 파일이 가리키는 프로젝트를 쓴다.
//   마이그레이션 이름을 빼면 그 프로젝트의 supabase/migrations/*.sql 을 이름순으로 전부 적용한다.
//
// 프로젝트 ref 는 SUPABASE_PROJECT_REF 환경변수 우선. 프로젝트마다 다른 Supabase 를 쓰므로
// 기본값에 기대면 **다른 프로젝트의 DB 에 마이그레이션을 쏘게 된다** — 그래서 ref 는
// 프로젝트별 기본값 표에서 찾고, 없으면 환경변수를 요구하고 멈춘다.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");

// 프로젝트 ref 는 비밀이 아님(DECISIONS 2026-07-24).
const KNOWN_REFS = {
  wama: "zubdbqlrcuywvelvnfle",
  signal: "wediqqjeqqwrpcseuqbf",
};

const argv = process.argv.slice(2);
let project = null;
const names = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--project" || argv[i] === "-p") {
    project = argv[i + 1];
    i += 1;
  } else {
    names.push(argv[i]);
  }
}

if (!project) {
  const activeFile = join(ROOT, "ACTIVE");
  if (!existsSync(activeFile)) {
    console.error("--project 를 주거나 루트 ACTIVE 파일이 있어야 한다.");
    process.exit(1);
  }
  project = readFileSync(activeFile, "utf8").trim();
}

const MIGRATIONS_DIR = join(ROOT, "projects", project, "supabase", "migrations");
if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`마이그레이션 폴더가 없다: projects/${project}/supabase/migrations`);
  process.exit(1);
}

// 인자로 이름을 안 주면 폴더의 것을 이름순으로 전부. 순서 의존이라 파일명 번호가 순서다.
const DEFAULT = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// 토큰은 환경변수에서만. 파일(.env)은 절대 읽지 않는다.
const token = process.env.SUPABASE_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || KNOWN_REFS[project];
if (!ref) {
  console.error(
    `프로젝트 '${project}' 의 Supabase ref 를 모른다.\n` +
      "SUPABASE_PROJECT_REF 환경변수로 주거나 scripts/apply-migrations.mjs 의 KNOWN_REFS 에 추가하세요.\n" +
      "(기본값으로 넘어가면 다른 프로젝트의 DB 에 쏘게 되므로 여기서 멈춘다.)",
  );
  process.exit(1);
}
if (!token) {
  console.error(
    "SUPABASE_TOKEN 환경변수가 없습니다. 이 스크립트는 토큰을 파일에서 읽지 않습니다.\n" +
    "OS 사용자 환경변수로 설정한 뒤(새 셸에서) 다시 실행하세요. (.env 에 토큰을 두지 마세요.)",
  );
  process.exit(1);
}

// 위에서 파싱한 `names` 를 쓴다. 여기서 argv 를 다시 읽으면 `--project signal` 이 파일명으로
// 섞여 `--project.sql` 을 열려다 죽는다 — 문서에 적힌 사용법이 그대로 실패한다.
const files = names.length > 0 ? names : DEFAULT;

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

let failed = false;
for (const name of files) {
  const file = name.endsWith(".sql") ? name : `${name}.sql`;
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  process.stdout.write(`적용 ${file} … `);
  const { ok, status, body } = await runSql(sql);
  if (ok) {
    console.log("OK");
  } else {
    failed = true;
    console.log(`실패 (HTTP ${status})`);
    console.error(body.slice(0, 800)); // 응답 본문에는 토큰이 포함되지 않음
    break; // 순서 의존이므로 첫 실패에서 멈춘다
  }
}
process.exit(failed ? 1 : 0);
