// 앱의 봉투(src/shared/lib/envelope/envelope.ts)를 게이트웨이에서 연다 — 같은 꼴·같은 알고리즘을 작게 다시 구현한 것.
//   { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey, iv, ciphertext }  (모두 base64, 다른 칸 없음)
//   데이터 키(32바이트)는 RSA-OAEP(SHA-256)로 감싸 있고 KMS 가 푼다. 암호문은 AES-256-GCM, 끝 16바이트가 인증 태그(WebCrypto 꼴).
//
// 승인 서명 연결 정보(INV-S16)의 평문은 앱의 linkIdentityPlaintext 꼴이다:
//   { v: 1, name, birth(yyyyMMdd), phone(숫자만, 01X…), creatorId }

"use strict";

const crypto = require("node:crypto");

const ENVELOPE_ALG = "RSA-OAEP-256+A256GCM";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const KEYS = ["v", "alg", "wrappedKey", "iv", "ciphertext"];

/** 봉투 꼴만 통과. 아니면 TypeError(→ 400 invalid_signer). */
function parseEnvelope(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("봉투가 아니다");
  const keys = Object.keys(input);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) throw new TypeError("봉투 칸이 다르다");
  if (input.v !== 1 || input.alg !== ENVELOPE_ALG) throw new TypeError("모르는 봉투 판");
  for (const k of ["wrappedKey", "iv", "ciphertext"]) {
    if (typeof input[k] !== "string" || input[k].length > 4096 || !BASE64.test(input[k])) throw new TypeError("봉투 값이 base64 가 아니다");
  }
  const wrappedKey = Buffer.from(input.wrappedKey, "base64");
  const iv = Buffer.from(input.iv, "base64");
  const ciphertext = Buffer.from(input.ciphertext, "base64");
  if (wrappedKey.length < 256 || iv.length !== 12 || ciphertext.length <= 16) throw new TypeError("봉투 길이가 맞지 않는다");
  return { wrappedKey, iv, ciphertext };
}

/** 풀린 데이터 키로 연다. 키가 틀리거나 변조됐으면 TypeError. 데이터 키는 쓰고 나서 0 으로 채운다. */
function openEnvelope(parsed, dek) {
  try {
    if (dek.length !== 32) throw new Error();
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, parsed.iv);
    decipher.setAuthTag(parsed.ciphertext.subarray(parsed.ciphertext.length - 16));
    const out = Buffer.concat([decipher.update(parsed.ciphertext.subarray(0, parsed.ciphertext.length - 16)), decipher.final()]);
    return out.toString("utf8");
  } catch {
    throw new TypeError("봉투가 열리지 않는다");
  } finally {
    dek.fill(0);
  }
}

const NAME_SHAPE = /^[가-힣A-Za-z][가-힣A-Za-z .·-]*$/;
const PHONE_SHAPE = /^01[016789][0-9]{7,8}$/;

/** 승인 서명 연결 정보 평문 → { name, birth, phone, creatorId }. 꼴이 아니면 TypeError. */
function parseLinkIdentity(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError("연결 정보가 JSON 이 아니다");
  }
  if (value === null || typeof value !== "object" || value.v !== 1) throw new TypeError("연결 정보 판이 다르다");
  const { name, birth, phone, creatorId } = value;
  if (typeof name !== "string" || name.length === 0 || name.length > 30 || !NAME_SHAPE.test(name)) throw new TypeError("이름 꼴");
  if (typeof birth !== "string" || !/^\d{8}$/.test(birth)) throw new TypeError("생년월일 꼴");
  if (typeof phone !== "string" || !PHONE_SHAPE.test(phone)) throw new TypeError("번호 꼴");
  if (typeof creatorId !== "string" || creatorId.length === 0 || creatorId.length > 128) throw new TypeError("크리에이터 꼴");
  return { name, birth, phone, creatorId };
}

module.exports = { ENVELOPE_ALG, parseEnvelope, openEnvelope, parseLinkIdentity };
