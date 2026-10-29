import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildApprovalPlaintext } from "@/entities/order/model/approval-plaintext";
import type { RecordedApproval } from "@/entities/order/model/evaluate-approval";
import { MAX_DECRYPTS_PER_BOX } from "@/entities/address/model/access-log";
import { authorizeDecrypt, type DecryptRequest } from "./authorize-decrypt";

const OWNER = "user-owner";
const hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const payloadFor = (orderNo: string) => buildApprovalPlaintext({ orderNo, fanNickname: "별빛", giftKind: "꽃", boxCount: 1 });

/** 서명 기록 — 기록된 원문 해시는 기본으로 그 원문의 해시(approval-signature INV-S12) */
const recordFor = (plaintext: string, recordedHash = hex(plaintext)): RecordedApproval => ({ plaintext, plaintextHash: hex(plaintext), recordedHash });

const ok: DecryptRequest = {
  requestedOrderNo: "FC-AAAAA",
  requesterUserId: OWNER,
  ownerUserId: OWNER,
  approval: recordFor(payloadFor("FC-AAAAA")),
  orderStatus: "inspected",
  parcelState: "inspected",
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
    expect(authorizeDecrypt({ ...ok, approval: null })).toEqual({ ok: false, reason: "no_valid_approval" });
  });

  it("INV-P4 (실패경로 a)·INV-S12: DB 에 승인 표시가 있어도 기록된 원문 해시가 그 주문 승인 원문의 해시와 다르면 거부된다", () => {
    expect(authorizeDecrypt({ ...ok, approval: recordFor(payloadFor("FC-AAAAA"), hex(payloadFor("FC-BBBBB"))) })).toEqual({
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
    expect(MAX_DECRYPTS_PER_BOX).toBe(3);
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

  it("INV-P5 (S5c): 1회 출력 후 출고 확정된 상자는 남은 횟수 안에서 재출력된다", () => {
    expect(authorizeDecrypt({ ...ok, orderStatus: "shipped", parcelState: "shipped", decryptCount: 1 })).toEqual({ ok: true, isReprint: true });
    // 옆 상자가 아직 안 나가 주문은 송장 출력 단계여도 같다
    expect(authorizeDecrypt({ ...ok, orderStatus: "label_printed", parcelState: "shipped", decryptCount: 2 })).toEqual({ ok: true, isReprint: true });
  });

  it("INV-P5 (S5g): 옆 상자가 아직 검수 완료라 주문이 검수 완료 단계여도 출고한 상자는 재출력된다", () => {
    // 주문 단계는 가장 덜 나간 상자를 따른다 — 상자 1 출고, 상자 2 출력 전이면 주문은 검수 완료
    expect(authorizeDecrypt({ ...ok, orderStatus: "inspected", parcelState: "shipped", decryptCount: 1 })).toEqual({ ok: true, isReprint: true });
  });

  it("INV-P5 (S5h, 실패경로): 출고 확정 뒤 재출력도 상한 3번을 넘지 않는다", () => {
    expect(authorizeDecrypt({ ...ok, orderStatus: "shipped", parcelState: "shipped", decryptCount: 3 })).toEqual({
      ok: false,
      reason: "decrypt_limit_reached",
    });
  });

  it("INV-P4 (c, 실패경로): 출고 확정된 상자의 첫 출력은 없다 · 주문이 출고됐는데 이 상자가 출고 확정이 아니면 거부", () => {
    expect(authorizeDecrypt({ ...ok, orderStatus: "shipped", parcelState: "shipped", decryptCount: 0 })).toEqual({ ok: false, reason: "order_not_printable" });
    expect(authorizeDecrypt({ ...ok, orderStatus: "shipped", parcelState: "inspected", decryptCount: 1 })).toEqual({ ok: false, reason: "order_not_printable" });
    expect(authorizeDecrypt({ ...ok, orderStatus: "rejected", parcelState: "shipped", decryptCount: 1 })).toEqual({ ok: false, reason: "order_not_printable" });
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
