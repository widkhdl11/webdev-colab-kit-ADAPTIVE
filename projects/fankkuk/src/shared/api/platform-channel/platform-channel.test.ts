import { describe, expect, it } from "vitest";
import { chooseChannelLoginVerifier } from "./login-verifier";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";

// 플랫폼 로그인 창구 (creator-verification INV-V14). 실제 연결은 외부 연결 때 — 지금은 로컬 가짜 창구뿐이다.
// 소개란 읽기 창구(옛 INV-V16 코드 자동 확인)는 2026-11-02 확인 방식을 바꾸며 뺐다.

const PROD_ENVS: Array<Record<string, string>> = [
  { NODE_ENV: "production" },
  { NODE_ENV: "development", VERCEL_ENV: "production" },
  { NODE_ENV: "production", FK_FAKE_PLATFORM_LOGIN: "1" },
];

describe("INV-V14: 가짜 플랫폼 로그인 창구는 운영에서 켜질 수 없다", () => {
  it("INV-V14: 운영 표시가 있으면 창구가 없다 — 운영에서 가짜를 켜는 설정을 넣어도", () => {
    for (const env of PROD_ENVS) expect(chooseChannelLoginVerifier(env)).toBeNull();
  });

  it("INV-V14: 로컬에서는 가짜 창구가 나오고, 그 계정이 요청한 채널의 주인이라고 답한다", async () => {
    expect(chooseChannelLoginVerifier({ NODE_ENV: "test" })?.kind).toBe("fake");
    const v = chooseChannelLoginVerifier({ NODE_ENV: "development" })!;
    expect(await v.ownedChannel({ accountId: "u1", platform: "youtube", requestedChannelKey: "ggul" })).toEqual({ platform: "youtube", channelKey: "ggul" });
  });
});

describe("INV-TS2: 시험 사이트에서는 가짜 채널 확인 창구가 열린다", () => {
  it("INV-TS2 (S2): 시험 사이트면 운영 빌드라도 가짜 플랫폼 로그인 창구가 나온다", () => {
    expect(chooseChannelLoginVerifier({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] })).not.toBeNull();
  });

  it("INV-TS2 (S2b, 실패경로): 시험 주소가 아니면 설정값이 있어도 창구가 없다", () => {
    const env = { NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://fankkuk.com" };
    expect(chooseChannelLoginVerifier(env)).toBeNull();
  });
});
