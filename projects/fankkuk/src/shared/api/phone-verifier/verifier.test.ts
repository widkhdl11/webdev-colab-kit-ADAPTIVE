import { describe, expect, it } from "vitest";
import { choosePhoneVerifier } from "./verifier";

describe("INV-U9: 가짜 본인 확인은 운영에서 켜질 수 없다", () => {
  it("INV-U9 (S9): 운영 표시가 있으면 확인 창구가 없다 — 가짜로 넘어가지 않는다", () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }]) {
      expect(choosePhoneVerifier(env)).toBeNull();
    }
  });

  it("INV-U9: 운영에서 가짜를 켜는 설정을 넣어도 가짜가 나오지 않는다", () => {
    expect(choosePhoneVerifier({ NODE_ENV: "production", FK_FAKE_PHONE_VERIFIER: "1" })).toBeNull();
  });

  it("INV-U9: 로컬에서는 가짜 확인 창구가 나온다", () => {
    expect(choosePhoneVerifier({ NODE_ENV: "development" })?.kind).toBe("fake");
    expect(choosePhoneVerifier({ NODE_ENV: "test" })?.kind).toBe("fake");
  });
});

describe("가짜 확인 창구", () => {
  it("요청한 번호를 확인된 번호로 돌려준다 — 번호는 서버가 가진 거래 값에서만 나온다", async () => {
    const v = choosePhoneVerifier({ NODE_ENV: "development" })!;
    const { tx } = await v.request("01055556666");
    expect(await v.result(tx)).toEqual({ status: "verified", phone: "01055556666" });
  });

  it("모르는 거래 값은 실패", async () => {
    const v = choosePhoneVerifier({ NODE_ENV: "development" })!;
    expect(await v.result("kakao_real_tx_123")).toEqual({ status: "failed" });
    expect(await v.result("fake:not-a-phone:x")).toEqual({ status: "failed" });
  });
});
