// 통합 테스트는 로컬 Supabase 에만 붙는다. 주소와 키는 `supabase status` 가 알려 주는 로컬 기본값이다(비밀 아님).
// 호스팅 DB 를 가리키면 시험 계정·시험 주문이 운영 데이터에 섞이므로, 로컬 주소가 아니면 시작하지 않는다.
import { execSync } from "node:child_process";

const out = execSync("npx supabase status --output env", {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const values = Object.fromEntries(
  out
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);

const apiUrl = values.API_URL ?? "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(apiUrl)) {
  throw new Error("통합 테스트는 로컬 Supabase 에만 붙는다 — `npx supabase start` 로 띄운 뒤 실행한다");
}
process.env.FK_TEST_API_URL = apiUrl;
process.env.FK_TEST_ANON_KEY = values.ANON_KEY ?? "";
process.env.FK_TEST_SERVICE_KEY = values.SERVICE_ROLE_KEY ?? "";
// 송장 출력 함수의 DB 자격(복호화 전용 역할 토큰)을 시험이 직접 만들 때 쓴다 — 로컬 기본값이다(비밀 아님)
process.env.FK_TEST_JWT_SECRET = values.JWT_SECRET ?? "";

// 가입 번호 키 두 개(signup INV-U18) — 개발 서버와 같은 값이어야 시험이 계산한 해시·암호문이 서버가 저장한 것과 맞는다.
// .env.local 에서 이 두 이름만 읽는다(값은 출력하지 않는다). 이미 환경에 있으면 그 값을 쓴다.
const PHONE_KEY_NAMES = ["FANKKUK_PHONE_ENC_KEY", "FANKKUK_PHONE_HASH_KEY"] as const;
if (PHONE_KEY_NAMES.some((n) => !process.env[n])) {
  const { existsSync, readFileSync } = await import("node:fs");
  const file = `${process.cwd()}/.env.local`;
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  for (const name of PHONE_KEY_NAMES) {
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    if (line && !process.env[name]) process.env[name] = line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
  }
}
