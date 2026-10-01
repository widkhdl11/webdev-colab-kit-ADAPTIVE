import { z } from "zod";

// 봉투 암호화: 값마다 무작위 데이터 키(AES-256-GCM)로 암호화하고, 그 데이터 키를
// RSA-OAEP(SHA-256) 공개키로 감싼다. 감싼 키를 푸는 쪽은 비밀키를 가진 곳 하나뿐이다.
// 이 모듈은 공개키로 봉인하는 일과, 이미 풀린 데이터 키로 여는 일만 한다 —
// 감싼 키를 푸는 일(비밀키 사용)은 여기 없다.

export const ENVELOPE_ALG = "RSA-OAEP-256+A256GCM";

const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
// RSA-2048 이상으로 감싼 키는 256바이트 이상이다.
const MIN_WRAPPED_KEY_BYTES = 256;

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);

const envelopeSchema = z
  .object({
    v: z.literal(1),
    alg: z.literal(ENVELOPE_ALG),
    wrappedKey: base64,
    iv: base64,
    ciphertext: base64,
  })
  .strict();

export type Envelope = z.infer<typeof envelopeSchema>;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

/** 신뢰하지 않는 입력에서 봉인 형식만 통과시킨다. 형식이 아니면 null. */
export function parseEnvelope(input: unknown): Envelope | null {
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) return null;
  const env = parsed.data;
  if (fromBase64(env.wrappedKey).length < MIN_WRAPPED_KEY_BYTES) return null;
  if (fromBase64(env.iv).length !== GCM_IV_BYTES) return null;
  if (fromBase64(env.ciphertext).length <= GCM_TAG_BYTES) return null;
  return env;
}

/** 평문을 공개키로 봉인한다. 평문과 데이터 키는 이 함수 밖으로 나가지 않는다. */
export async function sealEnvelope(plaintext: string, publicKey: CryptoKey): Promise<Envelope> {
  const dek = crypto.getRandomValues(new Uint8Array(AES_KEY_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const aesKey = await crypto.subtle.importKey("raw", dek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(plaintext)),
  );
  const wrappedKey = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, dek));
  dek.fill(0);
  return { v: 1, alg: ENVELOPE_ALG, wrappedKey: toBase64(wrappedKey), iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

/** 이미 풀린 데이터 키로 봉투를 연다. 키가 틀리면 예외. */
export async function openEnvelope(envelope: Envelope, dek: Uint8Array): Promise<string> {
  // WebCrypto 는 ArrayBuffer 로 받친 버퍼만 받는다 — 호출자가 넘긴 버퍼를 복사해 맞춘다.
  const aesKey = await crypto.subtle.importKey("raw", new Uint8Array(dek), { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv) },
    aesKey,
    fromBase64(envelope.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

/** PEM(SPKI) 공개키를 봉인용 키로 가져온다. KMS 가 내주는 공개키 형식이다. */
export async function importSealingPublicKey(spkiPem: string): Promise<CryptoKey> {
  const body = spkiPem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  return crypto.subtle.importKey("spki", fromBase64(body), { name: "RSA-OAEP", hash: "SHA-256" }, false, [
    "encrypt",
  ]);
}
