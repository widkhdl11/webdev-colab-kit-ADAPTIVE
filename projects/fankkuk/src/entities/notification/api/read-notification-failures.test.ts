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
    for (const bad of [{ status: "sent" }, { channel: "sms" }, { attempts: "5" }, { order_no: 5 }, { kind: "Approval Request" }]) {
      await expect(readNotificationFailures(client({ data: [{ ...ROW, ...bad }], error: null }))).rejects.toThrow();
    }
  });

  it("INV-N10 · INV-NB5: 주문이 없는 하루 묶음 줄도 목록에 보인다 — 주문번호 칸은 비어 있다", async () => {
    const rows = await readNotificationFailures(client({ data: [{ ...ROW, kind: "status_digest", order_no: null, round: 1, error_code: "no_contact" }], error: null }));
    expect(rows.map((r) => [r.kind, r.orderNo])).toEqual([["status_digest", null]]);
    expect(kindLabel("status_digest")).toBe("하루 묶음");
  });

  it("INV-N10: 모르는 종류(나중에 더한 알림)가 와도 목록은 열린다 — 종류 코드를 그대로 보인다", async () => {
    const rows = await readNotificationFailures(client({ data: [{ ...ROW, kind: "revgift_received" }], error: null }));
    expect(kindLabel(rows[0]!.kind, rows[0]!.round)).toBe("revgift_received");
  });

  it("종류와 오류 코드를 사람 말로 — 모르는 코드는 코드 그대로", () => {
    // 승인 요청은 10분 창의 첫 통(1)·끝 통(2), 승인 재알림은 3일째(1)·6일째(2) — notification-batching INV-NB1·NB2. 3차는 2026-10-30 전에 생긴 옛 줄
    expect(kindLabel("approval_request", 1)).toBe("승인 요청");
    expect(kindLabel("approval_request", 2)).toBe("승인 요청 (창 끝)");
    expect(kindLabel("approval_request", 3)).toBe("승인 요청 (옛 3차 재알림)");
    expect(kindLabel("approval_reminder", 1)).toBe("승인 재알림 (3일째)");
    expect(kindLabel("approval_reminder", 2)).toBe("승인 재알림 (6일째)");
    expect(kindLabel("arrived")).toBe("입고");
    // 추적기 상자는 2026-10-17 부터 반송하지 않고 보관한다(INV-N13·W14) — 운영자 표기 「추적기 보관」
    expect(kindLabel("hold")).toBe("추적기 보관");
    expect(kindLabel("return_address")).toBe("반송 주소 확인");
    expect(kindLabel("return_address_reminder")).toBe("반송 주소 확인 (14일 재알림)");
    expect(errorCodeLabel("no_contact")).toMatch(/꺼|이메일/);
    expect(errorCodeLabel("request_not_waiting")).toMatch(/승인/);
    expect(errorCodeLabel("no_waiting_requests")).toMatch(/승인 대기/);
    expect(errorCodeLabel("approval_window_open")).toMatch(/10분/);
    expect(errorCodeLabel("weird_code")).toBe("weird_code");
    expect(errorCodeLabel(null)).toBe("—");
  });
});
