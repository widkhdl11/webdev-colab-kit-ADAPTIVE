// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sealEnvelope } from "@/shared/lib/envelope/envelope";
import { parseAddressInput } from "./address-ciphertext";

async function publicKey(): Promise<CryptoKey> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"],
  );
  return pair.publicKey;
}

describe("주소 입력 (INV-P1)", () => {
  it("INV-P1 (S1): 브라우저에서 봉인한 주소는 받아들이고, 저장 값에 평문이 없다", async () => {
    const sealed = await sealEnvelope("부산시 해운대구 센텀로 77", await publicKey());
    const body = JSON.parse(JSON.stringify({ address: sealed }));

    const result = parseAddressInput(body);

    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.value)).not.toContain("센텀로");
  });

  it("INV-P1 (S1b, 실패경로): API 로 평문 주소를 직접 보내면 형식 오류로 거부된다", () => {
    const result = parseAddressInput({ address: "부산시 해운대구 센텀로 77" });
    expect(result).toEqual({ ok: false, error: "address_not_sealed" });
  });

  it("INV-P1 (S1b, 실패경로): 평문을 봉인 형식처럼 꾸며 보내도 거부된다", () => {
    const result = parseAddressInput({
      address: { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: "부산시", iv: "해운대구", ciphertext: "센텀로 77" },
    });
    expect(result.ok).toBe(false);
  });

  it("INV-P1 (S1b, 실패경로): 주소 칸이 없거나 다른 칸이 섞이면 거부된다", () => {
    expect(parseAddressInput({}).ok).toBe(false);
    expect(parseAddressInput(null).ok).toBe(false);
  });
});
