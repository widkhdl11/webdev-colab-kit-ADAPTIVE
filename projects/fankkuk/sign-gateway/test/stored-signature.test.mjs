// 송장 출력 때 저장된 카카오 서명 재검증 — address-protection INV-P4 (a).
// DB 에 method='kakao', signature='x' 같은 줄을 심어도 주소가 열리지 않아야 한다: 서명값을 체인·서명·폐기까지 다시 검증하고
// 감싼 틀을 벗긴 원문이 그 주문 서명 요청의 원문과 같을 때만 true.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadConfig } from "../lib/config.mjs";
import { createStoredSignatureVerifier, loadStoredSignatureVerifier } from "../lib/stored-signature.mjs";
import { makeCert, makeOcspResponse, makePki, makeSignedData } from "./helpers/pki.mjs";

const PLAINTEXT = "팬꾹 선물 수령 승인\n주문번호: FC-AAAAA\n보낸 팬: 별빛\n선물: 꽃 1상자";
const kakaoWrapped = (plain) => JSON.stringify({ txId: "tx_1", data: JSON.stringify(Object.fromEntries([["서명원문", plain]])) });

describe("INV-P4 (a): 저장된 카카오 서명 재검증", () => {
  const pki = makePki();
  const okPost = async (_url, body) => makeOcspResponse({ request: body, responderKey: pki.ca.key });
  const verify = createStoredSignatureVerifier({ anchors: [pki.ca.x509], ocspPost: okPost });
  const sign = (content, signer = pki.leaf, extra = {}) =>
    makeSignedData({ content: Buffer.from(content, "utf8"), signer, ...extra }).toString("base64");

  it("INV-P4 (a): 인증기관 체인·서명·폐기가 맞고 감싼 틀을 벗긴 원문이 그 원문과 같으면 true", async () => {
    assert.equal(await verify({ signature: sign(kakaoWrapped(PLAINTEXT)), plaintext: PLAINTEXT }), true);
    assert.equal(await verify({ signature: sign(PLAINTEXT), plaintext: PLAINTEXT }), true);
  });

  it("INV-P4 (실패경로 a): DB 에 심은 가짜 서명값(signature='x' 등)은 false", async () => {
    for (const fake of ["x", "fake-signature", "", "AAAA", Buffer.from("not der").toString("base64"), "!!!"]) {
      assert.equal(await verify({ signature: fake, plaintext: PLAINTEXT }), false, fake);
    }
  });

  it("INV-P4 (실패경로 a): 진짜 서명이라도 다른 주문의 원문이면 false — 서명 요청 원문과 바이트 단위로 같아야 한다", async () => {
    const other = PLAINTEXT.replace("FC-AAAAA", "FC-BBBBB");
    assert.equal(await verify({ signature: sign(kakaoWrapped(other)), plaintext: PLAINTEXT }), false);
    assert.equal(await verify({ signature: sign(kakaoWrapped(`${PLAINTEXT} `)), plaintext: PLAINTEXT }), false);
  });

  it("INV-P4 (실패경로 a): 다른 인증기관이 발급한 인증서로 서명했으면 false", async () => {
    const otherCa = makeCert({ cn: "Other CA", ca: true });
    const leaf = makeCert({ cn: "signer", issuer: otherCa, ocspUrl: "https://ocsp.kakao.com/ocsp" });
    assert.equal(await verify({ signature: sign(kakaoWrapped(PLAINTEXT), leaf), plaintext: PLAINTEXT }), false);
  });

  it("INV-P4 (실패경로 a): 서명 값이 훼손됐으면 false", async () => {
    assert.equal(await verify({ signature: sign(kakaoWrapped(PLAINTEXT), pki.leaf, { tamper: "signature" }), plaintext: PLAINTEXT }), false);
  });

  it("INV-P4 (실패경로 a): 폐기됐거나 폐기 조회가 안 되면 false(fail closed)", async () => {
    const revoked = createStoredSignatureVerifier({
      anchors: [pki.ca.x509],
      ocspPost: async (_url, body) => makeOcspResponse({ request: body, responderKey: pki.ca.key, status: "revoked" }),
    });
    assert.equal(await revoked({ signature: sign(kakaoWrapped(PLAINTEXT)), plaintext: PLAINTEXT }), false);
    const down = createStoredSignatureVerifier({ anchors: [pki.ca.x509], ocspPost: async () => assert.fail("x") });
    assert.equal(await down({ signature: sign(kakaoWrapped(PLAINTEXT)), plaintext: PLAINTEXT }), false);
  });

  it("INV-P4 (실패경로 a): 인증기관 인증서가 없으면 false", async () => {
    const none = createStoredSignatureVerifier({ anchors: [], ocspPost: okPost });
    assert.equal(await none({ signature: sign(kakaoWrapped(PLAINTEXT)), plaintext: PLAINTEXT }), false);
  });

  it("설정의 인증기관 인증서(DREAM_CA_FILE)로 만든다 — 없거나 못 읽으면 ok: false(묶음에 검증 함수를 넣지 않는다)", async () => {
    const env = { SIGN_ADAPTER: "test", GATEWAY_TOKEN: "t".repeat(40), LISTEN_HOST: "127.0.0.1", LISTEN_PORT: "8443" };
    assert.equal(loadStoredSignatureVerifier(loadConfig(env)).ok, false);
    assert.equal(loadStoredSignatureVerifier(loadConfig({ ...env, DREAM_CA_FILE: path.join(os.tmpdir(), "no-such-ca.pem") })).ok, false);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stored-sig-"));
    try {
      const caFile = path.join(dir, "ca.pem");
      fs.writeFileSync(caFile, pki.ca.pem);
      const posted = [];
      const r = loadStoredSignatureVerifier(loadConfig({ ...env, DREAM_CA_FILE: caFile }), {
        request: async (url, opts) => {
          posted.push({ url, allowedHosts: opts.allowedHosts });
          return { status: 200, rawBody: makeOcspResponse({ request: opts.body, responderKey: pki.ca.key }) };
        },
      });
      assert.equal(r.ok, true);
      assert.equal(await r.verify({ signature: sign(kakaoWrapped(PLAINTEXT)), plaintext: PLAINTEXT }), true);
      assert.equal(await r.verify({ signature: "x", plaintext: PLAINTEXT }), false);
      // 폐기 조회는 허용 목록 통로로 나간다
      assert.equal(posted.length, 1);
      assert.equal(posted[0].url, "https://ocsp.kakao.com/ocsp");
      assert.ok(Array.isArray(posted[0].allowedHosts));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
