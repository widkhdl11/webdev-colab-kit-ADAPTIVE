// AWS Signature Version 4 — KMS 를 부를 때 쓰는 요청 서명. AWS SDK 대신 이 파일 하나로 한다(의존성 없음).
// 서명할 헤더는 부르는 쪽이 넘긴 것 전부다(host·x-amz-date 포함). 경로는 "/" 처럼 이미 인코딩된 값을 받는다.

import crypto from "node:crypto";

const sha256Hex = (data) => crypto.createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data, "utf8").digest();

/** 2026-10-28T05:00:00.000Z → { amzDate: "20261028T050000Z", dateStamp: "20261028" } */
export function amzDates(date) {
  const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * @param {{ method: string, path: string, query?: string, headers: Record<string,string>, body: string,
 *           region: string, service: string, accessKeyId: string, secretAccessKey: string, amzDate: string }} req
 * @returns {string} Authorization 헤더 값
 */
export function signV4(req) {
  const dateStamp = req.amzDate.slice(0, 8);
  const entries = Object.entries(req.headers)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, " ")])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalHeaders = entries.map(([k, v]) => `${k}:${v}\n`).join("");
  const signedHeaders = entries.map(([k]) => k).join(";");
  const canonicalRequest = [
    req.method,
    req.path,
    req.query ?? "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(req.body),
  ].join("\n");
  const scope = `${dateStamp}/${req.region}/${req.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", req.amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${req.secretAccessKey}`, dateStamp);
  const kSigning = hmac(hmac(hmac(kDate, req.region), req.service), "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}
