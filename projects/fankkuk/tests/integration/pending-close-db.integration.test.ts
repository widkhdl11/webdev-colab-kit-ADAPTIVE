import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, deleteTestOrders, holdRowLock, psql, registerTestOrder, signedInClient } from "./helpers";
import { deleteTestRevgifts, followHaru, payTestRevgift, PROFILE, registerTestRevgift, unfollowHaru } from "./revgift-helpers";

// 24시간 지난 결제 대기 닫기 (payment INV-M15 · reverse-gift INV-R15).
// - 운영자의 「지금 돌리기」(office_run_expiry)가 결제 대기인 줄만 실패로 닫는다. 승인 중·완료는 그대로.
// - 결제 확정 시작(claim_payment·claim_revgift_payment)과 겹쳐도 둘 중 하나만 반영된다.
// - 닫힌 줄은 지우지 않고 「실패」로 남는다.
// 시드 주문·계정은 바꾸지 않는다 — 시험마다 새 주문(FC-T…)·보내기(RG-T…)를 만들고 끝나면 지운다.

type Counts = { pending_gifts: number; pending_revgifts: number };

function backdateOrderPayment(orderId: string, hours: number): void {
  psql(`update public.payments set created_at = now() - interval '${hours} hours' where order_id = '${orderId}' and kind = 'initial'`);
}
function backdateSend(sendId: string, hours: number): void {
  psql(`update public.revgift_sends set created_at = now() - interval '${hours} hours' where id = '${sendId}'`);
}
const orderPayment = (orderId: string) => psql(`select status from public.payments where order_id = '${orderId}' and kind = 'initial'`);
const sendStatus = (sendId: string) => psql(`select status from public.revgift_sends where id = '${sendId}'`);

async function runFor(orderNo: string): Promise<Counts> {
  const staff = await signedInClient("fankkuk_staff");
  const r = await staff.rpc("office_run_expiry", { p_order_no: orderNo });
  if (r.error) throw new Error(`office_run_expiry 실패: ${r.error.message}`);
  return r.data as Counts;
}

// 구름빵은 시드에서 하루를 팔로우하지 않는다 — 두 사람 몫 시험 동안만 팔로우를 붙인다
const ADDED_FOLLOWERS = [PROFILE.gureumppang];

beforeAll(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  followHaru(ADDED_FOLLOWERS);
});
afterAll(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  unfollowHaru(ADDED_FOLLOWERS);
});

describe("INV-M15: 24시간 지난 팬 선물 결제 대기는 「지금 돌리기」가 실패로 닫는다", () => {
  it("INV-M15 S15: 25시간이면 실패, 23시간이면 그대로, 두 번 돌려도 실패 한 번 — 주문 줄은 지우지 않는다", async () => {
    const young = await registerTestOrder();
    backdateOrderPayment(young.orderId, 23);
    expect((await runFor(young.orderNo)).pending_gifts).toBe(0);
    expect(orderPayment(young.orderId)).toBe("pending");

    const old = await registerTestOrder();
    backdateOrderPayment(old.orderId, 25);
    expect((await runFor(old.orderNo)).pending_gifts).toBe(1);
    expect(orderPayment(old.orderId)).toBe("failed");
    expect((await runFor(old.orderNo)).pending_gifts).toBe(0);
    expect(psql(`select count(*) from public.orders where id = '${old.orderId}'`)).toBe("1");
    expect(psql(`select settled_at is not null from public.payments where order_id = '${old.orderId}' and kind = 'initial'`)).toBe("t");
  });

  it("INV-M15 S15b (실패경로): 결제사 승인을 기다리는 25시간 된 결제는 그대로이고, 닫힌 결제는 결제 확정을 시작할 수 없다", async () => {
    const waiting = await registerTestOrder();
    expect((await adminClient().rpc("claim_payment", { p_toss_order_id: waiting.tossOrderId })).data).toBe(true);
    backdateOrderPayment(waiting.orderId, 25);
    expect((await runFor(waiting.orderNo)).pending_gifts).toBe(0);
    expect(orderPayment(waiting.orderId)).toBe("confirming");

    const closed = await registerTestOrder();
    backdateOrderPayment(closed.orderId, 25);
    await runFor(closed.orderNo);
    expect((await adminClient().rpc("claim_payment", { p_toss_order_id: closed.tossOrderId })).data).toBe(false);
    expect(orderPayment(closed.orderId)).toBe("failed");
  });

  it("INV-M15 (실패경로): 주문번호를 주면 그 주문만 닫는다", async () => {
    const a = await registerTestOrder();
    const b = await registerTestOrder();
    backdateOrderPayment(a.orderId, 25);
    backdateOrderPayment(b.orderId, 25);
    expect((await runFor(a.orderNo)).pending_gifts).toBe(1);
    expect(orderPayment(b.orderId)).toBe("pending");
  });

  it("INV-M15 S15c (동시): 기한 직후 결제 확정 시작과 자동 처리가 겹쳐도 하나만 반영된다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    for (let i = 0; i < 3; i++) {
      const o = await registerTestOrder();
      backdateOrderPayment(o.orderId, 25);
      // 두 요청을 같은 결제 줄의 잠금 뒤에 세워 확실히 겹치게 한다
      const lock = await holdRowLock(`select 1 from public.payments where order_id = '${o.orderId}' and kind = 'initial' for update`, 1);
      const [claimed, run] = await Promise.all([
        adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId }),
        staff.rpc("office_run_expiry", { p_order_no: o.orderNo }),
      ]);
      await lock.released;
      const closed = (run.data as Counts).pending_gifts;
      expect(claimed.data === true ? 1 : 0).toBe(1 - closed);
      expect(orderPayment(o.orderId)).toBe(claimed.data === true ? "confirming" : "failed");
    }
  });
});

describe("INV-M15·INV-R15: 운영자가 닫을 줄을 자동 처리 현황에서 본다", () => {
  type Due = { category: string; order_no: string; receiver_name: string; detail: string | null };
  const unpaid = async (): Promise<Due[]> =>
    ((await (await signedInClient("fankkuk_staff")).rpc("admin_expiry_due")).data as Due[]).filter((r) => r.category === "unpaid");

  it("INV-M15·INV-R15: 24시간 지난 결제 대기(팬 선물·역조공)는 줄로 나오고, 23시간·승인 중·닫힌 것은 나오지 않는다", async () => {
    const gift = await registerTestOrder();
    backdateOrderPayment(gift.orderId, 25);
    const youngGift = await registerTestOrder();
    backdateOrderPayment(youngGift.orderId, 23);
    const confirming = await registerTestOrder();
    await adminClient().rpc("claim_payment", { p_toss_order_id: confirming.tossOrderId });
    backdateOrderPayment(confirming.orderId, 25);
    const send = await registerTestRevgift([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
    ]);
    backdateSend(send.sendId, 25);
    const youngSend = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    backdateSend(youngSend.sendId, 23);

    const rows = await unpaid();
    const nos = rows.map((r) => r.order_no);
    expect(nos).toContain(gift.orderNo);
    expect(nos).not.toContain(youngGift.orderNo);
    expect(nos).not.toContain(confirming.orderNo);
    // 보내기 한 건은 한 줄 — 첫 몫의 주문번호, 받는 사람은 「첫 팬 외 n명」
    expect(nos).toContain(send.orderNos[0]);
    expect(nos).not.toContain(send.orderNos[1]);
    expect(nos).not.toContain(youngSend.orderNos[0]);
    expect(rows.find((r) => r.order_no === send.orderNos[0])?.receiver_name).toMatch(/ 외 1명$/);
    expect(rows.find((r) => r.order_no === gift.orderNo)?.detail).toBe("6,900원");

    await runFor(gift.orderNo);
    await runFor(send.orderNos[0]!);
    const after = (await unpaid()).map((r) => r.order_no);
    expect(after).not.toContain(gift.orderNo);
    expect(after).not.toContain(send.orderNos[0]);
  });

  it("INV-M15 (실패경로): 운영자가 아니면 빈 목록이다", async () => {
    const gift = await registerTestOrder();
    backdateOrderPayment(gift.orderId, 25);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("admin_expiry_due")).data).toEqual([]);
  });
});

describe("INV-R15: 24시간 지난 역조공 결제 대기는 「지금 돌리기」가 실패로 닫는다", () => {
  it("INV-R15 S15: 25시간이면 실패, 23시간이면 그대로, 두 번 돌려도 실패 한 번 — 보내기는 지우지 않는다", async () => {
    const young = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    backdateSend(young.sendId, 23);
    expect((await runFor(young.orderNos[0]!)).pending_revgifts).toBe(0);
    expect(sendStatus(young.sendId)).toBe("pending");

    const old = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    backdateSend(old.sendId, 25);
    expect((await runFor(old.orderNos[0]!)).pending_revgifts).toBe(1);
    expect(sendStatus(old.sendId)).toBe("failed");
    expect((await runFor(old.orderNos[0]!)).pending_revgifts).toBe(0);
    expect(psql(`select count(*) from public.revgift_shares where send_id = '${old.sendId}'`)).toBe("1");
  });

  it("INV-R15 S15b (실패경로): 승인 중·결제 완료인 25시간 된 보내기는 그대로이고, 닫힌 보내기는 결제 확정을 시작할 수 없다", async () => {
    const confirming = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    expect((await adminClient().rpc("claim_revgift_payment", { p_toss_order_id: confirming.tossOrderId })).data).toBe(true);
    backdateSend(confirming.sendId, 25);
    expect((await runFor(confirming.orderNos[0]!)).pending_revgifts).toBe(0);
    expect(sendStatus(confirming.sendId)).toBe("confirming");

    const paid = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(paid);
    backdateSend(paid.sendId, 25);
    expect((await runFor(paid.orderNos[0]!)).pending_revgifts).toBe(0);
    expect(sendStatus(paid.sendId)).toBe("done");

    const closed = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    backdateSend(closed.sendId, 25);
    await runFor(closed.orderNos[0]!);
    expect((await adminClient().rpc("claim_revgift_payment", { p_toss_order_id: closed.tossOrderId })).data).toBe(false);
    expect(sendStatus(closed.sendId)).toBe("failed");
  });

  it("INV-R15 (실패경로): 주문번호를 주면 그 몫이 든 보내기만 닫는다", async () => {
    const a = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    const b = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    backdateSend(a.sendId, 25);
    backdateSend(b.sendId, 25);
    expect((await runFor(a.orderNos[0]!)).pending_revgifts).toBe(1);
    expect(sendStatus(b.sendId)).toBe("pending");
  });

  it("INV-R15 (실패경로): 닫힌 보내기의 몫은 팬의 받은 역조공·크리에이터의 보낸 역조공 어디에도 나오지 않는다", async () => {
    const closed = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    backdateSend(closed.sendId, 25);
    await runFor(closed.orderNos[0]!);
    expect(sendStatus(closed.sendId)).toBe("failed");
    // 같은 때 결제가 끝난 보내기는 두 목록에 나온다 — 읽기가 결제 완료만 거르는지를 붙든다(닫힌 줄이 원래 안 보이는 것과 구분)
    const paid = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(paid);
    const fan = await signedInClient("byeolbit_fan");
    const received = ((await fan.rpc("my_received_revgifts")).data as { order_no: string }[]).map((r) => r.order_no);
    expect(received).not.toContain(closed.orderNos[0]);
    expect(received).toContain(paid.orderNos[0]);
    const haru = await signedInClient("haru_creator");
    const sent = ((await haru.rpc("my_sent_revgifts")).data as { order_no: string }[]).map((r) => r.order_no);
    expect(sent).not.toContain(closed.orderNos[0]);
    expect(sent).toContain(paid.orderNos[0]);
  });

  it("INV-R15 S15c (동시): 기한 직후 결제 확정 시작과 자동 처리가 겹쳐도 하나만 반영된다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    for (let i = 0; i < 3; i++) {
      const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
      backdateSend(send.sendId, 25);
      const lock = await holdRowLock(`select 1 from public.revgift_sends where id = '${send.sendId}' for update`, 1);
      const [claimed, run] = await Promise.all([
        adminClient().rpc("claim_revgift_payment", { p_toss_order_id: send.tossOrderId }),
        staff.rpc("office_run_expiry", { p_order_no: send.orderNos[0]! }),
      ]);
      await lock.released;
      const closed = (run.data as Counts).pending_revgifts;
      expect(claimed.data === true ? 1 : 0).toBe(1 - closed);
      expect(sendStatus(send.sendId)).toBe(claimed.data === true ? "confirming" : "failed");
    }
  });
});
