import { describe, expect, it } from "vitest";
import { splitRefundError } from "./refund-error-text";

describe("환불 실패 문구 나누기", () => {
  it("코드와 사람 말이 같이 오면 사람 말을 앞에, 코드를 따로 둔다", () => {
    expect(splitRefundError("NOT_CANCELABLE_AMOUNT 취소 할 수 없는 금액 입니다.")).toEqual({ message: "취소 할 수 없는 금액 입니다.", code: "NOT_CANCELABLE_AMOUNT" });
  });
  it("코드만 오면 코드를 그대로 보이지 않고 정해 둔 문장을 쓴다", () => {
    const r = splitRefundError("NOT_FOUND_PAYMENT");
    expect(r.code).toBe("NOT_FOUND_PAYMENT");
    expect(r.message).not.toContain("NOT_FOUND_PAYMENT");
    expect(r.message).toMatch(/결제사/);
  });
  it("코드 꼴이 아니면 받은 말을 그대로 둔다", () => {
    expect(splitRefundError("네트워크가 끊겼어요")).toEqual({ message: "네트워크가 끊겼어요", code: null });
    expect(splitRefundError("  ").message).toMatch(/결제사/);
  });
});
