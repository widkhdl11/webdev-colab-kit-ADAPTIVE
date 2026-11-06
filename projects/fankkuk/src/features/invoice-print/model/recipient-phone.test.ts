import { describe, expect, it, vi } from "vitest";
import { RECIPIENT_PHONE_ON_LABEL } from "@/shared/config/courier";
import { recipientPhoneOnLabel, withRecipientPhone } from "./recipient-phone";

const REAL = "01012345678";
const SAFE = "050412345678";
const printed = { kind: "printed" as const, waybill: "W-1", reprint: false, label: { recipientName: "별빛", phone: REAL, zipCode: "12345", address1: "가", address2: "" } };

describe("송장 라벨의 받는 사람 번호 (address-protection INV-P19)", () => {
  it("INV-P19: 택배사 계약 전 설정값은 실제 번호다", () => {
    expect(RECIPIENT_PHONE_ON_LABEL).toBe("real");
  });

  it("INV-P19: 실제 번호 설정이면 라벨 번호를 그대로 찍고 안심번호를 묻지 않는다", async () => {
    const issue = vi.fn(async () => SAFE);
    const phoneOf = recipientPhoneOnLabel("real", issue);
    expect(await phoneOf({ waybill: "W-1", phone: REAL })).toBe(REAL);
    expect(issue).not.toHaveBeenCalled();
  });

  it("INV-P19: 안심번호 설정이면 택배사가 준 안심번호를 찍는다(운송장 번호와 실제 번호로 묻는다)", async () => {
    const issue = vi.fn(async () => SAFE);
    const phoneOf = recipientPhoneOnLabel("courier_safe_number", issue);
    expect(await phoneOf({ waybill: "W-1", phone: REAL })).toBe(SAFE);
    expect(issue).toHaveBeenCalledWith({ waybill: "W-1", phone: REAL });
  });

  it("INV-P19 실패경로: 안심번호 설정인데 택배사가 번호를 못 주거나 번호 꼴이 아니면 실제 번호로 대신 찍지 않는다", async () => {
    expect(await recipientPhoneOnLabel("courier_safe_number", async () => null)({ waybill: "W-1", phone: REAL })).toBeNull();
    expect(await recipientPhoneOnLabel("courier_safe_number", async () => "안심번호")({ waybill: "W-1", phone: REAL })).toBeNull();
    expect(await recipientPhoneOnLabel("courier_safe_number", async () => { throw new Error("down"); })({ waybill: "W-1", phone: REAL })).toBeNull();
  });

  it("INV-P19 실패경로: 안심번호 설정인데 택배사 연결이 없으면 조립 단계에서 실패한다(출력 횟수를 쓰기 전에)", () => {
    expect(() => recipientPhoneOnLabel("courier_safe_number", undefined)).toThrow();
  });

  it("INV-P19: 출력 결과에 적용 — 안심번호로 바꾸고, 못 받으면 라벨 없이 실패로 돌린다", async () => {
    const ok = await withRecipientPhone(printed, recipientPhoneOnLabel("courier_safe_number", async () => SAFE));
    expect(ok).toEqual({ ...printed, label: { ...printed.label, phone: SAFE } });
    const none = await withRecipientPhone(printed, recipientPhoneOnLabel("courier_safe_number", async () => null));
    expect(none).toEqual({ kind: "failed" });
    const denied = { kind: "denied" as const, reason: "not_owner" };
    expect(await withRecipientPhone(denied, recipientPhoneOnLabel("courier_safe_number", async () => SAFE))).toBe(denied);
  });
});
