import { describe, expect, it } from "vitest";
import { readScan } from "./scan-code";

describe("스캔 값 꼴 (office-workflow INV-W1 — 서버가 스캔 값 꼴을 먼저 본다)", () => {
  it("INV-W1: 10~14자리 숫자는 송장, Q-여섯 자리는 내부 라벨 QR — 앞뒤 공백은 뗀다", () => {
    expect(readScan(" 1234567890 ")).toEqual({ kind: "waybill", value: "1234567890" });
    expect(readScan("12345678901234")).toEqual({ kind: "waybill", value: "12345678901234" });
    expect(readScan("Q-000123")).toEqual({ kind: "qr", value: "Q-000123" });
  });

  it("INV-W1 (실패경로): 자릿수가 모자라거나 넘치거나 다른 글자가 섞이면 어느 쪽도 아니다", () => {
    for (const raw of ["", "123456789", "123456789012345", "12345-67890", "q-000123", "Q-00012", "Q-0001234", "FC-261003-0041", "Q-00012a"]) {
      expect(readScan(raw)).toEqual({ kind: "invalid" });
    }
  });
});
