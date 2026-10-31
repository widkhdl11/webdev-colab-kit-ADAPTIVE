// 시연용 로그인 링크를 만든다 — 로컬 전용 (docs/specs/link-login.md).
// 알림톡을 보내지 않고, 크리에이터 아이디 하나로 1회용 토큰(30분·한 번)을 발급해 `http://localhost:3000/login/link#t=…` 를 출력한다.
// 운영 DB 에 「계정을 골라 발급하는」 길을 만들지 않으려고 DB 함수를 쓰지 않는다(S1e) — 로컬 DB 컨테이너(supabase_db_fankkuk)에 소유자로 직접 넣는다.
// 앱 설정(.env.local)의 SUPABASE_URL 이 로컬(127.0.0.1·localhost)이 아니면 거부한다 — 개발 서버가 다른 DB 에 붙어 있으면 이 링크는 그 DB 에 없다.
// 실행: node scripts/dev-login-link.mjs <크리에이터 아이디> [--origin http://localhost:3000]   (projects/fankkuk 에서)

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const loginId = args.find((a) => !a.startsWith("--"));
const originIndex = args.indexOf("--origin");
const origin = originIndex >= 0 ? args[originIndex + 1] : "http://localhost:3000";

if (!loginId || !/^[a-z0-9_]{4,30}$/.test(loginId)) {
  console.error("사용법: node scripts/dev-login-link.mjs <크리에이터 아이디> [--origin http://localhost:3000]");
  process.exit(1);
}

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;
if (!origin || !LOCAL.test(origin)) {
  console.error(`거부: --origin 은 로컬 주소만 받는다 (${origin ?? "없음"})`);
  process.exit(1);
}

// .env.local 의 SUPABASE_URL 이름 하나만 읽는다(값을 출력하지 않는다)
const envFile = ".env.local";
const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const supabaseUrl = /^SUPABASE_URL="?([^"\r\n]*)"?/m.exec(env)?.[1] ?? process.env.SUPABASE_URL ?? "";
if (!LOCAL.test(supabaseUrl)) {
  console.error("거부: 앱의 SUPABASE_URL 이 로컬 Supabase 가 아니다 — 로컬 DB 에서만 시연 링크를 만든다");
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");

// 넣은 줄의 계정만 돌려받는다(SELECT 로 감싸 psql 의 「INSERT 0 n」 줄이 섞이지 않게)
const sql = `with ins as (
  insert into public.login_link_tokens (token_hash, account_id, created_at, expires_at)
  select '${hash}', p.id, now(), now() + public.login_link_ttl()
  from public.profiles p
  where p.login_id = '${loginId}' and p.role = 'creator' and p.withdrawn_at is null
  returning account_id
) select account_id from ins`;

let out;
try {
  out = execFileSync("docker", ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
} catch (e) {
  console.error("로컬 DB 에 넣지 못했다 — 로컬 Supabase 가 켜져 있고 마이그레이션이 적용됐는지 확인한다");
  console.error(String(e.stderr ?? e).trim());
  process.exit(1);
}
const accountId = out.split("\n")[0];
if (!accountId) {
  console.error(`거부: 아이디 ${loginId} 인 크리에이터 계정이 없다`);
  process.exit(1);
}

console.log(`${origin.replace(/\/$/, "")}/login/link#t=${token}`);
console.log(`(${loginId} · 30분 안에 한 번만 쓰인다)`);
