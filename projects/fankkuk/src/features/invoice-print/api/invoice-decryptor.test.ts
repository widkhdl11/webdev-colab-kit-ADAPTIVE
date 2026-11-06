import { describe, expect, it } from "vitest";
import type { KeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { wireDecryptorDeps } from "./invoice-decryptor";

// 조립 단계 — 안심번호 설정인데 택배사 연결이 없으면 출력 함수가 만들어지지 않는다(address-protection INV-P19)
const base = {
  env: { NODE_ENV: "development", SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_PUBLISHABLE_KEY: "anon" },
  dbKey: "db",
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  unwrapper: {} as unknown as KeyUnwrapper,
  newWaybill: () => "W-1",
};

describe("송장 출력 조립 (address-protection INV-P19)", () => {
  it("INV-P19 실패경로: 안심번호 설정 + 연결 없음이면 조립이 실패한다", () => {
    expect(() => wireDecryptorDeps({ ...base, recipientPhoneMode: "courier_safe_number" })).toThrow(/안심번호/);
  });

  it("INV-P19: 실제 번호 설정(기본)은 연결 없이 조립되고, 연결을 넣은 안심번호 설정도 조립된다", () => {
    expect(() => wireDecryptorDeps(base)).not.toThrow();
    expect(() => wireDecryptorDeps({ ...base, recipientPhoneMode: "courier_safe_number", issueSafeNumber: async () => "050412345678" })).not.toThrow();
  });
});
