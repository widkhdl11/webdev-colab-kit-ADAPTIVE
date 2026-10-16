// Supabase 설정 읽기의 정본. 이름에 공개 접두어(NEXT_PUBLIC_)를 쓰지 않는다 — 브라우저는 Supabase 를
// 직접 부르지 않고 앱 서버만 부르므로(INV-L1) 브라우저 번들에 넣을 값이 없다.
// 값은 오류 메시지에 넣지 않는다. 이름만.

type EnvLike = Record<string, string | undefined>;

export type SupabaseConfig = { url: string; anonKey: string };

export function readSupabaseConfig(env: EnvLike): SupabaseConfig {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("SUPABASE_URL 이 없다");
  if (!anonKey) throw new Error("SUPABASE_PUBLISHABLE_KEY 가 없다");
  return { url, anonKey };
}

/** INV-L4: 관리자 키는 공개 접두어 없는 이름에서만 읽는다. 공개 이름으로도 설정돼 있으면 시작하지 않는다. */
export function readSecretKey(env: EnvLike): string {
  if (env.NEXT_PUBLIC_SUPABASE_SECRET_KEY !== undefined) {
    throw new Error("비밀 키가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다");
  }
  const key = env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY 가 없다");
  return key;
}
