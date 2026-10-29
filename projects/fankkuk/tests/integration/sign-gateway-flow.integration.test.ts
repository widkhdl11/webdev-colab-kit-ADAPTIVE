import { constants, createHash, privateDecrypt } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGatewayDecryptors } from "@/app/_sign-gateway/decryptor-entry";
import { creatorAddressPlaintext } from "@/entities/address/model/creator-address-plaintext";
import { createGatewayLabelPrinters } from "@/features/invoice-print/api/gateway-client";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";
import { sealEnvelope } from "@/shared/lib/envelope/envelope";
import { adminClient, creatorActorOf, deleteTestOrders, psql, recordSignTx, settleArgs, signedInClient, startSignRpc } from "./helpers";
import { ADDRESS_CREATOR_ID, decryptorDbKey, LABEL, logRows, OWNER_ID, testKeyPair, type TestKeys } from "./invoice-helpers";
import { FAN_PASS, fanSetsWaybill, inspect, paidGift, parcelState, receiveAndLabel, waybill } from "./office-helpers";
import { createTestCreator, removeTestCreator, TEST_CREATOR } from "./test-creator";

// 전 흐름: 등록 → 승인 → 복호화 → 라벨 출력 — 서명 게이트웨이(sign.fankkuk.com)가 주소를 여는 곳일 때
// (address-protection 「복호화 함수」·INV-P4·P7·P8, approval-signature INV-S2·S11·S12, external-connections INV-P2·P3).
//
// 게이트웨이를 이 프로세스 안에서 실제 HTTP 로 띄운다(sign-gateway/lib/app.mjs). 서명은 게이트웨이의 시험 어댑터(가짜 서명, 방식 fake)가 만든다.
// 키 풀기는 게이트웨이의 KMS 요청 코드(서명 v4·요청 본문)를 그대로 지나고, 받는 쪽만 이 시험의 비밀키로 흉내 낸다 —
// 실제 KMS 는 게이트웨이 서버 IP 에서만 풀리므로(키 정책) 여기서 부를 수 없다. 실제 KMS 는 서버의 자체 시험(scripts/kms-selftest.sh)이 본다.
// DB 는 로컬 Supabase(http)라 게이트웨이의 허용 목록 통로(https·supabase.co 만) 대신 기본 fetch 를 넣는다 — 통로 자체는 게이트웨이 유닛 시험이 본다.

type GatewayModules = {
  app: { createHandler: (o: unknown) => http.RequestListener };
  config: { loadConfig: (env: Record<string, string>) => unknown };
  adapters: { createAdapter: (config: unknown) => unknown };
  storedSignature: {
    createStoredSignatureVerifier: (o: {
      anchors: unknown[];
      ocspPost: (url: string, body: Buffer) => Promise<Buffer>;
    }) => (i: { signature: string; plaintext: string }) => Promise<boolean>;
  };
  kms: {
    kmsDecrypt: (
      kms: { keyId: string; accessKeyId: string; secretAccessKey: string },
      ciphertext: Buffer,
      opts: { request: (url: string, o: { body: string; headers: Record<string, string> }) => Promise<{ status: number; headers: object; body: string }> },
    ) => Promise<Buffer>;
  };
};

const GATEWAY_TOKEN = "e2e-gateway-token-".padEnd(48, "x");
const gatewayDir = new URL("../../sign-gateway/lib/", import.meta.url);
const load = async <T,>(name: string): Promise<T> => (await import(/* @vite-ignore */ new URL(name, gatewayDir).href)) as T;

let keys: TestKeys;
let mods: GatewayModules;
const kmsCalls: { algorithm: string; target: string; signed: boolean }[] = [];

/** KMS 를 흉내 낸다 — 요청 꼴을 기록하고, 정해진 방식(RSAES_OAEP_SHA_256)일 때만 이 시험의 비밀키로 푼다. */
async function fakeKms(_url: string, o: { body: string; headers: Record<string, string> }) {
  const body = JSON.parse(o.body) as { CiphertextBlob: string; EncryptionAlgorithm: string };
  kmsCalls.push({
    algorithm: body.EncryptionAlgorithm,
    target: o.headers["x-amz-target"] ?? "",
    signed: /^AWS4-HMAC-SHA256 Credential=AKIA-E2E\//.test(o.headers.authorization ?? ""),
  });
  if (body.EncryptionAlgorithm !== "RSAES_OAEP_SHA_256") {
    return { status: 400, headers: {}, body: JSON.stringify({ __type: "AccessDeniedException", message: "algorithm" }) };
  }
  const plain = privateDecrypt({ key: keys.privatePem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(body.CiphertextBlob, "base64"));
  return { status: 200, headers: {}, body: JSON.stringify({ Plaintext: plain.toString("base64") }) };
}

type TestPki = {
  makePki: () => { ca: { x509: unknown; key: unknown }; leaf: unknown };
  makeSignedData: (o: { content: Buffer; signer: unknown }) => Buffer;
  makeOcspResponse: (o: { request: Buffer; responderKey: unknown }) => Buffer;
};

/**
 * 게이트웨이를 띄운다. testSite: 시험 사이트를 붙인 게이트웨이인가(저장된 가짜 서명을 재검증에서 받는가)
 * verifyStoredSignature: 게이트웨이가 묶음에 넣는 카카오 서명 재검증 함수(INV-P4 a) — 없으면 kakao 기록은 거부된다
 */
async function startGateway(
  testSite: boolean,
  verifyStoredSignature?: (i: { signature: string; plaintext: string }) => Promise<boolean>,
): Promise<{ url: string; close: () => void }> {
  const config = mods.config.loadConfig({ SIGN_ADAPTER: "test", GATEWAY_TOKEN, LISTEN_HOST: "127.0.0.1", LISTEN_PORT: "8443" });
  const kmsCfg = { keyId: "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555", accessKeyId: "AKIA-E2E", secretAccessKey: "e2e" };
  const printers = createGatewayDecryptors({
    // 게이트웨이가 넘기는 것과 같은 값 — 운영 고정, 시험 사이트 표시는 그 게이트웨이 설정에 있을 때만
    env: {
      NODE_ENV: "production",
      SUPABASE_URL: process.env.FK_TEST_API_URL,
      SUPABASE_PUBLISHABLE_KEY: process.env.FK_TEST_ANON_KEY,
      ...(testSite ? { FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] } : {}),
    },
    dbKey: decryptorDbKey(),
    ownerUserId: OWNER_ID,
    unwrap: async (b64) => new Uint8Array(await mods.kms.kmsDecrypt(kmsCfg, Buffer.from(b64, "base64"), { request: fakeKms })),
    fetch,
    newWaybill: waybill,
    verifyStoredSignature,
  });
  const handler = mods.app.createHandler({ config, adapter: mods.adapters.createAdapter(config), invoice: { printers }, log: () => {} });
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

async function gatewayPost(url: string, path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${GATEWAY_TOKEN}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function tokenOf(loginId: string): Promise<string> {
  const { data } = await (await signedInClient(loginId)).auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}

/** ① 등록 — 크리에이터 브라우저가 쓰는 봉인 함수로 봉인하고, 주소 등록 DB 함수로 저장한다(INV-P1·P13) */
async function registerAddress(): Promise<void> {
  psql(`delete from pii.creator_addresses where creator_id = '${ADDRESS_CREATOR_ID}'`);
  const envelope = await sealEnvelope(creatorAddressPlaintext({ creatorId: ADDRESS_CREATOR_ID, ...LABEL }), keys.publicKey);
  const r = await adminClient().rpc("set_creator_address", { p_actor_id: TEST_CREATOR.profileId, p_envelope: envelope, p_label: "home", p_method: "fake" });
  if (r.error) throw new Error(`set_creator_address 실패: ${r.error.message}`);
}

/**
 * ② 승인 — 「승인」을 누른 것처럼 서명 요청을 만들고(INV-S17), 정해진 HTTP 약속 그대로 게이트웨이 시험 어댑터에 요청·결과 조회를 한 뒤
 * 돌려받은 서명된 원문·서명값·서명 시각·방식으로 승인 DB 함수에 낸다(INV-S2·S11·S12). 서명 대상은 연결 봉투 그대로 넘긴다(INV-S4).
 */
async function approveViaGateway(gw: string, requestId: string): Promise<{ method: string; savedHashMatches: boolean }> {
  const actor = creatorActorOf(requestId);
  const started = await startSignRpc(requestId, actor);
  expect(started.result).toBe("started");
  const signId = started.sign_request_id!;
  const plaintext = started.plaintext!;
  const req = await gatewayPost(gw, "/v1/sign/requests", { requestId: signId, plaintext, requestMessage: "팬꾹 선물 수령 승인", signer: { envelope: started.envelope, creatorId: started.creator_id } });
  expect(req.status).toBe(201);
  await recordSignTx(signId, actor, req.json.txId as string);
  const res = await gatewayPost(gw, `/v1/sign/requests/${signId}/result`, { txId: req.json.txId, plaintext });
  expect(res.status).toBe(200);
  expect(res.json.state).toBe("signed");
  // INV-S2: 돌려받은 서명된 원문은 저장 원문과 바이트 단위로 같다
  expect(res.json.signedPlaintext).toBe(plaintext);
  const r = await adminClient().rpc(
    "settle_approval_sign",
    settleArgs(signId, actor, res.json.signedPlaintext as string, {
      p_signature: res.json.signature as string,
      p_signed_at: res.json.signedAt as string,
      p_method: res.json.method as string,
    }),
  );
  if (r.error || r.data !== "approved") throw new Error(`settle_approval_sign 실패: ${r.error?.message ?? String(r.data)}`);
  const hash = createHash("sha256").update(plaintext, "utf8").digest("hex");
  const saved = psql(`select content_hash from public.approval_signatures where sign_request_id = '${signId}'`);
  return { method: res.json.method as string, savedHashMatches: saved === hash };
}

/** ③ 입고·검수 — 팬이 송장번호를 적고, 직원이 받아 라벨을 붙이고 검수 통과 */
async function receiveAndInspect(boxId: string): Promise<string> {
  const no = waybill();
  await fanSetsWaybill(boxId, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
  return qr;
}

beforeAll(async () => {
  keys = await testKeyPair();
  mods = {
    app: await load("app.mjs"),
    config: await load("config.mjs"),
    adapters: await load("adapters/index.mjs"),
    storedSignature: await load("stored-signature.mjs"),
    kms: await load("kms.mjs"),
  };
  deleteTestOrders();
  removeTestCreator();
  createTestCreator();
});

afterAll(() => {
  deleteTestOrders();
  removeTestCreator();
});

describe("전 흐름 — 등록 → 승인 → 복호화 → 라벨 출력 (게이트웨이가 주소를 연다)", () => {
  it("INV-P4·P7·P8·S12: 시험 어댑터로 승인한 주문의 주소가 게이트웨이에서 KMS 요청으로 풀려 라벨 다섯 칸으로 나온다", async () => {
    const gw = await startGateway(true);
    try {
      await registerAddress();
      const order = await paidGift(1, ADDRESS_CREATOR_ID);
      const signed = await approveViaGateway(gw.url, order.requestId);
      expect(signed).toEqual({ method: "fake", savedHashMatches: true });
      // INV-S12: 서명 기록은 방식·서명값·원문 해시만 — 서명자 식별값 칸은 비어 있다
      expect(psql(`select method || '|' || (signer_id is null) || '|' || (signature is not null) from public.approval_signatures where request_id = '${order.requestId}'`)).toBe("fake|true|true");

      const qr = await receiveAndInspect(order.boxIds[0]!);
      kmsCalls.length = 0;

      // ④ 복호화 → ⑤ 라벨 출력: 앱 서버의 게이트웨이 호출부가 대표 로그인 토큰과 QR 만 보낸다
      const app = createGatewayLabelPrinters({ url: gw.url, token: GATEWAY_TOKEN });
      const res = await app.printLabel({ qr, accessToken: await tokenOf("fankkuk_admin") });

      expect(res).toMatchObject({ kind: "printed", reprint: false, label: LABEL });
      if (res.kind !== "printed") throw new Error("열리지 않음");
      expect(Object.keys(res.label).sort()).toEqual(["address1", "address2", "phone", "recipientName", "zipCode"]);
      expect(kmsCalls).toEqual([{ algorithm: "RSAES_OAEP_SHA_256", target: "TrentService.Decrypt", signed: true }]);
      expect(parcelState(qr)).toBe("label_printed");
      expect(psql(`select outbound_waybill_no from public.office_parcels where qr_code = '${qr}'`)).toBe(res.waybill);
      expect(logRows(order.orderId)).toEqual([`opened:1:${OWNER_ID}`]);
    } finally {
      gw.close();
    }
  });

  it("INV-P8 (실패경로): 직원 로그인 토큰이면 게이트웨이가 거부 — KMS 를 부르지 않고 거부 기록 1줄", async () => {
    const gw = await startGateway(true);
    try {
      await registerAddress();
      const order = await paidGift(1, ADDRESS_CREATOR_ID);
      await approveViaGateway(gw.url, order.requestId);
      const qr = await receiveAndInspect(order.boxIds[0]!);
      kmsCalls.length = 0;
      const res = await createGatewayLabelPrinters({ url: gw.url, token: GATEWAY_TOKEN }).printLabel({ qr, accessToken: await tokenOf("fankkuk_staff") });
      expect(res).toEqual({ kind: "denied", reason: "not_owner" });
      expect(kmsCalls).toEqual([]);
      expect(parcelState(qr)).toBe("inspected");
    } finally {
      gw.close();
    }
  });

  it("INV-S11·TS1 (실패경로): 시험 사이트 표시가 없는 게이트웨이는 저장된 가짜 서명을 재검증에서 받지 않는다 — 열지 않는다", async () => {
    const signGw = await startGateway(true);
    const prodGw = await startGateway(false);
    try {
      await registerAddress();
      const order = await paidGift(1, ADDRESS_CREATOR_ID);
      await approveViaGateway(signGw.url, order.requestId);
      const qr = await receiveAndInspect(order.boxIds[0]!);
      kmsCalls.length = 0;
      const res = await createGatewayLabelPrinters({ url: prodGw.url, token: GATEWAY_TOKEN }).printLabel({ qr, accessToken: await tokenOf("fankkuk_admin") });
      expect(res).toEqual({ kind: "denied", reason: "no_valid_approval" });
      expect(kmsCalls).toEqual([]);
    } finally {
      signGw.close();
      prodGw.close();
    }
  });

  describe("INV-P4 (a): 운영 게이트웨이는 저장된 kakao 서명값을 다시 검증한다", () => {
    let pki: TestPki;
    let testCa: ReturnType<TestPki["makePki"]>;
    let verifier: (i: { signature: string; plaintext: string }) => Promise<boolean>;
    beforeAll(async () => {
      pki = (await import(/* @vite-ignore */ new URL("../../sign-gateway/test/helpers/pki.mjs", import.meta.url).href)) as TestPki;
      testCa = pki.makePki();
      verifier = mods.storedSignature.createStoredSignatureVerifier({
        anchors: [testCa.ca.x509],
        ocspPost: async (_url, body) => pki.makeOcspResponse({ request: body, responderKey: testCa.ca.key }),
      });
    });

    /** 승인된 주문의 서명 기록을 DB 에서 직접 kakao 줄로 바꿔 심는다(잠긴 표의 막기 트리거를 끄고) */
    function plantKakao(requestId: string, signature: string): void {
      psql(
        `set session_replication_role = replica; update public.approval_signatures set method = 'kakao', signature = '${signature.replace(/'/g, "''")}' where request_id = '${requestId.replace(/'/g, "''")}';`,
      );
    }
    function signRequestPlaintext(requestId: string): string {
      return psql(
        `select sr.plaintext from public.approval_signatures s join public.approval_sign_requests sr on sr.id = s.sign_request_id where s.request_id = '${requestId.replace(/'/g, "''")}'`,
      );
    }

    it("INV-P4 (실패경로 a): DB 에 심은 kakao 줄(signature='x')은 검증 함수가 있는 운영 게이트웨이에서도 열리지 않는다 — KMS 를 부르지 않는다", async () => {
      const signGw = await startGateway(true);
      const prodGw = await startGateway(false, verifier);
      try {
        await registerAddress();
        const order = await paidGift(1, ADDRESS_CREATOR_ID);
        await approveViaGateway(signGw.url, order.requestId);
        plantKakao(order.requestId, "x");
        expect(psql(`select method || '|' || signature from public.approval_signatures where request_id = '${order.requestId}'`)).toBe("kakao|x");
        const qr = await receiveAndInspect(order.boxIds[0]!);
        kmsCalls.length = 0;
        const res = await createGatewayLabelPrinters({ url: prodGw.url, token: GATEWAY_TOKEN }).printLabel({ qr, accessToken: await tokenOf("fankkuk_admin") });
        expect(res).toEqual({ kind: "denied", reason: "no_valid_approval" });
        expect(kmsCalls).toEqual([]);
        expect(logRows(order.orderId)).toEqual([`denied:no_valid_approval:${OWNER_ID}`]);
      } finally {
        signGw.close();
        prodGw.close();
      }
    });

    it("INV-P4 (a): 인증기관 체인이 맞는 전자서명문이 그 주문 서명 요청 원문을 덮으면 운영 게이트웨이가 연다 (마이그레이션 20261029000011 필요)", async () => {
      const signGw = await startGateway(true);
      const prodGw = await startGateway(false, verifier);
      try {
        await registerAddress();
        const order = await paidGift(1, ADDRESS_CREATOR_ID);
        await approveViaGateway(signGw.url, order.requestId);
        const plaintext = signRequestPlaintext(order.requestId);
        const cms = pki.makeSignedData({ content: Buffer.from(plaintext, "utf8"), signer: testCa.leaf }).toString("base64");
        plantKakao(order.requestId, cms);
        const qr = await receiveAndInspect(order.boxIds[0]!);
        const res = await createGatewayLabelPrinters({ url: prodGw.url, token: GATEWAY_TOKEN }).printLabel({ qr, accessToken: await tokenOf("fankkuk_admin") });
        expect(res).toMatchObject({ kind: "printed", label: LABEL });
      } finally {
        signGw.close();
        prodGw.close();
      }
    });
  });

  it("실패경로: 게이트웨이 토큰이 틀리면 송장 출력 함수까지 가지 않는다 — 앱에는 failed", async () => {
    const gw = await startGateway(true);
    try {
      const res = await createGatewayLabelPrinters({ url: gw.url, token: "w".repeat(48) }).printLabel({ qr: "Q", accessToken: await tokenOf("fankkuk_admin") });
      expect(res).toEqual({ kind: "failed" });
    } finally {
      gw.close();
    }
  });
});
