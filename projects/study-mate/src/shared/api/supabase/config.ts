// 연결에 필요한 설정을 읽는 한 자리.
//
// **네 군데에 같은 여덟 줄이 복사돼 있었다**(서버·브라우저·미들웨어·확인용). 변수 이름이
// 바뀌거나 옛 키 이름 대체를 한쪽에만 넣는 날, 다른 화면은 다 도는데 한 화면만 죽는다.
//
// 여기에는 `next/headers` 를 안 들인다 — 쿠키를 안 만지는 클라이언트가 이 파일을 통해
// 쿠키 모듈에 묶이면, 그 클라이언트가 쿠키를 안 쓴다는 말이 코드로는 거짓이 된다.

export class SupabaseConfigMissingError extends Error {
  constructor(missing: readonly string[]) {
    super(`Supabase 설정이 없어 데이터를 읽을 수 없다. 비어 있는 항목: ${missing.join(", ")}`);
    this.name = "SupabaseConfigMissingError";
  }
}

export type SupabaseConfig = {
  readonly projectUrl: string;
  readonly publishableKey: string;
};

/** 없으면 **던진다.** 설정이 없어서 안 보이는 것과 권한이 없어서 안 보이는 것은 다르다 */
export function readSupabaseConfig(): SupabaseConfig {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const missing = [
    projectUrl ? null : "NEXT_PUBLIC_SUPABASE_URL",
    publishableKey ? null : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((name): name is string => name !== null);
  if (!projectUrl || !publishableKey) throw new SupabaseConfigMissingError(missing);

  return { projectUrl, publishableKey };
}
