import { describe, expect, it } from "vitest";
import { creatorAddressPlaintext } from "./creator-address-plaintext";
import { fanAddressPlaintext, readOpenedFanAddress, type FanAddressInput } from "./fan-address-plaintext";

const BYEOLBIT = "00000000-0000-4000-a000-000000000001";

const VALID: FanAddressInput = {
  accountId: BYEOLBIT,
  recipientName: "김별빛",
  phone: "01012345678",
  zipCode: "04001",
  address1: "서울시 마포구 어울마당로 1",
  address2: "2층",
};

describe("팬 주소 봉인 평문 (address-protection INV-P17 · reverse-gift INV-R5)", () => {
  it("INV-P17 S17: 봉인할 평문에 택배 라벨 값과 그 팬의 계정 식별값이 함께 들어간다 — 주문번호는 없다", () => {
    const plain = JSON.parse(fanAddressPlaintext(VALID)) as Record<string, unknown>;
    expect(plain).toEqual({ v: 1, ...VALID });
    expect(plain).not.toHaveProperty("orderNo");
  });

  it("INV-P17 (실패경로): 칸이 하나라도 틀리거나 정해진 칸 밖의 값이 섞이면 만들지 않는다", () => {
    const bad: Partial<FanAddressInput>[] = [
      { accountId: "byeolbit" },
      { accountId: "" },
      { recipientName: " " },
      { phone: "02-123" },
      { zipCode: "1234" },
      { address1: "" },
      { address2: "가".repeat(121) },
    ];
    for (const patch of bad) expect(() => fanAddressPlaintext({ ...VALID, ...patch })).toThrow();
    expect(() => fanAddressPlaintext({ ...VALID, orderNo: "RG-ABC123" } as FanAddressInput)).toThrow();
  });

  it("INV-R7 b: 연 평문을 계정 식별값과 라벨 다섯 칸으로 나눈다", () => {
    const { accountId, ...label } = VALID;
    expect(readOpenedFanAddress(fanAddressPlaintext(VALID))).toEqual({ accountId, label });
  });

  it("INV-R7 b (실패경로): 꼴이 틀린 평문·크리에이터 봉인·주문번호 봉인은 팬 주소로 읽지 않는다", () => {
    expect(readOpenedFanAddress("서울 마포구")).toBeNull();
    expect(readOpenedFanAddress(JSON.stringify({ v: 1, accountId: BYEOLBIT }))).toBeNull();
    const { accountId: _a, ...rest } = VALID;
    expect(readOpenedFanAddress(creatorAddressPlaintext({ creatorId: BYEOLBIT, ...rest }))).toBeNull();
    expect(readOpenedFanAddress(JSON.stringify({ v: 1, orderNo: "RG-ABC123", ...rest }))).toBeNull();
  });
});
