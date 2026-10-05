import { describe, expect, it } from "vitest";
import { creatorAddressPlaintext, type CreatorAddressInput } from "./creator-address-plaintext";

const HARU_CREATOR_ID = "00000000-0000-4000-b000-000000000001";

const VALID: CreatorAddressInput = {
  creatorId: HARU_CREATOR_ID,
  recipientName: "김하루",
  phone: "01012345678",
  zipCode: "06236",
  address1: "서울시 강남구 테헤란로 123",
  address2: "101동 1004호",
};

describe("크리에이터 주소 봉인 평문 (INV-P13)", () => {
  it("INV-P13: 봉인할 평문에 택배 라벨 값과 그 크리에이터의 식별값이 함께 들어간다", () => {
    expect(JSON.parse(creatorAddressPlaintext(VALID))).toEqual({ v: 1, ...VALID });
  });

  it("INV-P13: 상세 주소는 비워도 된다", () => {
    expect(JSON.parse(creatorAddressPlaintext({ ...VALID, address2: "" })).address2).toBe("");
  });

  it("INV-P13 (실패경로): 칸이 하나라도 틀리면 평문을 만들지 않는다", () => {
    const bad: Partial<CreatorAddressInput>[] = [
      { creatorId: "haru" },
      { creatorId: "" },
      { recipientName: "  " },
      { phone: "0212345678" },
      { phone: "010-1234-5678" },
      { zipCode: "1234" },
      { address1: "" },
      { address2: "가".repeat(121) },
    ];
    for (const patch of bad) {
      expect(() => creatorAddressPlaintext({ ...VALID, ...patch })).toThrow();
    }
  });

  it("INV-P13 (실패경로): 정해진 칸 밖의 값이 섞이면 만들지 않는다", () => {
    expect(() => creatorAddressPlaintext({ ...VALID, memo: "x" } as CreatorAddressInput)).toThrow();
  });
});
