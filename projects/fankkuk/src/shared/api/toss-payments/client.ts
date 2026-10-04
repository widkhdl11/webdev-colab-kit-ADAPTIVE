// 토스페이먼츠 결제 API 클라이언트 (서버 전용).
// API 사실 출처: docs.tosspayments.com — 결제 승인 POST /v1/payments/confirm,
// 결제 취소 POST /v1/payments/{paymentKey}/cancel, 비밀 키 Basic 인증, Idempotency-Key 헤더, 테스트 키는 test_ 접두어.

const API_BASE = "https://api.tosspayments.com/v1/payments";
const CANCEL_TIMEOUT_MS = 60_000;

type EnvLike = { NODE_ENV?: string; VERCEL_ENV?: string };

export type TossPaymentsClient = {
  confirm(req: { paymentKey: string; orderId: string; amount: number; idempotencyKey: string }): Promise<unknown>;
  cancel(req: { paymentKey: string; cancelAmount: number; cancelReason: string; idempotencyKey: string }): Promise<unknown>;
};

/** INV-M4: 비밀 키는 공개 접두어가 없는 이름에서만 읽는다. 공개 이름으로도 설정돼 있으면 시작하지 않는다. */
export function readTossSecretKey(env: Record<string, string | undefined>): string {
  if (env.NEXT_PUBLIC_TOSS_SECRET_KEY !== undefined) {
    throw new Error("결제 비밀 키가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다");
  }
  const key = env.TOSS_SECRET_KEY;
  if (!key) throw new Error("TOSS_SECRET_KEY 가 없다");
  return key;
}

export function createTossPaymentsClient(opts: {
  secretKey: string;
  env: EnvLike;
  fetchImpl: typeof fetch;
}): TossPaymentsClient {
  // INV-M10: 운영에서 테스트 키를 쓰면 가상 승인이 일어난다 — 만드는 순간 실패한다.
  const production = opts.env.NODE_ENV === "production" || opts.env.VERCEL_ENV === "production";
  if (production && opts.secretKey.startsWith("test_")) {
    throw new Error("운영 환경에서 결제 테스트 키를 쓸 수 없다");
  }
  const authorization = `Basic ${btoa(`${opts.secretKey}:`)}`;

  async function post(url: string, body: unknown, idempotencyKey: string, signal?: AbortSignal): Promise<unknown> {
    const res = await opts.fetchImpl(url, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
      signal,
    });
    return res.json();
  }

  return {
    confirm: ({ paymentKey, orderId, amount, idempotencyKey }) =>
      post(`${API_BASE}/confirm`, { paymentKey, orderId, amount }, idempotencyKey),
    // 취소는 60초 안에 끝나지 않으면 끊는다. 부르는 쪽이 같은 요청을 2분 뒤에야 다시 보낼 수 있게 막아 두므로
    // 첫 요청이 그보다 오래 살아 있으면 두 요청의 결과가 섞인다. 끊긴 요청은 같은 멱등 키로 다시 보내면 된다.
    cancel: ({ paymentKey, cancelAmount, cancelReason, idempotencyKey }) =>
      post(`${API_BASE}/${encodeURIComponent(paymentKey)}/cancel`, { cancelAmount, cancelReason }, idempotencyKey, AbortSignal.timeout(CANCEL_TIMEOUT_MS)),
  };
}
