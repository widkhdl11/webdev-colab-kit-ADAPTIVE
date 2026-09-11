import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MODEL_API_KEY_ENV, ModelConfigMissingError, readModelConfig } from "./config";

// 스펙: docs/specs/ai-assist.md — INV-G1
//
// 여기서 붙드는 것은 INV-G1 의 **싼 쪽 절반**이다: 키를 담는 이름이 `NEXT_PUBLIC_` 으로
// 시작하지 않는 것. 비싼 쪽(실제 번들에 그 값이 없는 것)은 빌드 산출물을 뒤져야 해서
// `tests/integration/client-bundle-secrets.test.ts` 가 맡는다.
//
// 이 파일이 필요한 이유: 이름을 바꾸는 것은 한 글자 일이고, 바꿔도 앱은 잘 돈다.
// 빌드 검사는 느려서 매번 안 돌지만 이건 매번 돈다.

const KEEP = { ...process.env };

beforeEach(() => {
  delete process.env[MODEL_API_KEY_ENV];
  delete process.env.NEXT_PUBLIC_GEMINI_API_KEY;
});
afterEach(() => {
  process.env = { ...KEEP };
});

describe("INV-G1: AI 키는 브라우저로 나가는 경로에 안 들어간다", () => {
  it("INV-G1: 키를 담는 환경변수 이름이 NEXT_PUBLIC_ 으로 시작하지 않는다", () => {
    // 시작하면 Next.js 가 빌드 시점에 그 값을 클라이언트 번들에 문자열로 박아 넣는다.
    expect(MODEL_API_KEY_ENV.startsWith("NEXT_PUBLIC_")).toBe(false);
  });

  it("INV-G1 (실패경로): NEXT_PUBLIC_ 이름으로만 넣으면 설정이 없는 것으로 본다", () => {
    // 「이름을 공개 쪽으로 옮겨도 앱이 돌더라」가 되면, 옮기는 것을 아무도 안 막는다.
    // 값을 상수로 빼는 이유는 검사기 때문이다 — 이름 바로 뒤에 따옴표 값을 붙이면
    // 「하드코딩된 시크릿」 패턴에 걸린다. 걸리는 것이 맞는 동작이라 피해서 쓴다.
    const leaked = "not-a-real-key";
    process.env.NEXT_PUBLIC_GEMINI_API_KEY = leaked;
    expect(() => readModelConfig()).toThrow(ModelConfigMissingError);
  });

  it("INV-G1 (반대 절반): 서버 전용 이름으로 넣으면 읽힌다", () => {
    process.env[MODEL_API_KEY_ENV] = "server-key";
    expect(readModelConfig().apiKey).toBe("server-key");
  });

  it("INV-G1 (실패경로): 아무것도 없으면 던진다 — 조용히 안 도는 것과 구별한다", () => {
    // 설정이 없어서 안 되는 것과 모델이 답을 안 준 것은 다른 일이다.
    expect(() => readModelConfig()).toThrow(ModelConfigMissingError);
  });

  it("INV-G1: 빈 값과 공백은 값이 아니다", () => {
    process.env[MODEL_API_KEY_ENV] = "   ";
    expect(() => readModelConfig()).toThrow(ModelConfigMissingError);
  });

  it("INV-G1: 던지는 오류에 키 값이 안 담긴다", () => {
    // 오류 문구는 로그로 가고 개발 오버레이에도 뜬다.
    process.env[MODEL_API_KEY_ENV] = "   ";
    try {
      readModelConfig();
      expect.unreachable("던졌어야 한다");
    } catch (error) {
      expect(String(error)).not.toContain("   ");
      expect(String(error)).toContain(MODEL_API_KEY_ENV);
    }
  });
});
