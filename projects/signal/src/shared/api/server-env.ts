// 이 한 줄이 이 파일의 핵심이다 — ingestion-ranking INV-S4.
//
// 클라이언트 컴포넌트에서 이 모듈을 import 하면 **빌드가 실패한다.** 테스트로 잡는 것과
// 다른 층의 방벽이다: 테스트는 우리가 규칙을 기억할 때만 돌고, 이건 안 기억해도 막힌다.
import "server-only";

/**
 * 서버에서만 읽는 값.
 *
 * **키마다 따로 읽는다.** 처음엔 한 스키마로 묶어 한 번에 검증했는데, 그러면
 * `ANTHROPIC_API_KEY` 하나가 없을 때 Supabase 클라이언트조차 못 만들어 **수집 전체가 죽었다**
 * (2026-08-09 실제로 500). INV-S2 는 정확히 그 반대를 요구한다 — 요약이 안 되면 요약만 실패하고
 * 적재는 끝까지 가야 한다. 그래서 "필요한 자리에서 필요한 키만" 읽는다.
 *
 * 여기 있는 이름에 `NEXT_PUBLIC_` 을 붙이면 값이 클라이언트 번들에 인라인된다.
 * 이름 규칙 자체가 방벽의 일부다 (tests/secret-boundary.test.ts 가 이름을 훑는다).
 */

function required(name: string, value: string | undefined): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  throw new Error(
    `서버 전용 환경변수 ${name} 이(가) 없다. 이름은 .env.example 을 따른다.\n` +
      "값은 로그·에러 메시지에 절대 넣지 않는다.",
  );
}

/** RLS 를 우회하는 키. 수집·적재가 이걸로 쓴다. */
export function supabaseSecretKey(): string {
  // `process.env.X` 를 동적으로 읽지 않는 이유는 public-env.ts 와 같다(번들러가 치환한다).
  return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}

/**
 * 요약 생성용. **부르는 자리에서만 던진다** — 이 키가 없어도 수집은 돌아야 한다(INV-S2).
 * 던진 예외는 파이프라인이 요약 실패로 세고, 항목은 summary=null 로 남아 다음 주기에 재시도된다.
 */
export function anthropicApiKey(): string {
  return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
}
