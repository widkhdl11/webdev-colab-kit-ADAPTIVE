import { describe, expect, it } from "vitest";
import { qrContentFor } from "./qr-content";

describe("내부 QR 내용 (INV-P10)", () => {
  it("INV-P10 (S10): QR 내용은 주문번호와 정확히 같다", () => {
    expect(qrContentFor("FC-7K3M9")).toBe("FC-7K3M9");
    expect(qrContentFor("FC-001-2")).toBe("FC-001-2");
  });

  it("INV-P10 (실패경로): 주문번호 형식이 아닌 값은 QR 로 만들지 않는다 — 주소·URL 이 섞일 자리가 없다", () => {
    expect(() => qrContentFor("FC-7K3M9 서울시 강남구")).toThrow();
    expect(() => qrContentFor("https://fankkuk.kr/o/FC-7K3M9")).toThrow();
    expect(() => qrContentFor("")).toThrow();
  });
});
