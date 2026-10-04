import { describe, expect, it } from "vitest";
import { createTossPaymentsClient, readTossSecretKey } from "./client";

// 토스페이먼츠 API 는 외부다 — 여기서는 우리가 보내는 요청과 운영 차단을 본다.
type Call = { url: string; init: RequestInit };
function recordingFetch(response: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("토스페이먼츠 클라이언트", () => {
  it("INV-M10 (S10, 실패경로): 운영 환경에서 test_ 키면 만드는 순간 실패한다", () => {
    expect(() =>
      createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "production" }, fetchImpl: fetch }),
    ).toThrow(/테스트 키/);
    expect(() =>
      createTossPaymentsClient({
        secretKey: "test_gsk_x",
        env: { NODE_ENV: "development", VERCEL_ENV: "production" },
        fetchImpl: fetch,
      }),
    ).toThrow(/테스트 키/);
  });

  it("INV-M10: 개발 환경의 test_ 키, 운영 환경의 live_ 키는 만들어진다", () => {
    expect(() =>
      createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl: fetch }),
    ).not.toThrow();
    expect(() =>
      createTossPaymentsClient({ secretKey: "live_gsk_x", env: { NODE_ENV: "production" }, fetchImpl: fetch }),
    ).not.toThrow();
  });

  it("INV-M4 (S4): 비밀 키는 공개 접두어 없는 이름에서만 읽는다", () => {
    expect(readTossSecretKey({ TOSS_SECRET_KEY: "test_gsk_x" })).toBe("test_gsk_x");
  });

  it("INV-M4 (S4, 실패경로): 공개 접두어로 비밀 키가 설정돼 있으면 시작하지 않는다", () => {
    expect(() =>
      readTossSecretKey({ TOSS_SECRET_KEY: "test_gsk_x", NEXT_PUBLIC_TOSS_SECRET_KEY: "test_gsk_x" }),
    ).toThrow(/공개/);
    expect(() => readTossSecretKey({})).toThrow();
  });

  it("INV-M5: 승인 호출은 비밀 키 Basic 인증과 멱등 키를 붙여 confirm 으로 보낸다", async () => {
    const { calls, fetchImpl } = recordingFetch({ status: "DONE", orderId: "FC-7K3M9-p1", totalAmount: 9000 });
    const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });

    await client.confirm({ paymentKey: "tgen_abc", orderId: "FC-7K3M9-p1", amount: 9000, idempotencyKey: "confirm-FC-7K3M9-p1" });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe("https://api.tosspayments.com/v1/payments/confirm");
    const headers = new Headers(call!.init.headers);
    expect(headers.get("authorization")).toBe(`Basic ${btoa("test_gsk_x:")}`);
    expect(headers.get("idempotency-key")).toBe("confirm-FC-7K3M9-p1");
    expect(JSON.parse(String(call!.init.body))).toEqual({ paymentKey: "tgen_abc", orderId: "FC-7K3M9-p1", amount: 9000 });
  });

  it("INV-M9: 환불 호출은 금액과 환불별 멱등 키를 붙여 cancel 로 보낸다", async () => {
    const { calls, fetchImpl } = recordingFetch({ status: "PARTIAL_CANCELED" });
    const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });

    await client.cancel({ paymentKey: "tgen_abc", cancelAmount: 4000, cancelReason: "검수 불합격 반송", idempotencyKey: "refund-r1" });

    expect(calls[0]!.url).toBe("https://api.tosspayments.com/v1/payments/tgen_abc/cancel");
    expect(new Headers(calls[0]!.init.headers).get("idempotency-key")).toBe("refund-r1");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ cancelAmount: 4000, cancelReason: "검수 불합격 반송" });
  });

  it("INV-K7: 환불 호출은 60초 안에 끝나지 않으면 끊는다 — 같은 기록을 다시 잡을 수 있게 되는 2분보다 짧게", async () => {
    const { calls, fetchImpl } = recordingFetch({ status: "CANCELED" });
    const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });
    const seen: number[] = [];
    const original = AbortSignal.timeout;
    AbortSignal.timeout = (ms: number) => {
      seen.push(ms);
      return original.call(AbortSignal, ms);
    };
    try {
      await client.cancel({ paymentKey: "tgen_abc", cancelAmount: 4000, cancelReason: "r", idempotencyKey: "refund-r1" });
    } finally {
      AbortSignal.timeout = original;
    }
    expect(seen).toEqual([60_000]);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});
