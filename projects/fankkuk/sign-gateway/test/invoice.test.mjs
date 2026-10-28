// 송장 출력(주소를 여는 곳) — 게이트웨이 쪽 조립·통로·HTTP.  node --test test/*.test.mjs

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { createAdapter } from "../lib/adapters/index.mjs";
import { createHandler } from "../lib/app.mjs";
import { ConfigError, loadConfig } from "../lib/config.mjs";
import { createGuardedFetch } from "../lib/guarded-fetch.mjs";
import { createInvoicePrinters, invoiceReady } from "../lib/invoice.mjs";
import { OutboundBlockedError } from "../lib/outbound.mjs";

const TOKEN = "t".repeat(40);
const baseEnv = { SIGN_ADAPTER: "test", GATEWAY_TOKEN: TOKEN, LISTEN_HOST: "127.0.0.1", LISTEN_PORT: "8443" };
const REF = "abcdefghijklmnopqrst";
const full = {
  ...baseEnv,
  SUPABASE_URL: `https://${REF}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: "pk",
  DECRYPT_DB_KEY: "dbkey",
  DECRYPT_OWNER_USER_ID: "11111111-2222-3333-4444-555555555555",
  KMS_KEY_ID: "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555",
  AWS_ACCESS_KEY_ID: "AKIA1",
  AWS_SECRET_ACCESS_KEY: "s3cr3t",
};

describe("송장 출력 — 설정", () => {
  it("DB 주소는 <프로젝트>.supabase.co 꼴만, 대표 ID 는 계정 ID 꼴만", () => {
    assert.equal(loadConfig(full).invoice.supabaseUrl, `https://${REF}.supabase.co`);
    for (const bad of [`http://${REF}.supabase.co`, "https://evil.com", `https://${REF}.supabase.co.evil.com`, "https://127.0.0.1"]) {
      assert.throws(() => loadConfig({ ...full, SUPABASE_URL: bad }), ConfigError, bad);
    }
    assert.throws(() => loadConfig({ ...full, DECRYPT_OWNER_USER_ID: "admin" }), ConfigError);
  });
});

describe("송장 출력 — 조립", () => {
  const stubModule = (capture) => async () => ({
    createGatewayDecryptors: (o) => {
      capture(o);
      return { printLabel: async () => ({ kind: "failed" }), printReturnLabel: async () => ({ kind: "failed" }) };
    },
  });

  it("칸이 하나라도 비면 준비 안 됨 — 묶음을 불러오지도 않는다", async () => {
    const r = await createInvoicePrinters(loadConfig({ ...full, DECRYPT_DB_KEY: "" }), { load: async () => assert.fail("불렀다") });
    assert.equal(r.printers, null);
    assert.match(r.ready.reason, /DECRYPT_DB_KEY/);
    assert.equal(invoiceReady(loadConfig({ ...full, KMS_KEY_ID: "" })).ok, false);
    assert.equal(invoiceReady(loadConfig(full)).ok, true);
  });

  it("운영으로 고정해 넘긴다 — 서버 설정의 NODE_ENV 로 가짜 서명 창구가 열리지 않는다", async () => {
    let got;
    await createInvoicePrinters(loadConfig({ ...full, NODE_ENV: "development" }), { load: stubModule((o) => (got = o)) });
    assert.equal(got.env.NODE_ENV, "production");
    assert.equal(got.env.FANKKUK_TEST_SITE, undefined);
    assert.equal(got.dbKey, "dbkey");
    assert.equal(got.ownerUserId, "11111111-2222-3333-4444-555555555555");
  });

  it("실패경로: 시험 사이트 표시는 DB 주소가 코드의 시험 프로젝트 목록에 없으면 서버가 뜨지 않는다(지금 목록은 비어 있다)", () => {
    assert.throws(() => loadConfig({ ...full, FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://x.example" }), ConfigError);
    assert.throws(() => loadConfig({ ...full, FANKKUK_TEST_SITE: "1" }, { testSiteHosts: ["zzzzzzzzzzzzzzzzzzzz.supabase.co"] }), ConfigError);
  });

  it("시험 사이트 표시는 목록의 DB 주소일 때만 켜져서 넘어간다", async () => {
    let got;
    const config = loadConfig({ ...full, FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://x.example" }, { testSiteHosts: [`${REF}.supabase.co`] });
    await createInvoicePrinters(config, { load: stubModule((o) => (got = o)) });
    assert.equal(got.env.FANKKUK_TEST_SITE, "1");
    assert.equal(got.env.APP_ORIGIN, "https://x.example");
  });

  it("DB 요청 통로는 그 프로젝트 주소 하나만 통과시킨다", async () => {
    let got;
    await createInvoicePrinters(loadConfig(full), { load: stubModule((o) => (got = o)) });
    await assert.rejects(got.fetch("https://evil.com/rest/v1/"), OutboundBlockedError);
    await assert.rejects(got.fetch("https://other000000000000000.supabase.co/"), OutboundBlockedError);
    await assert.rejects(got.fetch(`http://${REF}.supabase.co/`), OutboundBlockedError);
  });

  it("키 풀기는 KMS 로 간다", async () => {
    let got;
    await createInvoicePrinters(loadConfig({ ...full, AWS_ACCESS_KEY_ID: "" }), { load: stubModule((o) => (got = o)) });
    assert.equal(got, undefined); // KMS 설정이 비면 준비 안 됨
  });
});

describe("송장 출력 — 허용 목록 통로", () => {
  it("목록의 주소로 보낸 요청을 Response 로 돌려준다(204 는 빈 본문)", async () => {
    const calls = [];
    const f = createGuardedFetch([`${REF}.supabase.co`], async (url, opts) => {
      calls.push({ url, opts });
      return url.endsWith("/none")
        ? { status: 204, headers: {}, body: "" }
        : { status: 200, headers: { "content-type": "application/json" }, body: '{"a":1}' };
    });
    const res = await f(`https://${REF}.supabase.co/rest/v1/rpc/x`, { method: "POST", headers: new Headers({ apikey: "k" }), body: "{}" });
    assert.deepEqual(await res.json(), { a: 1 });
    assert.equal(calls[0].opts.method, "POST");
    assert.equal(calls[0].opts.headers.apikey, "k");
    assert.equal(calls[0].opts.body, "{}");
    assert.deepEqual(calls[0].opts.allowedHosts, [`${REF}.supabase.co`]);
    assert.equal((await f(`https://${REF}.supabase.co/none`)).status, 204);
  });
});

describe("송장 출력 — HTTP", () => {
  let server;
  let base;
  let seen;
  const listen = (handler) =>
    new Promise((resolve) => {
      const s = http.createServer(handler);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });

  before(async () => {
    const config = loadConfig(baseEnv);
    const invoice = {
      printers: {
        printLabel: async (input) => ((seen = input), { kind: "denied", reason: "not_owner" }),
        printReturnLabel: async () => ({ kind: "not_linked" }),
      },
    };
    server = await listen(createHandler({ config, adapter: createAdapter(config), invoice, log: () => {} }));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  const post = (url, body, token = TOKEN) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  it("게이트웨이 토큰 없이는 401 — 송장 출력 함수를 부르지 않는다", async () => {
    seen = undefined;
    assert.equal((await post(`${base}/v1/invoice/label`, { qr: "Q", accessToken: "A" }, null)).status, 401);
    assert.equal((await post(`${base}/v1/invoice/label`, { qr: "Q", accessToken: "A" }, "w".repeat(40))).status, 401);
    assert.equal(seen, undefined);
  });

  it("QR·로그인 토큰을 그대로 넘기고 결과를 그대로 돌려준다", async () => {
    const res = await post(`${base}/v1/invoice/label`, { qr: "Q1", accessToken: "A1" });
    assert.deepEqual(await res.json(), { kind: "denied", reason: "not_owner" });
    assert.deepEqual(seen, { qr: "Q1", accessToken: "A1" });
    assert.deepEqual(await (await post(`${base}/v1/invoice/return-label`, { qr: "Q", accessToken: "A" })).json(), { kind: "not_linked" });
  });

  it("입력이 비면 400", async () => {
    assert.equal((await post(`${base}/v1/invoice/label`, { qr: "", accessToken: "A" })).status, 400);
    assert.equal((await post(`${base}/v1/invoice/label`, { qr: "Q" })).status, 400);
  });

  it("송장 출력 함수가 준비 안 됐으면 503", async () => {
    const config = loadConfig(baseEnv);
    const s2 = await listen(createHandler({ config, adapter: createAdapter(config), invoice: { printers: null }, log: () => {} }));
    try {
      const res = await post(`http://127.0.0.1:${s2.address().port}/v1/invoice/label`, { qr: "Q", accessToken: "A" });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "invoice_not_ready" });
    } finally {
      s2.close();
    }
  });
});
