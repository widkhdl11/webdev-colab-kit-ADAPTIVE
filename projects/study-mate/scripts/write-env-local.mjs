// 로컬 Supabase 의 접속 정보를 `.env.local` 로 옮긴다.
//
// 파일에 값을 적어 두지 않는 이유는 통합 테스트 헬퍼와 같다 — 적힌 키는 언젠가 진짜 키로
// 바뀌어 커밋된다. `.env.local` 은 .gitignore 가 막고 있고, 여기 들어가는 것은 공개 키뿐이다
// (브라우저 번들에도 들어가는 값). 비밀 키는 절대 쓰지 않는다.
//
// 사용: npm run env:local

import { writeFileSync } from "node:fs";

const status = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!status || !key) {
  console.error("로컬 Supabase 정보가 없다. `npm run env:local` 로 돌려라.");
  process.exit(1);
}

writeFileSync(
  ".env.local",
  [
    "# 로컬 개발 전용. scripts/write-env-local.mjs 가 만든다 — 손으로 고치지 말 것.",
    `NEXT_PUBLIC_SUPABASE_URL=${status}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}`,
    "",
  ].join("\n"),
);

console.log(".env.local 작성 — 공개 키 두 개만 들어 있다");
