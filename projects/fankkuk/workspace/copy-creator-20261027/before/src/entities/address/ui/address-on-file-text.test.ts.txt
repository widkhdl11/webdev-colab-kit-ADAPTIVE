import { describe, expect, it } from "vitest";
import { addressOnFileText } from "./address-on-file-text";

describe("등록한 주소 확인 문구 (INV-P16)", () => {
  it("INV-P16 S16: 이름표와 바꾼 날만 쓴다", () => {
    expect(addressOnFileText({ label: "studio", updatedAt: "2026-10-03T05:00:00Z" })).toBe("작업실 · 10월 3일 (토)에 등록한 주소");
  });

  it("INV-P16: 이름표가 없던 옛 등록은 날짜만, 날짜도 없으면 「등록한 주소」", () => {
    expect(addressOnFileText({ label: null, updatedAt: "2026-10-03T05:00:00Z" })).toBe("10월 3일 (토)에 등록한 주소");
    expect(addressOnFileText({ label: null, updatedAt: null })).toBe("등록한 주소");
  });
});
