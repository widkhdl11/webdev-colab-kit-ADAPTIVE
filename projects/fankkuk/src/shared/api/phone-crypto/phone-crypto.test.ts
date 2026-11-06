import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPhone, encryptPhone, phoneHash, phoneParts, readPhoneKeys } from "./phone-crypto";

const k = () => randomBytes(32).toString("base64");
const ENC = "FANKKUK_PHONE_ENC_KEY";
const HASH = "FANKKUK_PHONE_HASH_KEY";
const env = { [ENC]: k(), [HASH]: k() };
const keys = readPhoneKeys(env);
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const PHONE = "01012345678";

describe("가입 번호 암호화 (signup INV-U18)", () => {
  it("INV-U18: 암호문에는 원래 숫자가 없고, 같은 계정 ID 로만 풀린다", () => {
    const sealed = encryptPhone(keys, A, PHONE);
    expect(sealed).not.toContain(PHONE);
    expect(sealed).not.toContain("5678");
    expect(decryptPhone(keys, A, sealed)).toBe(PHONE);
  });

  it("INV-U18: 같은 번호도 암호화할 때마다 다른 값이다(줄마다 새 난수)", () => {
    expect(encryptPhone(keys, A, PHONE)).not.toBe(encryptPhone(keys, A, PHONE));
  });

  it("INV-U18 실패경로: 다른 계정 줄에 옮겨 붙인 암호문·고친 암호문·다른 키로는 풀리지 않는다", () => {
    const sealed = encryptPhone(keys, A, PHONE);
    expect(decryptPhone(keys, B, sealed)).toBeNull();
    const last = sealed.at(-3) === "A" ? "B" : "A";
    const tampered = sealed.slice(0, -3) + last + sealed.slice(-2);
    expect(decryptPhone(keys, A, tampered)).toBeNull();
    expect(decryptPhone(readPhoneKeys({ [ENC]: k(), [HASH]: k() }), A, sealed)).toBeNull();
    expect(decryptPhone(keys, A, "글자")).toBeNull();
  });

  it("INV-U18: 같은 번호 찾기 해시는 같은 번호면 같고, 다른 번호·다른 해시 키면 다르며 원래 숫자가 없다", () => {
    const h = phoneHash(keys, PHONE);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(phoneHash(keys, PHONE)).toBe(h);
    expect(phoneHash(keys, "01012345679")).not.toBe(h);
    expect(phoneHash(readPhoneKeys({ ...env, [HASH]: k() }), PHONE)).not.toBe(h);
    expect(h).not.toContain(PHONE);
  });

  it("INV-U18: 해시는 키 없이 번호만 해시한 값과 다르다(010 번호 전체 대입 막기)", () => {
    expect(phoneHash(keys, PHONE)).not.toBe(createHash("sha256").update(PHONE).digest("hex"));
  });

  it("INV-U18: 가린 표시용 앞 3자리·뒤 4자리", () => {
    expect(phoneParts(PHONE)).toEqual({ prefix: "010", last4: "5678" });
    expect(phoneParts("0161234567")).toEqual({ prefix: "016", last4: "4567" });
  });

  it("INV-U18 실패경로: 키가 없거나·32바이트가 아니거나·두 키가 같거나·공개 이름이면 실패한다(로컬도)", () => {
    expect(() => readPhoneKeys({})).toThrow();
    expect(() => readPhoneKeys({ [ENC]: k() })).toThrow();
    expect(() => readPhoneKeys({ ...env, [ENC]: randomBytes(16).toString("base64") })).toThrow();
    expect(() => readPhoneKeys({ [ENC]: env[ENC], [HASH]: env[ENC] })).toThrow();
    expect(() => readPhoneKeys({ ...env, [`NEXT_PUBLIC_${ENC}`]: "x" })).toThrow();
    expect(() => readPhoneKeys({ ...env, [`NEXT_PUBLIC_${HASH}`]: "x" })).toThrow();
  });

  it("INV-U18: 키 값은 오류 메시지에 들어가지 않는다", () => {
    const bad = randomBytes(16).toString("base64");
    expect(() => readPhoneKeys({ ...env, [ENC]: bad })).toThrow();
    try {
      readPhoneKeys({ ...env, [ENC]: bad });
    } catch (e) {
      expect(String(e)).not.toContain(bad);
    }
  });

  it("INV-U18 실패경로: 번호 꼴이 아니면 암호화·해시하지 않는다", () => {
    expect(() => encryptPhone(keys, A, "010-1234-5678")).toThrow();
    expect(() => phoneHash(keys, "12345")).toThrow();
    expect(() => phoneParts("12345")).toThrow();
  });
});
