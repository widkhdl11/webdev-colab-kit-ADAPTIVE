import { describe, expect, it } from "vitest";
import { readMailConfig } from "./config";

describe("메일 설정 읽기", () => {
  it("개발에서는 값이 없으면 로컬 메일 확인 화면으로 보낸다", () => {
    expect(readMailConfig({ NODE_ENV: "development" })).toEqual({
      host: "127.0.0.1",
      port: 55325,
      from: "팬꾹 <no-reply@fankkuk.test>",
      appOrigin: "http://127.0.0.1:3311",
    });
  });

  it("운영에서는 기본값을 쓰지 않는다 — 빠진 값이 있으면 시작하지 않는다", () => {
    const full = { NODE_ENV: "production", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", MAIL_FROM: "팬꾹 <a@example.com>", APP_ORIGIN: "https://fankkuk.example.com" };
    expect(readMailConfig(full).appOrigin).toBe("https://fankkuk.example.com");
    for (const name of ["SMTP_HOST", "SMTP_PORT", "MAIL_FROM", "APP_ORIGIN"] as const) {
      expect(() => readMailConfig({ ...full, [name]: undefined })).toThrow(name);
    }
  });

  it("링크 주소는 경로 없는 사이트 주소만, 운영에서는 https 만 받는다", () => {
    expect(readMailConfig({ APP_ORIGIN: "http://127.0.0.1:3311/" }).appOrigin).toBe("http://127.0.0.1:3311");
    expect(() => readMailConfig({ APP_ORIGIN: "http://127.0.0.1:3311/me" })).toThrow(/경로/);
    expect(() => readMailConfig({ APP_ORIGIN: "fankkuk" })).toThrow(/주소가 아니다/);
    expect(() =>
      readMailConfig({ NODE_ENV: "production", SMTP_HOST: "h", SMTP_PORT: "587", MAIL_FROM: "f", APP_ORIGIN: "http://fankkuk.example.com" }),
    ).toThrow(/https/);
  });

  it("운영 판정은 앱 전체와 같다 — VERCEL_ENV 만 운영이어도 기본값을 쓰지 않는다", () => {
    expect(() => readMailConfig({ VERCEL_ENV: "production" })).toThrow(/이 없다/);
  });

  it("포트가 숫자가 아니면 시작하지 않는다", () => {
    expect(() => readMailConfig({ SMTP_PORT: "abc" })).toThrow(/SMTP_PORT/);
  });
});
