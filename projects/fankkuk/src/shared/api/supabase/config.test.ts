import { describe, expect, it } from "vitest";
import { readSecretKey, readSupabaseConfig } from "./config";

describe("Supabase 설정 읽기", () => {
  it("주소와 공개 키를 공개 접두어 없는 이름에서 읽는다 — 브라우저는 Supabase 를 직접 부르지 않는다(INV-L1)", () => {
    expect(readSupabaseConfig({ SUPABASE_URL: "http://127.0.0.1:55321", SUPABASE_ANON_KEY: "anon" })).toEqual({
      url: "http://127.0.0.1:55321",
      anonKey: "anon",
    });
    expect(() => readSupabaseConfig({ SUPABASE_URL: "http://127.0.0.1:55321" })).toThrow(/SUPABASE_ANON_KEY/);
    expect(() => readSupabaseConfig({ SUPABASE_ANON_KEY: "anon" })).toThrow(/SUPABASE_URL/);
  });

  it("INV-L4 (S4): 관리자 키는 공개 접두어 없는 이름에서만 읽는다", () => {
    expect(readSecretKey({ SUPABASE_SECRET_KEY: "service" })).toBe("service");
  });

  it("INV-L4 (S4, 실패경로): 관리자 키가 공개 이름으로도 설정돼 있으면 시작하지 않는다", () => {
    expect(() => readSecretKey({ SUPABASE_SECRET_KEY: "service", NEXT_PUBLIC_SUPABASE_SECRET_KEY: "service" })).toThrow(/공개/);
    expect(() => readSecretKey({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: "service" })).toThrow(/공개/);
    expect(() => readSecretKey({})).toThrow(/SUPABASE_SECRET_KEY/);
  });
});
