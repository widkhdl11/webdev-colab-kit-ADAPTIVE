import { describe, expect, it } from "vitest";
import { buildApprovalPlaintext, parseApprovalPlaintext } from "./approval-plaintext";
import { giftKindLabelOf } from "@/shared/config/item-category";

// approval-signature INV-S1: 서명 원문은 주문번호·보낸 팬 닉네임·선물 종류·개수 네 값뿐이다.
// DB 의 원문 함수(approval_sign_plaintext)와 같은 꼴이다 — 같은 값을 넣으면 같은 글이 나오는지는 통합 시험(approval-sign-db)이 본다.

const STAR = { orderNo: "FC-7K3M9", fanNickname: "별빛", giftKind: "꽃", boxCount: 2 };

describe("INV-S1: 원문은 네 값으로만", () => {
  it("INV-S1 S1: 주문번호·닉네임·선물 종류·개수 네 줄이고 그 밖의 글이 없다", () => {
    expect(buildApprovalPlaintext(STAR)).toBe("주문번호: FC-7K3M9\n보낸 팬: 별빛\n선물 종류: 꽃\n개수: 2");
  });

  it("INV-S1 S1b (실패경로): 주소·메모·실명 칸이 섞여 들어오면 만들지 않는다", () => {
    for (const extra of [{ address: "서울시 강남구 테헤란로 1" }, { memo: "사랑해요" }, { realName: "정재원" }, { phone: "010-1234-5678" }]) {
      expect(() => buildApprovalPlaintext({ ...STAR, ...extra } as never), JSON.stringify(extra)).toThrow();
    }
  });

  it("INV-S1 (실패경로): 선물 종류는 정해진 목록의 이름만 — 팬이 쓴 글은 받지 않는다", () => {
    expect(() => buildApprovalPlaintext({ ...STAR, giftKind: "손편지와 사진" })).toThrow();
    expect(() => buildApprovalPlaintext({ ...STAR, giftKind: "기타" })).not.toThrow();
  });

  it("INV-S1 (실패경로): 칸 안의 줄바꿈·꼴이 틀린 주문번호·개수 0·11 은 만들지 않는다", () => {
    for (const bad of [{ fanNickname: "별빛\n선물 종류: 꽃" }, { orderNo: "fc-1" }, { boxCount: 0 }, { boxCount: 11 }, { fanNickname: "" }]) {
      expect(() => buildApprovalPlaintext({ ...STAR, ...bad }), JSON.stringify(bad)).toThrow();
    }
  });

  it("INV-S1: 원문을 칸으로 되돌린다 — 줄이 더 있거나 순서가 다르면 null", () => {
    expect(parseApprovalPlaintext(buildApprovalPlaintext(STAR))).toEqual(STAR);
    expect(parseApprovalPlaintext(`${buildApprovalPlaintext(STAR)}\n주소: 서울`)).toBeNull();
    expect(parseApprovalPlaintext("보낸 팬: 별빛\n주문번호: FC-7K3M9\n선물 종류: 꽃\n개수: 2")).toBeNull();
    expect(parseApprovalPlaintext("")).toBeNull();
  });
});

describe("INV-S1: 선물 종류 = 팬이 고른 목록 값의 이름", () => {
  it("INV-S1: 목록 코드는 그 이름, 비었거나 목록 밖이면 「기타」(팬이 쓴 물품 이름은 쓰지 않는다)", () => {
    expect(giftKindLabelOf("doll")).toBe("인형·쿠션");
    expect(giftKindLabelOf("other")).toBe("기타");
    expect(giftKindLabelOf(null)).toBe("기타");
    expect(giftKindLabelOf("손편지")).toBe("기타");
  });
});
