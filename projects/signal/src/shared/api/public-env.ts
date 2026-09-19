import { z } from "zod";

/**
 * 브라우저까지 가는 설정. 도메인 지식은 없다.
 *
 * 여기 있는 값은 Next 가 클라이언트 번들에 **문자열로 인라인한다** — 공개를 전제로 한 값만 둔다.
 * publishable(구 anon) 키가 여기 있는 건 맞다: 그 키는 공개용으로 설계됐고, 인가는 키가 아니라
 * RLS 가 한다(rules/supabase). 서버 전용 값은 server-env.ts 에 따로 있다.
 *
 * 왜 모듈로 두나: 이름이 틀리면 `process.env.X` 는 조용히 undefined 가 되고, 증상은 한참 뒤
 * Supabase 클라이언트 생성 시점에 알아볼 수 없는 오류로 나타난다. 여기서 이름째로 판정한다.
 */

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof schema>;

export function publicEnv(): PublicEnv {
  // `process.env` 를 동적으로 읽지 않는다(`process.env[name]`). Next 는 소스에 적힌
  // `process.env.NEXT_PUBLIC_X` 라는 **문자열을 찾아** 값으로 바꾼다 — 동적 접근은
  // 치환 대상이 아니라서 브라우저에서 undefined 가 된다.
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(
      `공개 환경변수가 준비되지 않았다:\n${lines.join("\n")}\n` +
        "이름은 .env.example 을 따른다. `npm run check:env` 로 이름만 확인할 수 있다.",
    );
  }
  return parsed.data;
}
