import { describe, expect, it, vi } from "vitest";
import { readDecryptorSecrets } from "./decryptor-secrets";

const OWNER = "00000000-0000-4000-a000-000000000021";
const PEM_ONE_LINE = "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBg\\n-----END PRIVATE KEY-----";

const FILE = [
  "# 개발용 주소 복호화 비밀키",
  `DEV_ADDRESS_PRIVATE_KEY="${PEM_ONE_LINE}"`,
  "DECRYPT_DB_KEY=eyJhbGciOiJIUzI1NiJ9.e30.sig",
  `DECRYPT_OWNER_USER_ID="${OWNER}"`,
  "",
].join("\n");

describe("송장 출력 함수 자신의 설정 (INV-P12·P8)", () => {
  it("INV-P12 (S12b, 실패경로): NODE_ENV=production 이면 만드는 순간 실패하고 키 파일을 읽지 않는다", () => {
    const read = vi.fn(() => FILE);
    expect(() => readDecryptorSecrets({ NODE_ENV: "production" }, read)).toThrow(/운영/);
    expect(read).not.toHaveBeenCalled();
  });

  it("INV-P12 (S12b, 실패경로): VERCEL_ENV=production 이면 NODE_ENV 가 무엇이든 실패하고 키 파일을 읽지 않는다", () => {
    const read = vi.fn(() => FILE);
    expect(() => readDecryptorSecrets({ NODE_ENV: "development", VERCEL_ENV: "production" }, read)).toThrow(/운영/);
    expect(read).not.toHaveBeenCalled();
  });

  it("INV-P12: 개발 환경에서는 비밀키·DB 자격·대표 ID 를 자기 파일에서 읽는다(줄바꿈 표기는 풀어서)", () => {
    expect(readDecryptorSecrets({ NODE_ENV: "development" }, () => FILE)).toEqual({
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----",
      dbKey: "eyJhbGciOiJIUzI1NiJ9.e30.sig",
      ownerUserId: OWNER,
    });
  });

  it("INV-P8 (실패경로): 대표 ID 가 없거나 꼴이 틀리면 만들지 않는다 — 빈 대표 ID 로 아무나 통과하는 일이 없다", () => {
    const without = FILE.replace(/^DECRYPT_OWNER_USER_ID=.*$/m, "");
    expect(() => readDecryptorSecrets({ NODE_ENV: "development" }, () => without)).toThrow(/DECRYPT_OWNER_USER_ID/);
    const wrong = FILE.replace(OWNER, "fankkuk_admin");
    expect(() => readDecryptorSecrets({ NODE_ENV: "development" }, () => wrong)).toThrow(/DECRYPT_OWNER_USER_ID/);
  });

  it("INV-P12 (실패경로): 비밀키·DB 자격이 없으면 이름만 대고 실패한다 — 값은 오류에 넣지 않는다", () => {
    const noKey = FILE.replace(/^DEV_ADDRESS_PRIVATE_KEY=.*$/m, "");
    expect(() => readDecryptorSecrets({ NODE_ENV: "development" }, () => noKey)).toThrow(/DEV_ADDRESS_PRIVATE_KEY/);
    const noDb = FILE.replace(/^DECRYPT_DB_KEY=.*$/m, "");
    try {
      readDecryptorSecrets({ NODE_ENV: "development" }, () => noDb);
      expect.unreachable();
    } catch (e) {
      expect(String(e)).toMatch(/DECRYPT_DB_KEY/);
      expect(String(e)).not.toContain("MIIEvQIBADANBg");
      expect(String(e)).not.toContain(OWNER);
    }
  });
});
