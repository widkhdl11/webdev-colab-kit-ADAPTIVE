import { describe, expect, it } from "vitest";
import { authorizeRevgiftDecrypt, checkOpenedRevgift, type RevgiftDecryptRequest } from "./authorize-revgift-decrypt";

const OWNER = "owner-1";

const ok: RevgiftDecryptRequest = {
  requestedOrderNo: "RG-ABC123",
  requesterUserId: OWNER,
  ownerUserId: OWNER,
  hasEnvelope: true,
  share: { reply: "accepted", inspected: true, shipped: false, returned: false, cancelled: false },
  decryptCount: 0,
};

describe("INV-R7: 몫의 주소를 여는 조건", () => {
  it("INV-R7 S7: 받기를 했고 검수 완료·출고 전인 몫을 대표가 요청하면 연다", () => {
    expect(authorizeRevgiftDecrypt(ok)).toEqual({ ok: true, isReprint: false });
  });

  it("INV-R7 S7b (a, 실패경로): 팬이 넣은 주소 암호문이 없으면(받기 전·지워짐) 열지 않는다", () => {
    expect(authorizeRevgiftDecrypt({ ...ok, hasEnvelope: false })).toEqual({ ok: false, reason: "no_valid_approval" });
  });

  it("INV-R7 (a, 실패경로): 팬의 답이 받음이 아니면 열지 않는다", () => {
    for (const reply of ["waiting", "declined", "expired"] as const) {
      expect(authorizeRevgiftDecrypt({ ...ok, share: { ...ok.share, reply } }).ok).toBe(false);
    }
  });

  it("INV-R7 S7d (c, 실패경로): 검수 전·출고 확정 뒤·반송·취소된 몫은 열지 않는다", () => {
    expect(authorizeRevgiftDecrypt({ ...ok, share: { ...ok.share, inspected: false } })).toEqual({ ok: false, reason: "order_not_printable" });
    expect(authorizeRevgiftDecrypt({ ...ok, share: { ...ok.share, shipped: true } })).toEqual({ ok: false, reason: "order_not_printable" });
    expect(authorizeRevgiftDecrypt({ ...ok, share: { ...ok.share, returned: true } })).toEqual({ ok: false, reason: "order_not_printable" });
    expect(authorizeRevgiftDecrypt({ ...ok, share: { ...ok.share, cancelled: true } })).toEqual({ ok: false, reason: "order_not_printable" });
  });

  it("INV-R7 S7e (d, 실패경로): 대표가 아니면 열지 않는다 — 대표 ID 설정이 비어 있어도 마찬가지", () => {
    expect(authorizeRevgiftDecrypt({ ...ok, requesterUserId: "staff-1" })).toEqual({ ok: false, reason: "not_owner" });
    expect(authorizeRevgiftDecrypt({ ...ok, requesterUserId: "", ownerUserId: "" })).toEqual({ ok: false, reason: "not_owner" });
  });

  it("INV-R7: 한 몫은 최대 3회 — 2회째부터는 재출력, 4회째는 거부", () => {
    expect(authorizeRevgiftDecrypt({ ...ok, decryptCount: 1 })).toEqual({ ok: true, isReprint: true });
    expect(authorizeRevgiftDecrypt({ ...ok, decryptCount: 2 })).toEqual({ ok: true, isReprint: true });
    expect(authorizeRevgiftDecrypt({ ...ok, decryptCount: 3 })).toEqual({ ok: false, reason: "decrypt_limit_reached" });
  });

  it("INV-R7 S7c (b, 실패경로): 연 내용의 주문번호가 요청한 몫과 다르면(옮겨 붙인 암호문) 쓰지 않는다", () => {
    const opened = JSON.stringify({ v: 1, orderNo: "RG-OTHER1", recipientName: "a", phone: "01012345678", zipCode: "04001", address1: "x", address2: "" });
    expect(checkOpenedRevgift({ requestedOrderNo: "RG-ABC123", openedPlaintext: opened })).toEqual({ ok: false, reason: "order_mismatch" });
    expect(checkOpenedRevgift({ requestedOrderNo: "RG-OTHER1", openedPlaintext: opened })).toEqual({
      ok: true,
      label: { recipientName: "a", phone: "01012345678", zipCode: "04001", address1: "x", address2: "" },
    });
    expect(checkOpenedRevgift({ requestedOrderNo: "RG-ABC123", openedPlaintext: "서울" })).toEqual({ ok: false, reason: "order_mismatch" });
  });
});
