import { describe, expect, it } from "vitest";
import { isLocalDevRequest } from "./local-dev";

/** 개발자 화면 가드 — verdict-review INV-VR9. */

const DEV = { nodeEnv: "development", vercel: undefined };

describe("isLocalDevRequest (INV-VR9)", () => {
  it("INV-VR9: 이 PC 의 주소로 온 개발 서버 요청만 받는다", () => {
    for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST:3001", "localhost"]) {
      expect(isLocalDevRequest(h, DEV)).toBe(true);
    }
  });

  it("INV-VR9: 같은 와이파이의 다른 기기·DNS 재바인딩·Host 없음은 거부한다", () => {
    for (const h of ["192.168.0.7:3000", "evil.example:3000", "localhost.evil.example:3000", "127.0.0.1.nip.io:3000", "localhost:3000@evil", ""]) {
      expect(isLocalDevRequest(h, DEV)).toBe(false);
    }
    expect(isLocalDevRequest(null, DEV)).toBe(false);
  });

  it("INV-VR9: 배포본은 Host 가 무엇이든 거부한다 — NODE_ENV 가 production 이거나 Vercel 위이거나", () => {
    expect(isLocalDevRequest("localhost:3000", { nodeEnv: "production", vercel: undefined })).toBe(false);
    expect(isLocalDevRequest("localhost:3000", { nodeEnv: "development", vercel: "1" })).toBe(false);
  });
});
