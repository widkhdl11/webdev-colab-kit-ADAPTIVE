import { describe, expect, it } from "vitest";
import { buildSigningPayload } from "./signing-payload";
import { evaluateApproval, type VerifiedSignature } from "./evaluate-approval";

const storedPayload = buildSigningPayload({
  requestId: "apr_A1",
  orderNo: "FC-AAAAA",
  requestedAt: "2026-10-01T09:30:00.000Z",
  fanNicknameHash: "b".repeat(64),
});
const otherPayload = buildSigningPayload({
  requestId: "apr_B1",
  orderNo: "FC-BBBBB",
  requestedAt: "2026-10-01T09:31:00.000Z",
  fanNicknameHash: "c".repeat(64),
});

const creatorSignerId = "kakao-ci-creator-1";
const signed = (content: string, signerId = creatorSignerId): VerifiedSignature => ({
  signedContent: new TextEncoder().encode(content),
  signerId,
});

const base = {
  storedPayload,
  registeredSignerId: creatorSignerId,
  orderStatus: "registered" as const,
  fanBlocked: false,
};

describe("승인 판정", () => {
  it("INV-S2: 서명된 원문이 저장한 원문과 같으면 승인된다", () => {
    expect(evaluateApproval({ ...base, signature: signed(storedPayload) })).toEqual({ ok: true, orderNo: "FC-AAAAA" });
  });

  it("INV-S2 (S2, 실패경로): 주문 A 의 서명을 주문 B 의 요청에 붙이면 원문 불일치로 거부된다", () => {
    expect(evaluateApproval({ ...base, signature: signed(otherPayload) })).toEqual({
      ok: false,
      reason: "payload_mismatch",
    });
  });

  it("INV-S2 (실패경로): 한 글자만 달라도 거부된다 — 바이트 단위 비교", () => {
    const tampered = storedPayload.replace("FC-AAAAA", "FC-AAAAB");
    expect(evaluateApproval({ ...base, signature: signed(tampered) }).ok).toBe(false);
    expect(evaluateApproval({ ...base, signature: signed(storedPayload + " ") }).ok).toBe(false);
  });

  it("INV-S4 (S4, 실패경로): 다른 사람의 인증서로 만든 서명은 본인 불일치로 거부된다", () => {
    expect(evaluateApproval({ ...base, signature: signed(storedPayload, "kakao-ci-someone-else") })).toEqual({
      ok: false,
      reason: "signer_mismatch",
    });
  });

  it("INV-S4 (실패경로): 가입 때 등록된 본인 식별값이 비어 있으면 누구의 서명도 받지 않는다", () => {
    expect(evaluateApproval({ ...base, registeredSignerId: "", signature: signed(storedPayload, "") }).ok).toBe(false);
  });

  it.each(["rejected", "expired", "canceled"] as const)(
    "INV-S6 (S6, 실패경로): %s 상태의 주문에는 유효한 서명이 와도 승인하지 않는다",
    (orderStatus) => {
      expect(evaluateApproval({ ...base, orderStatus, signature: signed(storedPayload) })).toEqual({
        ok: false,
        reason: "order_not_approvable",
      });
    },
  );

  it("INV-S6 (실패경로): 팬이 차단된 주문에는 승인하지 않는다", () => {
    expect(evaluateApproval({ ...base, fanBlocked: true, signature: signed(storedPayload) })).toEqual({
      ok: false,
      reason: "fan_blocked",
    });
  });
});
