import { describe, expect, it } from "vitest";
import { fullCancelVerdict } from "./cancel-outcome";

// 남은 금액 전부 취소의 결과 판정 (payment INV-M20 ②·③).

const KEY = "pk_review";
const canceled = (status = "CANCELED", cancelStatus = "DONE") => ({
  paymentKey: KEY,
  status,
  cancels: [{ cancelAmount: 5000, cancelStatus, canceledAt: "2026-10-10T03:00:00+09:00" }],
});

describe("INV-M20: 전액 취소 응답 판정", () => {
  it("INV-M20 ③: 결제 키가 같고 전부 취소됨·마지막 줄 완료면 ok", () => {
    expect(fullCancelVerdict(canceled(), KEY)).toEqual({ kind: "ok" });
  });

  it("INV-M20 (실패경로): 일부만 취소됨·다른 결제 키·마지막 줄이 완료가 아니면 ok 가 아니다", () => {
    expect(fullCancelVerdict(canceled("PARTIAL_CANCELED"), KEY).kind).not.toBe("ok");
    expect(fullCancelVerdict(canceled(), "pk_other").kind).not.toBe("ok");
    expect(fullCancelVerdict(canceled("CANCELED", "IN_PROGRESS"), KEY).kind).not.toBe("ok");
  });

  it("INV-M20 ②: 결제사 오류 꼴이면 rejected(취소되지 않음이 확실) — 문구는 200자 안", () => {
    expect(fullCancelVerdict({ code: "NOT_FOUND_PAYMENT", message: "존재하지 않는 결제 정보 입니다." }, KEY)).toEqual({
      kind: "rejected",
      error: "NOT_FOUND_PAYMENT 존재하지 않는 결제 정보 입니다.",
    });
    const long = fullCancelVerdict({ code: "X", message: "가".repeat(300) }, KEY);
    expect(long.kind === "rejected" && long.error.length).toBe(200);
  });

  it("INV-M20 ② (실패경로): 알아볼 수 없는 꼴은 unknown — 결제사에서 취소가 됐을 수도 있다", () => {
    expect(fullCancelVerdict({ unexpected: true }, KEY)).toEqual({ kind: "unknown" });
    expect(fullCancelVerdict(null, KEY)).toEqual({ kind: "unknown" });
    expect(fullCancelVerdict(canceled("PARTIAL_CANCELED"), KEY)).toEqual({ kind: "unknown" });
  });
});
