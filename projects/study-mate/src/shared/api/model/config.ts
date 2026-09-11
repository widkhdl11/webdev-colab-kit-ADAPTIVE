// 텍스트 모델 제공자의 설정을 읽는 한 자리.
//
// **이 파일에는 `NEXT_PUBLIC_` 이 없다.** Next.js 는 그 접두를 가진 환경변수를 빌드 시점에
// 클라이언트 번들에 문자열로 박아 넣는다. 이 앱의 다른 환경변수가 전부 그 접두를 갖고
// 있어서(전부 공개 키였다) 따라 붙이기 쉬운데, 그렇게 되면 앱은 멀쩡히 돌고 키만 새어
// 나간다 (INV-G1).
//
// 여기에 `server-only` 를 안 들이는 이유는 `supabase/config.ts` 와 같다 — 이름 상수는
// 검사에서도 읽어야 하고, 실제로 키를 쥐는 쪽(`gemini.ts`)이 경계를 표시한다.

/** 키를 담는 환경변수 이름. 검사가 이 값을 그대로 읽어 「공개 접두가 아니다」를 확인한다 */
export const MODEL_API_KEY_ENV = "GEMINI_API_KEY";

/**
 * 쓰는 모델. 2026-09-10 에 공식 문서에서 확인한 이름이다
 * (입력 100만 토큰당 $0.10 · 출력 $0.40).
 */
export const MODEL_NAME = "gemini-2.5-flash-lite";

export class ModelConfigMissingError extends Error {
  constructor() {
    // **값을 담지 않는다.** 이 문구는 로그와 개발 오버레이로 나간다.
    super(`AI 설정이 없어 모델을 부를 수 없다. 비어 있는 항목: ${MODEL_API_KEY_ENV}`);
    this.name = "ModelConfigMissingError";
  }
}

export type ModelConfig = {
  readonly apiKey: string;
  readonly model: string;
};

/**
 * 없으면 **던진다.** 설정이 없어서 안 되는 것과 모델이 답을 안 준 것은 다른 일이고,
 * 조용히 빈 결과를 돌려주면 둘이 화면에서 같아 보인다.
 *
 * 읽는 이름은 하나뿐이다 — 공개 접두가 붙은 이름으로는 **일부러 안 찾는다.**
 * 대체 경로를 열어 두면 「이름을 옮겨도 앱이 돌더라」가 되고, 옮기는 것을 아무도 안 막는다.
 */
export function readModelConfig(): ModelConfig {
  const apiKey = process.env[MODEL_API_KEY_ENV];
  if (apiKey === undefined || apiKey.trim() === "") throw new ModelConfigMissingError();
  return { apiKey, model: MODEL_NAME };
}
