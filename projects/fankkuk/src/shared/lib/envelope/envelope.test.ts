// @vitest-environment node
import { describe, expect, it } from "vitest";
import { openEnvelope, parseEnvelope, sealEnvelope } from "./envelope";

// 테스트용 RSA-OAEP 키 쌍 — 실제로는 비밀키가 KMS 밖으로 나오지 않는다.
// 여기서는 KMS 가 하는 "감싼 키 풀기"를 비밀키로 흉내 낸다.
async function testKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function unwrapLikeKms(wrappedKey: string, privateKey: CryptoKey): Promise<Uint8Array> {
  const bytes = Uint8Array.from(atob(wrappedKey), (c) => c.charCodeAt(0));
  return new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, bytes));
}

describe("envelope", () => {
  it("공개키로 봉인한 값은 평문 문자열을 담지 않고, 감싼 키를 풀면 원래 평문이 나온다", async () => {
    const { publicKey, privateKey } = await testKeyPair();
    const plaintext = "서울시 강남구 테헤란로 123, 101동 1004호";

    const sealed = await sealEnvelope(plaintext, publicKey);

    expect(JSON.stringify(sealed)).not.toContain("테헤란로");
    const dek = await unwrapLikeKms(sealed.wrappedKey, privateKey);
    expect(await openEnvelope(sealed, dek)).toBe(plaintext);
  });

  it("같은 평문을 두 번 봉인하면 매번 다른 데이터 키와 IV 가 쓰인다", async () => {
    const { publicKey } = await testKeyPair();
    const a = await sealEnvelope("같은 주소", publicKey);
    const b = await sealEnvelope("같은 주소", publicKey);
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("다른 데이터 키로는 열리지 않는다", async () => {
    const { publicKey } = await testKeyPair();
    const sealed = await sealEnvelope("주소", publicKey);
    await expect(openEnvelope(sealed, new Uint8Array(32))).rejects.toThrow();
  });

  it("parseEnvelope 는 봉인 형식만 받고 평문 문자열·필드 누락·모르는 버전을 거부한다", async () => {
    const { publicKey } = await testKeyPair();
    const sealed = await sealEnvelope("주소", publicKey);

    expect(parseEnvelope(JSON.parse(JSON.stringify(sealed)))).toEqual(sealed);
    expect(parseEnvelope("서울시 강남구 테헤란로 123")).toBeNull();
    expect(parseEnvelope({ ...sealed, wrappedKey: undefined })).toBeNull();
    expect(parseEnvelope({ ...sealed, v: 2 })).toBeNull();
    expect(parseEnvelope({ ...sealed, ciphertext: "평문이 섞인 값" })).toBeNull();
    expect(parseEnvelope({ ...sealed, extra: "x" })).toBeNull();
  });

  it("parseEnvelope 는 base64 형식이 맞아도 길이가 봉인 결과일 수 없는 값을 거부한다", async () => {
    const { publicKey } = await testKeyPair();
    const sealed = await sealEnvelope("주소", publicKey);
    const b64 = (n: number) => btoa(String.fromCharCode(...new Uint8Array(n).fill(65)));

    // 감싼 키는 RSA-2048 이상이면 256바이트 이상이다
    expect(parseEnvelope({ ...sealed, wrappedKey: b64(32) })).toBeNull();
    // GCM IV 는 정확히 12바이트
    expect(parseEnvelope({ ...sealed, iv: b64(16) })).toBeNull();
    // 암호문은 인증 태그(16바이트)보다 길어야 한다
    expect(parseEnvelope({ ...sealed, ciphertext: b64(16) })).toBeNull();
  });
});
