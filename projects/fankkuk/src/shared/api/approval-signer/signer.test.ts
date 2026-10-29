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

describe("INV-S16: 승인 서명 연결의 시험 서명 창구", () => {
  const identity = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: "A".repeat(344), iv: "c2VlZC1zaWctbG5r", ciphertext: "B".repeat(24) } as const;

  it("INV-S16 S16d (실패경로): 운영 표시가 있으면 연결 창구도 없다 — 시험 창구로 넘어가지 않는다", () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://fankkuk.com" }]) {
      expect(chooseApprovalSigner(env)).toBeNull();
    }
  });

  it("INV-S16: 시험 창구는 요청을 받고, 결과로 저장된 원문 그대로의 서명을 돌려준다", async () => {
    const s = chooseApprovalSigner({ NODE_ENV: "development" })!;
    expect(await s.requestLinkSignature({ requestId: "r1", payload: "fankkuk-signature-link:v1|req=r1|at=t", identity })).toEqual({ ok: true });
    const r = await s.linkSignatureResult({ requestId: "r1", payload: "fankkuk-signature-link:v1|req=r1|at=t", creatorUserId: "u1" });
    expect(r.state).toBe("signed");
    if (r.state !== "signed") return;
    expect(new TextDecoder().decode(r.signedContent)).toBe("fankkuk-signature-link:v1|req=r1|at=t");
    expect(r.signerId).toBe(s.registeredSignerIdOf("u1"));
  });

  it("INV-S16: 시험 사이트에서는 연결 창구가 열린다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] })?.kind).toBe("fake");
  });
});
