#!/usr/bin/env node
// `supabase status` 가 주는 로컬 접속값을 환경변수로 넣고 뒤에 오는 명령을 실행한다.
//
// 왜 이렇게 하나: 키를 파일에 적으면 언젠가 진짜 키로 바뀌어 커밋된다. 로컬 값은
// 매번 CLI 에서 읽는 편이 안전하고, 스택이 안 떠 있으면 여기서 바로 알려 줄 수 있다.
import { spawnSync } from "node:child_process";

const status = spawnSync("npx", ["supabase", "status", "-o", "json"], {
  encoding: "utf-8",
  shell: true,
});
// 출력 앞에 "Stopped services: [...]" 같은 줄이 붙고, JSON 자체는 여러 줄로 나올 수 있다.
// 그래서 첫 '{' 부터 마지막 '}' 까지를 잘라 낸다 — 한 줄만 집으면 조용히 깨진다.
const out = status.stdout ?? "";
const from = out.indexOf("{");
const to = out.lastIndexOf("}");
if (from === -1 || to <= from) {
  console.error("로컬 Supabase 가 안 떠 있다. `npx supabase start` 를 먼저 돌려라.");
  console.error((status.stderr ?? "").trim().split("\n").slice(0, 3).join("\n"));
  process.exit(1);
}
const s = JSON.parse(out.slice(from, to + 1));

const env = {
  ...process.env,
  SUPABASE_URL: s.API_URL,
  SUPABASE_DB_URL: s.DB_URL,
  SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY ?? s.ANON_KEY,
  SUPABASE_SECRET_KEY: s.SECRET_KEY ?? s.SERVICE_ROLE_KEY,
};

const r = spawnSync(process.argv[2], process.argv.slice(3), { stdio: "inherit", env, shell: true });
process.exit(r.status ?? 1);
