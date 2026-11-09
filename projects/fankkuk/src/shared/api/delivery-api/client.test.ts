import { describe, expect, it, vi } from "vitest";
import { readDeliveryApiCredentials, readDeliveryApiEndpointId, readDeliveryApiWebhookSecret } from "./config";
import { createDeliveryApi, DeliveryApiError } from "./client";

// delivery-status INV-DS12(키가 없으면 조용히 꺼짐) · INV-DS13(넘기는 것은 택배사 코드·송장번호·내부 번호뿐, 키는 머리에만).

const cred = { apiKey: "key_live_x", apiSecret: "sec_live_y" };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("배송 조회 서비스 설정 (INV-DS12)", () => {
  it("INV-DS12 (실패경로): 키·시크릿 중 하나라도 없으면 null — 던지지 않는다", () => {
    expect(readDeliveryApiCredentials({})).toBeNull();
    expect(readDeliveryApiCredentials({ DELIVERY_API_KEY: "a" })).toBeNull();
    expect(readDeliveryApiCredentials({ DELIVERY_API_KEY: " ", DELIVERY_API_SECRET: "b" })).toBeNull();
    expect(readDeliveryApiCredentials({ DELIVERY_API_KEY: "a", DELIVERY_API_SECRET: "b" })).toEqual({ apiKey: "a", apiSecret: "b" });
    expect(readDeliveryApiEndpointId({})).toBeNull();
    expect(readDeliveryApiWebhookSecret({ DELIVERY_API_WEBHOOK_SECRET: "" })).toBeNull();
  });
});

describe("createDeliveryApi (INV-DS13)", () => {
  it("INV-DS13: 구독 요청 본문은 택배사 코드·송장번호·내부 번호와 recurring·주소 번호뿐, 인증은 머리의 Bearer 키:시크릿", async () => {
    const fetchImpl = vi.fn(async () => ok({ isSuccess: true, data: { requestId: "r", itemCount: 1 } }));
    await createDeliveryApi(cred, fetchImpl).subscribe(
      [{ courierCode: "cj", trackingNumber: "123456789012", clientId: "6f1d2c1e-0000-4000-8000-000000000001", ...({ address: "서울", name: "홍길동" } as object) }],
      "ep_1",
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.deliveryapi.co.kr/v1/webhooks/register");
    expect(init.headers.Authorization).toBe("Bearer key_live_x:sec_live_y");
    expect(JSON.parse(init.body)).toEqual({
      items: [{ courierCode: "cj", trackingNumber: "123456789012", clientId: "6f1d2c1e-0000-4000-8000-000000000001" }],
      recurring: true,
      endpointId: "ep_1",
    });
    expect(init.body).not.toContain("key_live_x");
  });

  it("INV-DS13 (실패경로): 실패는 정해진 코드로만 — 응답의 오류 문장·키가 예외 메시지에 없다", async () => {
    const api = createDeliveryApi(cred, async () => ({ ok: false, status: 429, json: async () => ({ isSuccess: false, errorCode: "RATE_LIMITED", error: "key_live_x 한도 초과" }) }));
    const e = await api.trace([{ courierCode: "cj", trackingNumber: "123456789012", clientId: "a" }]).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DeliveryApiError);
    expect((e as DeliveryApiError).code).toBe("RATE_LIMITED");
    expect((e as Error).message).not.toContain("key_live_x");
    const net = await createDeliveryApi(cred, async () => {
      throw new Error("ECONNRESET key_live_x");
    })
      .subscribe([{ courierCode: "cj", trackingNumber: "123456789012", clientId: "a" }], "ep")
      .catch((x: unknown) => x);
    expect((net as DeliveryApiError).code).toBe("network");
  });

  it("한 번에 보낼 수 있는 수를 넘기면 부르지 않는다(구독 100 · 조회 50)", async () => {
    const fetchImpl = vi.fn(async () => ok({ isSuccess: true, data: {} }));
    const api = createDeliveryApi(cred, fetchImpl);
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ courierCode: "cj", trackingNumber: String(100000000000 + i), clientId: String(i) }));
    await expect(api.trace(many(51))).rejects.toMatchObject({ code: "too_many_items" });
    await expect(api.subscribe(many(101), "ep")).rejects.toMatchObject({ code: "too_many_items" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
