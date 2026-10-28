// node --test test/*.test.mjs  (의존성 없음)

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { createAdapter } from "../lib/adapters/index.mjs";
import { createHandler, tokenMatches } from "../lib/app.mjs";
import { ConfigError, loadConfig } from "../lib/config.mjs";
import { OutboundBlockedError, assertAllowedUrl, guardedLookup, isBlockedAddress } from "../lib/outbound.mjs";

const TOKEN = "t".repeat(40);
const baseEnv = { SIGN_ADAPTER: "test", GATEWAY_TOKEN: TOKEN, LISTEN_HOST: "127.0.0.1", LISTEN_PORT: "8443" };

describe("설정", () => {
  it("어댑터 이름이 없으면 뜨지 않는다", () => {
    assert.throws(() => loadConfig({ ...baseEnv, SIGN_ADAPTER: undefined }), ConfigError);
  });
  it("토큰이 비었거나 자리표시거나 짧으면 뜨지 않는다", () => {
    assert.throws(() => loadConfig({ ...baseEnv, GATEWAY_TOKEN: "" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, GATEWAY_TOKEN: "__FILL_ME__" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, GATEWAY_TOKEN: "short" }), ConfigError);
  });
  it("허용 목록은 드림시큐리티·카카오 안에서만 — 밖의 도메인을 적으면 뜨지 않는다", () => {
    assert.deepEqual(
      loadConfig({ ...baseEnv, OUTBOUND_ALLOWED_HOSTS: "api.dreamsecurity.com, cert.kakao.com" }).allowedHosts,
      ["api.dreamsecurity.com", "cert.kakao.com"],
    );
    assert.throws(() => loadConfig({ ...baseEnv, OUTBOUND_ALLOWED_HOSTS: "evil.com" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, OUTBOUND_ALLOWED_HOSTS: "kakao.com.evil.com" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, OUTBOUND_ALLOWED_HOSTS: "notkakao.com" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, OUTBOUND_ALLOWED_HOSTS: "kms.ap-northeast-2.amazonaws.com" }), ConfigError);
  });
});

describe("외부 요청 창구", () => {
  const allowed = ["api.dreamsecurity.com"];
  it("목록의 https 주소만 통과", () => {
    assert.equal(assertAllowedUrl("https://api.dreamsecurity.com/v1/x", allowed).hostname, "api.dreamsecurity.com");
  });
  for (const [label, url] of [
    ["http", "http://api.dreamsecurity.com/"],
    ["목록 밖", "https://example.com/"],
    ["IP 직접", "https://169.254.169.254/latest/meta-data"],
    ["IPv6 직접", "https://[::1]/"],
    ["다른 포트", "https://api.dreamsecurity.com:8443/"],
    ["계정 정보", "https://user:pw@api.dreamsecurity.com/"],
    ["형식 아님", "not a url"],
  ]) {
    it(`거부: ${label}`, () => assert.throws(() => assertAllowedUrl(url, allowed), OutboundBlockedError));
  }
  it("내부망 주소 판정", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "::ffff:a00:1", "64:ff9b::a00:1", "2002:a00:1::", "fd00:ec2::254", "0.0.0.0"]) {
      assert.equal(isBlockedAddress(a), true, a);
    }
    for (const a of ["3.34.120.193", "8.8.8.8", "2606:4700::1111"]) {
      assert.equal(isBlockedAddress(a), false, a);
    }
  });
  it("DNS 가 루프백으로 풀리면 연결하지 않는다", async () => {
    const err = await new Promise((resolve) => guardedLookup("localhost", {}, (e) => resolve(e)));
    assert.ok(err instanceof OutboundBlockedError);
  });
});

describe("토큰", () => {
  it("맞는 토큰·교체용 토큰만 통과", () => {
    const next = "n".repeat(40);
    assert.equal(tokenMatches(`Bearer ${TOKEN}`, [TOKEN, next]), true);
    assert.equal(tokenMatches(`Bearer ${next}`, [TOKEN, next]), true);
    assert.equal(tokenMatches(`Bearer ${TOKEN}x`, [TOKEN]), false);
    assert.equal(tokenMatches(TOKEN, [TOKEN]), false);
    assert.equal(tokenMatches(undefined, [TOKEN]), false);
  });
});

function startServer(env) {
  const config = loadConfig(env);
  const handler = createHandler({ config, adapter: createAdapter(config), log: () => {} });
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

describe("HTTP 흐름 (시험 어댑터)", () => {
  let server;
  let base;
  before(async () => {
    server = await startServer(baseEnv);
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  const call = (path, body, token = TOKEN) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const plaintext = "req_1|FK-0001|2026-10-28T00:00:00Z|abc123";

  async function requestThenResult(outcome, resultPlaintext = plaintext, requestId = "req_1") {
    const r1 = await call("/v1/sign/requests", { requestId: "req_1", plaintext, signer: { subjectId: "creator-1", outcome } });
    assert.equal(r1.status, 201);
    const { txId } = await r1.json();
    return call(`/v1/sign/requests/${requestId}/result`, { txId, plaintext: resultPlaintext });
  }

  it("healthz 는 토큰 없이 살아 있는지만", async () => {
    const res = await fetch(`${base}/healthz`);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("토큰이 없거나 틀리면 401", async () => {
    assert.equal((await call("/v1/sign/requests", {}, null)).status, 401);
    assert.equal((await call("/v1/sign/requests", {}, "w".repeat(40))).status, 401);
  });

  it("서명 → 검증된 결과, 방식은 fake", async () => {
    const res = await requestThenResult("signed");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.state, "signed");
    assert.equal(body.method, "fake");
    assert.equal(body.signedPlaintext, plaintext);
    assert.equal(body.signerId, "fake:creator-1");
    assert.ok(body.signature);
  });

  it("대기·거절·만료는 상태만", async () => {
    for (const outcome of ["pending", "rejected", "expired"]) {
      const body = await (await requestThenResult(outcome)).json();
      assert.deepEqual(body, { requestId: "req_1", state: outcome });
    }
  });

  it("다른 원문에 한 서명은 409 (원문 대조)", async () => {
    assert.equal((await requestThenResult("tampered")).status, 409);
  });

  it("앱이 보낸 원문과 다르면 409", async () => {
    assert.equal((await requestThenResult("signed", `${plaintext}x`)).status, 409);
  });

  it("서명 값이 훼손되면 422", async () => {
    assert.equal((await requestThenResult("badsig")).status, 422);
  });

  it("다른 요청 ID 로 거래 번호를 쓰면 404", async () => {
    assert.equal((await requestThenResult("signed", plaintext, "req_2")).status, 404);
  });

  it("입력 검사", async () => {
    assert.equal((await call("/v1/sign/requests", { requestId: "bad id!", plaintext, signer: {} })).status, 400);
    assert.equal((await call("/v1/sign/requests", { requestId: "r", plaintext: "x".repeat(2000), signer: {} })).status, 400);
    assert.equal((await call("/v1/sign/requests", { requestId: "r", plaintext, signer: {} })).status, 400);
    const big = await fetch(`${base}/v1/sign/requests`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ pad: "x".repeat(20_000) }),
    }).catch(() => ({ status: 413 }));
    assert.equal(big.status, 413);
    const text = await fetch(`${base}/v1/sign/requests`, {
      method: "POST",
      headers: { "content-type": "text/plain", authorization: `Bearer ${TOKEN}` },
      body: "{}",
    });
    assert.equal(text.status, 415);
  });
});

describe("드림시큐리티 어댑터 (명세 전)", () => {
  it("키를 다 채워도 명세 반영 전에는 503", async () => {
    const env = {
      ...baseEnv,
      SIGN_ADAPTER: "dreamsecurity",
      DREAM_API_BASE_URL: "https://api.dreamsecurity.com",
      DREAM_CLIENT_ID: "id",
      DREAM_CLIENT_SECRET: "secret",
      OUTBOUND_ALLOWED_HOSTS: "api.dreamsecurity.com",
    };
    const server = await startServer(env);
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const res = await fetch(`${base}/v1/sign/requests`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ requestId: "r1", plaintext: "p", signer: { name: "x" } }),
      });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "adapter_not_ready" });
    } finally {
      server.close();
    }
  });
});
