import { describe, expect, it } from "vitest";
import { chooseChannelBioReader, FAKE_NO_CODE_MARK } from "./bio-reader";
import { chooseChannelLoginVerifier } from "./login-verifier";

// 플랫폼 로그인·소개란 읽기 창구 (creator-verification INV-V14·V16). 실제 연결은 외부 연결 때 — 지금은 로컬 가짜 창구뿐이다.

const PROD_ENVS: Array<Record<string, string>> = [
  { NODE_ENV: "production" },
  { NODE_ENV: "development", VERCEL_ENV: "production" },
  { NODE_ENV: "production", FK_FAKE_PLATFORM_LOGIN: "1", FK_FAKE_CHANNEL_BIO: "1" },
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

describe("INV-V16: 가짜 소개란 창구는 운영에서 켜질 수 없다", () => {
  it("INV-V16: 운영 표시가 있으면 창구가 없다 — 운영에서 가짜를 켜는 설정을 넣어도", () => {
    for (const env of PROD_ENVS) expect(chooseChannelBioReader(env)).toBeNull();
  });

  it("INV-V16: 로컬 가짜 창구는 그 신청의 코드를 담은 소개란을 돌려준다 — 코드는 소개란 칸에만", async () => {
    const r = chooseChannelBioReader({ NODE_ENV: "development" })!;
    expect(r.kind).toBe("fake");
    const p = await r.readProfile({ platform: "youtube", channelKey: "ggul", codeForFake: "FK-AB2C-34" });
    expect(p?.bio).toContain("FK-AB2C-34");
    expect([...(p?.links ?? []), ...(p?.recentPosts ?? [])].join(" ")).not.toContain("FK-AB2C-34");
  });

  it("INV-V16: 채널 키에 「못 찾음」 표시가 있으면 코드 없는 소개란을 돌려준다(화면에서 못 찾음 길을 볼 수 있게)", async () => {
    const r = chooseChannelBioReader({ NODE_ENV: "development" })!;
    const p = await r.readProfile({ platform: "youtube", channelKey: `ggul${FAKE_NO_CODE_MARK}`, codeForFake: "FK-AB2C-34" });
    expect(p?.bio).not.toContain("FK-AB2C-34");
  });
});
