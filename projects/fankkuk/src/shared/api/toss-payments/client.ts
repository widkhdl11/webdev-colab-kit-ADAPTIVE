// 토스페이먼츠 결제 API 클라이언트 (서버 전용).
// API 사실 출처: docs.tosspayments.com — 결제 승인 POST /v1/payments/confirm,
// 결제 취소 POST /v1/payments/{paymentKey}/cancel, 주문번호로 결제 조회 GET /v1/payments/orders/{orderId}
// (없으면 404 NOT_FOUND_PAYMENT · NOT_FOUND), 비밀 키 Basic 인증, Idempotency-Key 헤더, 테스트 키는 test_ 접두어.
// 가상계좌(2026-10-15 공식 문서 docs.tosspayments.com/reference): 결제 객체의 secret(최대 50자, 입금 웹훅 본문의 secret 과 같으면 정상 웹훅),
// virtualAccount.accountNumber(최대 20자)·bankCode(두 자리)·dueDate, 취소 요청의 refundReceiveAccount{bank, accountNumber(숫자만, 최대 20자), holderName(최대 60자)}
// — 가상계좌 결제를 입금 뒤에 취소할 때만 필수, 입금 전에는 전액 취소만 되고 필요 없다.

import { z } from "zod";

const API_BASE = "https://api.tosspayments.com/v1/payments";
const CANCEL_TIMEOUT_MS = 60_000;
const LOOKUP_TIMEOUT_MS = 10_000;

export const TOSS_PAYMENT_STATUSES = [
  "READY",
  "IN_PROGRESS",
  "WAITING_FOR_DEPOSIT",
  "DONE",
  "CANCELED",
  "PARTIAL_CANCELED",
  "ABORTED",
  "EXPIRED",
] as const;
export type TossPaymentStatus = (typeof TOSS_PAYMENT_STATUSES)[number];

/**
 * 결제 조회 응답에서 쓰는 칸만. 나머지 칸은 버린다.
 * balanceAmount = 취소·부분 취소 뒤 남은 취소 가능 금액(2026-10-10 공식 문서). 응답에 없으면 null — 모르는 값으로 취소하지 않는다(payment INV-M20 ①).
 */
export type TossPaymentView = {
  status: TossPaymentStatus;
  orderId: string;
  totalAmount: number;
  balanceAmount: number | null;
  paymentKey: string;
  /** 웹훅 검증 값. 가상계좌가 아니면 없을 수 있다 — 없으면 null */
  secret?: string | null;
  /** 가상계좌 결제에만 — 발급된 계좌. 없으면 null */
  virtualAccount?: TossVirtualAccount | null;
};

export type TossVirtualAccount = { accountNumber: string; bankCode: string };

/** 가상계좌 결제를 입금 뒤 취소할 때 돌려받을 계좌(결제사 취소 요청의 refundReceiveAccount). */
export type TossRefundReceiveAccount = { bank: string; accountNumber: string; holderName: string };

/** 결제 조회 결과. not_found 는 결제사가 「그런 결제 없음」이라고 답한 것뿐 — 그 밖의 오류·시간 초과·꼴이 다른 응답은 error. */
export type TossLookup = { kind: "found"; payment: TossPaymentView } | { kind: "not_found" } | { kind: "error" };

const paymentShape = z.object({
  status: z.enum(TOSS_PAYMENT_STATUSES),
  orderId: z.string(),
  totalAmount: z.number().int(),
  balanceAmount: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? null),
  paymentKey: z.string().min(1),
  secret: z
    .string()
    .min(1)
    .max(100)
    .nullish()
    .transform((v) => v ?? null),
  virtualAccount: z
    .object({ accountNumber: z.string().min(1).max(30), bankCode: z.string().min(1).max(3) })
    .nullish()
    .transform((v) => (v ? { accountNumber: v.accountNumber, bankCode: v.bankCode } : null)),
});

/** 승인·조회 응답을 결제 꼴로 읽는다. 꼴이 다르면 null. */
export function parseTossPayment(body: unknown): TossPaymentView | null {
  const p = paymentShape.safeParse(body);
  return p.success ? p.data : null;
}
const errorShape = z.object({ code: z.string() });
const NOT_FOUND_CODES = new Set(["NOT_FOUND_PAYMENT", "NOT_FOUND"]);

type EnvLike = { NODE_ENV?: string; VERCEL_ENV?: string };

export type TossPaymentsClient = {
  confirm(req: { paymentKey: string; orderId: string; amount: number; idempotencyKey: string }): Promise<unknown>;
  /** cancelAmount 를 비우면 남은 금액 전부를 취소한다(결제사 문서 「값이 없으면 전액 취소」). */
  cancel(req: {
    paymentKey: string;
    cancelAmount?: number;
    cancelReason: string;
    idempotencyKey: string;
    /** 가상계좌 결제를 입금 뒤 취소할 때만 */
    refundReceiveAccount?: TossRefundReceiveAccount;
  }): Promise<unknown>;
  /** 주문번호로 결제 하나를 조회한다. 돈을 움직이지 않아 몇 번 불러도 같다. 던지지 않는다. */
  getByOrderId(orderId: string): Promise<TossLookup>;
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

  // 조회는 10초 안에 끝나지 않으면 끊고 「조회 오류」로 돌려준다 — 부르는 쪽은 그 결제를 그대로 두고 다음 회차에 다시 본다.
  async function getByOrderId(orderId: string): Promise<TossLookup> {
    try {
      const res = await opts.fetchImpl(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
        method: "GET",
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      const body: unknown = await res.json();
      if (res.status === 404) {
        const e = errorShape.safeParse(body);
        return e.success && NOT_FOUND_CODES.has(e.data.code) ? { kind: "not_found" } : { kind: "error" };
      }
      if (!res.ok) return { kind: "error" };
      const p = parseTossPayment(body);
      return p ? { kind: "found", payment: p } : { kind: "error" };
    } catch {
      return { kind: "error" };
    }
  }

  return {
    confirm: ({ paymentKey, orderId, amount, idempotencyKey }) =>
      post(`${API_BASE}/confirm`, { paymentKey, orderId, amount }, idempotencyKey),
    // 취소는 60초 안에 끝나지 않으면 끊는다. 부르는 쪽이 같은 요청을 2분 뒤에야 다시 보낼 수 있게 막아 두므로
    // 첫 요청이 그보다 오래 살아 있으면 두 요청의 결과가 섞인다. 끊긴 요청은 같은 멱등 키로 다시 보내면 된다.
    cancel: ({ paymentKey, cancelAmount, cancelReason, idempotencyKey, refundReceiveAccount }) =>
      post(
        `${API_BASE}/${encodeURIComponent(paymentKey)}/cancel`,
        { cancelAmount, cancelReason, ...(refundReceiveAccount ? { refundReceiveAccount } : {}) },
        idempotencyKey,
        AbortSignal.timeout(CANCEL_TIMEOUT_MS),
      ),
    getByOrderId,
  };
}
