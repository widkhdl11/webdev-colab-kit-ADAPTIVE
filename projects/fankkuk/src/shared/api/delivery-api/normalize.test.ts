import { describe, expect, it } from "vitest";
import { normalizeCarrierTime, normalizeTraceResponse, normalizeWebhookBody } from "./normalize";

// delivery-status INV-DS10 — 정리한 꼴(원본 raw 를 뺀 칸)에는 위치·설명·사람 칸이 없다. 원본은 raw 에만.
// 본문 모양은 문서 예시(webhook-guide · docs, 2026-11-09 읽음)를 옮겨 적은 녹화본이다.

const PII = { receiverName: "홍길동", senderName: "팬꾹", arrivalBranch: "가산대리점" };
const WEBHOOK = {
  event: "tracking.polled",
  requestId: "req_20260113_103000_a1b2c3d4e5f6a7b8",
  timestamp: "2026-01-13T10:30:00.000Z",
  summary: { total: 1, delivered: 1, active: 0, hasChanges: true },
  items: [
    {
      courierCode: "cj",
      trackingNumber: "123456789012",
      clientId: "6f1d2c1e-0000-4000-8000-000000000001",
      previousStatus: "IN_TRANSIT",
      currentStatus: "DELIVERED",
      hasChanged: true,
      isDelivered: true,
      trackingData: {
        ...PII,
        progresses: [
          { dateTime: "2026-01-12 18:20", location: "곤지암Hub", status: "간선상차", statusCode: "IN_TRANSIT", description: "기사 김기사 010-0000-0000" },
          { dateTime: "2026-01-13T10:10:00+09:00", location: "가산대리점", status: "배달완료", statusCode: "DELIVERED", description: "본인 수령" },
        ],
      },
    },
  ],
  metadata: { orderId: "x" },
};

describe("normalizeWebhookBody (INV-DS10)", () => {
  it("INV-DS10: 정리한 칸은 택배사·송장·상태 코드·이력(시각·코드)뿐 — 수령인·대리점·기사 글자는 raw 에만 있다", () => {
    const [it0] = normalizeWebhookBody(WEBHOOK)!;
    const { raw, ...rest } = it0!;
    expect(rest).toEqual({
      courierCode: "cj",
      trackingNumber: "123456789012",
      status: "DELIVERED",
      progresses: [
        { at: "2026-01-12T18:20:00+09:00", status: "IN_TRANSIT" },
        { at: "2026-01-13T10:10:00+09:00", status: "DELIVERED" },
      ],
    });
    const shown = JSON.stringify(rest);
    for (const v of [...Object.values(PII), "곤지암", "김기사", "010-", "본인 수령"]) expect(shown).not.toContain(v);
    // 원본은 그대로 남는다(분쟁용) — 찾는 방법이 동작한다
    expect(JSON.stringify(raw)).toContain("홍길동");
  });

  it("INV-DS10 (실패경로): 꼴이 아닌 본문은 null, 꼴이 아닌 항목·상태 코드는 건너뛴다", () => {
    expect(normalizeWebhookBody({})).toBeNull();
    expect(normalizeWebhookBody({ items: "x" })).toBeNull();
    const out = normalizeWebhookBody({ items: [{ courierCode: "CJ!", trackingNumber: "1" }, { courierCode: "cj", trackingNumber: "123456789012", currentStatus: "배달완료" }] })!;
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBeNull();
  });

  it("택배사 시각: 시간대가 없으면 한국 시각, 알아볼 수 없으면 null", () => {
    expect(normalizeCarrierTime("2026-01-12 18:20")).toBe("2026-01-12T18:20:00+09:00");
    expect(normalizeCarrierTime("2026-01-12T09:20:00Z")).toBe("2026-01-12T09:20:00Z");
    expect(normalizeCarrierTime("어제 저녁")).toBeNull();
    expect(normalizeCarrierTime(20260112)).toBeNull();
  });
});

describe("normalizeTraceResponse", () => {
  it("수동 조회 응답 — 성공 항목만 정리하고 실패 수를 센다, 정리한 칸에 사람 칸 없음", () => {
    const res = normalizeTraceResponse({
      isSuccess: true,
      data: {
        results: [
          { clientId: "a", success: true, data: { trackingNumber: "123456789012", courierCode: "cj", courierName: "CJ대한통운", deliveryStatus: "IN_TRANSIT", isDelivered: false, ...PII, progresses: [{ dateTime: "2026-01-12 18:20", statusCode: "PICKED_UP", location: "가산대리점" }] } },
          { clientId: "b", success: false, error: { code: "NOT_FOUND", message: "x" } },
        ],
        summary: { total: 2, successful: 1, failed: 1, billable: 1 },
      },
    })!;
    expect(res.failed).toBe(1);
    const { raw, ...rest } = res.items[0]!;
    expect(rest).toEqual({ courierCode: "cj", trackingNumber: "123456789012", status: "IN_TRANSIT", progresses: [{ at: "2026-01-12T18:20:00+09:00", status: "PICKED_UP" }] });
    expect(JSON.stringify(raw)).toContain("홍길동");
    expect(normalizeTraceResponse({ isSuccess: false })).toBeNull();
  });
});
