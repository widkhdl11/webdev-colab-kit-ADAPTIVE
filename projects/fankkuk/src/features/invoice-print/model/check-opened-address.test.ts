import { describe, expect, it } from "vitest";
import { creatorAddressPlaintext } from "@/entities/address/model/creator-address-plaintext";
import { checkOpenedCreatorAddress } from "./check-opened-address";

const HARU = "00000000-0000-4000-b000-000000000001";
const DALBIT = "00000000-0000-4000-b000-000000000002";

const fields = { recipientName: "김하루", phone: "01012345678", zipCode: "06236", address1: "서울시 강남구 테헤란로 123", address2: "101동" };

describe("연 주소의 주인 대조 (INV-P14)", () => {
  it("INV-P14: 봉인 속 크리에이터가 그 주소 칸의 크리에이터와 같으면 라벨 칸만 쓴다", () => {
    expect(checkOpenedCreatorAddress({ slotCreatorId: HARU, plaintext: creatorAddressPlaintext({ creatorId: HARU, ...fields }) })).toEqual({
      ok: true,
      label: fields,
    });
  });

  it("INV-P14 (S14, 실패경로): 달빛의 봉인을 하루 칸에 옮겨 붙이면 그 주소를 쓰지 않는다", () => {
    expect(checkOpenedCreatorAddress({ slotCreatorId: HARU, plaintext: creatorAddressPlaintext({ creatorId: DALBIT, ...fields }) })).toEqual({
      ok: false,
      reason: "address_mismatch",
    });
  });

  it("INV-P14 (실패경로): 연 내용의 꼴이 틀리면 쓰지 않는다", () => {
    expect(checkOpenedCreatorAddress({ slotCreatorId: HARU, plaintext: "대구시 중구 동성로 1" })).toEqual({ ok: false, reason: "address_mismatch" });
  });

  it("INV-P14 (실패경로): 주소 칸의 크리에이터를 모르면(빈 값) 쓰지 않는다", () => {
    expect(checkOpenedCreatorAddress({ slotCreatorId: "", plaintext: creatorAddressPlaintext({ creatorId: HARU, ...fields }) })).toEqual({
      ok: false,
      reason: "address_mismatch",
    });
  });
});
