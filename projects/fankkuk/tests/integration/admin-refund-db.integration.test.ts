import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, payTestOrder, psql, psqlError, registerTestOrder, signedInClient } from "./helpers";
import { deleteTestRevgifts, followHaru, payTestRevgift, PROFILE, registerTestRevgift, shareReply, unfollowHaru } from "./revgift-helpers";

// 환불 DB (admin-console INV-K2·K7·K8, payment INV-M8·M9, reverse-gift INV-R11).
// 잡기(admin_claim_refund) = 대표 로그인 토큰으로 금액을 정하고 기록을 「처리 중」으로 잡는다.
// 결과(settle_refund) = 앱 서버 키로 완료·실패를 남긴다. 결제사 호출 자체는 앱 시험이 본다.
// 팬 선물의 거절·반려·취소·검수 불합격은 아직 그 상태로 가는 길이 없어 상태를 직접 만든다.

const ADDED_FOLLOWERS = [PROFILE.gureumppang, PROFILE.somsatang];

beforeAll(() => {
  followHaru(ADDED_FOLLOWERS);
});

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
});

afterAll(() => {
  unfollowHaru(ADDED_FOLLOWERS);
});

type Claim = { refund_id: string; payment_key: string; amount_krw: number };

async function claimAs(loginId: string, kind: "gift" | "revgift", unitId: string) {
  const client = await signedInClient(loginId);
  const { data, error } = await client.rpc("admin_claim_refund", { p_kind: kind, p_unit_id: unitId });
  const rows = (data ?? []) as Claim[];
  return { claim: rows[0] ?? null, code: error?.code ?? null };
}

const asOwner = (kind: "gift" | "revgift", unitId: string) => claimAs("fankkuk_admin", kind, unitId);

/** 결제를 끝낸 소형 주문 하나. 돌려주는 값: 그 첫 결제의 ID. */
async function paidGift(): Promise<{ paymentId: string; orderId: string }> {
  const o = await registerTestOrder();
  await payTestOrder(o);
  const paymentId = psql(`select id from public.payments where toss_order_id = '${o.tossOrderId}'`);
  return { paymentId, orderId: o.orderId };
}

function setOrder(orderId: string, sql: string): void {
  psql(`update public.orders set ${sql} where id = '${orderId}'`);
}

/** 상품 대금 칸이 있는 결제로 바꾼다(네 칸 합 = 결제 금액은 그대로 지킨다). */
function addGoods(paymentId: string, goods: number): void {
  psql(`update public.payments set goods_krw = ${goods}, amount_krw = amount_krw + ${goods} where id = '${paymentId}'`);
}

function shareId(orderNo: string): string {
  return psql(`select id from public.revgift_shares where order_no = '${orderNo}'`);
}

function refundRow(id: string): string {
  return psql(`select status || '/' || amount_krw || '/' || attempts from public.refunds where id = '${id}'`);
}

function refundCount(where: string): string {
  return psql(`select count(*) from public.refunds where ${where}`);
}

async function settle(refundId: string, ok: boolean, error: string | null = null) {
  return adminClient().rpc("settle_refund", { p_refund_id: refundId, p_ok: ok, p_error: error });
}

describe("INV-M8 · INV-K7: 금액은 DB 가 주문 상태로 정한다 — 팬 선물", () => {
  it("INV-K7 S7: 입고 전 거절된 주문을 대표가 환불하면 전액, 기록 하나가 「처리 중」", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const { claim, code } = await asOwner("gift", g.paymentId);
    expect(code).toBeNull();
    expect(claim?.amount_krw).toBe(6900);
    expect(claim?.payment_key).toMatch(/^pk_pay_test_/);
    expect(refundRow(claim!.refund_id)).toBe("requesting/6900/1");
  });

  it("INV-M8: 입고 전 7일 자동 반려·팬 취소도 전액", async () => {
    for (const status of ["expired", "canceled"]) {
      const g = await paidGift();
      setOrder(g.orderId, `status = '${status}'`);
      expect((await asOwner("gift", g.paymentId)).claim?.amount_krw).toBe(6900);
    }
  });

  it("INV-M8: 입고 뒤 거절은 반송 택배비(배송비 칸)를 뺀 금액", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected', received_at = now()");
    expect((await asOwner("gift", g.paymentId)).claim?.amount_krw).toBe(6900 - 4000);
  });

  it("INV-M8: 입고 뒤 검수 불합격 반송은 상품 대금 칸만", async () => {
    const g = await paidGift();
    addGoods(g.paymentId, 25000);
    setOrder(g.orderId, "status = 'rejected', received_at = now(), inspection_result = 'returned', inspected_at = now()");
    expect((await asOwner("gift", g.paymentId)).claim?.amount_krw).toBe(25000);
  });

  it("INV-M8 (실패경로): 출고 시각이 있으면 상태가 거절·검수 불합격이어도 환불하지 않는다", async () => {
    const rejected = await paidGift();
    setOrder(rejected.orderId, "status = 'rejected', received_at = now(), shipped_at = now()");
    expect((await asOwner("gift", rejected.paymentId)).code).toBe("P0022");
    const returned = await paidGift();
    addGoods(returned.paymentId, 25000);
    setOrder(returned.orderId, "status = 'rejected', received_at = now(), inspection_result = 'returned', inspected_at = now(), shipped_at = now()");
    expect((await asOwner("gift", returned.paymentId)).code).toBe("P0022");
  });

  it("INV-M8: 입고 뒤 팬 취소는 배송비 칸만", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'canceled', received_at = now()");
    expect((await asOwner("gift", g.paymentId)).claim?.amount_krw).toBe(4000);
  });

  it("INV-M8 (실패경로): 출고된 주문은 환불하지 않는다 — 거부, 기록 없음", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'shipped', received_at = now(), shipped_at = now()");
    expect((await asOwner("gift", g.paymentId)).code).toBe("P0022");
    expect(refundCount(`payment_id = '${g.paymentId}'`)).toBe("0");
  });

  it("INV-M8 (실패경로): 진행 중인 주문(거절·반려·취소가 아님)은 환불하지 않는다", async () => {
    const g = await paidGift();
    expect((await asOwner("gift", g.paymentId)).code).toBe("P0022");
  });

  it("INV-M8 (실패경로): 돌려줄 금액이 0 원이면 기록을 만들지 않는다(검수 불합격인데 상품 대금 칸이 0)", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected', received_at = now(), inspection_result = 'returned', inspected_at = now()");
    expect((await asOwner("gift", g.paymentId)).code).toBe("P0022");
    expect(refundCount(`payment_id = '${g.paymentId}'`)).toBe("0");
  });

  it("INV-M8 (실패경로): 결제가 끝나지 않은 결제는 환불하지 않는다", async () => {
    const o = await registerTestOrder();
    const paymentId = psql(`select id from public.payments where toss_order_id = '${o.tossOrderId}'`);
    setOrder(o.orderId, "status = 'canceled', registered_at = now()");
    expect((await asOwner("gift", paymentId)).code).toBe("P0022");
  });

  it("없는 결제 ID 는 P0002", async () => {
    expect((await asOwner("gift", "00000000-0000-4000-a000-0000000000ff")).code).toBe("P0002");
  });
});

describe("INV-R11: 역조공은 몫마다 따로", () => {
  it("INV-R11 S11: 셋 중 중형 몫이 입고 전 받지 않음이면 6,900원만, 나머지 몫은 그대로", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
      { fanId: PROFILE.somsatang, tier: "medium" },
    ]);
    await payTestRevgift(send);
    const medium = send.orderNos[2]!;
    psql(`update public.revgift_shares set reply = 'expired', replied_at = now() where order_no = '${medium}'`);
    const { claim, code } = await asOwner("revgift", shareId(medium));
    expect(code).toBeNull();
    expect(claim?.amount_krw).toBe(6900);
    expect(claim?.payment_key).toBe(`pk_${send.tossOrderId}`);
    expect(shareReply(send.orderNos[0]!)).toBe("waiting");
    expect(refundCount(`share_id in (select id from public.revgift_shares where send_id = '${send.sendId}')`)).toBe("1");
  });

  it("INV-R11: 입고 뒤 받지 않음은 그 몫의 배송비 칸을 뺀 금액", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now(), received_at = now() where order_no = '${no}'`);
    expect((await asOwner("revgift", shareId(no))).claim?.amount_krw).toBe(5400 - 4000);
  });

  it("INV-R11 (실패경로): 받기를 기다리는 몫·받은 몫은 환불하지 않는다", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
    ]);
    await payTestRevgift(send);
    psql(`update public.revgift_shares set reply = 'accepted', replied_at = now() where order_no = '${send.orderNos[1]}'`);
    expect((await asOwner("revgift", shareId(send.orderNos[0]!))).code).toBe("P0022");
    expect((await asOwner("revgift", shareId(send.orderNos[1]!))).code).toBe("P0022");
  });

  it("INV-R11 (실패경로): 결제가 끝나지 않은 보내기의 몫은 환불하지 않는다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const no = send.orderNos[0]!;
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where order_no = '${no}'`);
    expect((await asOwner("revgift", shareId(no))).code).toBe("P0022");
  });
});

describe("INV-K2 · INV-K7: 환불은 대표만", () => {
  it("INV-K7 S7c (실패경로): 직원 운영자가 환불하면 거부, 기록 없음", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    expect((await claimAs("fankkuk_staff", "gift", g.paymentId)).code).toBe("42501");
    expect(refundCount(`payment_id = '${g.paymentId}'`)).toBe("0");
  });

  it("INV-K1 (실패경로): 팬·크리에이터가 부르면 거부", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    expect((await claimAs("byeolbit_fan", "gift", g.paymentId)).code).toBe("42501");
    expect((await claimAs("haru_creator", "gift", g.paymentId)).code).toBe("42501");
    expect(refundCount(`payment_id = '${g.paymentId}'`)).toBe("0");
  });

  it("INV-K1 (실패경로): 로그인 안 한 사람은 잡기 함수를 부를 수 없다", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const { error } = await anonClient().rpc("admin_claim_refund", { p_kind: "gift", p_unit_id: g.paymentId });
    expect(error).not.toBeNull();
    expect(refundCount(`payment_id = '${g.paymentId}'`)).toBe("0");
  });

  it("결과 기록 함수는 앱 서버 키 전용 — 대표 로그인 토큰으로도 「완료」를 찍을 수 없다", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const { claim } = await asOwner("gift", g.paymentId);
    const owner = await signedInClient("fankkuk_admin");
    const { error } = await owner.rpc("settle_refund", { p_refund_id: claim!.refund_id, p_ok: true, p_error: null });
    expect(error).not.toBeNull();
    expect(refundRow(claim!.refund_id)).toBe("requesting/6900/1");
  });

  it("화면 쪽 키로는 환불 표를 직접 읽거나 쓰지 못한다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const read = await owner.from("refunds").select("id");
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
    const g = await paidGift();
    const write = await owner.from("refunds").insert({ payment_id: g.paymentId, amount_krw: 1, requested_by: PROFILE.haru });
    expect(write.error).not.toBeNull();
  });
});

describe("INV-K7 · INV-M9: 같은 환불은 한 번만", () => {
  it("INV-K7 S7b: 같은 환불을 동시에 두 번 잡으면 하나만 잡히고 기록은 하나", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const results = await Promise.all([asOwner("gift", g.paymentId), asOwner("gift", g.paymentId)]);
    expect(results.filter((r) => r.code === null)).toHaveLength(1);
    expect(results.filter((r) => r.code === "P0024")).toHaveLength(1);
    expect(refundCount(`payment_id = '${g.paymentId}'`)).toBe("1");
  });

  it("INV-K7: 처리 중인 환불을 다시 누르면 「처리 중」으로 거부된다", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    await asOwner("gift", g.paymentId);
    expect((await asOwner("gift", g.paymentId)).code).toBe("P0024");
  });

  it("INV-M9 S9 (실패경로): 완료된 환불을 다시 누르면 거부되고 아무것도 나가지 않는다", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const { claim } = await asOwner("gift", g.paymentId);
    expect((await settle(claim!.refund_id, true)).data).toBe(true);
    expect(refundRow(claim!.refund_id)).toBe("done/6900/1");
    expect((await asOwner("gift", g.paymentId)).code).toBe("P0023");
  });

  it("INV-K7: 결제사 취소가 실패하면 「실패」로 남고, 다시 누르면 같은 기록(같은 멱등 키)·같은 금액으로 다시 잡힌다", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const first = (await asOwner("gift", g.paymentId)).claim!;
    expect((await settle(first.refund_id, false, "결제사 오류")).data).toBe(true);
    expect(refundRow(first.refund_id)).toBe("failed/6900/1");
    // 그 사이 주문이 입고된 것으로 바뀌어도 금액은 처음 정한 값 — 같은 멱등 키에 다른 금액을 보내지 않는다
    setOrder(g.orderId, "received_at = now()");
    const again = (await asOwner("gift", g.paymentId)).claim!;
    expect(again.refund_id).toBe(first.refund_id);
    expect(again.amount_krw).toBe(6900);
    expect(refundRow(first.refund_id)).toBe("requesting/6900/2");
  });

  it("INV-K7: 「처리 중」이 2분 넘게 끝나지 않으면(서버가 중간에 죽음) 같은 기록으로 다시 잡을 수 있다", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const first = (await asOwner("gift", g.paymentId)).claim!;
    psql(`update public.refunds set claimed_at = now() - interval '121 seconds' where id = '${first.refund_id}'`);
    const again = (await asOwner("gift", g.paymentId)).claim!;
    expect(again.refund_id).toBe(first.refund_id);
    expect(refundRow(first.refund_id)).toBe("requesting/6900/2");
  });

  it("INV-K7 (실패경로): 결과는 「처리 중」인 기록에만 한 번 남는다 — 두 번째 결과 기록은 아무것도 바꾸지 않는다", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const { claim } = await asOwner("gift", g.paymentId);
    expect((await settle(claim!.refund_id, true)).data).toBe(true);
    expect((await settle(claim!.refund_id, false, "늦게 온 실패")).data).toBe(false);
    expect(refundRow(claim!.refund_id)).toBe("done/6900/1");
  });

  it("INV-R11 S11b: 같은 몫의 환불을 동시에 두 번 잡아도 기록은 하나", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    psql(`update public.revgift_shares set reply = 'expired', replied_at = now() where order_no = '${no}'`);
    const id = shareId(no);
    const results = await Promise.all([asOwner("revgift", id), asOwner("revgift", id)]);
    expect(results.filter((r) => r.code === null)).toHaveLength(1);
    expect(results.filter((r) => r.code === "P0024")).toHaveLength(1);
    expect(refundCount(`share_id = '${id}'`)).toBe("1");
  });
});

describe("INV-M9 · INV-R11: 환불 합계 상한은 DB 표가 지킨다", () => {
  function insertRefund(col: "payment_id" | "share_id", id: string, amount: number): string | null {
    return psqlError(
      `insert into public.refunds (${col}, amount_krw, requested_by) values ('${id}', ${amount}, '00000000-0000-4000-a000-000000000021')`,
    );
  }

  it("INV-M9 (실패경로): 한 결제의 환불은 그 결제 금액을 넘지 못한다", async () => {
    const g = await paidGift();
    expect(insertRefund("payment_id", g.paymentId, 6901)).not.toBeNull();
    expect(insertRefund("payment_id", g.paymentId, 6900)).toBeNull();
  });

  it("INV-M9 (실패경로): 한 결제에 환불 기록은 하나", async () => {
    const g = await paidGift();
    expect(insertRefund("payment_id", g.paymentId, 100)).toBeNull();
    expect(insertRefund("payment_id", g.paymentId, 100)).not.toBeNull();
  });

  it("INV-M9 (실패경로): 기록된 환불 금액을 나중에 키울 수 없다", async () => {
    const g = await paidGift();
    expect(insertRefund("payment_id", g.paymentId, 6900)).toBeNull();
    expect(psqlError(`update public.refunds set amount_krw = 7000 where payment_id = '${g.paymentId}'`)).not.toBeNull();
  });

  it("INV-R11 (실패경로): 몫 하나의 환불은 결제 금액 안이라도 그 몫 금액을 넘지 못한다", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
    ]);
    await payTestRevgift(send);
    expect(insertRefund("share_id", shareId(send.orderNos[0]!), 6000)).not.toBeNull();
  });

  it("INV-R11 (실패경로): 몫 금액이 잘못 커져 있어도 보내기 전체 환불은 결제 금액을 넘지 못한다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const id = shareId(send.orderNos[0]!);
    psql(`update public.revgift_shares set amount_krw = 9000 where id = '${id}'`);
    expect(insertRefund("share_id", id, 9000)).not.toBeNull();
    expect(insertRefund("share_id", id, 5400)).toBeNull();
  });

  it("결제 하나와 몫 하나 중 정확히 하나를 가리켜야 한다", async () => {
    expect(
      psqlError(`insert into public.refunds (amount_krw, requested_by) values (100, '00000000-0000-4000-a000-000000000021')`),
    ).not.toBeNull();
  });
});

describe("INV-K1 · INV-K8: 결제·환불 내역 읽기", () => {
  const COLUMNS = [
    "amount_krw",
    "goods_krw",
    "inspection_fee_krw",
    "order_no",
    "paid_at",
    "payer_nickname",
    "payment_kind",
    "refund_error",
    "refund_krw",
    "refund_status",
    "service_fee_krw",
    "shipping_fee_krw",
    "unit_id",
    "unit_kind",
  ];

  async function rowsAs(loginId: string) {
    const client = await signedInClient(loginId);
    const { data, error } = await client.rpc("admin_payment_rows");
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  }

  it("INV-K1 S1: 직원 운영자는 환불 대기·완료·실패를 금액과 함께 본다", async () => {
    const due = await paidGift();
    setOrder(due.orderId, "status = 'rejected'");
    const done = await paidGift();
    setOrder(done.orderId, "status = 'rejected', received_at = now()");
    const doneClaim = (await asOwner("gift", done.paymentId)).claim!;
    await settle(doneClaim.refund_id, true);
    const failed = await paidGift();
    setOrder(failed.orderId, "status = 'expired'");
    const failedClaim = (await asOwner("gift", failed.paymentId)).claim!;
    await settle(failedClaim.refund_id, false, "결제사 오류");
    const running = await paidGift();

    const rows = await rowsAs("fankkuk_staff");
    const of = (id: string) => rows.find((r) => r.unit_id === id);
    expect(of(due.paymentId)).toMatchObject({ unit_kind: "gift", refund_status: "due", refund_krw: 6900, payer_nickname: "별빛" });
    expect(of(done.paymentId)).toMatchObject({ refund_status: "done", refund_krw: 2900 });
    expect(of(failed.paymentId)).toMatchObject({ refund_status: "failed", refund_krw: 6900, refund_error: "결제사 오류" });
    expect(of(running.paymentId)).toMatchObject({ refund_status: "none", refund_krw: null });
  });

  it("INV-R11: 역조공은 몫마다 한 줄 — 보낸 크리에이터 닉네임, 몫 금액·배송비 칸", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.somsatang, tier: "medium" },
    ]);
    await payTestRevgift(send);
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where order_no = '${send.orderNos[1]}'`);
    const rows = await rowsAs("fankkuk_admin");
    const medium = rows.find((r) => r.order_no === send.orderNos[1]);
    expect(medium).toMatchObject({
      unit_kind: "revgift",
      payment_kind: "revgift",
      payer_nickname: "하루",
      amount_krw: 6900,
      goods_krw: 0,
      service_fee_krw: 1900,
      inspection_fee_krw: 0,
      shipping_fee_krw: 5000,
      refund_status: "due",
      refund_krw: 6900,
    });
    expect(rows.find((r) => r.order_no === send.orderNos[0])).toMatchObject({ refund_status: "none" });
  });

  it("결제가 끝나지 않은 결제는 내역에 나오지 않는다", async () => {
    const o = await registerTestOrder();
    const paymentId = psql(`select id from public.payments where toss_order_id = '${o.tossOrderId}'`);
    const rows = await rowsAs("fankkuk_admin");
    expect(rows.find((r) => r.unit_id === paymentId)).toBeUndefined();
  });

  it("INV-K1 S1b (실패경로): 팬·크리에이터가 읽으면 빈 결과", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    expect(await rowsAs("byeolbit_fan")).toEqual([]);
    expect(await rowsAs("haru_creator")).toEqual([]);
  });

  it("INV-K8 S8: 응답 칸은 정해진 열네 개뿐 — 주소·실명·전화번호 칸이 없다", async () => {
    const g = await paidGift();
    setOrder(g.orderId, "status = 'rejected'");
    const rows = await rowsAs("fankkuk_admin");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(COLUMNS);
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(text).not.toMatch(/(시|도|구|로|길)\s?\d/);
  });
});
