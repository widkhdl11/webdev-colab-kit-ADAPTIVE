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
