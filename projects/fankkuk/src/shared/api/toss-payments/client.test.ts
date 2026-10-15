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

  it("INV-M20: 취소 금액을 비우면 본문에 금액 칸이 없다 — 결제사가 남은 금액 전부를 취소한다", async () => {
    const { calls, fetchImpl } = recordingFetch({ paymentKey: "tgen_abc", status: "CANCELED", cancels: [] });
    const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });
    await client.cancel({ paymentKey: "tgen_abc", cancelReason: "전액 취소", idempotencyKey: "rc-1" });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ cancelReason: "전액 취소" });
    expect(new Headers(calls[0]!.init.headers).get("idempotency-key")).toBe("rc-1");
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

describe("결제 조회 (payment INV-M19)", () => {
  const PAYMENT = { status: "DONE", orderId: "pay_x1", totalAmount: 6900, paymentKey: "pk_toss", method: "카드" };

  it("INV-M19: 주문번호로 GET 조회 — Basic 인증, 본문 없음, 시간 제한", async () => {
    const { calls, fetchImpl } = recordingFetch(PAYMENT);
    const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });
    const r = await client.getByOrderId("pay_x1");
    expect(r).toEqual({ kind: "found", payment: { status: "DONE", orderId: "pay_x1", totalAmount: 6900, balanceAmount: null, paymentKey: "pk_toss", secret: null, virtualAccount: null } });
    expect(calls[0]!.url).toBe("https://api.tosspayments.com/v1/payments/orders/pay_x1");
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.init.body).toBeUndefined();
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe(`Basic ${btoa("test_gsk_x:")}`);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("INV-M20 ①: 조회 응답의 남은 금액(balanceAmount)을 읽는다 — 정수가 아니면 꼴이 다른 응답(조회 오류)", async () => {
    const ok = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl: recordingFetch({ ...PAYMENT, status: "PARTIAL_CANCELED", balanceAmount: 4000 }).fetchImpl });
    expect(await ok.getByOrderId("pay_x1")).toEqual({
      kind: "found",
      payment: { status: "PARTIAL_CANCELED", orderId: "pay_x1", totalAmount: 6900, balanceAmount: 4000, paymentKey: "pk_toss", secret: null, virtualAccount: null },
    });
    const bad = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl: recordingFetch({ ...PAYMENT, balanceAmount: "4000" }).fetchImpl });
    expect(await bad.getByOrderId("pay_x1")).toEqual({ kind: "error" });
  });

  it("INV-M19: 주문번호는 주소에 그대로 끼우지 않고 인코딩한다", async () => {
    const { calls, fetchImpl } = recordingFetch(PAYMENT);
    const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });
    await client.getByOrderId("a/b?c");
    expect(calls[0]!.url).toBe("https://api.tosspayments.com/v1/payments/orders/a%2Fb%3Fc");
  });

  it("INV-M19 (S19c): 404 NOT_FOUND_PAYMENT·NOT_FOUND 는 「없음」", async () => {
    for (const code of ["NOT_FOUND_PAYMENT", "NOT_FOUND"]) {
      const { fetchImpl } = recordingFetch({ code, message: "존재하지 않는 결제 정보 입니다." }, 404);
      const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });
      expect(await client.getByOrderId("pay_x1")).toEqual({ kind: "not_found" });
    }
  });

  it("INV-M19 (S19b, 실패경로): 다른 오류 응답·꼴이 다른 응답·모르는 상태·연결 끊김은 「조회 오류」", async () => {
    const cases: [unknown, number][] = [
      [{ code: "UNAUTHORIZED_KEY" }, 401],
      [{ code: "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING" }, 500],
      [{ code: "SOMETHING_ELSE" }, 404],
      [{ status: "DONE", orderId: "pay_x1" }, 200],
      [{ ...PAYMENT, status: "WHATEVER" }, 200],
      [{ ...PAYMENT, totalAmount: "6900" }, 200],
      [{ ...PAYMENT, paymentKey: "" }, 200],
    ];
    for (const [body, status] of cases) {
      const { fetchImpl } = recordingFetch(body, status);
      const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });
      expect(await client.getByOrderId("pay_x1")).toEqual({ kind: "error" });
    }
    const broken = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl: broken });
    expect(await client.getByOrderId("pay_x1")).toEqual({ kind: "error" });
  });

  it("INV-M19: 조회 상태 여덟 가지를 그대로 받는다", async () => {
    for (const status of ["DONE", "ABORTED", "EXPIRED", "CANCELED", "PARTIAL_CANCELED", "READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT"]) {
      const { fetchImpl } = recordingFetch({ ...PAYMENT, status });
      const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "development" }, fetchImpl });
      expect(await client.getByOrderId("pay_x1")).toMatchObject({ kind: "found", payment: { status } });
    }
  });
});
