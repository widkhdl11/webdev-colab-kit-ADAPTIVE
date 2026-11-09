import { describe, expect, it } from "vitest";
import { UNCONNECTED_SAFE_NUMBER_API, type SafeNumberApi } from "@/shared/api/safe-number/safe-number-api";
import { EXCEL_RECIPIENT_PHONE } from "@/shared/config/courier";
import { excelRecipientPhone } from "./excel-recipient-phone";

const REAL = "010-1234-5678";

function api(issue: SafeNumberApi["issue"]): SafeNumberApi & { calls: number } {
  const a = {
    connected: true,
    calls: 0,
    issue: async (input: { realPhone: string; ref: string }) => {
      a.calls += 1;
      return issue(input);
    },
  };
  return a;
}

describe("엑셀 받는 사람 전화 칸 (address-protection INV-P21 ② · INV-P19)", () => {
  it("INV-P21: 지금 설정은 실제 번호다", () => {
    expect(EXCEL_RECIPIENT_PHONE).toBe("real");
  });

  it("INV-P21: 실제 번호 설정이면 연 주소의 번호, 안심번호 업체를 부르지 않는다", async () => {
    const a = api(async () => "0504-1234-5678");
    expect(await excelRecipientPhone("real", a)({ realPhone: REAL, ref: "box-1" })).toBe(REAL);
    expect(a.calls).toBe(0);
  });

  it("INV-P21: 안심번호 설정 + 연결이 있으면 업체가 준 번호", async () => {
    const a = api(async () => "0504-1234-5678");
    expect(await excelRecipientPhone("safe_number_api", a)({ realPhone: REAL, ref: "box-1" })).toBe("0504-1234-5678");
    expect(a.calls).toBe(1);
  });

  it("INV-P21 (실패경로): 안심번호 설정인데 연결이 없으면 조립 단계에서 실패 — 실제 번호로 대신 넣지 않는다", () => {
    expect(() => excelRecipientPhone("safe_number_api", UNCONNECTED_SAFE_NUMBER_API)).toThrow();
  });

  it("INV-P21 (실패경로): 업체 오류·번호 꼴이 아님은 그 상자의 실패 — 실제 번호를 돌려주지 않는다", async () => {
    await expect(excelRecipientPhone("safe_number_api", api(async () => { throw new Error("x"); }))({ realPhone: REAL, ref: "b" })).rejects.toThrow();
    await expect(excelRecipientPhone("safe_number_api", api(async () => REAL))({ realPhone: REAL, ref: "b" })).rejects.toThrow();
    await expect(excelRecipientPhone("safe_number_api", api(async () => ""))({ realPhone: REAL, ref: "b" })).rejects.toThrow();
  });
});
