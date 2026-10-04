import { describe, expect, it } from "vitest";
import { buildSigningPayload } from "@/entities/order/model/signing-payload";
import type { VerifiedSignature } from "@/entities/order/model/evaluate-approval";
import { MAX_DECRYPTS_PER_ORDER } from "@/entities/address/model/access-log";
import { authorizeDecrypt, type DecryptRequest } from "./authorize-decrypt";

const OWNER = "user-owner";
const CREATOR_SIGNER = "kakao-ci-creator-1";

const payloadFor = (orderNo: string) =>
  buildSigningPayload({
    requestId: `apr_${orderNo.slice(3)}`,
    orderNo,
    requestedAt: "2026-10-01T09:30:00.000Z",
    fanNicknameHash: "d".repeat(64),
  });

const signatureOver = (content: string, signerId = CREATOR_SIGNER): VerifiedSignature => ({
  signedContent: new TextEncoder().encode(content),
  signerId,
});

const ok: DecryptRequest = {
  requestedOrderNo: "FC-AAAAA",
  requesterUserId: OWNER,
  ownerUserId: OWNER,
  storedPayload: payloadFor("FC-AAAAA"),
  signature: signatureOver(payloadFor("FC-AAAAA")),
  registeredSignerId: CREATOR_SIGNER,
  orderStatus: "inspected",
  fanBlocked: false,
  decryptCount: 0,
  differenceUnpaid: false,
};

describe("복호화 허용 판정", () => {
  it("INV-M12 (S12, 실패경로): 차액이 아직 결제되지 않은 주문은 송장을 출력하지 않는다", () => {
    expect(authorizeDecrypt({ ...ok, differenceUnpaid: true })).toEqual({ ok: false, reason: "difference_unpaid" });
  });

  it("INV-P4: 조건이 모두 맞으면 첫 출력이 허용되고 재출력 표시는 없다", () => {
    expect(authorizeDecrypt(ok)).toEqual({ ok: true, isReprint: false });
  });

  it("INV-P4 (S4, 실패경로 a): 승인 서명이 없는 주문은 거부된다", () => {
    expect(authorizeDecrypt({ ...ok, signature: null })).toEqual({ ok: false, reason: "no_valid_approval" });
  });

  it("INV-P4 (실패경로 a): DB 에 승인 표시가 있어도 서명 검증이 실패하면 거부된다 — 서명을 직접 다시 본다", () => {
    expect(authorizeDecrypt({ ...ok, signature: signatureOver(payloadFor("FC-AAAAA"), "kakao-ci-attacker") })).toEqual({
      ok: false,
      reason: "no_valid_approval",
    });
  });

  it("INV-P4 (S4b, 실패경로 b): 주문 A 의 승인을 주문 B 의 출력에 붙이면 거부된다", () => {
    const res = authorizeDecrypt({ ...ok, requestedOrderNo: "FC-BBBBB" });
    expect(res).toEqual({ ok: false, reason: "order_mismatch" });
  });

  it.each(["registered", "approved", "received", "labeled", "rejected", "expired", "canceled", "shipped"] as const)(
    "INV-P4 (S4c, 실패경로 c): %s 상태에서는 거부된다",
    (orderStatus) => {
      expect(authorizeDecrypt({ ...ok, orderStatus })).toEqual({ ok: false, reason: "order_not_printable" });
    },
  );

  it("INV-P4 (실패경로 c): 팬이 차단된 주문은 거부된다", () => {
    expect(authorizeDecrypt({ ...ok, fanBlocked: true }).ok).toBe(false);
  });

  it("INV-P5: 상한은 3회다", () => {
    expect(MAX_DECRYPTS_PER_ORDER).toBe(3);
  });

  it("INV-P5 (S5d): 2회째·3회째 출력은 재출력으로 표시된다", () => {
    expect(authorizeDecrypt({ ...ok, orderStatus: "label_printed", decryptCount: 1 })).toEqual({
      ok: true,
      isReprint: true,
    });
    expect(authorizeDecrypt({ ...ok, orderStatus: "label_printed", decryptCount: 2 })).toEqual({
      ok: true,
      isReprint: true,
    });
  });

  it("INV-P5 (S5, 실패경로): 상한까지 연 주문은 더 열리지 않는다", () => {
    expect(authorizeDecrypt({ ...ok, orderStatus: "label_printed", decryptCount: 3 })).toEqual({
      ok: false,
      reason: "decrypt_limit_reached",
    });
  });

  it("INV-P5 (S5c, 실패경로): 1회 출력 후 출고 확정된 주문은 남은 횟수가 있어도 거부된다", () => {
    expect(authorizeDecrypt({ ...ok, orderStatus: "shipped", decryptCount: 1 })).toEqual({
      ok: false,
      reason: "order_not_printable",
    });
  });

  it("INV-P8 (S8, 실패경로): 대표가 아닌 계정의 요청은 거부된다", () => {
    expect(authorizeDecrypt({ ...ok, requesterUserId: "user-staff" })).toEqual({
      ok: false,
      reason: "not_owner",
    });
  });

  it("INV-P8 (실패경로): 복호화 함수에 대표 ID 설정이 비어 있으면 아무도 열 수 없다", () => {
    expect(authorizeDecrypt({ ...ok, ownerUserId: "", requesterUserId: "" })).toEqual({
      ok: false,
      reason: "not_owner",
    });
  });
});
