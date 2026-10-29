import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApprovalPlaintext } from "./approval-plaintext";
import { checkRecordedApproval, orderNoOfApprovalPlaintext, sameSignedPlaintext, sha256Hex } from "./evaluate-approval";
import { buildSigningPayload } from "./signing-payload";

const A = buildApprovalPlaintext({ orderNo: "FC-AAAAA", fanNickname: "별빛", giftKind: "꽃", boxCount: 2 });
const B = buildApprovalPlaintext({ orderNo: "FC-BBBBB", fanNickname: "별빛", giftKind: "꽃", boxCount: 2 });
const hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("INV-S2: 서명된 원문은 저장한 원문과 바이트 단위로 같아야 한다", () => {
  it("INV-S2: 같으면 통과", () => {
    expect(sameSignedPlaintext(A, A)).toBe(true);
  });

  it("INV-S2 S2 (실패경로): 주문 A 의 서명된 원문을 주문 B 의 요청에 붙이면 거부", () => {
    expect(sameSignedPlaintext(B, A)).toBe(false);
  });

  it("INV-S2 (실패경로): 한 글자·공백 하나·유니코드 정규화만 달라도 거부, 저장 원문이 비면 거부", () => {
    expect(sameSignedPlaintext(A, `${A} `)).toBe(false);
    expect(sameSignedPlaintext(A, A.replace("2", "3"))).toBe(false);
    expect(sameSignedPlaintext(A, A.normalize("NFD"))).toBe(false);
    expect(sameSignedPlaintext("", "")).toBe(false);
  });
});

describe("INV-S12·INV-P4 (a)(b): 저장된 서명 기록을 서명자 식별값 없이 다시 본다", () => {
  it("INV-S12: 기록된 원문 해시가 그 주문 승인 원문의 SHA-256 과 같으면 통과하고 원문의 주문번호를 준다", async () => {
    expect(await sha256Hex(A)).toBe(hex(A));
    expect(checkRecordedApproval({ plaintext: A, plaintextHash: hex(A), recordedHash: hex(A) })).toEqual({ ok: true, orderNo: "FC-AAAAA" });
  });

  it("INV-S12 (실패경로): 해시가 다르거나 꼴이 아니거나 원문을 읽을 수 없으면 거부", () => {
    expect(checkRecordedApproval({ plaintext: A, plaintextHash: hex(A), recordedHash: hex(B) }).ok).toBe(false);
    expect(checkRecordedApproval({ plaintext: A, plaintextHash: hex(A), recordedHash: "" }).ok).toBe(false);
    expect(checkRecordedApproval({ plaintext: A, plaintextHash: hex(A), recordedHash: hex(A).toUpperCase() }).ok).toBe(false);
    expect(checkRecordedApproval({ plaintext: "아무 글", plaintextHash: hex("아무 글"), recordedHash: hex("아무 글") }).ok).toBe(false);
  });

  it("INV-P4 (b): 2026-10-29 전의 원문(요청 ID·주문번호·시각·닉네임 해시)에서도 주문번호를 읽는다", () => {
    const old = buildSigningPayload({ requestId: "apr_A1", orderNo: "FC-CCCCC", requestedAt: "2026-10-01T09:30:00.000Z", fanNicknameHash: "b".repeat(64) });
    expect(orderNoOfApprovalPlaintext(old)).toBe("FC-CCCCC");
    expect(orderNoOfApprovalPlaintext(A)).toBe("FC-AAAAA");
    expect(orderNoOfApprovalPlaintext("주문번호: FC-AAAAA")).toBeNull();
  });
});
