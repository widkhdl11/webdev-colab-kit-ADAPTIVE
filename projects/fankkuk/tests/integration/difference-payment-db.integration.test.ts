import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseDifferenceStore } from "@/features/difference-pay/api/supabase-difference-store";
import { confirmDifferencePayment } from "@/features/difference-pay/model/confirm-difference";
import { createTossPaymentsClient } from "@/shared/api/toss-payments/client";
import { code, differenceRow, differenceToss, labeled, measure, paidOrder, prepare } from "./difference-helpers";
import { adminClient, approveRpc, deleteTestOrders, psql, psqlError, SEED, signedInClient } from "./helpers";
import { FAN_PASS, finishPrint, inspect, parcelState, waybill } from "./office-helpers";

// 차액 결제 (payment INV-M2·M3·M5·M7·M8·M11·M12·M13, admin-console INV-K1).
// 운영자가 검수 때 실측 구간을 기록하면 DB 가 차액 요청(결제 대기)을 만든다 → 팬이 선물 상세에서 차액을 결제한다(토스 승인 API 만 가짜)
// → 차액이 끝나야 송장이 나간다 → 7일 미납이면 그 주문은 반송 대상, 환불은 상품 대금 칸만(선불 반송 — 2026-10-08 정책 ③).
// 시드 주문은 건드리지 않는다 — 시험마다 새 주문(물건 이름 「시험 선물」)을 만들고 끝나면 지운다.

/** 가짜 토스 승인 API. totalAmount 를 주면 요청 금액 대신 그 금액을 돌려준다(위조·오류 응답). 받은 멱등 키 헤더도 남긴다. */
function fakeToss(status = "DONE", totalAmount?: number) {
  const calls: { orderId: string; amount: number }[] = [];
  const idempotencyKeys: (string | null)[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { orderId: string; amount: number };
    calls.push(body);
    idempotencyKeys.push(new Headers(init.headers).get("Idempotency-Key"));
    return new Response(JSON.stringify({ status, orderId: body.orderId, totalAmount: totalAmount ?? body.amount }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, idempotencyKeys, client: createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "test" }, fetchImpl }) };
}

async function payDifference(boxId: string, toss = fakeToss()) {
  const prepared = await prepare(boxId);
  if (prepared.error) throw new Error(`prepare 실패: ${prepared.error.code}`);
  const row = (prepared.data as { toss_order_id: string; amount_krw: number }[])[0]!;
  const out = await confirmDifferencePayment({ store: createSupabaseDifferenceStore(adminClient()), toss: toss.client }, SEED.fanId, {
    orderId: row.toss_order_id,
    amount: String(row.amount_krw),
    paymentKey: `pk_${row.toss_order_id}`,
  });
  return { out, row, toss };
}

beforeAll(() => deleteTestOrders());
afterAll(() => deleteTestOrders());

describe("INV-M11: 차액은 서버가 상자마다 실측 − 신고로 계산하고, 상자당 하나다", () => {
  it("INV-M11 S11 · INV-M7: 소형 신고 → 실측 중형이면 차액 2,000원, 칸마다 차(서비스료 500 · 검수비 500 · 배송비 1,000)", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    const r = await measure(qr, "medium");
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ result: "difference", amount_krw: 2000 });
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
    expect(psql(`select measured_tier from public.boxes where id = '${g.boxIds[0]}'`)).toBe("medium");
  });

  it("INV-M11 S11b (실패경로): 중형 신고 → 실측 소형이면 차액 요청도 환불도 없다", async () => {
    const g = await paidOrder(["medium"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "small")).data).toEqual({ result: "none" });
    expect((await measure(qr, "small")).error?.code).toBe("55000");
    expect(differenceRow(g.orderId)).toBe("");
  });

  it("INV-M11 (실패경로): 같은 구간이면 차액이 없고, 실측은 상자마다 한 번이라 두 번째 기록은 거부된다(차액 요청 1건)", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "large")).data).toEqual({ result: "difference", amount_krw: 4000 });
    expect((await measure(qr, "medium")).error?.code).toBe("55000");
    expect(differenceRow(g.orderId)).toBe("4000/0/500/1000/2500/pending");
    const same = await paidOrder(["medium"]);
    expect((await measure(await labeled(same.boxIds[0]!), "medium")).data).toEqual({ result: "none" });
    expect(differenceRow(same.orderId)).toBe("");
  });

  it("INV-M11 S11c (실패경로): 실측이 대형을 넘으면 차액이 아니라 검수 불합격 — 통과로 기록해도 반송 대기로 간다", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "oversize")).data).toEqual({ result: "inspection_failed" });
    expect(differenceRow(g.orderId)).toBe("");
    expect(await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS)).toBe("return_waiting");
  });

  it("INV-M11 (실패경로): 입고 전·검수가 끝난 상자에는 실측을 기록할 수 없다, 모르는 구간은 거부", async () => {
    const g = await paidOrder(["small", "small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "huge")).error?.code).toBe("22023");
    await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS);
    expect((await measure(qr, "medium")).error?.code).toBe("55000");
    expect(differenceRow(g.orderId)).toBe("");
  });

  it("INV-K1 (실패경로): 팬·크리에이터는 실측을 기록할 수 없고 아무것도 바뀌지 않는다", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    for (const who of ["byeolbit_fan", "haru_creator"]) expect((await measure(qr, "medium", who)).error?.code).toBe("42501");
    expect(differenceRow(g.orderId)).toBe("");
    expect(psql(`select coalesce(measured_tier::text, 'none') from public.boxes where id = '${g.boxIds[0]}'`)).toBe("none");
  });

  it("INV-M11 · INV-M7: 중형 신고 → 실측 대형이면 차액 2,000원, 칸마다 차(서비스료 0 · 검수비 500 · 배송비 1,500)", async () => {
    const g = await paidOrder(["medium"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "large")).data).toEqual({ result: "difference", amount_krw: 2000 });
    expect(differenceRow(g.orderId)).toBe("2000/0/0/500/1500/pending");
  });

  it("INV-M11 (실패경로): 같은 상자에 차액 줄을 직접 두 번 넣어도 DB 가 두 번째를 거부한다(상자당 차액 하나)", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "medium");
    const err = psqlError(
      `insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw) values ('${g.orderId}', 'difference', '${g.boxIds[0]}', 'diff_dup_${code(8).toLowerCase()}', 2000, 0, 500, 500, 1000)`,
    );
    expect(err).toMatch(/payments_one_difference_per_box/);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });
});

/** 그 주문의 차액 결제 요청 알림 줄(이메일 통로)의 받는 계정 ID 들. */
function differenceAlerts(orderId: string): string[] {
  const out = psql(
    `select coalesce(string_agg(account_id::text, ',' order by account_id), '') from public.notification_outbox where order_id = '${orderId}' and kind = 'difference_due' and channel = 'email'`,
  );
  return out ? out.split(",") : [];
}

describe("notifications INV-N18: 차액 결제 요청이 생기면 보낸 팬에게 상자마다 알림 한 번", () => {
  it("INV-N18 S18: 소형 신고 → 실측 중형이면 차액 줄과 함께 별빛에게만 알림 줄 하나(크리에이터에게는 없음)", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "medium")).data).toEqual({ result: "difference", amount_krw: 2000 });
    expect(differenceAlerts(g.orderId)).toEqual([SEED.fanId]);
    expect(psql(`select count(*) from public.notification_outbox where order_id = '${g.orderId}' and kind = 'difference_due' and account_id <> '${SEED.fanId}'`)).toBe("0");
  });

  it("INV-N18 S18b (실패경로): 실측이 신고와 같거나 작으면 · 대형을 넘어 검수 불합격이면 알림이 없다", async () => {
    const same = await paidOrder(["small"]);
    expect((await measure(await labeled(same.boxIds[0]!), "small")).data).toEqual({ result: "none" });
    const smaller = await paidOrder(["medium"]);
    expect((await measure(await labeled(smaller.boxIds[0]!), "small")).data).toEqual({ result: "none" });
    const over = await paidOrder(["small"]);
    expect((await measure(await labeled(over.boxIds[0]!), "oversize")).data).toEqual({ result: "inspection_failed" });
    for (const g of [same, smaller, over]) expect(differenceAlerts(g.orderId)).toEqual([]);
  });

  it("INV-N18 S18b (실패경로): 하루가 거절한 주문의 상자는 크게 실측돼도 차액도 알림도 없다", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false })).error).toBeNull();
    expect((await measure(qr, "medium")).data).toEqual({ result: "none" });
    expect(differenceRow(g.orderId)).toBe("");
    expect(differenceAlerts(g.orderId)).toEqual([]);
  });

  it("INV-N18 S18b: 상자 둘이 모두 크게 실측되면 상자마다 한 줄씩 두 줄", async () => {
    const g = await paidOrder(["small", "small"]);
    for (const boxId of g.boxIds) expect((await measure(await labeled(boxId), "medium")).data).toEqual({ result: "difference", amount_krw: 2000 });
    expect(differenceAlerts(g.orderId)).toEqual([SEED.fanId, SEED.fanId]);
  });
});

describe("차액 결제 — 첫 결제와 같은 대조·한 번만 확정 (INV-M2·M3·M5)", () => {
  async function withDifference() {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "medium");
    return { g, qr };
  }

  it("INV-M3 S3: 팬이 차액을 결제하면 승인 API 응답이 DONE·금액 일치일 때 완료로 기록된다", async () => {
    const { g } = await withDifference();
    const { out, toss } = await payDifference(g.boxIds[0]!);
    expect(out).toEqual({ ok: true, orderNo: g.orderNo });
    expect(toss.calls).toEqual([expect.objectContaining({ orderId: differenceToss(g.orderId), amount: 2000 })]);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/done");
  });

  it("INV-M3 S3b (실패경로): 승인 응답이 ABORTED 면 완료가 아니고, 팬은 새 결제 번호로 다시 결제할 수 있다", async () => {
    const { g } = await withDifference();
    const first = await payDifference(g.boxIds[0]!, fakeToss("ABORTED"));
    expect(first.out).toEqual({ ok: false, reason: "not_approved" });
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/failed");
    const again = await payDifference(g.boxIds[0]!);
    expect(again.out.ok).toBe(true);
    expect(again.row.toss_order_id).not.toBe(first.row.toss_order_id);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/done");
  });

  it("INV-M2 S2 (실패경로): 성공 주소의 금액이 다르면 승인 API 를 부르지 않고 실패로 닫는다", async () => {
    const { g } = await withDifference();
    const row = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string }[])[0]!;
    const toss = fakeToss();
    const out = await confirmDifferencePayment({ store: createSupabaseDifferenceStore(adminClient()), toss: toss.client }, SEED.fanId, {
      orderId: row.toss_order_id,
      amount: "100",
      paymentKey: "pk_x",
    });
    expect(out).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(toss.calls).toHaveLength(0);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/failed");
  });

  it("INV-M5 S5b (동시): 같은 차액의 승인 처리 두 개가 동시에 와도 승인 API 는 한 번, 완료 기록은 하나", async () => {
    const { g } = await withDifference();
    const row = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string; amount_krw: number }[])[0]!;
    const toss = fakeToss();
    const deps = { store: createSupabaseDifferenceStore(adminClient()), toss: toss.client };
    const ret = { orderId: row.toss_order_id, amount: String(row.amount_krw), paymentKey: "pk_same" };
    await Promise.all([confirmDifferencePayment(deps, SEED.fanId, ret), confirmDifferencePayment(deps, SEED.fanId, ret)]);
    expect(toss.calls).toHaveLength(1);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/done");
    // 새로고침 — 승인 API 를 다시 부르지 않고 처음 결과
    expect(await confirmDifferencePayment(deps, SEED.fanId, ret)).toEqual({ ok: true, orderNo: g.orderNo });
    expect(toss.calls).toHaveLength(1);
  });

  it("INV-M5 (동시): 승인 권리는 두 요청이 동시에 와도 하나만 얻는다", async () => {
    const { g } = await withDifference();
    const toss = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string }[])[0]!.toss_order_id;
    const claims = await Promise.all([
      adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss }),
      adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss }),
    ]);
    expect(claims.map((c) => c.data).sort()).toEqual([false, true]);
  });

  it("INV-L3 (실패경로): 다른 팬은 남의 차액을 결제 준비·승인할 수 없다", async () => {
    const { g } = await withDifference();
    expect((await prepare(g.boxIds[0]!, "daltokki_fan")).error?.code).toBe("P0002");
    const toss = fakeToss();
    const out = await confirmDifferencePayment({ store: createSupabaseDifferenceStore(adminClient()), toss: toss.client }, SEED.otherFanId, {
      orderId: differenceToss(g.orderId),
      amount: "2000",
      paymentKey: "pk_x",
    });
    expect(out).toEqual({ ok: false, reason: "no_pending_payment" });
    expect(toss.calls).toHaveLength(0);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });

  it("INV-M3 (실패경로): 승인 응답이 DONE 이어도 금액(totalAmount)이 다르면 완료가 아니다", async () => {
    const { g } = await withDifference();
    const { out, toss } = await payDifference(g.boxIds[0]!, fakeToss("DONE", 100));
    expect(toss.calls).toHaveLength(1);
    expect(out).toEqual({ ok: false, reason: "not_approved" });
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/failed");
  });

  it("INV-M5: 차액 승인 API 호출에는 그 결제 번호로 만든 멱등 키 헤더가 붙는다", async () => {
    const { g } = await withDifference();
    const { out, toss, row } = await payDifference(g.boxIds[0]!);
    expect(out.ok).toBe(true);
    expect(toss.idempotencyKeys).toEqual([`confirm-${row.toss_order_id}`]);
  });

  it("INV-L3 (실패경로): 운영자도 팬의 차액을 결제 준비할 수 없다(없는 것과 같은 답)", async () => {
    const { g } = await withDifference();
    for (const who of ["fankkuk_admin", "fankkuk_staff", "haru_creator"]) expect((await prepare(g.boxIds[0]!, who)).error?.code).toBe("P0002");
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });

  it("보안 (실패경로): 결제창을 연 사이 운영자가 반송을 기록하면 그 차액은 승인되지 않는다(결제 API 를 부르지 않음)", async () => {
    const { g, qr } = await withDifference();
    const row = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string; amount_krw: number }[])[0]!;
    // 팬이 결제창에 있는 동안 운영자가 검수에서 반송으로 기록한다
    expect(await inspect(await signedInClient("fankkuk_staff"), qr, { ...FAN_PASS, outcome: "return" })).toBe(
      "return_waiting",
    );
    const toss = fakeToss();
    const out = await confirmDifferencePayment({ store: createSupabaseDifferenceStore(adminClient()), toss: toss.client }, SEED.fanId, {
      orderId: row.toss_order_id,
      amount: String(row.amount_krw),
      paymentKey: "pk_after_return",
    });
    expect(out.ok).toBe(false);
    expect(toss.calls).toHaveLength(0);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });

  it("보안 (실패경로): 보관(held)으로 간 상자의 차액도 승인 권리를 얻지 못한다", async () => {
    const { g, qr } = await withDifference();
    const toss = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string }[])[0]!.toss_order_id;
    expect(await inspect(await signedInClient("fankkuk_staff"), qr, { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" })).toBe("held");
    expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss })).data).toBe(false);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });
});

describe("INV-M12: 차액 결제가 끝나기 전에는 송장을 출력하지 않는다", () => {
  it("INV-M12 S12: 실측으로 생긴 미납 차액이 있으면 송장 출력·주소 열기가 거부되고, 차액을 내면 출력된다", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "medium");
    const staff = await signedInClient("fankkuk_staff");
    expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
    expect((await approveRpc(g.requestId)).data).toBe("approved");
    expect(finishPrint(qr, waybill())).toBe("P0041");
    const claim = psql(`set role address_decryptor; select public.invoice_claim_print('${qr}', '00000000-0000-4000-a000-000000000021')::text;`);
    expect(JSON.parse(claim.split(/\r?\n/).pop() ?? "")).toEqual({ result: "denied", reason: "difference_unpaid" });

    expect((await payDifference(g.boxIds[0]!)).out.ok).toBe(true);
    expect(finishPrint(qr, waybill())).toBeNull();
  });

  it("INV-M12 (실패경로): 실패로 끝난 차액·결제 확인 중인 차액이 있어도 송장 출력은 거부된다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    for (const status of ["failed", "confirming"] as const) {
      const g = await paidOrder(["small"]);
      const qr = await labeled(g.boxIds[0]!);
      await measure(qr, "medium");
      expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
      expect((await approveRpc(g.requestId)).data).toBe("approved");
      const toss = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string }[])[0]!.toss_order_id;
      if (status === "confirming") expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss })).data).toBe(true);
      else expect((await adminClient().rpc("settle_difference_payment", { p_toss_order_id: toss, p_status: "failed", p_payment_key: null })).data).toBe(true);
      expect(differenceRow(g.orderId)).toBe(`2000/0/500/500/1000/${status}`);
      // 출고 화면 안내도 승인 대기가 아니라 차액 대기 — 결제 중·실패도 「아직 안 끝난 차액」이다
      expect(((await staff.rpc("office_parcel_by_qr", { p_qr: qr })).data as { next_step: string }[])[0]?.next_step).toBe("wait_difference");
      expect(finishPrint(qr, waybill())).toBe("P0041");
      expect(parcelState(qr)).toBe("inspected");
    }
  });
});

describe("출고 화면 안내: 승인은 끝났고 차액만 미납이면 「차액 결제 대기」(BACKLOG 2026-10-06)", () => {
  it("같은 상자의 다음 할 일이 승인 전 wait_approval → 승인 뒤 wait_difference → 차액을 내면 print_label", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "medium");
    const staff = await signedInClient("fankkuk_staff");
    expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
    const nextStep = async () => ((await staff.rpc("office_parcel_by_qr", { p_qr: qr })).data as { next_step: string }[])[0]?.next_step;

    expect(await nextStep()).toBe("wait_approval");
    expect((await approveRpc(g.requestId)).data).toBe("approved");
    expect(await nextStep()).toBe("wait_difference");
    expect((await payDifference(g.boxIds[0]!)).out.ok).toBe(true);
    expect(await nextStep()).toBe("print_label");
  });

  it("(실패경로) 차액 기한(요청 + 168시간)이 지났는데 7일 처리 전이면 wait_expiry — 더 낼 수 없는 차액을 기다리라고 하지 않는다", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "medium");
    const staff = await signedInClient("fankkuk_staff");
    expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
    expect((await approveRpc(g.requestId)).data).toBe("approved");
    const nextStep = async () => ((await staff.rpc("office_parcel_by_qr", { p_qr: qr })).data as { next_step: string }[])[0]?.next_step;
    psql(`update public.payments set created_at = now() - interval '167 hours' where order_id = '${g.orderId}' and kind = 'difference'`);
    expect(await nextStep()).toBe("wait_difference");
    psql(`update public.payments set created_at = now() - interval '168 hours 1 minute' where order_id = '${g.orderId}' and kind = 'difference'`);
    expect(await nextStep()).toBe("wait_expiry");
  });

  it("(실패경로) 차액이 없는 상자는 승인 뒤 바로 print_label — wait_difference 로 새지 않는다", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "small");
    const staff = await signedInClient("fankkuk_staff");
    expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
    expect((await approveRpc(g.requestId)).data).toBe("approved");
    expect(((await staff.rpc("office_parcel_by_qr", { p_qr: qr })).data as { next_step: string }[])[0]?.next_step).toBe("print_label");
  });
});

describe("INV-M13 · INV-M8: 차액 요청 뒤 7일 미납이면 반송 대상, 환불은 상품 대금 칸만", () => {
  async function inspectedWithDifference() {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "medium");
    await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS);
    return { g, qr };
  }
  const backdate = (orderId: string, interval: string) =>
    psql(`update public.payments set created_at = now() - interval '${interval}' where order_id = '${orderId}' and kind = 'difference'`);
  const refundDue = (orderId: string) =>
    psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${orderId}' and p.kind = 'initial'`);

  it("INV-M13 S13: 168시간 지난 미납 차액은 운영자의 7일 처리에서 반송 대기로 — 167시간이면 아직 아니다", async () => {
    const { g, qr } = await inspectedWithDifference();
    const staff = await signedInClient("fankkuk_staff");
    backdate(g.orderId, "167 hours");
    expect(((await staff.rpc("office_run_expiry", { p_order_no: g.orderNo })).data as { differences: number }).differences).toBe(0);
    expect(parcelState(qr)).toBe("inspected");
    backdate(g.orderId, "168 hours");
    expect(((await staff.rpc("office_run_expiry", { p_order_no: g.orderNo })).data as { differences: number }).differences).toBe(1);
    expect(parcelState(qr)).toBe("return_waiting");
    // 두 번 돌려도 다시 처리하지 않는다
    expect(((await staff.rpc("office_run_expiry", { p_order_no: g.orderNo })).data as { differences: number }).differences).toBe(0);
  });

  it("INV-M13 (실패경로): 기한이 지난 차액은 7일 처리 전이라도 결제를 준비·승인할 수 없다", async () => {
    const { g } = await inspectedWithDifference();
    const row = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string }[])[0]!;
    backdate(g.orderId, "168 hours");
    expect((await prepare(g.boxIds[0]!)).error?.code).toBe("P0022");
    expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: row.toss_order_id })).data).toBe(false);
    expect(differenceRow(g.orderId)).toBe("2000/0/500/500/1000/pending");
  });

  it("INV-M13 (동시): 결제 승인 권리와 7일 처리가 겹쳐도 둘 중 하나만 — 결제 중인 차액은 반송되지 않는다", async () => {
    for (let i = 0; i < 4; i += 1) {
      const { g, qr } = await inspectedWithDifference();
      const toss = differenceToss(g.orderId);
      psql(`update public.payments set created_at = now() - interval '168 hours' + interval '300 milliseconds' where toss_order_id = '${toss}'`);
      const staff = await signedInClient("fankkuk_staff");
      await new Promise((r) => setTimeout(r, 250));
      const [claimed] = await Promise.all([
        adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss }),
        staff.rpc("office_run_expiry", { p_order_no: g.orderNo }),
      ]);
      const row = psql(`select status || '/' || (expired_at is not null) from public.payments where toss_order_id = '${toss}'`);
      if (claimed.data === true) {
        expect(row).toBe("confirming/false");
        expect(parcelState(qr)).toBe("inspected");
      } else {
        // 승인 권리를 못 얻었으면 기한이 지난 것이다 — 7일 처리가 먼저 했으면 반송 대기, 아직이면 그대로(다음 처리에서 반송)
        expect(["pending/true", "pending/false"]).toContain(row);
        expect(parcelState(qr)).toBe(row === "pending/true" ? "return_waiting" : "inspected");
      }
      expect(row).not.toBe("confirming/true");
    }
  });

  it("INV-M13 (실패경로): 승인 권리를 얻은(결제 중인) 차액은 그 뒤 기한이 지나도 7일 처리가 닫지 않는다", async () => {
    const { g, qr } = await inspectedWithDifference();
    const toss = ((await prepare(g.boxIds[0]!)).data as { toss_order_id: string }[])[0]!.toss_order_id;
    expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss })).data).toBe(true);
    backdate(g.orderId, "169 hours");
    await (await signedInClient("fankkuk_staff")).rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(psql(`select status || '/' || (expired_at is not null) from public.payments where toss_order_id = '${toss}'`)).toBe("confirming/false");
    expect(parcelState(qr)).toBe("inspected");
  });

  it("INV-M8 S8: 차액 미납 반송의 환불은 첫 결제의 상품 대금 칸만 — 배송비 칸은 선불 반송에 쓰인다, 반송 전에는 환불 대상이 아니다", async () => {
    const { g } = await inspectedWithDifference();
    expect(refundDue(g.orderId)).toBe("none");
    backdate(g.orderId, "168 hours");
    await (await signedInClient("fankkuk_staff")).rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(refundDue(g.orderId)).toBe(psql(`select goods_krw from public.payments where order_id = '${g.orderId}' and kind = 'initial'`));
    expect(refundDue(g.orderId)).not.toBe(psql(`select shipping_fee_krw from public.payments where order_id = '${g.orderId}' and kind = 'initial'`));
    // 내지 않은 차액 결제 자체는 환불할 것이 없다
    expect(psql(`select coalesce(public.refund_due_of_payment(p.id)::text, 'none') from public.payments p where p.order_id = '${g.orderId}' and p.kind = 'difference'`)).toBe(
      "none",
    );
  });

  it("INV-M8 (실패경로): 실측 대형 초과(검수 불합격)는 차액 미납이 아니라 상품 대금 칸만이다", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "oversize");
    await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS);
    expect(refundDue(g.orderId)).toBe("0");
  });

  it("INV-M8 (실패경로): 한 주문에 검수 불합격 상자와 미납 차액이 같이 있으면 팬의 위반 갈래(상품 대금 칸만)를 따른다", async () => {
    const g = await paidOrder(["small", "small"]);
    const staff = await signedInClient("fankkuk_staff");
    const first = await labeled(g.boxIds[0]!);
    await measure(first, "oversize");
    await inspect(staff, first, FAN_PASS);
    const second = await labeled(g.boxIds[1]!);
    await measure(second, "medium");
    await inspect(staff, second, FAN_PASS);
    backdate(g.orderId, "168 hours");
    await staff.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(parcelState(second)).toBe("return_waiting");
    expect(refundDue(g.orderId)).toBe("0");
  });
});
