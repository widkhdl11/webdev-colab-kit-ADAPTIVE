import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, deleteTestOrders, holdRowLock, psql, registerTestOrder, SEED, signedInClient } from "./helpers";

// 무통장 입금(토스 가상계좌) — payment INV-M21~M25.
// 실제 로컬 DB 에 붙는다. 바꾸는 것은 관리자 키 클라이언트를 만드는 자리(로컬 DB 의 앱 서버 키)와 결제사 API 뿐이다 —
// 전역 fetch 에서 토스 주소만 가로채 시험이 정한 응답을 돌려주고, 나머지(Supabase)는 그대로 보낸다.
// 「(manual/0019 뒤)」 시험은 개인정보 구역 파일 supabase/manual/0019_refund_account.sql 을 사람이 적용한 뒤에만 통과한다.

vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => adminClient() }));

const { confirmPayment } = await import("@/features/checkout/model/checkout");
const { createSupabasePaymentStore } = await import("@/entities/payment/api/supabase-payment-store");
const { createTossPaymentsClient } = await import("@/shared/api/toss-payments/client");
const { POST: depositCallback } = await import("@/app/api/checkout/deposit-callback/route");
const { runServerReconcile } = await import("@/app/api/cron/payments/reconciler");
const { runRefund } = await import("@/features/admin-refund/model/run-refund");
const { refundDepositDeps } = await import("@/app/api/admin/refunds/deposit-deps");

const realFetch = globalThis.fetch;
type TossReply = { status: number; body: unknown };
/** 결제 조회(주문번호) 응답 — 없으면 500 */
const lookups = new Map<string, TossReply>();
/** 결제 취소(결제 키) 응답 — 없으면 500 */
const cancels = new Map<string, TossReply>();
const lookupCalls: string[] = [];
const cancelCalls: { paymentKey: string; body: Record<string, unknown> }[] = [];

const REFUND_KEY = Buffer.alloc(32, 7).toString("base64");

beforeAll(() => {
  deleteTestOrders();
  process.env.TOSS_SECRET_KEY = "test_gsk_deposit";
  process.env.REFUND_ACCOUNT_KEY = REFUND_KEY;
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.tosspayments.com/")) return realFetch(input, init);
    const lookup = /\/v1\/payments\/orders\/([^/?]+)$/.exec(url);
    const cancel = /\/v1\/payments\/([^/?]+)\/cancel$/.exec(url);
    let reply: TossReply = { status: 500, body: { code: "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING", message: "x" } };
    if (lookup) {
      const id = decodeURIComponent(lookup[1]!);
      lookupCalls.push(id);
      reply = lookups.get(id) ?? reply;
    } else if (cancel) {
      const key = decodeURIComponent(cancel[1]!);
      cancelCalls.push({ paymentKey: key, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      reply = cancels.get(key) ?? reply;
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch);
});
afterEach(() => {
  lookups.clear();
  cancels.clear();
  lookupCalls.length = 0;
  cancelCalls.length = 0;
});
afterAll(() => {
  vi.unstubAllGlobals();
  deleteTestOrders();
});

// ── 준비 ──────────────────────────────────

type Waiting = { orderId: string; orderNo: string; tossOrderId: string; secret: string; paymentKey: string };

function vaPayment(tossOrderId: string, amount: number, status: string, secret: string, paymentKey = `pk_va_${tossOrderId}`) {
  return {
    status,
    orderId: tossOrderId,
    totalAmount: amount,
    balanceAmount: amount,
    paymentKey,
    method: "가상계좌",
    secret,
    virtualAccount: { accountType: "일반", accountNumber: "X6516490000001", bankCode: "20", customerName: "별빛", dueDate: "2026-10-16T12:00:00", expired: false },
  };
}

/** 결제 승인 응답이 「입금 기다리는 중」인 가짜 토스 — 승인 API 는 이 클라이언트로만 부른다. */
function confirmToss(reply: (body: { orderId: string; amount: number; paymentKey: string }) => unknown) {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { orderId: string; amount: number; paymentKey: string };
    return new Response(JSON.stringify(reply(body)), { status: 200 });
  }) as unknown as typeof fetch;
  return createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "test" }, fetchImpl });
}

/** 등록 → 성공 주소 승인 → 토스가 계좌를 발급(입금 대기). 소형 1 = 6,900원. */
async function waitingOrder(): Promise<Waiting> {
  const o = await registerTestOrder(1);
  const secret = `ps_${crypto.randomUUID().replaceAll("-", "")}`;
  const paymentKey = `pk_va_${o.tossOrderId}`;
  const store = createSupabasePaymentStore(adminClient());
  const toss = confirmToss((b) => vaPayment(b.orderId, b.amount, "WAITING_FOR_DEPOSIT", secret, b.paymentKey));
  const out = await confirmPayment({ store, toss }, SEED.fanId, { orderId: o.tossOrderId, amount: "6900", paymentKey });
  expect(out).toMatchObject({ ok: true, awaitingDeposit: true });
  return { ...o, secret, paymentKey };
}

function state(tossOrderId: string): string {
  return psql(
    `select p.status || '|' || o.status || '|' || (select count(*) from public.approval_requests q where q.order_id = o.id)
       || '|' || (select count(*) from public.inbound_codes c join public.boxes b on b.id = c.box_id where b.order_id = o.id)
     from public.payments p join public.orders o on o.id = p.order_id where p.toss_order_id = '${tossOrderId}'`,
  );
}

function callback(body: unknown): Promise<Response> {
  const req = new NextRequest("http://localhost/api/checkout/deposit-callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return depositCallback(req);
}

const depositBody = (w: Waiting, status = "DONE", secret = w.secret) => ({
  createdAt: "2026-10-15T12:00:00.000000",
  secret,
  status,
  transactionKey: `tx_${w.tossOrderId}`,
  orderId: w.tossOrderId,
});

function backdateDue(tossOrderId: string, minutes: number): void {
  psql(`update public.payments set deposit_due_at = now() - interval '${minutes} minutes' where toss_order_id = '${tossOrderId}'`);
}

function outboxCount(orderId: string, kind: string): string {
  return psql(`select count(distinct account_id) from public.notification_outbox where order_id = '${orderId}' and kind = '${kind}'`);
}

// ── INV-M21 ──────────────────────────────────

describe("INV-M21: 입금 대기 주문은 결제가 끝난 주문이 아니다", () => {
  it("INV-M21: 승인 응답이 「입금 기다리는 중」이면 입금 대기 — 승인 요청·받는 주소 6자리·승인 요청 알림이 없고 기한은 발급 뒤 24시간", async () => {
    const w = await waitingOrder();
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
    expect(outboxCount(w.orderId, "approval_request")).toBe("0");
    expect(
      psql(`select deposit_due_at between now() + interval '23 hours 58 minutes' and now() + interval '24 hours' from public.payments where toss_order_id = '${w.tossOrderId}'`),
    ).toBe("t");
    // 비밀 값은 원문이 아니라 해시로만 남는다
    expect(psql(`select encode(deposit_secret_hash, 'hex') from public.payments where toss_order_id = '${w.tossOrderId}'`)).toBe(
      createHash("sha256").update(w.secret, "utf8").digest("hex"),
    );
    // 같은 성공 주소를 새로고침해도 승인 API 를 다시 부르지 않고 입금 대기를 돌려준다(INV-M5)
    const store = createSupabasePaymentStore(adminClient());
    let called = 0;
    const toss = confirmToss((b) => {
      called += 1;
      return vaPayment(b.orderId, b.amount, "DONE", w.secret);
    });
    expect(await confirmPayment({ store, toss }, SEED.fanId, { orderId: w.tossOrderId, amount: "6900", paymentKey: w.paymentKey })).toMatchObject({
      ok: true,
      awaitingDeposit: true,
    });
    expect(called).toBe(0);
  });

  it("INV-M21 (실패경로): 「입금 기다리는 중」이라도 발급 금액이 서버 금액과 다르면 입금 대기가 아니라 실패", async () => {
    const o = await registerTestOrder(1);
    const store = createSupabasePaymentStore(adminClient());
    const toss = confirmToss((b) => vaPayment(b.orderId, 100, "WAITING_FOR_DEPOSIT", "ps_secret_mismatch"));
    const out = await confirmPayment({ store, toss }, SEED.fanId, { orderId: o.tossOrderId, amount: "6900", paymentKey: "pk_x" });
    expect(out).toMatchObject({ ok: false });
    expect(state(o.tossOrderId)).toBe("failed|pending_payment|0|0");
  });

  it("INV-M21: 입금 계좌는 그 주문의 팬만 읽는다 — 남의 팬은 0줄, 비밀 값 해시는 로그인 키로 읽히지 않는다", async () => {
    const w = await waitingOrder();
    const mine = await (await signedInClient("byeolbit_fan")).rpc("my_deposit_account", { p_order_no: w.orderNo });
    expect(mine.error).toBeNull();
    expect(mine.data).toEqual([
      expect.objectContaining({ bank_code: "20", account_no: "X6516490000001", amount_krw: 6900 }),
    ]);
    const other = await (await signedInClient("daltokki_fan")).rpc("my_deposit_account", { p_order_no: w.orderNo });
    expect(other.data ?? []).toEqual([]);
    const direct = await (await signedInClient("byeolbit_fan")).from("payments").select("deposit_secret_hash").eq("toss_order_id", w.tossOrderId);
    expect(direct.data ?? []).toEqual([]);
  });

  it("INV-M21: 입금 대기 주문은 24시간이 지나도 사진 정리 대상이 아니고 이번 달 보낸 수에 센다", async () => {
    const w = await waitingOrder();
    psql(`update public.orders set created_at = now() - interval '25 hours' where id = '${w.orderId}'`);
    expect(psql(`select public.gift_photo_order_dead('${w.orderId}')`)).toBe("f");
    psql(`update public.orders set created_at = now() where id = '${w.orderId}'`);
    const before = Number(psql(`select public.receiving_counted_orders('${SEED.fanId}', '${SEED.haruCreatorId}')`));
    psql(`update public.payments set status = 'failed', payment_key = null where toss_order_id = '${w.tossOrderId}'`);
    expect(Number(psql(`select public.receiving_counted_orders('${SEED.fanId}', '${SEED.haruCreatorId}')`))).toBe(before - 1);
  });
});

// ── INV-M22 ──────────────────────────────────

describe("INV-M22: 입금 알림은 「다시 조회하라」는 신호", () => {
  it("INV-M22 (실패경로): 알림의 비밀 값이 저장한 값과 다르면 조회도 하지 않고 거부, 주문은 그대로", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret) });
    const res = await callback(depositBody(w, "DONE", "ps_forged"));
    expect(res.status).not.toBe(200);
    expect(lookupCalls).toEqual([]);
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
  });

  it("INV-M22 (실패경로): 본문 status 가 DONE 이어도 조회가 「입금 기다리는 중」이면 바꾸지 않는다", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "WAITING_FOR_DEPOSIT", w.secret) });
    const res = await callback(depositBody(w, "DONE"));
    expect(res.status).toBe(200);
    expect(lookupCalls).toEqual([w.tossOrderId]);
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
  });

  it("INV-M22: 본문 status 가 무엇이든 조회가 완료·금액 일치면 결제 완료 — 승인 요청 1개, 6자리 발급, 결제 키는 조회 응답의 값", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret, "pk_from_lookup") });
    const res = await callback(depositBody(w, "WAITING_FOR_DEPOSIT"));
    expect(res.status).toBe(200);
    expect(state(w.tossOrderId)).toBe("done|registered|1|1");
    expect(psql(`select payment_key from public.payments where toss_order_id = '${w.tossOrderId}'`)).toBe("pk_from_lookup");
  });

  it("INV-M22 (실패경로): 조회가 완료여도 금액이 다르면 완료가 아니다(확인 필요)", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 100, "DONE", w.secret) });
    expect((await callback(depositBody(w))).status).toBe(200);
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
    expect(psql(`select review_at is not null from public.payments where toss_order_id = '${w.tossOrderId}'`)).toBe("t");
  });

  it("INV-M22: 같은 알림 두 번 + 상태 변경 알림(두 종류) — 주문은 한 번만 바뀐다", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret, "pk_first") });
    expect((await callback(depositBody(w))).status).toBe(200);
    const settledAt = psql(`select settled_at from public.payments where toss_order_id = '${w.tossOrderId}'`);
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret, "pk_second") });
    expect((await callback(depositBody(w))).status).toBe(200);
    // 상태 변경 웹훅(PAYMENT_STATUS_CHANGED)은 꼴이 다르다 — 비밀 값이 없으면 받지 않는다
    expect((await callback({ eventType: "PAYMENT_STATUS_CHANGED", createdAt: "x", data: { orderId: w.tossOrderId, status: "DONE" } })).status).not.toBe(200);
    expect(state(w.tossOrderId)).toBe("done|registered|1|1");
    expect(psql(`select payment_key || '|' || settled_at from public.payments where toss_order_id = '${w.tossOrderId}'`)).toBe(`pk_first|${settledAt}`);
    expect(outboxCount(w.orderId, "approval_request")).toBe("1");
    // DB 도 한 번만 — 완료된 줄에 완료 반영을 다시 불러도 바뀌지 않는다
    const again = await adminClient().rpc("settle_payment", {
      p_toss_order_id: w.tossOrderId, p_status: "done", p_payment_key: "pk_again", p_request_id: null, p_payload: null, p_requested_at: new Date().toISOString(),
    });
    expect(again.data).toBe(false);
  });

  it("INV-M22 (동시): 알림 두 개가 동시에 와도 승인 요청 1개", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret) });
    const lock = await holdRowLock(`select 1 from public.payments where toss_order_id = '${w.tossOrderId}' for update`, 2);
    const [a, b] = await Promise.all([callback(depositBody(w)), callback(depositBody(w))]);
    await lock.released;
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(state(w.tossOrderId)).toBe("done|registered|1|1");
  });

  it("INV-M22 (실패경로): 조회가 실패하면 200 이 아니다(토스가 다시 보낸다), 주문은 그대로", async () => {
    const w = await waitingOrder();
    const res = await callback(depositBody(w));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
  });

  it("INV-M22 (실패경로): 반영(DB)이 실패하면 200 이 아니다", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret) });
    psql("revoke execute on function public.settle_payment(text, public.payment_status, text, text, text, timestamptz) from service_role");
    try {
      const res = await callback(depositBody(w));
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      psql("grant execute on function public.settle_payment(text, public.payment_status, text, text, text, timestamptz) to service_role");
    }
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
  });

  it("INV-M22: 놓친 알림은 예약 작업의 조회가 메운다", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret) });
    const r = await runServerReconcile(w.orderNo);
    expect(r.ok).toBe(true);
    expect(state(w.tossOrderId)).toBe("done|registered|1|1");
  });

  it("INV-M22 (INV-M19 와 같이): 승인 호출이 끊겨 「승인 중」에 남았는데 조회가 「입금 기다리는 중」이면 입금 대기로 정리한다", async () => {
    const o = await registerTestOrder(1);
    expect((await adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId })).data).toBe(true);
    psql(`update public.payments set confirming_at = now() - interval '11 minutes' where toss_order_id = '${o.tossOrderId}'`);
    lookups.set(o.tossOrderId, { status: 200, body: vaPayment(o.tossOrderId, 6900, "WAITING_FOR_DEPOSIT", "ps_after_timeout") });
    await runServerReconcile(o.orderNo);
    expect(state(o.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
    expect(psql(`select encode(deposit_secret_hash, 'hex') from public.payments where toss_order_id = '${o.tossOrderId}'`)).toBe(
      createHash("sha256").update("ps_after_timeout", "utf8").digest("hex"),
    );
  });
});

// ── INV-M23 ──────────────────────────────────

describe("INV-M23: 입금 기한 24시간", () => {
  it("INV-M23: 기한이 지나고 조회가 「입금 기다리는 중」이면 결제사에서 취소한 뒤 결제 실패로 닫고(주문은 결제 전으로 끝남), 팬에게 알림 한 번", async () => {
    const w = await waitingOrder();
    backdateDue(w.tossOrderId, 1);
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "WAITING_FOR_DEPOSIT", w.secret) });
    cancels.set(w.paymentKey, {
      status: 200,
      body: { paymentKey: w.paymentKey, status: "CANCELED", cancels: [{ cancelAmount: 6900, cancelStatus: "DONE", canceledAt: "2026-10-16T12:00:00+09:00" }] },
    });
    const r = await runServerReconcile(w.orderNo);
    expect(r.ok).toBe(true);
    expect(cancelCalls).toHaveLength(1);
    expect(cancelCalls[0]!.body).not.toHaveProperty("cancelAmount");
    expect(state(w.tossOrderId)).toBe("failed|pending_payment|0|0");
    expect(outboxCount(w.orderId, "deposit_expired")).toBe("1");
    await runServerReconcile(w.orderNo);
    expect(outboxCount(w.orderId, "deposit_expired")).toBe("1");
  });

  it("INV-M23 (실패경로): 기한이 지났어도 조회가 완료면 취소하지 않고 결제 완료", async () => {
    const w = await waitingOrder();
    backdateDue(w.tossOrderId, 1);
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret) });
    await runServerReconcile(w.orderNo);
    expect(cancelCalls).toEqual([]);
    expect(state(w.tossOrderId)).toBe("done|registered|1|1");
  });

  it("INV-M23 (실패경로): 기한 전이면 「입금 기다리는 중」이어도 취소하지 않는다", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "WAITING_FOR_DEPOSIT", w.secret) });
    await runServerReconcile(w.orderNo);
    expect(cancelCalls).toEqual([]);
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
  });

  it("INV-M23 (실패경로): 결제사가 취소를 거절하면(그 사이 입금됨) 주문을 취소하지 않는다", async () => {
    const w = await waitingOrder();
    backdateDue(w.tossOrderId, 1);
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "WAITING_FOR_DEPOSIT", w.secret) });
    cancels.set(w.paymentKey, { status: 400, body: { code: "INVALID_REFUND_ACCOUNT_INFO", message: "환불 계좌 정보가 필요합니다." } });
    await runServerReconcile(w.orderNo);
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
  });

  it("INV-M23 (동시): 기한 지남 취소와 입금 반영이 겹치면 하나만 반영된다", async () => {
    const draft = (orderNo: string, at: string) => ({
      p_request_id: `apr_${orderNo.replaceAll("-", "")}`,
      p_payload: `fankkuk-approval:v1|req=apr_${orderNo.replaceAll("-", "")}|order=${orderNo}|at=${at}|fan=${"0".repeat(64)}`,
      p_requested_at: at,
    });
    for (let i = 0; i < 2; i += 1) {
      const w = await waitingOrder();
      const lock = await holdRowLock(`select 1 from public.payments where toss_order_id = '${w.tossOrderId}' for update`, 2);
      const at = new Date().toISOString();
      const settle = adminClient().rpc("settle_payment", { p_toss_order_id: w.tossOrderId, p_status: "done", p_payment_key: "pk_race", ...draft(w.orderNo, at) });
      const close = adminClient().rpc("close_deposit_expired", { p_toss_order_id: w.tossOrderId });
      const [s, c] = i === 0 ? await Promise.all([settle, close]) : (await Promise.all([close, settle])).reverse();
      await lock.released;
      expect([s.data, c.data].filter((v) => v === true)).toHaveLength(1);
      const st = state(w.tossOrderId);
      expect(["done|registered|1|1", "failed|pending_payment|0|0"]).toContain(st);
      expect(outboxCount(w.orderId, "deposit_expired")).toBe(st.startsWith("failed") ? "1" : "0");
    }
  });

  it("INV-M23 (실패경로): 입금 대기가 아닌 결제는 기한 지남으로 닫히지 않고, 입금 대기는 일반 실패 반영으로 닫히지 않는다", async () => {
    const o = await registerTestOrder(1);
    expect((await adminClient().rpc("close_deposit_expired", { p_toss_order_id: o.tossOrderId })).data).toBe(false);
    expect(state(o.tossOrderId)).toBe("pending|pending_payment|0|0");
    const w = await waitingOrder();
    const failed = await adminClient().rpc("settle_payment", {
      p_toss_order_id: w.tossOrderId, p_status: "failed", p_payment_key: null, p_request_id: null, p_payload: null, p_requested_at: null,
    });
    expect(failed.data).toBe(false);
    expect(state(w.tossOrderId)).toBe("waiting_deposit|pending_payment|0|0");
  });
});

// ── INV-M24 ──────────────────────────────────

describe("INV-M24: 입금 완료 뒤 되돌림", () => {
  it("INV-M24: 입금 반영 뒤(크리에이터에게 간 주문) 조회가 「입금 기다리는 중」이면 조용히 되돌리지 않고 확인 필요로 올린다", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret) });
    await callback(depositBody(w));
    expect(state(w.tossOrderId)).toBe("done|registered|1|1");

    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "WAITING_FOR_DEPOSIT", w.secret) });
    expect((await callback(depositBody(w, "WAITING_FOR_DEPOSIT"))).status).toBe(200);
    expect(state(w.tossOrderId)).toBe("done|registered|1|1");
    expect(psql(`select deposit_reverted_at is not null from public.payments where toss_order_id = '${w.tossOrderId}'`)).toBe("t");
    const boss = await signedInClient("fankkuk_admin");
    const rows = (await boss.rpc("admin_payment_rows")).data as { order_no: string; unit_kind: string; needs_review: boolean }[];
    expect(rows.filter((r) => r.order_no === w.orderNo && r.unit_kind === "gift")).toEqual([expect.objectContaining({ needs_review: true })]);
  });

  it("INV-M24 (실패경로): 되돌림이 없으면 확인 필요가 아니다", async () => {
    const w = await waitingOrder();
    lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret) });
    await callback(depositBody(w));
    await callback(depositBody(w));
    const boss = await signedInClient("fankkuk_admin");
    const rows = (await boss.rpc("admin_payment_rows")).data as { order_no: string; unit_kind: string; needs_review: boolean }[];
    expect(rows.filter((r) => r.order_no === w.orderNo && r.unit_kind === "gift")).toEqual([expect.objectContaining({ needs_review: false })]);
  });
});

// ── INV-M25 ──────────────────────────────────

/** 입금 완료된 무통장 주문을 거절로 돌려 결제 금액 전액이 환불 대상이 되게 한다. */
async function refundableDeposit(): Promise<Waiting & { paymentId: string }> {
  const w = await waitingOrder();
  lookups.set(w.tossOrderId, { status: 200, body: vaPayment(w.tossOrderId, 6900, "DONE", w.secret) });
  expect((await callback(depositBody(w))).status).toBe(200);
  lookups.clear();
  lookupCalls.length = 0;
  psql(`update public.orders set status = 'rejected' where id = '${w.orderId}'`);
  return { ...w, paymentId: psql(`select id from public.payments where toss_order_id = '${w.tossOrderId}'`) };
}

async function postRefundAccount(loginId: string, body: unknown) {
  const { saveRefundAccount } = await import("@/features/refund-account/model/save-refund-account");
  return saveRefundAccount({ session: await signedInClient(loginId), env: process.env }, body);
}

async function ownerRefund(paymentId: string) {
  const session = await signedInClient("fankkuk_admin");
  const toss = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "test" }, fetchImpl: globalThis.fetch });
  return runRefund({ session, admin: adminClient(), toss, deposit: refundDepositDeps(adminClient(), process.env) }, { kind: "gift", unitId: paymentId });
}

const account = (orderNo: string) => ({ orderNo, bankCode: "88", accountNumber: "110123456789", holderName: "김별빛" });

describe("INV-M25: 환불 계좌", () => {
  it("INV-M25 (실패경로): 환불 계좌가 없으면 무통장 결제는 결제사까지 가지 않는다", async () => {
    const r = await refundableDeposit();
    const out = await ownerRefund(r.paymentId);
    // 개인정보 구역 파일 적용 전에는 계좌를 읽는 함수가 없어 500, 적용 뒤에는 「계좌 없음」 409 — 어느 쪽이든 결제사 호출은 없다
    expect(out.status).toBeGreaterThanOrEqual(400);
    expect(cancelCalls).toEqual([]);
  });

  it("INV-M25 (실패경로, manual/0019 뒤): 카드 결제 주문·남의 주문에는 환불 계좌를 넣을 수 없다", async () => {
    const r = await refundableDeposit();
    expect((await postRefundAccount("daltokki_fan", account(r.orderNo))).status).toBe(404);
    const card = await registerTestOrder(1);
    psql(`update public.payments set status = 'done', payment_key = 'pk_card', settled_at = now() where toss_order_id = '${card.tossOrderId}'`);
    expect((await postRefundAccount("byeolbit_fan", account(card.orderNo))).status).toBe(404);
    expect((await postRefundAccount("byeolbit_fan", { ...account(r.orderNo), accountNumber: "12" })).status).toBe(400);
  });

  it("INV-M25 (manual/0019 뒤): 팬이 넣은 계좌는 은행·끝 네 자리만 돌아오고, 구역 표는 로그인 키로 읽히지 않으며, 저장값은 암호문이다", async () => {
    const r = await refundableDeposit();
    const saved = await postRefundAccount("byeolbit_fan", account(r.orderNo));
    expect(saved).toEqual({ status: 200, body: { bankCode: "88", last4: "6789" } });
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("my_refund_account", { p_order_no: r.orderNo })).data).toEqual([{ bank_code: "88", account_last4: "6789" }]);
    expect((await (await signedInClient("daltokki_fan")).rpc("my_refund_account", { p_order_no: r.orderNo })).data ?? []).toEqual([]);
    expect((await fan.schema("pii").from("refund_accounts").select("*")).data ?? null).toBeNull();
    const sealed = psql(`select sealed from pii.refund_accounts where payment_id = '${r.paymentId}'`);
    expect(sealed).not.toContain("110123456789");
    expect(sealed).not.toContain("김별빛");
  });

  it("INV-M25 (manual/0019 뒤): 환불은 그 계좌로 결제사에 가고, 환불이 끝나면 계좌가 지워진다", async () => {
    const r = await refundableDeposit();
    expect((await postRefundAccount("byeolbit_fan", account(r.orderNo))).status).toBe(200);
    cancels.set(r.paymentKey, {
      status: 200,
      body: { paymentKey: r.paymentKey, status: "CANCELED", cancels: [{ cancelAmount: 6900, cancelStatus: "DONE", canceledAt: "2026-10-16T12:00:00+09:00" }] },
    });
    const out = await ownerRefund(r.paymentId);
    expect(out).toMatchObject({ status: 200 });
    expect(cancelCalls).toHaveLength(1);
    expect(cancelCalls[0]!.body.refundReceiveAccount).toEqual({ bank: "88", accountNumber: "110123456789", holderName: "김별빛" });
    expect(psql(`select count(*) from pii.refund_accounts where payment_id = '${r.paymentId}'`)).toBe("0");
    expect(psql(`select coalesce(last_error, '') from public.refunds where payment_id = '${r.paymentId}'`)).not.toContain("110123456789");
  });

  it("INV-M25 (manual/0019 뒤): 환불이 실패하면 계좌는 남아 다시 시도에 쓴다", async () => {
    const r = await refundableDeposit();
    expect((await postRefundAccount("byeolbit_fan", account(r.orderNo))).status).toBe(200);
    cancels.set(r.paymentKey, { status: 400, body: { code: "INVALID_REFUND_ACCOUNT_NUMBER", message: "계좌번호가 올바르지 않습니다." } });
    expect((await ownerRefund(r.paymentId)).status).toBe(502);
    expect(psql(`select count(*) from pii.refund_accounts where payment_id = '${r.paymentId}'`)).toBe("1");
  });
});
