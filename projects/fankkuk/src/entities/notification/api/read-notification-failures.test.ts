import { describe, expect, it } from "vitest";
import { errorCodeLabel, kindLabel, readNotificationFailures } from "./read-notification-failures";

// 운영자 실패 목록 읽기 (notifications INV-N10). 응답은 신뢰 경계 밖이라 정해진 칸만 꺼내 쓴다.

const ROW = {
  kind: "approval_request",
  order_no: "FC-7K3M9",
  round: 3,
  channel: "email",
  status: "failed",
  attempts: 5,
  error_code: "smtp_error",
  finished_at: "2026-10-06T06:00:00+00:00",
};

const client = (reply: { data: unknown; error: { code: string } | null }) => ({ rpc: async () => reply }) as never;

describe("운영자 실패 목록 읽기 (INV-N10)", () => {
  it("INV-N10: 정해진 칸만 꺼낸다 — 응답에 다른 칸이 섞여 와도 화면 값에 넣지 않는다", async () => {
    const rows = await readNotificationFailures(client({ data: [{ ...ROW, account_id: "x", email: "a@example.com" }], error: null }));
    expect(rows).toEqual([
      { kind: "approval_request", orderNo: "FC-7K3M9", round: 3, channel: "email", status: "failed", attempts: 5, errorCode: "smtp_error", finishedAt: "2026-10-06T06:00:00+00:00" },
    ]);
    expect(JSON.stringify(rows)).not.toContain("a@example.com");
  });

  it("(실패경로): DB 오류나 꼴이 다른 응답이면 던진다 — 빈 목록으로 보이게 하지 않는다", async () => {
    await expect(readNotificationFailures(client({ data: null, error: { code: "42501" } }))).rejects.toThrow();
    await expect(readNotificationFailures(client({ data: [{ ...ROW, status: "sent" }], error: null }))).rejects.toThrow();
  });

  it("종류와 오류 코드를 사람 말로 — 모르는 코드는 코드 그대로", () => {
    expect(kindLabel("approval_request", 3)).toBe("승인 요청 (3차 재알림)");
    expect(kindLabel("approval_request", 1)).toBe("승인 요청");
    expect(kindLabel("hold")).toBe("보관");
    expect(errorCodeLabel("no_contact")).toMatch(/꺼|이메일/);
    expect(errorCodeLabel("request_not_waiting")).toMatch(/승인/);
    expect(errorCodeLabel("weird_code")).toBe("weird_code");
    expect(errorCodeLabel(null)).toBe("—");
  });
});
