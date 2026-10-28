// AWS KMS 복호화 — 브라우저가 공개키(RSA-OAEP SHA-256)로 감싼 데이터 키를 푼다.
// 키 정책·IAM 정책이 이 서버 IP 와 RSAES_OAEP_SHA_256 방식에서 온 kms:Decrypt 만 허용한다.
// 호출 주소는 서울 리전 KMS 하나로 코드에 박혀 있다 — 환경 변수로 다른 곳을 가리킬 수 없다.

import { outboundRequest } from "./outbound.mjs";
import { amzDates, signV4 } from "./sigv4.mjs";

export const KMS_REGION = "ap-northeast-2";
export const KMS_HOST = `kms.${KMS_REGION}.amazonaws.com`;
export const KMS_ALGORITHM = "RSAES_OAEP_SHA_256";

/** KMS 가 거부했을 때. type 은 AccessDeniedException 같은 AWS 오류 이름, message 는 AWS 원문. */
export class KmsError extends Error {
  constructor(type, message, status) {
    super(`${type}: ${message}`);
    this.type = type;
    this.awsMessage = message;
    this.status = status;
  }
}

export function kmsReady(kms) {
  const missing = [
    ["keyId", "KMS_KEY_ID"],
    ["accessKeyId", "AWS_ACCESS_KEY_ID"],
    ["secretAccessKey", "AWS_SECRET_ACCESS_KEY"],
  ]
    .filter(([key]) => !kms[key])
    .map(([, env]) => env);
  if (kms.region && kms.region !== KMS_REGION) return { ok: false, reason: `AWS_REGION 은 ${KMS_REGION} 이어야 한다` };
  if (missing.length > 0) return { ok: false, reason: `환경 변수 비어 있음: ${missing.join(", ")}` };
  // __FILL_ME__ 의 가운데만 바꿔 넣으면 앞뒤 __ 가 값에 남는다(2026-10-28 실제로 났다). 값은 말하지 않고 칸 이름만
  const leftover = [
    ["keyId", "KMS_KEY_ID"],
    ["accessKeyId", "AWS_ACCESS_KEY_ID"],
    ["secretAccessKey", "AWS_SECRET_ACCESS_KEY"],
  ]
    .filter(([key]) => /^__|__$|\s/.test(kms[key]))
    .map(([, env]) => env);
  if (leftover.length > 0) return { ok: false, reason: `값 앞뒤에 __ 나 공백이 남아 있음: ${leftover.join(", ")}` };
  return { ok: true };
}

/**
 * @param {{ keyId: string, accessKeyId: string, secretAccessKey: string }} kms
 * @param {Buffer} ciphertext 감싼 데이터 키
 * @param {{ algorithm?: string, now?: Date, request?: typeof outboundRequest }} [opts] algorithm 은 자체 시험(조건 확인)에서만 바꾼다
 * @returns {Promise<Buffer>} 데이터 키
 */
export async function kmsDecrypt(kms, ciphertext, opts = {}) {
  const ready = kmsReady(kms);
  if (!ready.ok) throw new KmsError("NotConfigured", ready.reason, 0);

  const body = JSON.stringify({
    CiphertextBlob: ciphertext.toString("base64"),
    KeyId: kms.keyId,
    EncryptionAlgorithm: opts.algorithm ?? KMS_ALGORITHM,
  });
  const { amzDate } = amzDates(opts.now ?? new Date());
  const headers = {
    "content-type": "application/x-amz-json-1.1",
    host: KMS_HOST,
    "x-amz-date": amzDate,
    "x-amz-target": "TrentService.Decrypt",
  };
  const authorization = signV4({
    method: "POST",
    path: "/",
    headers,
    body,
    region: KMS_REGION,
    service: "kms",
    accessKeyId: kms.accessKeyId,
    secretAccessKey: kms.secretAccessKey,
    amzDate,
  });

  const request = opts.request ?? outboundRequest;
  const res = await request(`https://${KMS_HOST}/`, {
    allowedHosts: [KMS_HOST],
    method: "POST",
    headers: { ...headers, authorization, "content-length": String(Buffer.byteLength(body)) },
    body,
  });

  let parsed = {};
  try {
    parsed = JSON.parse(res.body || "{}");
  } catch {
    // 아래에서 상태 코드로 판단
  }
  if (res.status !== 200) {
    const type = String(parsed.__type ?? `Http${res.status}`).split("#").pop();
    throw new KmsError(type, String(parsed.message ?? parsed.Message ?? ""), res.status);
  }
  if (typeof parsed.Plaintext !== "string") throw new KmsError("MalformedResponse", "Plaintext 가 없다", res.status);
  return Buffer.from(parsed.Plaintext, "base64");
}
