import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminClient, deleteTestOrders, payTestOrder, psql, registerTestOrder, signedInClient } from "./helpers";
import { closeKeptShares, deleteTestRevgifts, followHaru, payTestRevgift, PROFILE, registerTestRevgift, unfollowHaru } from "./revgift-helpers";

// 환불 DB — 다시 시도의 경계·결과 기록·내역 금액 (admin-console INV-K1·K2·K7, payment INV-M9, reverse-gift INV-R11).
// admin-refund-db 의 짝이다. 리뷰(2026-10-04)가 찾은 빈 갈래와 15일 멱등 키 만료를 붙든다.

const OWNER = "00000000-0000-4000-a000-000000000021";
const STAFF = "00000000-0000-4000-a000-000000000022";

beforeAll(() => {
  followHaru([PROFILE.gureumppang]);
});

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
});

afterAll(() => {
  unfollowHaru([PROFILE.gureumppang]);
});

type Claim = { refund_id: string; payment_key: string; amount_krw: number };

async function asOwner(kind: "gift" | "revgift", unitId: string) {
  const client = await signedInClient("fankkuk_admin");
  const { data, error } = await client.rpc("admin_claim_refund", { p_kind: kind, p_unit_id: unitId });
  return { claim: ((data ?? []) as Claim[])[0] ?? null, code: error?.code ?? null };
}

async function settle(refundId: string, ok: boolean, error: string | null = null) {
  return adminClient().rpc("settle_refund", { p_refund_id: refundId, p_ok: ok, p_error: error });
}

async function paidGift(): Promise<{ paymentId: string; orderId: string }> {
  const o = await registerTestOrder();
  await payTestOrder(o);
  return { paymentId: psql(`select id from public.payments where toss_order_id = '${o.tossOrderId}'`), orderId: o.orderId };
}

async function rejectedGift() {
  const g = await paidGift();
  psql(`update public.orders set status = 'rejected' where id = '${g.orderId}'`);
  return g;
}

function shareId(orderNo: string): string {
  return psql(`select id from public.revgift_shares where order_no = '${orderNo}'`);
}

function refundRow(id: string): string {
  return psql(`select status || '/' || amount_krw || '/' || attempts from public.refunds where id = '${id}'`);
}

function refundField(id: string, col: string): string {
  return psql(`select coalesce(${col}::text, '<null>') from public.refunds where id = '${id}'`);
}

async function readRows() {
  const client = await signedInClient("fankkuk_admin");
  const { data, error } = await client.rpc("admin_payment_rows");
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

describe("INV-K7 · INV-M9: 다시 시도의 경계", () => {
  it("INV-K7 (실패경로): 처리 중이 2분이 안 됐으면(119초) 아직 「처리 중」으로 거부된다", async () => {
    const g = await rejectedGift();
    const first = (await asOwner("gift", g.paymentId)).claim!;
    psql(`update public.refunds set claimed_at = now() - interval '119 seconds' where id = '${first.refund_id}'`);
    expect((await asOwner("gift", g.paymentId)).code).toBe("P0024");
  });

  it("INV-M9 (실패경로): 처음 잡은 지 14일이 지난 실패 기록은 다시 잡지 않는다 — 결제사 멱등 키가 15일 뒤 효력을 잃어 두 번 나갈 수 있다", async () => {
    const g = await rejectedGift();
    const first = (await asOwner("gift", g.paymentId)).claim!;
    await settle(first.refund_id, false, "응답 끊김");
    psql(`update public.refunds set created_at = now() - interval '14 days 1 minute' where id = '${first.refund_id}'`);
    expect((await asOwner("gift", g.paymentId)).code).toBe("P0025");
    expect(refundRow(first.refund_id)).toBe("failed/6900/1");
  });

  it("INV-M9 (실패경로): 14일이 지난 「처리 중」도 다시 잡지 않는다", async () => {
    const g = await rejectedGift();
    const first = (await asOwner("gift", g.paymentId)).claim!;
    psql(`update public.refunds set created_at = now() - interval '15 days', claimed_at = now() - interval '15 days' where id = '${first.refund_id}'`);
    expect((await asOwner("gift", g.paymentId)).code).toBe("P0025");
  });

  it("INV-K7: 14일이 안 된(13일) 실패 기록은 다시 잡힌다", async () => {
    const g = await rejectedGift();
    const first = (await asOwner("gift", g.paymentId)).claim!;
    await settle(first.refund_id, false, "결제사 오류");
    psql(`update public.refunds set created_at = now() - interval '13 days' where id = '${first.refund_id}'`);
    expect((await asOwner("gift", g.paymentId)).claim?.refund_id).toBe(first.refund_id);
  });

  it("INV-K2: 기록에는 누른 대표가 남고, 다시 잡으면 다시 누른 사람으로 바뀐다", async () => {
    const g = await rejectedGift();
    const first = (await asOwner("gift", g.paymentId)).claim!;
    expect(refundField(first.refund_id, "requested_by")).toBe(OWNER);
    await settle(first.refund_id, false, "결제사 오류");
    psql(`update public.refunds set requested_by = '${STAFF}' where id = '${first.refund_id}'`);
    await asOwner("gift", g.paymentId);
    expect(refundField(first.refund_id, "requested_by")).toBe(OWNER);
  });

  it("INV-K7: 다시 잡으면 지난 오류는 지워지고 결제 키를 다시 돌려준다", async () => {
    const g = await rejectedGift();
    const first = (await asOwner("gift", g.paymentId)).claim!;
    await settle(first.refund_id, false, "결제사 오류");
    const again = (await asOwner("gift", g.paymentId)).claim!;
    expect(again.payment_key).toBe(first.payment_key);
    expect(refundField(first.refund_id, "last_error")).toBe("<null>");
    expect((await readRows()).find((r) => r.unit_id === g.paymentId)?.refund_error).toBeNull();
  });
});

describe("결과 기록(settle_refund)의 오류 칸", () => {
  it("실패 오류는 200자까지만 남는다 — 길어도 결과 기록 자체는 성공한다", async () => {
    const g = await rejectedGift();
    const { claim } = await asOwner("gift", g.paymentId);
    expect((await settle(claim!.refund_id, false, "가".repeat(300))).data).toBe(true);
    expect(psql(`select char_length(last_error) from public.refunds where id = '${claim!.refund_id}'`)).toBe("200");
  });

  it("실패인데 오류 문구가 없으면 빈 문구로 남는다", async () => {
    const g = await rejectedGift();
    const { claim } = await asOwner("gift", g.paymentId);
    await settle(claim!.refund_id, false, null);
    expect(refundField(claim!.refund_id, "last_error")).toBe("");
  });

  it("성공이면 오류 칸은 비어 있다(문구를 같이 보내도)", async () => {
    const g = await rejectedGift();
    const { claim } = await asOwner("gift", g.paymentId);
    await settle(claim!.refund_id, true, "무시될 문구");
    expect(refundField(claim!.refund_id, "last_error")).toBe("<null>");
    expect((await readRows()).find((r) => r.unit_id === g.paymentId)).toMatchObject({ refund_status: "done", refund_error: null });
  });
});

describe("INV-R11: 역조공 몫의 다시 시도·완료", () => {
  async function declinedShare() {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const no = send.orderNos[0]!;
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where order_no = '${no}'`);
    closeKeptShares(`s.order_no = '${no}'`);
    return shareId(no);
  }

  it("INV-R11: 실패한 몫은 같은 기록으로 다시 잡히고, 완료된 몫은 P0023", async () => {
    const id = await declinedShare();
    const first = (await asOwner("revgift", id)).claim!;
    await settle(first.refund_id, false, "결제사 오류");
    expect((await asOwner("revgift", id)).claim?.refund_id).toBe(first.refund_id);
    await settle(first.refund_id, true);
    expect((await asOwner("revgift", id)).code).toBe("P0023");
  });

  it("INV-R11: 환불을 마친 몫은 내역에 「완료」와 기록된 금액으로 보인다", async () => {
    const id = await declinedShare();
    const first = (await asOwner("revgift", id)).claim!;
    await settle(first.refund_id, true);
    expect((await readRows()).find((r) => r.unit_id === id)).toMatchObject({ refund_status: "done", refund_krw: 5400 });
  });

  it("INV-R11 (실패경로): 결제 키를 같이 쓰는 같은 보내기의 다른 몫이 처리 중이면 기다리게 한다 — 결제사 응답의 마지막 취소 줄이 이 몫의 것이 되도록", async () => {
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
    ]);
    await payTestRevgift(send);
    psql(`update public.revgift_shares set reply = 'declined', replied_at = now() where send_id = '${send.sendId}'`);
    closeKeptShares(`s.send_id = '${send.sendId}'`);
    const a = shareId(send.orderNos[0]!);
    const b = shareId(send.orderNos[1]!);
    const first = (await asOwner("revgift", a)).claim!;
    expect((await asOwner("revgift", b)).code).toBe("P0024");
    await settle(first.refund_id, true);
    expect((await asOwner("revgift", b)).code).toBeNull();
  });
});

describe("INV-K1: 내역의 금액·순서", () => {
  it("INV-M9: 기록된 환불액이 지금 상태로 다시 계산한 값보다 앞선다", async () => {
    const g = await rejectedGift();
    const { claim } = await asOwner("gift", g.paymentId); // 입고 전 거절 = 6,900
    await settle(claim!.refund_id, false, "결제사 오류");
    psql(`update public.orders set received_at = now() where id = '${g.orderId}'`); // 지금 계산하면 2,900
    expect((await readRows()).find((r) => r.unit_id === g.paymentId)?.refund_krw).toBe(6900);
  });

  it("결제가 끝나지 않은 역조공 몫은 내역에 나오지 않는다", async () => {
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const id = shareId(send.orderNos[0]!);
    expect((await readRows()).find((r) => r.unit_id === id)).toBeUndefined();
  });

  it("결제 시각은 결제 완료 시각이고, 최근 결제가 위에 온다", async () => {
    const older = await paidGift();
    const newer = await paidGift();
    psql(`update public.payments set settled_at = now() - interval '3 days', created_at = now() where id = '${older.paymentId}'`);
    psql(`update public.payments set settled_at = now() - interval '1 day', created_at = now() - interval '9 days' where id = '${newer.paymentId}'`);
    const rows = await readRows();
    const iOld = rows.findIndex((r) => r.unit_id === older.paymentId);
    const iNew = rows.findIndex((r) => r.unit_id === newer.paymentId);
    expect(iNew).toBeGreaterThanOrEqual(0);
    expect(iNew).toBeLessThan(iOld);
    const settledNew = psql(`select floor(extract(epoch from settled_at))::bigint from public.payments where id = '${newer.paymentId}'`);
    expect(Math.floor(Date.parse(String(rows[iNew]!.paid_at)) / 1000)).toBe(Number(settledNew));
  });
});
