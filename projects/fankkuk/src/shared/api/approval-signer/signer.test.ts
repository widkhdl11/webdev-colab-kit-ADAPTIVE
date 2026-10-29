import { describe, expect, it } from "vitest";
import { acceptedSignatureMethod } from "./accepted-method";
import { chooseApprovalSigner, createGatewaySigner } from "./signer";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";

const identity = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: "A".repeat(344), iv: "c2VlZC1zaWctbG5r", ciphertext: "B".repeat(24) } as const;
const TOKEN = "t".repeat(40);
const GW = { SIGN_GATEWAY_URL: "https://sign.fankkuk.com", SIGN_GATEWAY_TOKEN: TOKEN };
const PLAIN = "주문번호: FC-7K3M9\n보낸 팬: 별빛\n선물 종류: 꽃\n개수: 2";

describe("INV-S11: 가짜 서명 창구는 운영에서 켜질 수 없다", () => {
  it("INV-S11 S11c: 운영 표시가 있고 게이트웨이 설정이 없으면 창구가 없다 — 가짜로 넘어가지 않는다", () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }]) {
      expect(chooseApprovalSigner(env)).toBeNull();
    }
  });

  it("INV-S11 S11c: 운영에서 가짜를 켜는 설정을 넣어도 창구가 없다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", FK_FAKE_APPROVAL_SIGNER: "1", FK_FAKE_PHONE_VERIFIER: "1" } as never)).toBeNull();
  });

  it("INV-S11 (실패경로): 운영에서 게이트웨이 주소·토큰 중 하나만 있으면 창구가 없다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", SIGN_GATEWAY_URL: GW.SIGN_GATEWAY_URL })).toBeNull();
    expect(chooseApprovalSigner({ NODE_ENV: "production", SIGN_GATEWAY_TOKEN: TOKEN })).toBeNull();
  });

  it("INV-S11: 운영에서 게이트웨이 주소·토큰이 둘 다 있으면 게이트웨이 창구(kakao)", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", ...GW })?.kind).toBe("kakao");
  });

  it("INV-S11: 로컬에서는 가짜 창구가 나온다 — 게이트웨이 설정이 있어도", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "development" })?.kind).toBe("fake");
    expect(chooseApprovalSigner({ NODE_ENV: "test", ...GW })?.kind).toBe("fake");
  });

  it("INV-S11: 송장 출력 재검증이 받는 방식 — 운영은 kakao, 로컬·시험 사이트는 fake", () => {
    expect(acceptedSignatureMethod({ NODE_ENV: "production" })).toBe("kakao");
    expect(acceptedSignatureMethod({ NODE_ENV: "development" })).toBe("fake");
    expect(acceptedSignatureMethod({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] })).toBe("fake");
  });
});

describe("INV-S17: 가짜 창구 — 첫 결과 확인에서 바로 서명", () => {
  it("INV-S17·S11: 요청을 받고, 첫 확인에서 저장된 원문 그대로 서명해 돌려준다(방식 fake)", async () => {
    const s = chooseApprovalSigner({ NODE_ENV: "development" })!;
    const req = await s.requestSignature({ requestId: "r1", plaintext: PLAIN, requestMessage: "팬꾹 선물 수령 승인", envelope: identity, creatorId: "c1" });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    const r = await s.signatureResult({ requestId: "r1", txId: req.txId, plaintext: PLAIN });
    expect(r).toMatchObject({ state: "signed", method: "fake", signedPlaintext: PLAIN });
  });
});

describe("TS2: 시험 사이트", () => {
  it("INV-TS2 (S2): 시험 사이트면 운영 빌드라도 가짜 서명 창구가 나온다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] })?.kind).toBe("fake");
  });

  it("INV-TS2 (S2b, 실패경로): 시험 주소가 아니면 설정값이 있어도 창구가 없다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://fankkuk.com" })).toBeNull();
  });

  it("INV-S16 S16d (실패경로): 운영(시험 사이트 아님)·게이트웨이 없음이면 연결 창구도 없다", () => {
    expect(chooseApprovalSigner({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://fankkuk.com" })).toBeNull();
  });
});

type Call = { url: string; init: RequestInit };
function fakeFetch(replies: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = replies.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("INV-S17·S4: 게이트웨이 창구 — 정해진 HTTP 약속", () => {
  const cfg = { url: "https://sign.fankkuk.com", token: TOKEN };

  it("INV-S4: 요청은 POST /v1/sign/requests, Bearer 토큰, 본문은 요청 ID·원문·요청 구분 문구·봉투 그대로", async () => {
    const f = fakeFetch([{ status: 201, body: { requestId: "r1", txId: "tx_1", expiresAt: "2026-10-29T01:05:00Z" } }]);
    const s = createGatewaySigner(cfg, f.impl);
    expect(await s.requestSignature({ requestId: "r1", plaintext: PLAIN, requestMessage: "팬꾹 선물 수령 승인", envelope: identity, creatorId: "c1" })).toEqual({ ok: true, txId: "tx_1" });
    expect(f.calls[0]!.url).toBe("https://sign.fankkuk.com/v1/sign/requests");
    expect(f.calls[0]!.init.method).toBe("POST");
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ requestId: "r1", plaintext: PLAIN, requestMessage: "팬꾹 선물 수령 승인", signer: { envelope: identity, creatorId: "c1" } });
  });

  it("INV-S17 (실패경로): 201 이 아니거나 요청 ID 가 다르거나 꼴이 틀리면 실패", async () => {
    for (const reply of [
      { status: 200, body: { requestId: "r1", txId: "tx_1", expiresAt: "x" } },
      { status: 201, body: { requestId: "r2", txId: "tx_1", expiresAt: "x" } },
      { status: 201, body: { requestId: "r1" } },
      { status: 503, body: {} },
    ]) {
      const s = createGatewaySigner(cfg, fakeFetch([reply]).impl);
      expect((await s.requestSignature({ requestId: "r1", plaintext: PLAIN, requestMessage: "m", envelope: identity, creatorId: "c1" })).ok, JSON.stringify(reply)).toBe(false);
    }
  });

  it("INV-S17: 결과는 POST /v1/sign/requests/{requestId}/result 본문 txId·원문 — 상태를 그대로 옮긴다", async () => {
    const signed = { state: "signed", method: "kakao", signedPlaintext: PLAIN, signature: "MIIB", signedAt: "2026-10-29T01:02:03Z" };
    const f = fakeFetch([
      { status: 200, body: { state: "pending" } },
      { status: 200, body: { state: "rejected" } },
      { status: 200, body: { state: "expired" } },
      { status: 200, body: signed },
    ]);
    const s = createGatewaySigner(cfg, f.impl);
    const ask = () => s.signatureResult({ requestId: "r1", txId: "tx_1", plaintext: PLAIN });
    expect(await ask()).toEqual({ state: "pending" });
    expect(await ask()).toEqual({ state: "rejected" });
    expect(await ask()).toEqual({ state: "expired" });
    expect(await ask()).toEqual(signed);
    expect(f.calls[0]!.url).toBe("https://sign.fankkuk.com/v1/sign/requests/r1/result");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ txId: "tx_1", plaintext: PLAIN });
  });

  it("INV-S2·S4 (S4, 실패경로): 409 원문 불일치·422 서명/대상자 불일치는 mismatch, 서명 결과의 방식이 kakao 가 아니면 mismatch", async () => {
    const f = fakeFetch([
      { status: 409, body: { error: "plaintext_mismatch" } },
      { status: 422, body: { error: "signer_mismatch" } },
      { status: 200, body: { state: "signed", method: "fake", signedPlaintext: PLAIN, signature: "x", signedAt: "2026-10-29T01:02:03Z" } },
    ]);
    const s = createGatewaySigner(cfg, f.impl);
    const ask = () => s.signatureResult({ requestId: "r1", txId: "tx_1", plaintext: PLAIN });
    expect(await ask()).toEqual({ state: "mismatch" });
    expect(await ask()).toEqual({ state: "mismatch" });
    expect(await ask()).toEqual({ state: "mismatch" });
  });

  it("INV-S17: 연결 실패·5xx·꼴 틀림은 unavailable(요청을 끝내지 않고 다음 확인에서 다시 묻는다)", async () => {
    const s = createGatewaySigner(cfg, fakeFetch([{ status: 502, body: {} }, { status: 200, body: { state: "done" } }]).impl);
    expect(await s.signatureResult({ requestId: "r1", txId: "tx_1", plaintext: PLAIN })).toEqual({ state: "unavailable" });
    expect(await s.signatureResult({ requestId: "r1", txId: "tx_1", plaintext: PLAIN })).toEqual({ state: "unavailable" });
    const broken = createGatewaySigner(cfg, (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(await broken.signatureResult({ requestId: "r1", txId: "tx_1", plaintext: PLAIN })).toEqual({ state: "unavailable" });
  });
});
