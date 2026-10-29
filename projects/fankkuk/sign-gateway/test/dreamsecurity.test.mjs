// 드림시큐리티 어댑터 — 가짜 드림 서버(outboundRequest 자리에 끼우는 함수)·가짜 연동 모듈·시험용 인증기관으로 끝까지 돌린다.
// node --test test/*.test.mjs  (의존성 없음, 네트워크 없음)

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { after, before, beforeEach, describe, it } from "node:test";
import { createAdapter } from "../lib/adapters/index.mjs";
import { createHandler } from "../lib/app.mjs";
import { ConfigError, loadConfig } from "../lib/config.mjs";
import { assertAllowedUrl } from "../lib/outbound.mjs";
import { makeCert, makeOcspResponse, makePki, makeSignedData } from "./helpers/pki.mjs";

const require = createRequire(import.meta.url);
const { unwrapKakaoContent, parseIssueDate, kstStamp } = require("../lib/adapters/dreamsecurity.cjs");
const signedDataLib = require("../lib/signed-data.cjs");

const TOKEN = "t".repeat(40);
// 가이드 2.5 예시의 data 안 키 이름(외부 데이터 꼴이라 문자열로만 쓴다)
const KAKAO_DATA_KEY = "서명원문";
const PLAINTEXT = "FK-0001|별빛|편지|2";
const REQUEST_MESSAGE = "팬꾹 선물 수령 승인";
const IDENTITY = { v: 1, name: "김하루", birth: "19990101", phone: "01012345678", creatorId: "creator-1" };

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s) => Buffer.from(s, "base64").toString("utf8");

/** 연동 모듈 대역 — 실제 모듈의 공개 함수와 같은 이름. 암호화는 표시만 붙인 base64 다. */
function fakeModule() {
  let siteUrl = null;
  return {
    initCalls: [],
    keyInit(file, password) {
      this.initCalls.push({ file, password });
    },
    setSiteUrl(v) {
      siteUrl = v;
    },
    getSiteUrl: () => siteUrl,
    getServiceId: () => "service-1",
    RSAEncrypt: (s) => `enc:${b64(s)}`,
    RSAServerEncrypt: (publicKey, s) => `srv:${publicKey}:${b64(s)}`,
    getResult: (hub) => {
      if (!hub.startsWith("hub:")) throw new Error("bad hub");
      return unb64(hub.slice(4));
    },
    aesDecode: (provider, value) => {
      if (provider !== "kakao" || !value.startsWith("aes:")) throw new Error("bad aes");
      return unb64(value.slice(4));
    },
  };
}

const kstIssue = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().replace("T", " ").replace("Z", "");

/** 가짜 드림 서버 + OCSP 응답기. scenario 를 시험마다 바꾼다. */
function fakeDream(ctx) {
  const tokens = new Map();
  const calls = [];
  async function request(url, opts) {
    assertAllowedUrl(url, opts.allowedHosts); // 진짜 창구와 같은 허용 목록 검사
    const u = new URL(url);
    calls.push({ url, body: opts.body });
    const s = ctx.scenario;
    const json = (o) => ({ status: 200, headers: {}, body: JSON.stringify(o), rawBody: Buffer.from(JSON.stringify(o)) });
    if (u.hostname === "ocsp.kakao.com") {
      if (s.ocspFail) throw new Error("connect");
      const body = makeOcspResponse({ request: opts.body, responderKey: s.ocspKey ?? ctx.pki.ca.key, status: s.ocspStatus });
      return { status: 200, headers: {}, body: "", rawBody: body };
    }
    if (u.pathname === "/agent/get-token") {
      const b = JSON.parse(opts.body);
      const [stamp, clientTxId] = unb64(b.encClientTxId.slice(4)).split("|");
      const userToken = `ut_${crypto.randomUUID()}`;
      tokens.set(userToken, { stamp, clientTxId, serviceId: b.serviceId, siteUrl: b.siteUrl });
      return json({ resultCode: "2000", userToken, publicKey: "PK" });
    }
    if (u.pathname === "/agent/auth-enc-request") {
      const b = JSON.parse(opts.body);
      const tx = tokens.get(b.userToken);
      const [, pk, data] = b.encUserReqInfo.split(":");
      assert.equal(pk, "PK");
      tx.jsonData = JSON.parse(unb64(data));
      return json({ resultCode: "2000", userToken: b.userToken });
    }
    if (u.pathname === "/agent/auth-result") {
      const b = JSON.parse(opts.body);
      const tx = tokens.get(b.userToken);
      const code = s.codes.length > 0 ? s.codes.shift() : "2000";
      if (code !== "2000") return json({ resultCode: code, resultMsg: "x" });
      const signContents = tx.jsonData.signContents;
      const content = s.content ? s.content(signContents) : JSON.stringify({ txId: "relay-tx", data: JSON.stringify({ [KAKAO_DATA_KEY]: signContents }) });
      const signedData = makeSignedData({ content: Buffer.from(content, "utf8"), signer: s.signer ?? ctx.pki.leaf, tamper: s.tamper });
      const who = { ...{ name: tx.jsonData.username, phone: "010-1234-5678", birth: tx.jsonData.userbirthday }, ...s.who };
      const result = {
        clientTxId: s.clientTxId ?? tx.clientTxId,
        txId: "relay-tx",
        certTxId: "kakao-tx",
        serviceType: "sign",
        providerId: "kakao",
        encUsername: `aes:${b64(who.name)}`,
        encUserphone: `aes:${b64(who.phone)}`,
        encUserbirthday: `aes:${b64(who.birth)}`,
        encCi: "aes:should-not-be-read",
        signedData: signedData.toString("base64"),
        issuer: "EZIOK Agent1",
        issueDate: s.issueDate ?? kstIssue(ctx.clock),
      };
      return json({ serviceId: "service-1", hubToken: `hub:${b64(JSON.stringify(result))}`, keyToken: null, resultCode: "2000" });
    }
    throw new Error(`모르는 주소 ${url}`);
  }
  return { request, calls, tokens };
}

function sealIdentity(identity, kmsPublicKey) {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(identity), "utf8"), cipher.final(), cipher.getAuthTag()]);
  const wrappedKey = crypto.publicEncrypt({ key: kmsPublicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, dek);
  return { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: wrappedKey.toString("base64"), iv: iv.toString("base64"), ciphertext: ct.toString("base64") };
}

describe("드림시큐리티 어댑터 (가짜 드림 서버)", () => {
  const ctx = { scenario: null, clock: Date.now(), pki: null };
  let dir;
  let server;
  let base;
  let fake;
  let mod;
  let kms;
  let env;

  before(async () => {
    ctx.pki = makePki();
    kms = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgw-dream-"));
    fs.writeFileSync(path.join(dir, "key.dat"), "not-a-real-key");
    fs.writeFileSync(path.join(dir, "ca.pem"), ctx.pki.ca.pem);
    fs.writeFileSync(path.join(dir, "module.cjs"), "// 대역 — 시험에서는 loadModule 로 바꿔 끼운다");
    env = {
      SIGN_ADAPTER: "dreamsecurity",
      GATEWAY_TOKEN: TOKEN,
      LISTEN_HOST: "127.0.0.1",
      DREAM_KEY_FILE: path.join(dir, "key.dat"),
      DREAM_KEY_PASSWORD: "pw-secret",
      DREAM_SITE_URL: "www.fankkuk.com",
      DREAM_ENV: "development",
      DREAM_CA_FILE: path.join(dir, "ca.pem"),
      DREAM_MODULE_FILE: path.join(dir, "module.cjs"),
      OUTBOUND_ALLOWED_HOSTS: "scert-dir.ez-iok.com, ocsp.kakao.com",
    };
    const config = loadConfig(env);
    fake = fakeDream(ctx);
    mod = fakeModule();
    const adapter = createAdapter(config, {
      outboundRequest: fake.request,
      unwrapKey: async (w) => crypto.privateDecrypt({ key: kms.privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, w),
      unwrapReady: () => ({ ok: true }),
      loadModule: () => mod,
      now: () => ctx.clock,
    });
    server = http.createServer(createHandler({ config, adapter, log: () => {} }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => {
    ctx.clock = Date.now();
    ctx.scenario = { codes: [] };
  });

  const call = (p, body) =>
    fetch(`${base}${p}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });
  const start = async (identity = IDENTITY, extra = {}) => {
    const res = await call("/v1/sign/requests", {
      requestId: "req_1",
      plaintext: PLAINTEXT,
      requestMessage: REQUEST_MESSAGE,
      signer: { envelope: sealIdentity(identity, kms.publicKey), creatorId: identity.creatorId, ...extra },
    });
    return res;
  };
  const result = (txId, plaintext = PLAINTEXT, requestId = "req_1") => call(`/v1/sign/requests/${requestId}/result`, { txId, plaintext });

  it("토큰 → 요청 → 대기 → 서명: 검증된 결과만, 서명자 식별값·인증서는 응답에 없다", async () => {
    ctx.scenario.codes = ["1014"];
    const r1 = await start();
    assert.equal(r1.status, 201);
    const created = await r1.json();
    assert.match(created.txId, /^FANKKUK[0-9a-f]{32}$/);
    assert.equal(created.requestId, "req_1");
    assert.equal(Date.parse(created.expiresAt), ctx.clock + 5 * 60 * 1000);

    // 딜러사로 간 값: 개발 주소, 거래 ID 는 「한국시간|clientTxId」, 서명 요청은 카카오·sign·PlainText·hubtoken·MB
    const tx = [...fake.tokens.values()].find((t) => t.clientTxId === created.txId);
    assert.equal(tx.stamp, kstStamp(ctx.clock));
    assert.match(tx.stamp, /^\d{14}$/);
    assert.equal(tx.serviceId, "service-1");
    assert.equal(tx.siteUrl, "www.fankkuk.com");
    assert.deepEqual(tx.jsonData, {
      siteUrl: "www.fankkuk.com",
      serviceType: "sign",
      providerId: "kakao",
      username: "김하루",
      userphone: "01012345678",
      userbirthday: "19990101",
      browserType: "MB",
      signTargetType: "PlainText",
      signContents: PLAINTEXT,
      signRequestMessage: REQUEST_MESSAGE,
      retTransferType: "hubtoken",
      returnUrl: "https://www.fankkuk.com",
    });
    assert.ok(fake.calls.every((c) => c.url.startsWith("https://scert-dir.ez-iok.com/agent/") || c.url.startsWith("https://ocsp.kakao.com/")));
    assert.deepEqual(mod.initCalls.at(-1), { file: env.DREAM_KEY_FILE, password: "pw-secret" });

    const pending = await (await result(created.txId)).json();
    assert.deepEqual(pending, { requestId: "req_1", state: "pending" });

    const signedRes = await result(created.txId);
    assert.equal(signedRes.status, 200);
    const signed = await signedRes.json();
    assert.deepEqual(Object.keys(signed).sort(), ["method", "requestId", "signature", "signedAt", "signedPlaintext", "state"]);
    assert.equal(signed.state, "signed");
    assert.equal(signed.method, "kakao");
    assert.equal(signed.signedPlaintext, PLAINTEXT);
    assert.ok(Buffer.from(signed.signature, "base64").length > 500); // 전자서명문 그대로
    assert.ok(Math.abs(Date.parse(signed.signedAt) - Date.now()) < 60_000);

    // hubToken 은 한 번만 나온다 — 다시 물어도 같은 결과(딜러사에 다시 묻지 않음)
    const before = fake.calls.length;
    assert.deepEqual(await (await result(created.txId)).json(), signed);
    assert.equal(fake.calls.length, before);
  });

  it("1012(결과 시간 초과) → expired", async () => {
    ctx.scenario.codes = ["1012"];
    const { txId } = await (await start()).json();
    assert.deepEqual(await (await result(txId)).json(), { requestId: "req_1", state: "expired" });
  });

  it("5003(입력 정보와 인증사업자 정보 불일치) → rejected", async () => {
    ctx.scenario.codes = ["5003"];
    const { txId } = await (await start()).json();
    assert.deepEqual(await (await result(txId)).json(), { requestId: "req_1", state: "rejected" });
  });

  it("모르는 결과 코드 → 502, 다음 조회에서 다시 묻는다", async () => {
    ctx.scenario.codes = ["2999"];
    const { txId } = await (await start()).json();
    const res = await result(txId);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "upstream_error" });
    assert.equal((await (await result(txId)).json()).state, "signed");
  });

  for (const [label, who] of [
    ["이름", { name: "김하로" }],
    ["휴대폰", { phone: "010-1234-5679" }],
    ["생년월일", { birth: "19990102" }],
  ]) {
    it(`대상자 세 값 중 ${label}만 달라도 422 signer_mismatch`, async () => {
      ctx.scenario.who = who;
      const { txId } = await (await start()).json();
      const res = await result(txId);
      assert.equal(res.status, 422);
      assert.deepEqual(await res.json(), { error: "signer_mismatch" });
      // 끝난 결과로 남는다
      assert.equal((await result(txId)).status, 422);
    });
  }

  it("결과의 거래 ID 가 이 거래 것이 아니면 422 signer_mismatch", async () => {
    ctx.scenario.clientTxId = "FANKKUKother";
    const { txId } = await (await start()).json();
    assert.deepEqual(await (await result(txId)).json(), { error: "signer_mismatch" });
  });

  it("다른 원문에 한 서명은 409 plaintext_mismatch", async () => {
    ctx.scenario.content = (c) => JSON.stringify({ txId: "relay-tx", data: JSON.stringify({ [KAKAO_DATA_KEY]: `${c}#x` }) });
    const { txId } = await (await start()).json();
    const res = await result(txId);
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "plaintext_mismatch" });
  });

  it("앱이 보낸 원문이 거래 원문과 다르면 409", async () => {
    const { txId } = await (await start()).json();
    assert.equal((await result(txId, `${PLAINTEXT}x`)).status, 409);
  });

  it("서명 값 변조 → 422 signature_invalid", async () => {
    ctx.scenario.tamper = "signature";
    const { txId } = await (await start()).json();
    const res = await result(txId);
    assert.equal(res.status, 422);
    assert.deepEqual(await res.json(), { error: "signature_invalid" });
  });

  it("원문 해시(messageDigest) 불일치 → 422", async () => {
    ctx.scenario.tamper = "digest";
    const { txId } = await (await start()).json();
    assert.equal((await result(txId)).status, 422);
  });

  it("설정한 인증기관이 발급하지 않은 인증서 → 422", async () => {
    const other = makePki();
    ctx.scenario.signer = other.leaf;
    const { txId } = await (await start()).json();
    assert.deepEqual(await (await result(txId)).json(), { error: "signature_invalid" });
  });

  it("폐기된 인증서(OCSP revoked) → 422", async () => {
    ctx.scenario.ocspStatus = "revoked";
    const { txId } = await (await start()).json();
    assert.equal((await result(txId)).status, 422);
  });

  it("OCSP 에 묻지 못하면(연결 실패) 거부 — fail closed", async () => {
    ctx.scenario.ocspFail = true;
    const { txId } = await (await start()).json();
    assert.equal((await result(txId)).status, 422);
  });

  it("OCSP 응답 서명이 인증기관 것이 아니면 거부", async () => {
    ctx.scenario.ocspKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const { txId } = await (await start()).json();
    assert.equal((await result(txId)).status, 422);
  });

  it("발급 시각이 10분 넘게 지난 결과 → 422", async () => {
    ctx.scenario.issueDate = kstIssue(ctx.clock - 11 * 60 * 1000);
    const { txId } = await (await start()).json();
    assert.equal((await result(txId)).status, 422);
  });

  it("만료(5분) 지난 txId·모르는 txId·재시작 뒤 txId 는 expired", async () => {
    const { txId } = await (await start()).json();
    ctx.clock += 5 * 60 * 1000 + 1000;
    assert.deepEqual(await (await result(txId)).json(), { requestId: "req_1", state: "expired" });
    assert.deepEqual(await (await result("FANKKUKunknown")).json(), { requestId: "req_1", state: "expired" });
  });

  it("다른 요청 ID 로 거래 번호를 쓰면 404", async () => {
    const { txId } = await (await start()).json();
    assert.equal((await result(txId, PLAINTEXT, "req_2")).status, 404);
  });

  it("같은 거래를 동시에 물어도 딜러사에는 결과를 한 번만 묻고 둘 다 같은 답", async () => {
    const { txId } = await (await start()).json();
    const n = fake.calls.filter((c) => c.url.endsWith("/auth-result")).length;
    const [a, b] = await Promise.all([result(txId), result(txId)]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal((await a.json()).state, "signed");
    assert.equal((await b.json()).state, "signed");
    assert.equal(fake.calls.filter((c) => c.url.endsWith("/auth-result")).length, n + 1);
  });

  it("봉투가 아니거나 열리지 않거나, 크리에이터 ID 가 다르면 400 invalid_signer", async () => {
    const bad = await call("/v1/sign/requests", { requestId: "r", plaintext: PLAINTEXT, requestMessage: REQUEST_MESSAGE, signer: { envelope: { v: 1 } } });
    assert.equal(bad.status, 400);
    const sealed = sealIdentity(IDENTITY, kms.publicKey);
    const broken = { ...sealed, ciphertext: Buffer.from(Buffer.from(sealed.ciphertext, "base64").map((x, i) => (i === 0 ? x ^ 1 : x))).toString("base64") };
    assert.equal((await call("/v1/sign/requests", { requestId: "r", plaintext: PLAINTEXT, requestMessage: REQUEST_MESSAGE, signer: { envelope: broken } })).status, 400);
    assert.equal((await start(IDENTITY, { creatorId: "creator-2" })).status, 400);
    // 크리에이터 ID 없이 봉투만 오면 대조할 수 없다 — 받지 않는다
    assert.equal((await start(IDENTITY, { creatorId: undefined })).status, 400);
    assert.equal((await start(IDENTITY, { creatorId: "" })).status, 400);
    assert.equal((await start(IDENTITY, { creatorId: "creator-1" })).status, 201);
    assert.equal((await start({ ...IDENTITY, phone: "0212345678" })).status, 400);
  });

  it("요청 구분 문구는 1~40자 필수", async () => {
    const body = { requestId: "r", plaintext: PLAINTEXT, signer: { envelope: sealIdentity(IDENTITY, kms.publicKey), creatorId: IDENTITY.creatorId } };
    assert.equal((await call("/v1/sign/requests", body)).status, 400);
    assert.equal((await call("/v1/sign/requests", { ...body, requestMessage: "가".repeat(41) })).status, 400);
  });
});

describe("드림시큐리티 어댑터 준비 상태", () => {
  const baseEnv = {
    SIGN_ADAPTER: "dreamsecurity",
    GATEWAY_TOKEN: TOKEN,
    LISTEN_HOST: "127.0.0.1",
    DREAM_KEY_FILE: "/nonexistent/key.dat",
    DREAM_KEY_PASSWORD: "pw",
    DREAM_SITE_URL: "www.fankkuk.com",
    DREAM_ENV: "development",
    DREAM_CA_FILE: "/nonexistent/ca.pem",
    DREAM_MODULE_FILE: "/nonexistent/eziok.cjs",
    OUTBOUND_ALLOWED_HOSTS: "scert-dir.ez-iok.com",
  };
  const deps = { unwrapReady: () => ({ ok: true }), loadModule: () => fakeModule(), outboundRequest: async () => assert.fail("불렀다") };

  it("연동 모듈 파일이 없으면 이유와 함께 준비 안 됨 → 서명 요청 503", async () => {
    const config = loadConfig(baseEnv);
    const adapter = createAdapter(config, deps);
    const r = adapter.ready();
    assert.equal(r.ok, false);
    assert.match(r.reason, /연동 모듈/);
    assert.doesNotMatch(r.reason, /pw/);
    const server = http.createServer(createHandler({ config, adapter, log: () => {} }));
    await new Promise((res) => server.listen(0, "127.0.0.1", res));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/v1/sign/requests`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ requestId: "r1", plaintext: "p", requestMessage: "m", signer: { envelope: {} } }),
      });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "adapter_not_ready" });
    } finally {
      server.close();
    }
  });

  it("빈 칸·허용 목록 누락·키 파일 없음은 각각 이름으로 알린다", () => {
    assert.match(createAdapter(loadConfig({ ...baseEnv, DREAM_KEY_PASSWORD: "__FILL_ME__" }), deps).ready().reason, /DREAM_KEY_PASSWORD/);
    assert.match(createAdapter(loadConfig({ ...baseEnv, OUTBOUND_ALLOWED_HOSTS: "cert-dir.ez-iok.com" }), deps).ready().reason, /scert-dir\.ez-iok\.com/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgw-ready-"));
    try {
      fs.writeFileSync(path.join(dir, "m.cjs"), "");
      const r = createAdapter(loadConfig({ ...baseEnv, DREAM_MODULE_FILE: path.join(dir, "m.cjs") }), deps).ready();
      assert.match(r.reason, /DREAM_KEY_FILE/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("설정 검사: DREAM_ENV·접두사·도메인 꼴, ez-iok.com 은 허용 범위 안", () => {
    assert.throws(() => loadConfig({ ...baseEnv, DREAM_ENV: "staging" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, DREAM_TX_PREFIX: "TOOLONGPREFIX" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, DREAM_TX_PREFIX: "FAN-KK" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, DREAM_SITE_URL: "https://www.fankkuk.com" }), ConfigError);
    assert.throws(() => loadConfig({ ...baseEnv, OUTBOUND_ALLOWED_HOSTS: "ez-iok.com.evil.com" }), ConfigError);
    assert.equal(loadConfig(baseEnv).dreamsecurity.txPrefix, "FANKKUK");
    assert.deepEqual(loadConfig({ ...baseEnv, OUTBOUND_ALLOWED_HOSTS: "cert-dir.ez-iok.com,scert-dir.ez-iok.com" }).allowedHosts, [
      "cert-dir.ez-iok.com",
      "scert-dir.ez-iok.com",
    ]);
    assert.match(loadConfig({ ...baseEnv, DREAM_MODULE_FILE: undefined }).dreamsecurity.moduleFile, /lib[\\/]vendor[\\/]eziok_Key_Manager\.cjs$/);
  });
});

describe("카카오 원문 감싸기·시각", () => {
  it("감싼 틀을 벗긴 후보: 감싸지 않은 원문 · data · data 안 값 하나", () => {
    assert.ok(unwrapKakaoContent(Buffer.from(JSON.stringify({ txId: "t", data: JSON.stringify({ [KAKAO_DATA_KEY]: "TEST 입니다." }) }))).includes("TEST 입니다."));
    assert.ok(unwrapKakaoContent(Buffer.from(JSON.stringify({ txId: "t", data: "plain" }))).includes("plain"));
    assert.ok(unwrapKakaoContent(Buffer.from("TEST 입니다.")).includes("TEST 입니다."));
    // 값이 둘이면 data 자체만 후보
    const two = JSON.stringify({ a: "1", b: "2" });
    const c = unwrapKakaoContent(Buffer.from(JSON.stringify({ txId: "t", data: two })));
    assert.ok(c.includes(two));
    assert.ok(!c.includes("1"));
  });
  it("발급일은 한국시간", () => {
    assert.equal(parseIssueDate("2022-08-01 20:11:03.003"), Date.parse("2022-08-01T11:11:03.003Z"));
    assert.ok(Number.isNaN(parseIssueDate("2022/08/01")));
    assert.equal(kstStamp(Date.parse("2026-10-28T15:30:00Z")), "20261029003000");
  });
});

describe("전자서명문 검증 (직접 만든 인증기관)", () => {
  const now = new Date();
  const pki = makePki();
  const okPost = async (url, body) => makeOcspResponse({ request: body, responderKey: pki.ca.key });

  it("정상: 원문·서명 시각을 꺼낸다 (RSA·ECDSA)", async () => {
    const out = await signedDataLib.verifySignedData({
      signedData: makeSignedData({ content: Buffer.from("원문"), signer: pki.leaf }),
      anchors: [pki.ca.x509],
      now,
      ocspPost: okPost,
    });
    assert.equal(out.content.toString(), "원문");
    assert.ok(out.signingTime instanceof Date);
    const ec = makePki({ leafKeyType: "ec" });
    const ecOut = await signedDataLib.verifySignedData({
      signedData: makeSignedData({ content: Buffer.from("x"), signer: ec.leaf }),
      anchors: [ec.ca.x509],
      now,
      ocspPost: async (u, b) => makeOcspResponse({ request: b, responderKey: ec.ca.key }),
    });
    assert.equal(ecOut.content.toString(), "x");
  });

  const reject = (input, reason) =>
    assert.rejects(signedDataLib.verifySignedData({ anchors: [pki.ca.x509], now, ocspPost: okPost, ...input }), (e) => e instanceof signedDataLib.SignedDataError && e.reason === reason);

  it("거부 이유", async () => {
    await reject({ signedData: makeSignedData({ content: Buffer.from("a"), signer: pki.leaf, tamper: "signature" }) }, "signature_mismatch");
    await reject({ signedData: makeSignedData({ content: Buffer.from("a"), signer: pki.leaf, tamper: "digest" }) }, "message_digest_mismatch");
    await reject({ signedData: Buffer.from("not der") }, "signed_data_malformed");
    const expired = makeCert({ cn: "old", issuer: pki.ca, ocspUrl: "https://ocsp.kakao.com/", notBefore: new Date(Date.now() - 3 * 864e5), notAfter: new Date(Date.now() - 864e5) });
    await reject({ signedData: makeSignedData({ content: Buffer.from("a"), signer: expired }) }, "certificate_expired");
    const noOcsp = makeCert({ cn: "no-ocsp", issuer: pki.ca });
    await reject({ signedData: makeSignedData({ content: Buffer.from("a"), signer: noOcsp }) }, "ocsp_url_missing");
    await reject({ signedData: makeSignedData({ content: Buffer.from("a"), signer: pki.leaf }), ocspPost: async (u, b) => makeOcspResponse({ request: b, responderKey: pki.ca.key, status: "unknown" }) }, "ocsp_status_unknown");
    await reject({ signedData: makeSignedData({ content: Buffer.from("a"), signer: pki.leaf }), ocspPost: async (u, b) => makeOcspResponse({ request: b, responderKey: pki.ca.key, nextUpdate: new Date(Date.now() - 3600e3) }) }, "ocsp_stale");
    await reject({ signedData: makeSignedData({ content: Buffer.from("a"), signer: pki.leaf }), anchors: [] }, "no_trust_anchor");
  });

  it("중간 인증서를 거쳐 인증기관까지 이어진다, 서명 인증서를 발급한 쪽에 OCSP 를 묻는다", async () => {
    const mid = makeCert({ cn: "Mid CA", issuer: pki.ca, ca: true });
    const leaf = makeCert({ cn: "leaf2", issuer: mid, ocspUrl: "https://ocsp.kakao.com/" });
    const out = await signedDataLib.verifySignedData({
      signedData: makeSignedData({ content: Buffer.from("m"), signer: leaf, certs: [leaf.raw, mid.raw] }),
      anchors: [pki.ca.x509],
      now,
      ocspPost: async (u, b) => makeOcspResponse({ request: b, responderKey: mid.key }),
    });
    assert.equal(out.content.toString(), "m");
    // CA 표시가 없는 중간 인증서는 받지 않는다
    const notCa = makeCert({ cn: "Not CA", issuer: pki.ca });
    const leaf3 = makeCert({ cn: "leaf3", issuer: notCa, ocspUrl: "https://ocsp.kakao.com/" });
    await reject({ signedData: makeSignedData({ content: Buffer.from("m"), signer: leaf3, certs: [leaf3.raw, notCa.raw] }) }, "chain_untrusted");
  });

  it("OCSP 위임 응답기(id-kp-OCSPSigning)를 받는다, EKU 없는 인증서가 서명한 응답은 거부", async () => {
    const der = require("../lib/der.cjs");
    const responder = makeCert({ cn: "OCSP", issuer: pki.ca, eku: ["1.3.6.1.5.5.7.3.9"] });
    const plain = makeCert({ cn: "plain", issuer: pki.ca });
    const withCert = (r) => async (u, b) => {
      // 응답에 응답기 인증서를 [0] certs 로 붙여 다시 만든다
      const resp = der.parse(makeOcspResponse({ request: b, responderKey: r.key }));
      const basicOctets = resp.children()[1].children()[0].children()[1].content;
      const [tbs, alg, sig] = der.parse(basicOctets).children();
      const basic = der.enc.seq(tbs.raw, alg.raw, sig.raw, der.enc.explicit(0, der.enc.seq(r.raw)));
      return der.enc.seq(der.enc.tlv(0x0a, Buffer.from([0])), der.enc.explicit(0, der.enc.seq(der.enc.oid("1.3.6.1.5.5.7.48.1.1"), der.enc.octet(basic))));
    };
    const sd = makeSignedData({ content: Buffer.from("a"), signer: pki.leaf });
    const out = await signedDataLib.verifySignedData({ signedData: sd, anchors: [pki.ca.x509], now, ocspPost: withCert(responder) });
    assert.equal(out.content.toString(), "a");
    await reject({ signedData: sd, ocspPost: withCert(plain) }, "ocsp_signature");
  });
});
