// @vitest-environment node
import { describe, expect, it } from "vitest";
import { importSealingPublicKey, openEnvelope, sealEnvelope } from "./envelope";
import { createDevKeyUnwrapper } from "./dev-key-unwrapper";

async function devKeyPairPem(): Promise<{ publicPem: string; privatePem: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const pem = (label: string, der: ArrayBuffer) =>
    `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...new Uint8Array(der)))}\n-----END ${label}-----`;
  return {
    publicPem: pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey)),
    privatePem: pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  };
}

describe("임시 복호화 (INV-P12)", () => {
  it("INV-P12 (S12): 개발 환경에서는 브라우저 방식으로 봉인한 주소를 개발용 키로 열 수 있다", async () => {
    const { publicPem, privatePem } = await devKeyPairPem();
    const sealed = await sealEnvelope("대구시 중구 동성로 1", await importSealingPublicKey(publicPem));

    const unwrapper = createDevKeyUnwrapper({ privateKeyPem: privatePem, env: { NODE_ENV: "development" } });
    const dek = await unwrapper.unwrap(sealed.wrappedKey);

    expect(await openEnvelope(sealed, dek)).toBe("대구시 중구 동성로 1");
  });

  it("INV-P12 (S12b, 실패경로): NODE_ENV=production 이면 만드는 순간 실패한다", async () => {
    const { privatePem } = await devKeyPairPem();
    expect(() => createDevKeyUnwrapper({ privateKeyPem: privatePem, env: { NODE_ENV: "production" } })).toThrow(
      /운영/,
    );
  });

  it("INV-P12 (S12b, 실패경로): VERCEL_ENV=production 이면 NODE_ENV 가 무엇이든 실패한다", async () => {
    const { privatePem } = await devKeyPairPem();
    expect(() =>
      createDevKeyUnwrapper({ privateKeyPem: privatePem, env: { NODE_ENV: "development", VERCEL_ENV: "production" } }),
    ).toThrow(/운영/);
  });

  it("INV-P12 (실패경로): 개발용 비밀키가 비어 있으면 만들지 않는다", () => {
    expect(() => createDevKeyUnwrapper({ privateKeyPem: "", env: { NODE_ENV: "development" } })).toThrow();
  });
});
