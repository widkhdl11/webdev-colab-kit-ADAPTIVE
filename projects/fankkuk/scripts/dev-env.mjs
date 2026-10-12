// 로컬 개발 서버 설정을 .env.local 에 채운다. 이미 있는 이름은 건드리지 않는다.
// - Supabase: `supabase status` 가 알려 주는 로컬 기본값(비밀 아님 — 로컬 DB 전용). 공개 키는 새 이름(publishable)이 있으면 그것, 옛 CLI 면 anon 값
// - 토스: 토스페이먼츠 공식 예제(github.com/tosspayments/tosspayments-sample)에 공개된 문서용 시험 키. 실제 결제가 일어나지 않는다
// - 메일: 로컬 Mailpit(SMTP 55325)
// 실행: node scripts/dev-env.mjs   (projects/fankkuk 에서, 로컬 Supabase 가 켜져 있어야 한다)

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const FILE = ".env.local";
const current = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const has = (name) => new RegExp(`^${name}=`, "m").test(current);

const status = Object.fromEntries(
  execSync("npx supabase status --output env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(status.API_URL ?? "")) throw new Error("로컬 Supabase 가 꺼져 있다 — npx supabase start 뒤에 실행한다");

const wanted = {
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
  TOSS_SECRET_KEY: "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6",
  NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "55325",
  MAIL_FROM: "팬꾹 <no-reply@fankkuk.test>",
  APP_ORIGIN: "http://127.0.0.1:3311",
};

const lines = Object.entries(wanted)
  .filter(([name, value]) => value && !has(name))
  .map(([name, value]) => `${name}="${value}"`);
if (lines.length === 0) {
  console.log("이미 다 있다 — 바꾸지 않았다.");
} else {
  appendFileSync(FILE, `${current === "" || current.endsWith("\n") ? "" : "\n"}# 로컬 개발 설정 (scripts/dev-env.mjs)\n${lines.join("\n")}\n`);
  console.log(`${lines.length}개 이름을 .env.local 에 붙였다: ${lines.map((l) => l.split("=")[0]).join(", ")}`);
}
