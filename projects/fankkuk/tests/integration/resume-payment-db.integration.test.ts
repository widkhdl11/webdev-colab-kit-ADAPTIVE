import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readActionItems, readCreatorActionItems } from "@/entities/action-item/api/read-action-items";
import { actionItemsOfOrder } from "@/entities/action-item/model/action-items";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { confirmPayment } from "@/features/checkout/model/checkout";
import { prepareResume } from "@/features/checkout/model/resume-payment";
import { createTossPaymentsClient } from "@/shared/api/toss-payments/client";
import { readSiteHeader } from "@/widgets/site-header/api/session-header";
import { adminClient, anonClient, deleteTestOrders, holdRowLock, psql, registerTestOrder, SEED, signedInClient } from "./helpers";

// 헤더 숫자 읽기(readSiteHeader)가 끌고 오는 요청 쿠키 클라이언트는 이 시험에서 쓰지 않는다 — 읽기 결과를 넘기므로 부르지 않는다
vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: () => {
    throw new Error("시험에서는 요청 쿠키 클라이언트를 쓰지 않는다");
  },
}));

// 결제 이어 하기 (payment INV-M22 · S22·S22b·S22c) 와 팬 지금 할 일 「결제 미완료」(action-center INV-J1 표 · INV-J2 · INV-J13).
// 실제 DB 로 본다. 토스 승인 API 만 가짜(외부)다. 시드 주문은 바꾸지 않는다 — 시험마다 새 주문(FC-T…)을 만들고 끝나면 지운다.

function fakeToss() {
  const calls: { orderId: string; amount: number }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { orderId: string; amount: number };
    calls.push(body);
    return new Response(JSON.stringify({ status: "DONE", orderId: body.orderId, totalAmount: body.amount }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, client: createTossPaymentsClient({ secretKey: "test_gsk_x", fetchImpl }) };
}

/** 처음 결제 대기를 만든 때를 hours 시간 전으로 — 결제 줄은 주문마다 하나다 */
function backdate(orderId: string, hours: number): void {
  psql(`update public.payments set created_at = now() - interval '${hours} hours' where order_id = '${orderId}' and kind = 'initial'`);
}
const payRow = (orderId: string) =>
  psql(`select toss_order_id || '|' || status || '|' || amount_krw || '|' || created_at from public.payments where order_id = '${orderId}' and kind = 'initial'`);
const currentTossId = (orderId: string) => psql(`select toss_order_id from public.payments where order_id = '${orderId}' and kind = 'initial'`);

async function resumeAs(loginId: string, orderNo: string) {
  return prepareResume(await signedInClient(loginId), { orderNo });
}

async function runExpiry(orderNo: string): Promise<void> {
  const staff = await signedInClient("fankkuk_staff");
  const r = await staff.rpc("office_run_expiry", { p_order_no: orderNo });
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.message}`);
}

const store = () => createSupabasePaymentStore(adminClient());

beforeAll(() => deleteTestOrders());
afterAll(() => deleteTestOrders());

describe("INV-M22: 결제 이어 하기 — 처음 금액 그대로, 시도마다 새 결제 번호, 앞 시도는 대체됨", () => {
  it("INV-M22 S22: 2시간 된 결제 대기(6,900원) 뒤 소형 요금이 7,500원으로 바뀜 → 이어 하기 금액 6,900원, 새 결제 번호, 앞 시도 대체됨", async () => {
    const o = await registerTestOrder();
    backdate(o.orderId, 2);
    const before = payRow(o.orderId);
    const price = psql(`select price_krw from public.tier_prices where tier = 'small'`);
    psql(`update public.tier_prices set price_krw = 7500 where tier = 'small'`);
    try {
      const r = await resumeAs("byeolbit_fan", o.orderNo);
      expect(r.status).toBe(200);
      const body = r.body as { orderId: string; amountKrw: number; orderNo: string };
      expect(body.amountKrw).toBe(6900);
      expect(body.orderNo).toBe(o.orderNo);
      expect(body.orderId).not.toBe(o.tossOrderId);
      // 기록: 새 결제 번호의 결제 대기, 금액·칸 그대로, 처음 만든 때 그대로(시계가 다시 시작하지 않음 ④)
      const [tossId, status, amount, createdAt] = payRow(o.orderId).split("|");
      expect(tossId).toBe(body.orderId);
      expect(status).toBe("pending");
      expect(amount).toBe("6900");
      expect(createdAt).toBe(before.split("|")[3]);
      expect(psql(`select service_fee_krw || '/' || inspection_fee_krw || '/' || shipping_fee_krw from public.payments where order_id = '${o.orderId}' and kind = 'initial'`)).toBe("1400/1500/4000");
      // 앞 시도는 대체됨으로 남는다
      expect(psql(`select count(*) from public.payment_superseded_attempts where toss_order_id = '${o.tossOrderId}'`)).toBe("1");
      // 대체된 시도의 성공 주소: 결제 확정을 시작할 수 없고 승인 API 를 부르지 않는다
      expect((await adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId })).data).toBe(false);
      const toss = fakeToss();
      const out = await confirmPayment({ store: store(), toss: toss.client }, SEED.fanId, { orderId: o.tossOrderId, amount: "6900", paymentKey: "pk_old" });
      expect(out.ok).toBe(false);
      expect(toss.calls).toEqual([]);
    } finally {
      psql(`update public.tier_prices set price_krw = ${price} where tier = 'small'`);
    }
  });

  it("INV-M22 ②: 이어 하기를 두 번 하면 결제 번호가 매번 새로 생기고, 지난 두 시도는 모두 대체됨", async () => {
    const o = await registerTestOrder();
    const first = (await resumeAs("byeolbit_fan", o.orderNo)).body as { orderId: string };
    const second = (await resumeAs("byeolbit_fan", o.orderNo)).body as { orderId: string };
    expect(new Set([o.tossOrderId, first.orderId, second.orderId]).size).toBe(3);
    expect(currentTossId(o.orderId)).toBe(second.orderId);
    expect((await adminClient().rpc("claim_payment", { p_toss_order_id: first.orderId })).data).toBe(false);
    expect(psql(`select count(*) from public.payments where order_id = '${o.orderId}' and kind = 'initial'`)).toBe("1");
  });

  it("INV-M22 S22b (동시): 두 시도 A(대체됨)·B 의 성공 주소가 함께 옴(B 는 두 번) → 승인 API 는 B 한 번, 주문 완료 1번, 결제 완료 1개, 승인 요청 1개", async () => {
    const o = await registerTestOrder();
    const b = (await resumeAs("byeolbit_fan", o.orderNo)).body as { orderId: string };
    const toss = fakeToss();
    const s = store();
    // 세 요청을 같은 결제 줄의 잠금 뒤에 세워 확실히 겹치게 한다
    const lock = await holdRowLock(`select 1 from public.payments where order_id = '${o.orderId}' and kind = 'initial' for update`, 1);
    const confirm = (orderId: string) => confirmPayment({ store: s, toss: toss.client }, SEED.fanId, { orderId, amount: "6900", paymentKey: `pk_${orderId}` });
    const outs = await Promise.all([confirm(o.tossOrderId), confirm(b.orderId), confirm(b.orderId)]);
    await lock.released;
    expect(toss.calls.map((c) => c.orderId)).toEqual([b.orderId]);
    expect(outs[0]!.ok).toBe(false);
    expect(psql(`select status from public.orders where id = '${o.orderId}'`)).toBe("registered");
    expect(psql(`select count(*) from public.payments where order_id = '${o.orderId}' and status = 'done'`)).toBe("1");
    expect(psql(`select count(*) from public.approval_requests where order_id = '${o.orderId}'`)).toBe("1");
  });

  it("INV-M22 S22b (동시): 이어 하기와 지금 시도의 결제 확정 시작이 겹치면 하나만 반영된다 — 확정이 이기면 이어 하기는 거부, 이어 하기가 이기면 확정 시작 실패", async () => {
    for (let i = 0; i < 3; i++) {
      const o = await registerTestOrder();
      const lock = await holdRowLock(`select 1 from public.payments where order_id = '${o.orderId}' and kind = 'initial' for update`, 1);
      const [resumed, claimed] = await Promise.all([resumeAs("byeolbit_fan", o.orderNo), adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId })]);
      await lock.released;
      if (claimed.data === true) {
        expect(resumed.status).toBe(409);
        expect(payRow(o.orderId).split("|").slice(0, 2)).toEqual([o.tossOrderId, "confirming"]);
      } else {
        expect(resumed.status).toBe(200);
        expect(payRow(o.orderId).split("|").slice(0, 2)).toEqual([(resumed.body as { orderId: string }).orderId, "pending"]);
      }
    }
  });

  it("INV-M22 S22c (실패경로): 처음 결제 대기 뒤 24시간이 지난 주문은 닫히기 전이든 뒤든 이어 할 수 없다 — 없는 주문과 같은 응답", async () => {
    const unknown = await resumeAs("byeolbit_fan", "FC-TZZZZZZ");
    expect(unknown.status).toBe(404);
    const late = await registerTestOrder();
    backdate(late.orderId, 24.02);
    expect(await resumeAs("byeolbit_fan", late.orderNo)).toEqual(unknown);
    expect(currentTossId(late.orderId)).toBe(late.tossOrderId);
    await runExpiry(late.orderNo);
    expect(await resumeAs("byeolbit_fan", late.orderNo)).toEqual(unknown);
  });

  it("INV-M22 S22c ④: 23시간에 이어 하기 → 1시간 반이 지나면 「지금 돌리기」가 닫는다(시계가 다시 시작하지 않음)", async () => {
    const o = await registerTestOrder();
    backdate(o.orderId, 23);
    expect((await resumeAs("byeolbit_fan", o.orderNo)).status).toBe(200);
    // 1시간 반이 흐른 것과 같게 — 처음 결제 대기 시각을 1.5시간 더 앞으로
    psql(`update public.payments set created_at = created_at - interval '90 minutes' where order_id = '${o.orderId}' and kind = 'initial'`);
    await runExpiry(o.orderNo);
    expect(payRow(o.orderId).split("|")[1]).toBe("failed");
    expect(psql(`select status from public.orders where id = '${o.orderId}'`)).toBe("pending_payment");
  });

  it("INV-M22 ⑤ (실패경로): 달토끼가 별빛의 주문을 이어 하면 없는 주문과 같은 응답이고 아무것도 바뀌지 않는다. 로그인 안 함·직원도 거부", async () => {
    const o = await registerTestOrder();
    const unknown = await resumeAs("byeolbit_fan", "FC-TZZZZZZ");
    const before = payRow(o.orderId);
    expect(await resumeAs("daltokki_fan", o.orderNo)).toEqual(unknown);
    expect(await resumeAs("fankkuk_staff", o.orderNo)).toEqual(unknown);
    expect((await prepareResume(anonClient(), { orderNo: o.orderNo })).status).not.toBe(200);
    expect(payRow(o.orderId)).toBe(before);
    expect(psql(`select count(*) from public.payment_superseded_attempts a join public.payments p on p.id = a.payment_id where p.order_id = '${o.orderId}'`)).toBe("0");
  });

  it("INV-M22 (실패경로): 결제가 끝난 주문은 이어 할 수 없다(없는 주문과 같은 응답) · 결제 확정 중이면 409", async () => {
    const unknown = await resumeAs("byeolbit_fan", "FC-TZZZZZZ");
    const paid = await registerTestOrder();
    const toss = fakeToss();
    expect((await confirmPayment({ store: store(), toss: toss.client }, SEED.fanId, { orderId: paid.tossOrderId, amount: "6900", paymentKey: "pk_paid" })).ok).toBe(true);
    expect(await resumeAs("byeolbit_fan", paid.orderNo)).toEqual(unknown);

    const busy = await registerTestOrder();
    expect((await adminClient().rpc("claim_payment", { p_toss_order_id: busy.tossOrderId })).data).toBe(true);
    expect((await resumeAs("byeolbit_fan", busy.orderNo)).status).toBe(409);
  });

  it("INV-M22: 24시간 안에 승인이 실패로 끝난 결제(결제 대기 주문)는 이어 하기로 새 결제 번호의 결제 대기가 된다", async () => {
    const o = await registerTestOrder();
    expect((await adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId })).data).toBe(true);
    await store().settle(o.tossOrderId, { status: "failed" });
    const r = await resumeAs("byeolbit_fan", o.orderNo);
    expect(r.status).toBe(200);
    expect(payRow(o.orderId).split("|").slice(0, 3)).toEqual([(r.body as { orderId: string }).orderId, "pending", "6900"]);
  });
});

describe("INV-J1 결제 미완료: 결제 대기로 처음 만든 지 24시간 전인, 로그인 계정이 보낸 팬 선물 주문", () => {
  const unpaidOf = async (loginId: string, orderNo: string) =>
    (await readActionItems(await signedInClient(loginId))).filter((it) => it.kind === "unpaid" && it.orderNo === orderNo);

  it("INV-J1 (결제 미완료): 2시간 된 결제 대기 → 줄 1, 금액 6,900원, 기한 = 처음 결제 대기 + 24시간. 이어 하기 뒤에도 같은 기한", async () => {
    const o = await registerTestOrder();
    backdate(o.orderId, 2);
    const due = new Date(psql(`select to_char((created_at + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.payments where order_id = '${o.orderId}'`));
    const rows = await unpaidOf("byeolbit_fan", o.orderNo);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "unpaid", amountKrw: 6900, creatorName: expect.any(String) });
    expect(Date.parse(rows[0]!.dueAt!)).toBe(due.getTime());
    await resumeAs("byeolbit_fan", o.orderNo);
    const after = await unpaidOf("byeolbit_fan", o.orderNo);
    expect(after).toHaveLength(1);
    expect(Date.parse(after[0]!.dueAt!)).toBe(due.getTime());
  });

  it("INV-J1 (결제 미완료, 경계): 23시간 59분이면 있고 24시간 1분이면 없다(이어 하기도 그때부터 거부)", async () => {
    const young = await registerTestOrder();
    backdate(young.orderId, 23 + 59 / 60);
    expect(await unpaidOf("byeolbit_fan", young.orderNo)).toHaveLength(1);
    const old = await registerTestOrder();
    backdate(old.orderId, 24 + 1 / 60);
    expect(await unpaidOf("byeolbit_fan", old.orderNo)).toHaveLength(0);
    expect((await resumeAs("byeolbit_fan", old.orderNo)).status).toBe(404);
  });

  it("INV-J1 (결제 미완료, 실패경로): 결제 확정 중 · 결제 완료 · 닫힌 주문은 줄이 없다", async () => {
    const busy = await registerTestOrder();
    await adminClient().rpc("claim_payment", { p_toss_order_id: busy.tossOrderId });
    const paid = await registerTestOrder();
    await confirmPayment({ store: store(), toss: fakeToss().client }, SEED.fanId, { orderId: paid.tossOrderId, amount: "6900", paymentKey: "pk_paid2" });
    const closed = await registerTestOrder();
    backdate(closed.orderId, 25);
    await runExpiry(closed.orderNo);
    for (const o of [busy, paid, closed]) expect(await unpaidOf("byeolbit_fan", o.orderNo)).toHaveLength(0);
  });

  it("INV-J1 (결제 미완료, 실패경로): 남의 주문 — 달토끼로 읽으면 별빛의 결제 미완료가 없다. 직원은 0줄", async () => {
    const o = await registerTestOrder();
    expect(await unpaidOf("byeolbit_fan", o.orderNo)).toHaveLength(1);
    expect(await unpaidOf("daltokki_fan", o.orderNo)).toHaveLength(0);
    expect(await readActionItems(await signedInClient("fankkuk_staff"))).toEqual([]);
  });

  it("INV-J2 · INV-J13 (결제 미완료): 같은 읽기 한 번에서 사이드바 숫자 = 지금 할 일 줄 수, 상세 칸은 그 주문의 줄 — 결제 미완료 하나가 셋 모두에 같이 든다", async () => {
    const client = await signedInClient("byeolbit_fan");
    const before = await readActionItems(client);
    const o = await registerTestOrder();
    const items = await readActionItems(client);
    const header = await readSiteHeader(client, { userId: SEED.fanId, role: "fan", nickname: "별빛" }, "/me/actions", items);
    expect(items).toHaveLength(before.length + 1);
    expect(header.role === "fan" ? header.actionCount : -1).toBe(items.length);
    expect(actionItemsOfOrder(items, o.orderNo).map((it) => it.kind)).toEqual(["unpaid"]);
    // 결제를 마치면 다음 읽기에서 줄이 없고 숫자도 같이 준다
    await confirmPayment({ store: store(), toss: fakeToss().client }, SEED.fanId, { orderId: o.tossOrderId, amount: "6900", paymentKey: "pk_j2" });
    const after = await readActionItems(client);
    expect(after).toHaveLength(before.length);
    expect(actionItemsOfOrder(after, o.orderNo)).toEqual([]);
  });
});

describe("INV-M22 ⑤ · INV-J5·J6: 크리에이터 계정이 보낸 결제 대기 주문도 결제를 마치지 않은 선물 줄과 이어 하기가 있다", () => {
  const HARU = SEED.creatorProfileId;
  const MOMO_CREATOR = "00000000-0000-4000-b000-000000000002";
  const creatorUnpaid = async (loginId: string, orderNo: string) =>
    (await readCreatorActionItems(await signedInClient(loginId))).filter((it) => it.kind === "unpaid" && it.orderNo === orderNo);

  it("INV-M22 ⑤ · INV-J5: 하루(크리에이터)가 모모에게 보낸 결제 대기 주문 → 하루의 지금 할 일에 줄 1(보낸 선물 판), 이어 하기도 된다", async () => {
    const o = await registerTestOrder(1, { senderId: HARU, creatorId: MOMO_CREATOR });
    const rows = await creatorUnpaid("haru_creator", o.orderNo);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "unpaid", amountKrw: 6900 });
    const r = await resumeAs("haru_creator", o.orderNo);
    expect(r.status).toBe(200);
    expect((r.body as { amountKrw: number }).amountKrw).toBe(6900);
  });

  it("INV-M22 ⑤ (실패경로): 남의 주문 — 별빛이 보낸 결제 대기 주문은 하루(받는 크리에이터)의 지금 할 일에 없다. 하루 것은 모모·별빛에게 없다", async () => {
    const fanOrder = await registerTestOrder();
    expect(await creatorUnpaid("haru_creator", fanOrder.orderNo)).toHaveLength(0);
    expect((await resumeAs("haru_creator", fanOrder.orderNo)).status).toBe(404);
    const haruOrder = await registerTestOrder(1, { senderId: HARU, creatorId: MOMO_CREATOR });
    expect(await creatorUnpaid("momo_creator", haruOrder.orderNo)).toHaveLength(0);
    expect((await readActionItems(await signedInClient("byeolbit_fan"))).some((it) => it.orderNo === haruOrder.orderNo)).toBe(false);
  });

  it("INV-J6 · INV-J13: 같은 읽기 한 번에서 크리에이터 사이드바 숫자 = 지금 할 일 줄 수, 상세 칸은 그 주문의 줄 하나 — 결제하면 셋이 같이 준다", async () => {
    const client = await signedInClient("haru_creator");
    const before = await readCreatorActionItems(client);
    const o = await registerTestOrder(1, { senderId: HARU, creatorId: MOMO_CREATOR });
    const items = await readCreatorActionItems(client);
    const header = await readSiteHeader(client, { userId: HARU, role: "creator", nickname: "하루" }, "/gifts", items);
    expect(items).toHaveLength(before.length + 1);
    expect(header.role === "creator" ? header.actionCount : -1).toBe(items.length);
    expect(items.filter((it) => it.orderNo === o.orderNo).map((it) => it.kind)).toEqual(["unpaid"]);
    await confirmPayment({ store: store(), toss: fakeToss().client }, HARU, { orderId: o.tossOrderId, amount: "6900", paymentKey: "pk_haru" });
    const after = await readCreatorActionItems(client);
    expect(after).toHaveLength(before.length);
    expect(after.filter((it) => it.orderNo === o.orderNo)).toEqual([]);
  });
});

describe("INV-M22 ④ · INV-M15: 결제 확정 시작은 처음 결제 대기 + 24시간 전에만 — 닫기 처리가 돌기 전이라도", () => {
  it("INV-M22 ④ · INV-M15 (실패경로): 23시간 59분에 이어 하기 → 24시간 1분에 성공 주소 → 승인 API 호출 없음, 주문 등록 없음, 실패로 안내", async () => {
    const o = await registerTestOrder();
    backdate(o.orderId, 23 + 59 / 60);
    const b = (await resumeAs("byeolbit_fan", o.orderNo)).body as { orderId: string };
    backdate(o.orderId, 24 + 1 / 60);
    const toss = fakeToss();
    const out = await confirmPayment({ store: store(), toss: toss.client }, SEED.fanId, { orderId: b.orderId, amount: "6900", paymentKey: "pk_late" });
    // 성공 주소 라우트는 in_progress 가 아니면 「결제 실패」로 보낸다
    expect(out).toEqual({ ok: false, reason: "not_approved" });
    expect(toss.calls).toEqual([]);
    expect(psql(`select status from public.orders where id = '${o.orderId}'`)).toBe("pending_payment");
    expect(psql(`select count(*) from public.approval_requests where order_id = '${o.orderId}'`)).toBe("0");
    expect(psql(`select status from public.payments where order_id = '${o.orderId}'`)).not.toBe("confirming");
  });

  it("INV-M22 ④ · INV-M15: 23시간 59분 된 결제 대기의 성공 주소 → 정상 완료(승인 API 한 번, 주문 등록)", async () => {
    const o = await registerTestOrder();
    backdate(o.orderId, 23 + 59 / 60);
    const toss = fakeToss();
    const out = await confirmPayment({ store: store(), toss: toss.client }, SEED.fanId, { orderId: o.tossOrderId, amount: "6900", paymentKey: "pk_ontime" });
    expect(out.ok).toBe(true);
    expect(toss.calls).toHaveLength(1);
    expect(psql(`select status from public.orders where id = '${o.orderId}'`)).toBe("registered");
  });
});
