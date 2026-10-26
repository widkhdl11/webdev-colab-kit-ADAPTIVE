import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { labeled, measure, paidOrder, prepare } from "./difference-helpers";
import { adminClient, deleteTestOrders, psql, registerTestOrder, requestIdFor, signedInClient } from "./helpers";
import { deleteTestRevgifts, PROFILE, registerTestRevgift } from "./revgift-helpers";

// 「확인 필요」 결제의 전액 취소 (payment INV-M20 S20~S20f · notifications INV-N19 S19·S19b).
// 실제 로컬 DB 에 붙는다. 바꾸는 것은 관리자 키 클라이언트를 만드는 자리와 결제사 API 뿐이다 —
// 전역 fetch 에서 토스 주소만 가로채 시험이 정한 조회·취소 응답을 돌려준다. 「확인 필요」는 실제 다시 확인 경로로 만든다.

vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => adminClient() }));

const { runServerReconcile } = await import("@/app/api/cron/payments/reconciler");
const { runReviewCancel } = await import("@/features/admin-review-cancel/model/run-review-cancel");
const { createTossPaymentsClient } = await import("@/shared/api/toss-payments/client");

const realFetch = globalThis.fetch;
type TossReply = { status: number; body: unknown };
const lookups = new Map<string, TossReply>();
type CancelCall = { paymentKey: string; amount: number | undefined; idempotencyKey: string | null };
const cancelCalls: CancelCall[] = [];
let cancelReply: (paymentKey: string, amount: number) => TossReply = (paymentKey, amount) => ({
  status: 200,
  body: { paymentKey, status: "CANCELED", cancels: [{ cancelAmount: amount, cancelStatus: "DONE", canceledAt: new Date().toISOString() }] },
});
const defaultCancelReply = cancelReply;
const testStartedAt = new Date().toISOString();

beforeAll(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  process.env.TOSS_SECRET_KEY = "test_gsk_review_cancel";
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.tosspayments.com/")) return realFetch(input, init);
    const json = (r: TossReply) => new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    const lookup = /\/v1\/payments\/orders\/([^/?]+)$/.exec(url);
    if (lookup) return json(lookups.get(decodeURIComponent(lookup[1]!)) ?? { status: 500, body: { code: "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING" } });
    const cancel = /\/v1\/payments\/([^/]+)\/cancel$/.exec(url);
    if (cancel) {
      const paymentKey = decodeURIComponent(cancel[1]!);
      const body = JSON.parse(String(init?.body ?? "{}")) as { cancelAmount?: number };
      const headers = new Headers(init?.headers);
      cancelCalls.push({ paymentKey, amount: body.cancelAmount, idempotencyKey: headers.get("Idempotency-Key") });
      const reply = cancelReply(paymentKey, body.cancelAmount ?? 0);
      // 연결이 끊긴 것처럼 — 결제사에서 취소가 됐는지 모른다
      if (reply.status === 0) throw new TypeError("fetch failed");
      return json(reply);
    }
    return json({ status: 404, body: { code: "NOT_FOUND" } });
  }) as typeof fetch);
});
afterEach(() => {
  lookups.clear();
  cancelCalls.length = 0;
  cancelReply = defaultCancelReply;
});
afterAll(() => {
  vi.unstubAllGlobals();
  deleteTestOrders();
  deleteTestRevgifts();
});

const toss = () => createTossPaymentsClient({ secretKey: "test_gsk_review_cancel", fetchImpl: fetch });

async function cancelAs(login: string, source: "initial" | "difference" | "revgift", tossOrderId: string) {
  return runReviewCancel({ session: await signedInClient(login), admin: adminClient(), toss: toss() }, { source, tossOrderId });
}

function backdate(table: "payments" | "revgift_sends", tossOrderId: string): void {
  psql(`update public.${table} set confirming_at = now() - interval '11 minutes' where toss_order_id = '${tossOrderId}'`);
}

/** 결제사 조회 = 승인됨이지만 금액이 다름(또는 부분 취소) → 다시 확인이 「확인 필요」로 표시한 팬 선물 첫 결제(기록 6,900원). */
async function reviewGift(lookup: { status: string; total: number; balance: number }) {
  const o = await registerTestOrder(1);
  expect((await adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId })).data).toBe(true);
  backdate("payments", o.tossOrderId);
  lookups.set(o.tossOrderId, {
    status: 200,
    body: { status: lookup.status, orderId: o.tossOrderId, totalAmount: lookup.total, balanceAmount: lookup.balance, paymentKey: `pk_review_${o.tossOrderId}` },
  });
  expect((await runServerReconcile(o.orderNo)).counts.review).toBe(1);
  return o;
}

const paymentState = (tossOrderId: string) =>
  psql(
    `select p.status || '|' || coalesce(p.review_payment_key, '-') || '|' || coalesce(p.review_balance_krw::text, '-') || '|' || o.status
     from public.payments p join public.orders o on o.id = p.order_id where p.toss_order_id = '${tossOrderId}'`,
  );
const cancelRow = (tossOrderId: string) =>
  psql(`select coalesce(string_agg(status || '/' || amount_krw || '/' || attempts, ';'), '') from public.review_cancels where toss_order_id = '${tossOrderId}'`);
const cancelId = (tossOrderId: string) => psql(`select id from public.review_cancels where toss_order_id = '${tossOrderId}'`);
/** 그 주문의 취소 알림 줄이 통로(이메일·카카오)마다 정확히 하나인가 — 같은 통로에 두 줄이면 f */
const oneLinePerChannel = (orderId: string) =>
  psql(
    `select count(*) = count(distinct channel) and count(*) >= 1 from public.notification_outbox where order_id = '${orderId}' and kind in ('payment_canceled', 'difference_canceled')`,
  );
const notices = (orderId: string) =>
  psql(`select coalesce(string_agg(distinct kind || '>' || account_id, ','), '') from public.notification_outbox where order_id = '${orderId}' and kind in ('payment_canceled', 'difference_canceled')`);

describe("INV-M20: 「확인 필요」 결제의 전액 취소 — 팬 선물 첫 결제", () => {
  it("INV-M20 (S20) · INV-N19 (S19): 표시 때 결제 키·남은 금액을 기록하고, 대표가 전액 취소하면 결제사 취소 1번 → 결제 실패·주문은 결제 전 그대로·팬에게 알림 1줄", async () => {
    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    expect(paymentState(o.tossOrderId)).toBe(`confirming|pk_review_${o.tossOrderId}|5000|pending_payment`);

    const r = await cancelAs("fankkuk_admin", "initial", o.tossOrderId);
    expect(r.status).toBe(200);
    // 금액을 비워 남은 금액 전부를 취소한다 — 기록한 금액은 보여 주기용
    expect(cancelCalls).toEqual([{ paymentKey: `pk_review_${o.tossOrderId}`, amount: undefined, idempotencyKey: cancelId(o.tossOrderId) }]);
    expect(cancelRow(o.tossOrderId)).toBe("done/5000/1");
    expect(paymentState(o.tossOrderId).split("|")[0]).toBe("failed");
    expect(paymentState(o.tossOrderId).split("|")[3]).toBe("pending_payment");
    expect(psql(`select count(*) from public.approval_requests where order_id = '${o.orderId}'`)).toBe("0");
    expect(notices(o.orderId)).toBe(`payment_canceled>${PROFILE.byeolbit}`);
    expect(oneLinePerChannel(o.orderId)).toBe("t");
  });

  it("INV-M20 (S20b): 조회 = 부분 취소(남은 4,000)면 남은 금액 4,000 이 기록되고, 취소는 금액을 비워 남은 것 전부", async () => {
    const o = await reviewGift({ status: "PARTIAL_CANCELED", total: 6900, balance: 4000 });
    expect(paymentState(o.tossOrderId)).toBe(`confirming|pk_review_${o.tossOrderId}|4000|pending_payment`);
    expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(200);
    expect(cancelCalls.map((c) => c.amount)).toEqual([undefined]);
    expect(cancelRow(o.tossOrderId)).toBe("done/4000/1");
  });

  it("INV-M20 (S20b, 실패경로): 결제사가 일부만 취소됐다고 답하면 완료로 치지 않는다 — 결과를 모름으로 남긴다", async () => {
    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    cancelReply = (paymentKey, amount) => ({
      status: 200,
      body: { paymentKey, status: "PARTIAL_CANCELED", cancels: [{ cancelAmount: amount, cancelStatus: "DONE" }] },
    });
    expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(502);
    expect(cancelRow(o.tossOrderId)).toBe("requesting/5000/1");
    expect(paymentState(o.tossOrderId).split("|")[0]).toBe("confirming");
  });

  it("INV-M20 (S20c, 실패경로): 직원·팬·크리에이터는 거부되고 결제사를 부르지 않는다 — 결제는 그대로", async () => {
    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    for (const who of ["fankkuk_staff", "byeolbit_fan", "haru_creator"]) {
      const r = await cancelAs(who, "initial", o.tossOrderId);
      expect([403, 404]).toContain(r.status);
    }
    // DB 함수를 직접 불러도 대표가 아니면 거부
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_claim_review_cancel", { p_source: "initial", p_toss_order_id: o.tossOrderId })).error?.code).toBe("42501");
    // 결과 반영 함수는 앱 서버 키만 — 대표 로그인으로도 결제사를 거치지 않고 「취소 완료」를 기록할 수 없다
    const boss = await signedInClient("fankkuk_admin");
    const claimed = (await boss.rpc("admin_claim_review_cancel", { p_source: "initial", p_toss_order_id: o.tossOrderId })).data as { cancel_id: string }[];
    expect((await boss.rpc("settle_review_cancel", { p_cancel_id: claimed[0]!.cancel_id, p_ok: true, p_error: null })).error?.code).toBe("42501");
    expect(cancelRow(o.tossOrderId)).toBe("requesting/5000/1");
    psql(`delete from public.review_cancels where toss_order_id = '${o.tossOrderId}'`);
    expect(cancelCalls).toEqual([]);
    expect(cancelRow(o.tossOrderId)).toBe("");
    expect(paymentState(o.tossOrderId).split("|")[0]).toBe("confirming");
  });

  it("INV-M20 (S20c, 실패경로): 표시 없는 결제·이미 완료된 결제·없는 결제는 거부, 결제사 호출 없음", async () => {
    const plain = await registerTestOrder(1);
    await adminClient().rpc("claim_payment", { p_toss_order_id: plain.tossOrderId });
    expect((await cancelAs("fankkuk_admin", "initial", plain.tossOrderId)).status).toBe(409);

    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    psql(`update public.payments set status = 'done', payment_key = 'pk_done' where toss_order_id = '${o.tossOrderId}'`);
    expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(409);

    expect((await cancelAs("fankkuk_admin", "initial", "pay_test_nothing_here")).status).toBe(404);
    expect(cancelCalls).toEqual([]);
  });

  it("INV-M20 (S20c, 실패경로): 화면이 금액을 보내면 받지 않는다", async () => {
    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    const r = await runReviewCancel(
      { session: await signedInClient("fankkuk_admin"), admin: adminClient(), toss: toss() },
      { source: "initial", tossOrderId: o.tossOrderId, amountKrw: 6900 },
    );
    expect(r.status).toBe(400);
    expect(cancelCalls).toEqual([]);
  });
});

describe("INV-M20 (S20d·S20e): 두 번 누름·결제사 실패·늦게 온 승인", () => {
  it("INV-M20 (S20d, 동시): 「처리 중」 기록이 있는 동안 다시 누르면 거부 — 결제사까지 가지 않는다", async () => {
    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    const boss = await signedInClient("fankkuk_admin");
    const first = await boss.rpc("admin_claim_review_cancel", { p_source: "initial", p_toss_order_id: o.tossOrderId });
    expect(first.error).toBeNull();
    expect((await boss.rpc("admin_claim_review_cancel", { p_source: "initial", p_toss_order_id: o.tossOrderId })).error?.code).toBe("P0024");
    expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(409);
    // 90초 지났어도 아직 2분 안 — 그대로 거부
    psql(`update public.review_cancels set requested_at = now() - interval '90 seconds' where toss_order_id = '${o.tossOrderId}'`);
    expect((await boss.rpc("admin_claim_review_cancel", { p_source: "initial", p_toss_order_id: o.tossOrderId })).error?.code).toBe("P0024");
    expect(cancelCalls).toEqual([]);
    expect(cancelRow(o.tossOrderId)).toBe("requesting/5000/1");
  });

  it("INV-M20 (S20d): 결제사 취소가 실패하면 기록은 실패·결제는 그대로·알림 없음, 다시 누르면 같은 기록·같은 멱등 키로 재시도", async () => {
    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    cancelReply = () => ({ status: 400, body: { code: "PROVIDER_ERROR", message: "일시적인 오류" } });
    expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(502);
    expect(cancelRow(o.tossOrderId)).toBe("failed/5000/1");
    expect(paymentState(o.tossOrderId).split("|")[0]).toBe("confirming");
    expect(notices(o.orderId)).toBe("");

    cancelReply = defaultCancelReply;
    expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(200);
    expect(cancelRow(o.tossOrderId)).toBe("done/5000/2");
    const keys = cancelCalls.map((c) => c.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    expect(paymentState(o.tossOrderId).split("|")[0]).toBe("failed");
    // 끝난 뒤 또 누르면 「이미 취소」
    expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(409);
    expect(cancelCalls).toHaveLength(2);
  });

  it("INV-M20 (S20d, 실패경로): 결제사 응답을 받지 못하거나 알아볼 수 없으면 결과를 모르는 것 — 「처리 중」으로 남기고 늦게 온 승인도 막는다, 2분 뒤 같은 키로 다시", async () => {
    for (const reply of [{ status: 0, body: null }, { status: 200, body: { unexpected: true } }]) {
      const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
      cancelReply = () => reply;
      expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(502);
      expect(cancelRow(o.tossOrderId)).toBe("requesting/5000/1");
      expect(paymentState(o.tossOrderId).split("|")[0]).toBe("confirming");
      // 2분 안에 다시 누르면 결제사까지 가지 않는다
      expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(409);
      expect(cancelCalls).toHaveLength(1);
      // 2분 뒤 같은 기록·같은 멱등 키로
      psql(`update public.review_cancels set requested_at = now() - interval '3 minutes' where toss_order_id = '${o.tossOrderId}'`);
      cancelReply = defaultCancelReply;
      expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(200);
      expect(new Set(cancelCalls.map((c) => c.idempotencyKey)).size).toBe(1);
      expect(cancelRow(o.tossOrderId)).toBe("done/5000/2");
      cancelCalls.length = 0;
    }
  });

  it("INV-M20 (S20d): 「처리 중」이 2분 넘게 남은 기록은 다시 잡힌다", async () => {
    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    const boss = await signedInClient("fankkuk_admin");
    await boss.rpc("admin_claim_review_cancel", { p_source: "initial", p_toss_order_id: o.tossOrderId });
    psql(`update public.review_cancels set requested_at = now() - interval '3 minutes' where toss_order_id = '${o.tossOrderId}'`);
    expect((await cancelAs("fankkuk_admin", "initial", o.tossOrderId)).status).toBe(200);
    expect(cancelRow(o.tossOrderId)).toBe("done/5000/2");
  });

  it("INV-M20 (S20e, 실패경로): 취소 기록이 「처리 중」·완료인 결제에 늦게 돌아온 원래 승인이 와도 완료가 되지 않고 주문 등록·승인 요청도 없다", async () => {
    // 늦게 돌아온 원래 승인의 반영 — 정상 확정과 같은 인자(승인 요청 원문 꼴까지)
    const settleLate = (o: { orderNo: string; tossOrderId: string }) => {
      const requestId = requestIdFor(o.orderNo);
      const at = new Date().toISOString();
      return adminClient().rpc("settle_payment", {
        p_toss_order_id: o.tossOrderId,
        p_status: "done",
        p_payment_key: `pk_late_${o.tossOrderId}`,
        p_request_id: requestId,
        p_payload: `fankkuk-approval:v1|req=${requestId}|order=${o.orderNo}|at=${at}|fan=${"0".repeat(64)}`,
        p_requested_at: at,
      });
    };
    const requesting = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    await (await signedInClient("fankkuk_admin")).rpc("admin_claim_review_cancel", { p_source: "initial", p_toss_order_id: requesting.tossOrderId });
    expect((await settleLate(requesting)).data).toBe(false);
    expect(paymentState(requesting.tossOrderId).split("|")[0]).toBe("confirming");
    expect(psql(`select count(*) from public.approval_requests where order_id = '${requesting.orderId}'`)).toBe("0");

    const done = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    expect((await cancelAs("fankkuk_admin", "initial", done.tossOrderId)).status).toBe(200);
    expect((await settleLate(done)).data).toBe(false);
    expect(paymentState(done.tossOrderId)).toMatch(/^failed\|.*\|pending_payment$/);

    // 결제사 취소가 실패로 끝난 기록이면 막지 않는다 — 돈이 돌아가지 않았다
    const failed = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    cancelReply = () => ({ status: 400, body: { code: "PROVIDER_ERROR", message: "x" } });
    await cancelAs("fankkuk_admin", "initial", failed.tossOrderId);
    expect((await settleLate(failed)).data).toBe(true);
    expect(paymentState(failed.tossOrderId).split("|")[0]).toBe("done");
  });
});

describe("INV-M20 (S20f): 차액 결제·역조공 결제", () => {
  it("INV-M20 (S20f) · INV-N19 (S19): 차액 — 전액 취소하면 차액 결제 실패, 팬에게 difference_canceled 1줄, 다시 준비하면 표시가 비고 새 결제번호", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "medium");
    const row = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string; amount_krw: number }[])[0]!;
    expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: row.toss_order_id })).data).toBe(true);
    backdate("payments", row.toss_order_id);
    lookups.set(row.toss_order_id, {
      status: 200,
      body: { status: "DONE", orderId: row.toss_order_id, totalAmount: 1000, balanceAmount: 1000, paymentKey: `pk_review_${row.toss_order_id}` },
    });
    expect((await runServerReconcile(g.orderNo)).counts.review).toBe(1);

    expect((await cancelAs("fankkuk_admin", "difference", row.toss_order_id)).status).toBe(200);
    expect(cancelCalls.map((c) => c.amount)).toEqual([undefined]);
    expect(psql(`select status from public.payments where toss_order_id = '${row.toss_order_id}'`)).toBe("failed");
    expect(notices(g.orderId)).toBe(`difference_canceled>${PROFILE.byeolbit}`);
    expect(oneLinePerChannel(g.orderId)).toBe("t");

    const again = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string }[])[0]!;
    expect(again.toss_order_id).not.toBe(row.toss_order_id);
    expect(
      psql(
        `select status || '|' || (review_at is null) || '|' || (review_payment_key is null) || '|' || (review_balance_krw is null) from public.payments where toss_order_id = '${again.toss_order_id}'`,
      ),
    ).toBe("pending|true|true|true");
  });

  it("INV-M20 (S20f) · INV-N19 (S19b, 실패경로): 역조공 — 전액 취소하면 보내기는 실패, 알림 줄은 없다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await adminClient().rpc("claim_revgift_payment", { p_toss_order_id: send.tossOrderId })).data).toBe(true);
    backdate("revgift_sends", send.tossOrderId);
    lookups.set(send.tossOrderId, {
      status: 200,
      body: { status: "DONE", orderId: send.tossOrderId, totalAmount: 3000, balanceAmount: 3000, paymentKey: `pk_review_${send.tossOrderId}` },
    });
    expect((await runServerReconcile(send.orderNos[0]!)).counts.review).toBe(1);
    expect(psql(`select review_payment_key || '|' || review_balance_krw from public.revgift_sends where id = '${send.sendId}'`)).toBe(
      `pk_review_${send.tossOrderId}|3000`,
    );

    expect((await cancelAs("fankkuk_admin", "revgift", send.tossOrderId)).status).toBe(200);
    expect(cancelCalls.map((c) => c.amount)).toEqual([undefined]);
    expect(psql(`select status from public.revgift_sends where id = '${send.sendId}'`)).toBe("failed");
    // 받는 팬에게도 취소 알림 줄이 없다
    expect(
      psql(
        `select count(*) from public.notification_outbox where kind in ('payment_canceled', 'difference_canceled') and created_at >= '${testStartedAt}' and account_id = '${PROFILE.byeolbit}' and order_id is null`,
      ),
    ).toBe("0");

    // 늦게 돌아온 원래 승인 — 취소된 보내기는 완료가 되지 않는다(역조공 결제 줄에도 같은 장치)
    const late = await adminClient().rpc("settle_revgift_payment", {
      p_toss_order_id: send.tossOrderId,
      p_status: "done",
      p_payment_key: `pk_late_${send.tossOrderId}`,
    });
    expect(late.data).toBe(false);
    expect(psql(`select status from public.revgift_sends where id = '${send.sendId}'`)).toBe("failed");
    expect(psql(`select count(*) from public.notification_outbox where kind in ('payment_canceled', 'difference_canceled') and event_at > now() - interval '1 minute' and account_id = '${PROFILE.haru}'`)).toBe("0");
  });
});

describe("INV-M20 (S20e·S20f): 역조공 결제의 늦은 승인", () => {
  it("INV-M20 (S20e·S20f, 실패경로): 역조공 취소가 「처리 중」인 동안 늦게 돌아온 원래 승인은 보내기를 완료로 바꾸지 못하고 받는 주소 6자리도 생기지 않는다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await adminClient().rpc("claim_revgift_payment", { p_toss_order_id: send.tossOrderId })).data).toBe(true);
    backdate("revgift_sends", send.tossOrderId);
    lookups.set(send.tossOrderId, {
      status: 200,
      body: { status: "DONE", orderId: send.tossOrderId, totalAmount: 3000, balanceAmount: 3000, paymentKey: `pk_review_${send.tossOrderId}` },
    });
    expect((await runServerReconcile(send.orderNos[0]!)).counts.review).toBe(1);
    const boss = await signedInClient("fankkuk_admin");
    expect((await boss.rpc("admin_claim_review_cancel", { p_source: "revgift", p_toss_order_id: send.tossOrderId })).error).toBeNull();

    const late = await adminClient().rpc("settle_revgift_payment", {
      p_toss_order_id: send.tossOrderId,
      p_status: "done",
      p_payment_key: `pk_late_${send.tossOrderId}`,
    });
    expect(late.data).toBe(false);
    expect(psql(`select status from public.revgift_sends where id = '${send.sendId}'`)).toBe("confirming");
    expect(psql(`select count(*) from public.inbound_codes c join public.revgift_shares s on s.id = c.share_id where s.send_id = '${send.sendId}'`)).toBe("0");
  });
});

describe("INV-M20: 확인 필요 결제 목록", () => {
  it("INV-M20: 운영자(직원·대표)는 확인 필요 결제를 취소 상태와 함께 읽고, 팬·크리에이터는 거부", async () => {
    const o = await reviewGift({ status: "DONE", total: 5000, balance: 5000 });
    for (const who of ["fankkuk_staff", "fankkuk_admin"]) {
      const { data, error } = await (await signedInClient(who)).rpc("admin_review_payments");
      expect(error).toBeNull();
      const rows = data as { toss_order_id: string; source: string; order_no: string; amount_krw: number; balance_krw: number; cancel_status: string }[];
      expect(rows.filter((r) => r.toss_order_id === o.tossOrderId)).toEqual([
        expect.objectContaining({ source: "initial", order_no: o.orderNo, amount_krw: 6900, balance_krw: 5000, cancel_status: "none" }),
      ]);
    }
    for (const who of ["byeolbit_fan", "haru_creator"]) {
      expect((await (await signedInClient(who)).rpc("admin_review_payments")).error?.code).toBe("42501");
    }
    await cancelAs("fankkuk_admin", "initial", o.tossOrderId);
    const after = (await (await signedInClient("fankkuk_staff")).rpc("admin_review_payments")).data as { toss_order_id: string }[];
    // 취소가 끝나 결제가 실패로 닫히면 확인 필요 목록에서 빠진다
    expect(after.filter((r) => r.toss_order_id === o.tossOrderId)).toEqual([]);
  });
});
