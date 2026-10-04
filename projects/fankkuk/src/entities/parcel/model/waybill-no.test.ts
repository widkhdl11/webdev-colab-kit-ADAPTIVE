import { describe, expect, it } from "vitest";
import { formatWaybill, normalizeWaybill, parseWaybillInput, WAYBILL_FORMAT_MESSAGE } from "./waybill-no";

describe("원 송장번호 — 상자를 사무실로 보낸 택배의 송장번호 (office-workflow INV-W1·INV-W5 매칭 키)", () => {
  it("공백·하이픈은 지우고 숫자만 남긴다", () => {
    expect(normalizeWaybill(" 6401-2345 7788 ")).toBe("640123457788");
    expect(parseWaybillInput("6401-2345-7788")).toEqual({ ok: true, value: "640123457788" });
  });

  it("10~14자리만 받는다 — 경계값", () => {
    expect(parseWaybillInput("123456789").ok).toBe(false);
    expect(parseWaybillInput("1234567890").ok).toBe(true);
    expect(parseWaybillInput("12345678901234").ok).toBe(true);
    expect(parseWaybillInput("123456789012345").ok).toBe(false);
  });

  it("숫자·공백·하이픈 밖의 글자가 있으면 지우지 않고 거부한다", () => {
    expect(parseWaybillInput("64012345778a")).toEqual({ ok: false, message: WAYBILL_FORMAT_MESSAGE });
    expect(parseWaybillInput("６４０１２３４５７７８８").ok).toBe(false);
  });

  it("비어 있으면 적어 달라고 한다", () => {
    expect(parseWaybillInput("   ")).toEqual({ ok: false, message: "송장번호를 적어 주세요." });
  });

  it("화면에는 네 자리씩 띄어 보여 준다", () => {
    expect(formatWaybill("640123457788")).toBe("6401 2345 7788");
    expect(formatWaybill("1234567890")).toBe("1234 5678 90");
  });
});
