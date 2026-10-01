import { describe, expect, it } from "vitest";
import { parseTrackingNo } from "./tracking-no";

describe("parseTrackingNo — 팬이 사무실로 보낸 택배의 송장번호", () => {
  it("숫자만 남기고 받는다 (하이픈·공백은 지운다)", () => {
    expect(parseTrackingNo("5840-1237-6655")).toEqual({ ok: true, value: "584012376655" });
    expect(parseTrackingNo(" 584012376655 ")).toEqual({ ok: true, value: "584012376655" });
  });

  it("10~14자리만 받는다", () => {
    expect(parseTrackingNo("123456789").ok).toBe(false);
    expect(parseTrackingNo("1234567890").ok).toBe(true);
    expect(parseTrackingNo("12345678901234").ok).toBe(true);
    expect(parseTrackingNo("123456789012345").ok).toBe(false);
  });

  it("숫자·하이픈·공백 밖의 글자가 있으면 거부한다 — 지우고 받지 않는다", () => {
    expect(parseTrackingNo("58401237665a").ok).toBe(false);
    expect(parseTrackingNo("").ok).toBe(false);
  });
  it("빈 칸은 '숫자로 적어 주세요'가 아니라 비었다고 알린다", () => {
    const r = parseTrackingNo("   ");
    expect(r.ok ? null : r.message).toBe("송장번호를 적어 주세요.");
  });
});
