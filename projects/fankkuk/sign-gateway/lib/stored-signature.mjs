// 송장 출력 때 저장된 카카오 서명을 다시 검증한다 — address-protection INV-P4 (a).
//
// DB 의 서명 기록은 「서명값 칸이 비어 있지 않음 · 방식 kakao · 원문 해시」만으로는 믿지 않는다 — DB 에 method='kakao', signature='x' 줄을
// 심으면 그것만으로 주소가 열리기 때문이다. 그래서 주소를 열기 전에 저장된 서명값(전자서명문 base64)을 승인 때와 같은 검증에 다시 넣는다:
//   1. 전자서명문 검증(lib/signed-data.cjs) — 서명 값 · 인증서 체인(DREAM_CA_FILE 의 카카오 인증기관) · 폐기 여부(OCSP, 허용 목록 통로)
//   2. 카카오가 감싼 틀을 벗긴 원문(dreamsecurity.cjs 의 unwrapKakaoContent) 중 하나가 그 주문 서명 요청의 원문과 바이트 단위로 같다
// 하나라도 어긋나면 false — 판정은 「유효한 승인 없음」으로 거부한다. 오류도 false 다(fail closed).
// 로그·오류에 서명값·원문을 넣지 않는다.

import fs from "node:fs";
import { createRequire } from "node:module";
import { outboundRequest } from "./outbound.mjs";

const require = createRequire(import.meta.url);
const signedDataLib = require("./signed-data.cjs");
const { unwrapKakaoContent } = require("./adapters/dreamsecurity.cjs");

const MAX_SIGNATURE_LENGTH = 65536; // DB 의 서명값 칸 상한과 같다
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * @param {{ anchors: import("node:crypto").X509Certificate[], ocspPost: (url: string, body: Buffer) => Promise<Buffer>, now?: () => number }} o
 * @returns {(input: { signature: string, plaintext: string }) => Promise<boolean>}
 */
export function createStoredSignatureVerifier({ anchors, ocspPost, now = () => Date.now() }) {
  return async function verifyStoredSignature({ signature, plaintext }) {
    if (typeof signature !== "string" || signature.length === 0 || signature.length > MAX_SIGNATURE_LENGTH || !BASE64.test(signature)) return false;
    if (typeof plaintext !== "string" || plaintext.length === 0) return false;
    if (!Array.isArray(anchors) || anchors.length === 0) return false;
    let verified;
    try {
      verified = await signedDataLib.verifySignedData({ signedData: Buffer.from(signature, "base64"), anchors, now: new Date(now()), ocspPost });
    } catch {
      return false;
    }
    const want = Buffer.from(plaintext, "utf8");
    return unwrapKakaoContent(verified.content).some((c) => Buffer.from(c, "utf8").equals(want));
  };
}

/**
 * 게이트웨이 설정에서 검증 함수를 만든다. 카카오 인증기관 인증서(DREAM_CA_FILE)를 못 읽으면 { ok: false } —
 * 그러면 송장 출력 함수에 검증 함수를 넣지 않고, 묶음은 kakao 서명 기록을 전부 거부한다.
 */
export function loadStoredSignatureVerifier(config, { request = outboundRequest } = {}) {
  const caFile = config.dreamsecurity?.caFile;
  if (!caFile) return { ok: false, reason: "DREAM_CA_FILE 비어 있음 — 카카오 서명 송장은 거부" };
  let anchors;
  try {
    anchors = signedDataLib.parsePemBundle(fs.readFileSync(caFile, "utf8"));
  } catch {
    return { ok: false, reason: "카카오 인증기관 인증서를 읽지 못함 (DREAM_CA_FILE) — 카카오 서명 송장은 거부" };
  }
  if (anchors.length === 0) return { ok: false, reason: "카카오 인증기관 인증서가 없음 (DREAM_CA_FILE) — 카카오 서명 송장은 거부" };
  async function ocspPost(ocspUrl, body) {
    const res = await request(ocspUrl, {
      allowedHosts: config.allowedHosts,
      method: "POST",
      headers: { "content-type": "application/ocsp-request", accept: "application/ocsp-response" },
      body,
    });
    if (res.status !== 200 || !res.rawBody) throw new Error("ocsp http");
    return res.rawBody;
  }
  return { ok: true, verify: createStoredSignatureVerifier({ anchors, ocspPost }) };
}
