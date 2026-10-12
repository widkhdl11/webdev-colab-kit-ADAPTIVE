import { describe, expect, it } from "vitest";
import { chooseApprovalSigner } from "./signer";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";

describe("INV-S11: 가짜 서명 창구는 운영에서 켜질 수 없다", () => {
  it("INV-S11 S11c: 운영 표시가 있으면 창구가 없다 — 가짜로 넘어가지 않는다", () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }]) {
      expect(chooseApprovalSigner(env)).toBeNull();
    }
  });

  it("INV-S11 S11c: 운영에서 가짜를 켜는 설정을 넣어도 창구가 없다", () => {
    const env: Record<string, string> = { NODE_ENV: "production", FK_FAKE_APPROVAL_SIGNER: "1", FK_FAKE_PHONE_VERIFIER: "1" };
    expect(chooseApprovalSigner(env)).toBeNull();
  });

  it("INV-S11: 로컬에서는 가짜 창구가 나온다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "development" })?.kind).toBe("fake");
    expect(chooseApprovalSigner({ NODE_ENV: "test" })?.kind).toBe("fake");
  });
});

describe("가짜 서명 창구", () => {
  it("INV-S11: 저장된 원문을 그대로 서명하고, 서명자는 그 크리에이터의 등록값과 같다", async () => {
    const s = chooseApprovalSigner({ NODE_ENV: "development" })!;
    const r = await s.sign({ storedPayload: "apr_X|FC-1|2026|h", creatorUserId: "u1" });
    expect(new TextDecoder().decode(r.signedContent)).toBe("apr_X|FC-1|2026|h");
    expect(r.signerId).toBe(s.registeredSignerIdOf("u1"));
    expect(r.signerId).not.toBe(s.registeredSignerIdOf("u2"));
  });
});

describe("INV-TS2: 시험 사이트에서는 가짜 서명 창구가 열린다", () => {
  it("INV-TS2 (S2): 시험 사이트면 운영 빌드라도 가짜 서명 창구가 나온다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] })?.kind).toBe("fake");
  });

  it("INV-TS2 (S2b, 실패경로): 시험 주소가 아니면 설정값이 있어도 창구가 없다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://fankkuk.com" })).toBeNull();
  });
});
