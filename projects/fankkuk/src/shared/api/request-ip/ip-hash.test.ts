import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clientIp, hashIp, readIpHashSecret } from "./ip-hash";

// 접속 주소는 원문이 아니라 비밀 값을 섞은 해시로만 다룬다(signup INV-U14).

const SECRET_A = "s".repeat(32);
const SECRET_B = "t".repeat(32);

describe("INV-U14: 접속 주소 해시", () => {
  it("INV-U14: 해시는 64자리, 원문을 담지 않고, 같은 비밀·같은 주소면 같고 비밀이 다르면 다르다", () => {
    const h = hashIp(SECRET_A, "203.0.113.7");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203");
    expect(hashIp(SECRET_A, "203.0.113.7")).toBe(h);
    expect(hashIp(SECRET_B, "203.0.113.7")).not.toBe(h);
    expect(hashIp(SECRET_A, "203.0.113.8")).not.toBe(h);
  });

  it("INV-U14 (실패경로): 운영에서 비밀 값이 없거나 짧으면 시작하지 않는다, 공개 이름(NEXT_PUBLIC_)으로 있으면 어디서든 거부", () => {
    expect(() => readIpHashSecret({ NODE_ENV: "production" })).toThrow(/FANKKUK_IP_HASH_SECRET/);
    expect(() => readIpHashSecret({ VERCEL_ENV: "production", FANKKUK_IP_HASH_SECRET: "short" })).toThrow(/FANKKUK_IP_HASH_SECRET/);
    expect(() => readIpHashSecret({ FANKKUK_IP_HASH_SECRET: SECRET_A, NEXT_PUBLIC_FANKKUK_IP_HASH_SECRET: SECRET_A })).toThrow(/공개/);
    expect(readIpHashSecret({ NODE_ENV: "production", FANKKUK_IP_HASH_SECRET: SECRET_A })).toBe(SECRET_A);
  });

  it("INV-U14: 로컬에서 비밀 값이 없으면 실행마다 새로 만든 값을 쓴다 — 고정된 기본값이 없다", () => {
    const a = readIpHashSecret({ NODE_ENV: "development" });
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(readIpHashSecret({ NODE_ENV: "development" })).toBe(a); // 한 실행 안에서는 같아야 횟수를 센다
  });

  it("INV-U14: 접속 주소는 x-real-ip, 없으면 x-forwarded-for 의 첫 값", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.1", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.1");
    expect(clientIp(new Headers({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("INV-U14: IPv6 는 앞 64비트 대역으로 센다 — 같은 /64 의 다른 주소는 같은 해시, 줄여 쓴 꼴·대문자도 같다", () => {
    const h = hashIp(SECRET_A, "2001:db8:1:2::1");
    expect(hashIp(SECRET_A, "2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(h);
    expect(hashIp(SECRET_A, "2001:0DB8:0001:0002:0:0:0:ffff")).toBe(h);
    expect(hashIp(SECRET_A, "2001:db8:1:2::1%eth0")).toBe(h);
  });

  it("INV-U14 (실패경로): 다른 /64 대역은 다른 해시", () => {
    const h = hashIp(SECRET_A, "2001:db8:1:2::1");
    expect(hashIp(SECRET_A, "2001:db8:1:3::1")).not.toBe(h);
    expect(hashIp(SECRET_A, "2001:db9:1:2::1")).not.toBe(h);
    expect(hashIp(SECRET_A, "::1")).not.toBe(h);
  });

  it("INV-U14: IPv4 는 주소 그대로 센다(IPv4 를 담은 IPv6 꼴도 그 IPv4 로)", () => {
    const direct = createHmac("sha256", SECRET_A).update("203.0.113.7").digest("hex");
    expect(hashIp(SECRET_A, "203.0.113.7")).toBe(direct);
    expect(hashIp(SECRET_A, "::ffff:203.0.113.7")).toBe(direct);
    expect(hashIp(SECRET_A, "203.0.113.8")).not.toBe(direct);
  });
});
