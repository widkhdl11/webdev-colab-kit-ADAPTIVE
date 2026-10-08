import { describe, expect, it } from "vitest";
import { readMyInquiryRestricted } from "./read-my-inquiry-restricted";

const client = (data: unknown, error: { code: string } | null = null) =>
  ({ rpc: async (fn: string) => (fn === "my_inquiry_restricted" ? { data, error } : { data: null, error: { code: "42883" } }) }) as never;

describe("내 계정 문의 제한 여부 읽기 (INV-K12)", () => {
  it("INV-K12: DB 의 참·거짓을 그대로 돌려준다", async () => {
    expect(await readMyInquiryRestricted(client(true))).toBe(true);
    expect(await readMyInquiryRestricted(client(false))).toBe(false);
  });

  it("INV-K12 (실패경로): 오류나 꼴이 다른 답은 「제한 안 됨」으로 넘기지 않고 던진다", async () => {
    await expect(readMyInquiryRestricted(client(null, { code: "XX000" }))).rejects.toThrow();
    await expect(readMyInquiryRestricted(client(null))).rejects.toThrow();
    await expect(readMyInquiryRestricted(client("true"))).rejects.toThrow();
  });
});
