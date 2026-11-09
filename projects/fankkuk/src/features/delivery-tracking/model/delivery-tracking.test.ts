import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DeliveryApiError, type DeliveryApi } from "@/shared/api/delivery-api/client";
import { runManualTrace } from "./manual-trace";
import { receiveDeliveryWebhook, toIngestPayload } from "./receive-webhook";
import { runSubscribeSweep } from "./subscribe-sweep";

// delivery-status INV-DS7(서명 뒤에만 저장) · INV-DS10(원본은 넘기지도 저장하지도 않는다) · INV-DS12(조용히 꺼짐·실패해도 막지 않음) · INV-DS13(넘기는 칸) · INV-DS14(수동 조회는 운영자만).

const HOOK_KEY = "whsec_unit";
const NOW_MS = Date.parse("2026-11-09T03:00:00Z");
const TS = String(Math.floor(NOW_MS / 1000));
const BODY = JSON.stringify({ event: "tracking.polled", items: [{ courierCode: "cj", trackingNumber: "123456789012", currentStatus: "IN_TRANSIT", trackingData: { receiverName: "홍길동" } }] });
const sig = (body: string, ts = TS) => `sha256=${createHmac("sha256", HOOK_KEY).update(`${ts}.${body}`).digest("hex")}`;

function webhookDeps() {
  const ingest = vi.fn(async () => ({ saved: 1, ignored: 0 }));
  return { deps: { webhookSecret: HOOK_KEY, ingest }, ingest };
}

describe("receiveDeliveryWebhook (INV-DS7)", () => {
  it("INV-DS7: 맞는 서명이면 정리한 항목을 수신 처리에 넘기고 200 — 응답에는 수만", async () => {
    const { deps, ingest } = webhookDeps();
    const reply = await receiveDeliveryWebhook(deps, { timestamp: TS, signature: sig(BODY), rawBody: BODY, nowMs: NOW_MS });
    expect(reply).toEqual({ status: 200, body: { saved: 1, ignored: 0 } });
    expect(ingest).toHaveBeenCalledTimes(1);
    const payload = toIngestPayload((ingest.mock.calls[0] as unknown as [Parameters<typeof toIngestPayload>[0]])[0]);
    expect(payload[0]).toMatchObject({ courier_code: "cj", tracking_number: "123456789012", status: "IN_TRANSIT" });
  });

  it("INV-DS10: 원본은 어디에도 넘기지 않는다 — 수신 처리가 받는 항목과 DB 로 보내는 꼴에 수령인 글자도 원본 칸도 없다", async () => {
    const { deps, ingest } = webhookDeps();
    await receiveDeliveryWebhook(deps, { timestamp: TS, signature: sig(BODY), rawBody: BODY, nowMs: NOW_MS });
    const items = (ingest.mock.calls[0] as unknown as [Parameters<typeof toIngestPayload>[0]])[0];
    const payload = toIngestPayload(items);
    expect(JSON.stringify(items)).not.toContain("홍길동");
    expect(JSON.stringify(payload)).not.toContain("홍길동");
    expect(Object.keys(payload[0]!).sort()).toEqual(["courier_code", "progresses", "status", "tracking_number"]);
    // 찾는 방법이 동작한다 — 받은 본문에는 그 글자가 있다
    expect(BODY).toContain("홍길동");
  });

  it("INV-DS7 (실패경로): 틀린 서명 · 시각 초과 · 본문 한 글자 변조 · 키 없음 → 401, 수신 처리를 부르지 않고 내용 없음", async () => {
    const cases = [
      { timestamp: TS, signature: sig(BODY).replace(/.$/, (c) => (c === "0" ? "1" : "0")), rawBody: BODY },
      { timestamp: String(Number(TS) - 301), signature: sig(BODY, String(Number(TS) - 301)), rawBody: BODY },
      { timestamp: TS, signature: sig(BODY), rawBody: BODY.replace("IN_TRANSIT", "DELIVERED") },
    ];
    for (const c of cases) {
      const { deps, ingest } = webhookDeps();
      expect(await receiveDeliveryWebhook(deps, { ...c, nowMs: NOW_MS })).toEqual({ status: 401, body: {} });
      expect(ingest).not.toHaveBeenCalled();
    }
    const { ingest } = webhookDeps();
    expect(await receiveDeliveryWebhook({ webhookSecret: null, ingest }, { timestamp: TS, signature: sig(BODY), rawBody: BODY, nowMs: NOW_MS })).toEqual({ status: 401, body: {} });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("서명은 맞는데 JSON 이 아니거나 꼴이 아니면 400, 수신 처리 없음", async () => {
    for (const body of ["not json", JSON.stringify({ nope: 1 })]) {
      const { deps, ingest } = webhookDeps();
      expect((await receiveDeliveryWebhook(deps, { timestamp: TS, signature: sig(body), rawBody: body, nowMs: NOW_MS })).status).toBe(400);
      expect(ingest).not.toHaveBeenCalled();
    }
  });
});

const fakeApi = (over: Partial<DeliveryApi> = {}): DeliveryApi => ({ subscribe: vi.fn(async () => undefined), trace: vi.fn(async () => ({})), ...over });
const PENDING = [{ id: "6f1d2c1e-0000-4000-8000-000000000001", courierCode: "cj", waybillNo: "123456789012" }];

describe("runSubscribeSweep (INV-DS12·DS13)", () => {
  it("INV-DS12 (실패경로): 키나 웹훅 주소 번호가 없으면 대기 줄을 잡지도 않는다", async () => {
    const claim = vi.fn(async () => PENDING);
    expect(await runSubscribeSweep({ api: null, endpointId: "ep", claim, result: vi.fn() })).toEqual({ kind: "skipped" });
    expect(await runSubscribeSweep({ api: fakeApi(), endpointId: null, claim, result: vi.fn() })).toEqual({ kind: "skipped" });
    expect(claim).not.toHaveBeenCalled();
  });

  it("INV-DS13: 넘기는 것은 택배사 코드·송장번호·조회 줄 ID, 성공하면 결과 null(구독됨)", async () => {
    const api = fakeApi();
    const result = vi.fn(async () => undefined);
    expect(await runSubscribeSweep({ api, endpointId: "ep_1", claim: async () => PENDING, result })).toEqual({ kind: "done", subscribed: 1, failed: 0 });
    expect(api.subscribe).toHaveBeenCalledWith([{ courierCode: "cj", trackingNumber: "123456789012", clientId: PENDING[0]!.id }], "ep_1");
    expect(result).toHaveBeenCalledWith([PENDING[0]!.id], null);
  });

  it("INV-DS12 (실패경로): 구독 요청이 실패해도 던지지 않고 오류 코드만 남긴다", async () => {
    const result = vi.fn(async () => undefined);
    const api = fakeApi({ subscribe: vi.fn(async () => Promise.reject(new DeliveryApiError("RATE_LIMITED"))) });
    expect(await runSubscribeSweep({ api, endpointId: "ep", claim: async () => PENDING, result })).toEqual({ kind: "done", subscribed: 0, failed: 1 });
    expect(result).toHaveBeenCalledWith([PENDING[0]!.id], "RATE_LIMITED");
  });
});

describe("runManualTrace (INV-DS14)", () => {
  const ID = "6f1d2c1e-0000-4000-8000-000000000001";
  it("INV-DS14 (실패경로): 운영자가 아니면 404, 조회 서비스를 부르지 않는다", async () => {
    const api = fakeApi();
    expect((await runManualTrace({ api, targets: async () => "forbidden", ingest: vi.fn() }, { ids: [ID] })).status).toBe(404);
    expect(api.trace).not.toHaveBeenCalled();
  });

  it("INV-DS14: 조회 결과를 웹훅과 같은 수신 처리로 저장하고 수만 돌려준다 — 송장번호 없음", async () => {
    const api = fakeApi({
      trace: vi.fn(async () => ({ isSuccess: true, data: { results: [{ success: true, data: { trackingNumber: "123456789012", courierCode: "cj", deliveryStatus: "DELIVERED", receiverName: "홍길동" } }] } })),
    });
    const ingest = vi.fn(async () => ({ saved: 1, ignored: 0 }));
    const reply = await runManualTrace({ api, targets: async () => [{ trackingId: ID, courierCode: "cj", waybillNo: "123456789012" }], ingest }, { ids: [ID] });
    expect(reply).toEqual({ status: 200, body: { saved: 1, ignored: 0, failed: 0 } });
    expect(JSON.stringify(reply.body)).not.toContain("123456789012");
    expect(ingest).toHaveBeenCalledTimes(1);
    // 조회 응답 원본도 저장하지 않는다 — 수신 처리에는 단계·시각만 간다(INV-DS10)
    const items = (ingest.mock.calls[0] as unknown as [Parameters<typeof toIngestPayload>[0]])[0];
    expect(JSON.stringify(items)).not.toContain("홍길동");
    expect(JSON.stringify(toIngestPayload(items))).not.toContain("홍길동");
  });

  it("몸통 꼴: ID 가 아니거나 50개를 넘으면 400 · 키가 없으면 503", async () => {
    const deps = { api: fakeApi(), targets: async () => [], ingest: vi.fn() };
    expect((await runManualTrace(deps, { ids: ["x"] })).status).toBe(400);
    expect((await runManualTrace(deps, { ids: Array.from({ length: 51 }, () => ID) })).status).toBe(400);
    expect((await runManualTrace({ ...deps, api: null }, { ids: [ID] })).status).toBe(503);
  });
});
