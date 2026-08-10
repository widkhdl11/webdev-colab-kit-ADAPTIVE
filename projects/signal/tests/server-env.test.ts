import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * INV-S2 인접: **요약 키가 없어도 수집(적재)은 돌아야 한다.**
 *
 * 처음엔 서버 전용 키 두 개를 한 스키마로 묶어 한 번에 검증했다. 그랬더니
 * `ANTHROPIC_API_KEY` 가 없을 때 Supabase 클라이언트조차 못 만들어 **수집 라우트가 500** 이 났다
 * (2026-08-09, 실제 실행에서 발견).
 *
 * 예전엔 이걸 소스 문자열 정규식으로 확인했는데 그건 알리바이였다 — 함수를 한 번도 부르지
 * 않으니 순서를 바꾸면 통과하고, 주석 길이만 줄여도 빨간불이 켜졌다. 이제 **실제로 부른다.**
 * `server-only` 는 서버 조건에서만 풀리므로 빈 모듈로 바꿔 끼운다(그 파일의 방벽은 빌드가 잡는다).
 */
vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadEnvModule() {
  return import("@/shared/api/server-env");
}

describe("server-env — 키를 따로 읽는다", () => {
  it("INV-S2: ANTHROPIC_API_KEY 가 없어도 supabaseSecretKey() 는 살아 있다", async () => {
    // 이게 2026-08-09 의 500 을 재현하는 조건이다. 두 키를 묶으면 여기서 던진다.
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_아무값");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    const { supabaseSecretKey, anthropicApiKey } = await loadEnvModule();

    expect(supabaseSecretKey()).toBe("sb_secret_아무값");
    // 요약 키는 부르는 자리에서만 던져야 한다.
    expect(() => anthropicApiKey()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("INV-S2 실패경로: 반대도 성립한다 — Supabase 키가 없어도 요약 키는 읽힌다", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-아무값");

    const { supabaseSecretKey, anthropicApiKey } = await loadEnvModule();

    expect(anthropicApiKey()).toBe("sk-ant-아무값");
    expect(() => supabaseSecretKey()).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("공백뿐인 값은 없는 것으로 본다", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "   ");
    const { supabaseSecretKey } = await loadEnvModule();
    expect(() => supabaseSecretKey()).toThrow();
  });

  it("INV-S4: 예외 메시지에 값을 넣지 않는다", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_진짜값");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { anthropicApiKey } = await loadEnvModule();
    try {
      anthropicApiKey();
      expect.unreachable("던져야 한다");
    } catch (e) {
      expect(String(e)).not.toContain("sb_secret_진짜값");
    }
  });

  it("Supabase 클라이언트는 Claude 키를 건드리지 않는다", () => {
    // 이건 **어느 모듈이 무엇을 import 하는가**라 정적 속성이다 — 파일을 읽어 확인한다.
    // 이 파일이 anthropicApiKey 를 부르면 요약 키 없이는 적재도 못 한다.
    const supabaseClient = readFileSync(
      resolve(process.cwd(), "src/shared/api/supabase-server.ts"),
      "utf8",
    );
    expect(supabaseClient).not.toMatch(/anthropic/i);
    expect(supabaseClient).toMatch(/supabaseSecretKey/);
  });
});
