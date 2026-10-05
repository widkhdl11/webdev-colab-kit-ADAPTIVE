import { describe, expect, it } from "vitest";
import { creatorAddressPlaintext, readOpenedCreatorAddress, type CreatorAddressInput } from "./creator-address-plaintext";

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

describe("연 평문 읽기 (INV-P14 — 송장 출력이 쓰는 꼴)", () => {
  it("INV-P14: 봉인한 평문을 그대로 읽으면 크리에이터 식별값과 라벨 칸이 나뉘어 나온다", () => {
    const { creatorId, ...label } = VALID;
    expect(readOpenedCreatorAddress(creatorAddressPlaintext(VALID))).toEqual({ creatorId, label });
  });

  it("INV-P14: 라벨 칸에는 크리에이터 식별값·판 번호가 들어가지 않는다", () => {
    const opened = readOpenedCreatorAddress(creatorAddressPlaintext(VALID));
    expect(Object.keys(opened?.label ?? {}).sort()).toEqual(["address1", "address2", "phone", "recipientName", "zipCode"]);
  });

  it("INV-P14 (실패경로): 꼴이 틀린 평문은 null — 송장 출력이 그 내용을 쓰지 않는다", () => {
    const broken = [
      "not json",
      "",
      JSON.stringify({ ...VALID }),
      JSON.stringify({ v: 2, ...VALID }),
      JSON.stringify({ v: 1, ...VALID, memo: "x" }),
      JSON.stringify({ v: 1, ...VALID, creatorId: "haru" }),
      JSON.stringify({ v: 1, ...VALID, phone: "0212345678" }),
      JSON.stringify(null),
    ];
    for (const text of broken) expect(readOpenedCreatorAddress(text)).toBeNull();
  });
});
