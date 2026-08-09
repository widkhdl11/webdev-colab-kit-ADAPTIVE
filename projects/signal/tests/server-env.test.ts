import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * INV-S2 인접: **요약 키가 없어도 수집(적재)은 돌아야 한다.**
 *
 * 처음엔 서버 전용 키 두 개를 한 스키마로 묶어 한 번에 검증했다. 그랬더니
 * `ANTHROPIC_API_KEY` 가 없을 때 Supabase 클라이언트조차 못 만들어 **수집 라우트가 500** 이 났다
 * (2026-08-09, 실제 실행에서 발견). 키를 따로 읽는지 여기서 붙든다.
 *
 * `server-only` 를 단 모듈이라 `--conditions=react-server` 없이는 import 가 던진다.
 * 그래서 모듈을 부르지 않고 **소스를 읽어 구조를 확인한다** — 이 불변식의 내용이
 * "두 키가 한 함수에 묶여 있지 않다"라서 구조 확인으로 충분하다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/shared/api/server-env.ts"), "utf8");
const supabaseClient = readFileSync(
  resolve(process.cwd(), "src/shared/api/supabase-server.ts"),
  "utf8",
);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server-env — 키를 따로 읽는다", () => {
  it("키마다 별도 함수가 있다", () => {
    expect(src).toMatch(/export function supabaseSecretKey\(\)/);
    expect(src).toMatch(/export function anthropicApiKey\(\)/);
  });

  it("두 키를 한 번에 검증하는 함수가 없다", () => {
    // 묶어서 검증하면 하나가 없을 때 나머지도 못 쓴다 — 그게 500 의 원인이었다.
    const combined = /SUPABASE_SECRET_KEY[\s\S]{0,200}ANTHROPIC_API_KEY/.test(src);
    expect(combined, "두 키가 한 덩어리로 묶여 있다").toBe(false);
  });

  it("Supabase 클라이언트는 Claude 키를 건드리지 않는다", () => {
    // 이 파일이 anthropicApiKey 를 부르면 요약 키 없이는 적재도 못 한다.
    expect(supabaseClient).not.toMatch(/anthropic/i);
    expect(supabaseClient).toMatch(/supabaseSecretKey/);
  });

  it("요약 키는 요약을 부르는 자리에서만 읽는다", () => {
    const ports = readFileSync(
      resolve(process.cwd(), "src/features/ingestion/api/ports.ts"),
      "utf8",
    );
    // summarize 안에서 읽어야 한다 — 모듈 최상위에서 읽으면 import 만 해도 던진다.
    const summarizeBody = ports.slice(ports.indexOf("async summarize"));
    expect(summarizeBody).toMatch(/anthropicApiKey\(\)/);
    expect(ports.slice(0, ports.indexOf("createIngestPorts"))).not.toMatch(/anthropicApiKey\(\)/);
  });
});
