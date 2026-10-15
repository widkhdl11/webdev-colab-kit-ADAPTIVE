import { describe, expect, it } from "vitest";
import { openRefundAccount, readRefundAccountKey, sealRefundAccount } from "./sealed-account";

// 환불 계좌 봉인 (payment INV-M25) — 저장값에 계좌번호·예금주가 그대로 남지 않고, 다른 키로는 열리지 않는다.

const KEY = Buffer.alloc(32, 1).toString("base64");
const OTHER = Buffer.alloc(32, 2).toString("base64");
const secret = { accountNumber: "110123456789", holderName: "김별빛" };

describe("INV-M25: 환불 계좌 봉인", () => {
  it("INV-M25: 봉인값에는 계좌번호·예금주가 없고, 같은 키로 열면 그대로 돌아온다", async () => {
    const sealed = await sealRefundAccount(KEY, secret);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/);
    expect(sealed).not.toContain("110123456789");
    expect(await openRefundAccount(KEY, sealed)).toEqual(secret);
  });
  it("INV-M25 (실패경로): 다른 키·바뀐 봉인값은 열리지 않는다", async () => {
    const sealed = await sealRefundAccount(KEY, secret);
    expect(await openRefundAccount(OTHER, sealed)).toBeNull();
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(await openRefundAccount(KEY, tampered)).toBeNull();
    expect(await openRefundAccount(KEY, "plain")).toBeNull();
  });
  it("INV-M25 (실패경로): 키가 공개 이름으로도 있거나 32바이트가 아니면 시작하지 않는다", () => {
    expect(readRefundAccountKey({ REFUND_ACCOUNT_KEY: KEY })).toBe(KEY);
    expect(() => readRefundAccountKey({ REFUND_ACCOUNT_KEY: KEY, NEXT_PUBLIC_REFUND_ACCOUNT_KEY: KEY })).toThrow(/공개/);
    expect(() => readRefundAccountKey({ REFUND_ACCOUNT_KEY: Buffer.alloc(16).toString("base64") })).toThrow();
    expect(() => readRefundAccountKey({})).toThrow();
  });
});
