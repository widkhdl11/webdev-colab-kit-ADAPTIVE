// 송장 출력 — 주소를 여는 유일한 곳(address-protection 「복호화 함수」). 판정 코드는 앱의 송장 출력 함수를 그대로 묶어 온
// dist/decryptor.mjs 이고(빌드: scripts/build-decryptor.mjs), 여기서는 재료만 넣는다:
//   키 풀기 = KMS(이 서버 IP·RSAES_OAEP_SHA_256 만 허용) / DB·로그인 확인 = 허용 목록을 거치는 통로(이 프로젝트의 Supabase 주소 하나)
//   / 복호화 전용 DB 토큰·대표 ID = 이 서버 환경 변수에만.
// 카카오 서명 재검증(INV-P4 a): 저장된 전자서명문을 체인·서명·폐기까지 다시 검증하는 함수(stored-signature.mjs)를 묶음에 넣는다.
// 카카오 인증기관 인증서(DREAM_CA_FILE)가 없으면 넣지 않고, 그러면 묶음이 kakao 서명 기록을 전부 거부한다(fail closed).
// 서명 재검증의 가짜 창구는 NODE_ENV=production 으로 고정해 넘기므로, 시험 사이트 판정(FANKKUK_TEST_SITE=1 + 시험 사이트 주소) 없이는 열리지 않는다.

import { createGuardedFetch } from "./guarded-fetch.mjs";
import { kmsDecrypt, kmsReady } from "./kms.mjs";
import { loadStoredSignatureVerifier } from "./stored-signature.mjs";

const DIST_URL = new URL("../dist/decryptor.mjs", import.meta.url);

export function invoiceReady(config) {
  const missing = [
    ["supabaseUrl", "SUPABASE_URL"],
    ["supabaseKey", "SUPABASE_PUBLISHABLE_KEY"],
    ["dbKey", "DECRYPT_DB_KEY"],
    ["ownerUserId", "DECRYPT_OWNER_USER_ID"],
  ]
    .filter(([key]) => !config.invoice[key])
    .map(([, env]) => env);
  if (missing.length > 0) return { ok: false, reason: `환경 변수 비어 있음: ${missing.join(", ")}` };
  const kms = kmsReady(config.kms);
  if (!kms.ok) return { ok: false, reason: `KMS — ${kms.reason}` };
  return { ok: true };
}

/** 묶어 온 송장 출력 함수를 게이트웨이 재료로 만든다. load·unwrap·signatureCheck 는 시험에서 바꿔 끼운다. */
export async function createInvoicePrinters(config, { load = () => import(DIST_URL.href), unwrap, signatureCheck } = {}) {
  const ready = invoiceReady(config);
  if (!ready.ok) return { ready, printers: null };
  const mod = await load();
  const check = signatureCheck ?? loadStoredSignatureVerifier(config);
  const env = {
    NODE_ENV: "production",
    SUPABASE_URL: config.invoice.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: config.invoice.supabaseKey,
    FANKKUK_TEST_SITE: config.invoice.testSite ?? undefined,
    APP_ORIGIN: config.invoice.appOrigin ?? undefined,
  };
  const printers = mod.createGatewayDecryptors({
    env,
    dbKey: config.invoice.dbKey,
    ownerUserId: config.invoice.ownerUserId,
    unwrap:
      unwrap ??
      (async (wrappedKeyBase64) => new Uint8Array(await kmsDecrypt(config.kms, Buffer.from(wrappedKeyBase64, "base64")))),
    fetch: createGuardedFetch([new URL(config.invoice.supabaseUrl).hostname]),
    // 없으면(ok: false) 넘기지 않는다 — 묶음은 검증 함수가 없으면 kakao 서명 기록을 승인으로 치지 않는다
    verifyStoredSignature: check.ok ? check.verify : undefined,
  });
  return { ready, printers, signatureCheck: check.ok ? { ok: true } : { ok: false, reason: check.reason } };
}
