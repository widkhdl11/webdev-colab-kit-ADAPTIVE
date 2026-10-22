import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, payTestOrder, psql, registerTestOrder, SEED, signedInClient } from "./helpers";
import { approve, codeOf, deleteTestUnmatched, paidGift, scanInbound, waybill, type Unit } from "./office-helpers";

// 「아직 보내지 않음」과 운영자 「배송문제 확인」 (office-workflow INV-W10 S10f, notifications INV-N15 — 2026-10-21 「도착하지 않은 상자는 30일 하나로, 알림 세 번」).
// 팬이 「아직 보내지 않음」을 누르면 주문에 「고객 확인: 아직 안 보냄」과 누른 시각만 남는다 — 기한(결제 + 720시간)은 바뀌지 않는다.
// 운영자 목록은 결제 + 7일이 지났고 아직 입고되지 않은 상자가 있는 진행 중 주문. 실명·주소·전화번호는 없다.

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
});

const staff = (): Promise<SupabaseClient> => signedInClient("fankkuk_staff");
const backdatePaid = (orderId: string, hours: string) =>
  psql(`begin; set local session_replication_role = replica; update public.orders set registered_at = now() - interval '${hours}' where id = '${orderId}'; commit;`);

async function approvedGift(n: number): Promise<Unit> {
  const g = await paidGift(n);
  await approve(g);
  return g;
}

async function markNotSent(login: string, orderNo: string) {
  return (await signedInClient(login)).rpc("mark_gift_not_sent", { p_order_no: orderNo });
}

type IssueRow = {
  order_no: string;
  sender_nickname: string;
  paid_at: string;
  elapsed_days: number;
  missing_boxes: number;
  not_sent_at: string | null;
  auto_cancel_at: string;
};

async function issues(login = "fankkuk_staff"): Promise<IssueRow[]> {
  const r = await (await signedInClient(login)).rpc("admin_shipping_issues");
  if (r.error) throw new Error(`admin_shipping_issues 실패: ${r.error.code} ${r.error.message}`);
  return r.data as IssueRow[];
}

describe("INV-W10 「아직 보내지 않음」 — 기록만, 기한은 그대로", () => {
  it("INV-W10 (S10f): 결제 + 10일 미입고 주문에 별빛이 누름 → 주문에 누른 시각, 자동 취소일은 결제 + 720시간 그대로 · 다시 누르면 시각만 바뀐다", async () => {
    const g = await approvedGift(1);
    backdatePaid(g.orderId, "240 hours");
    const before = psql(`select registered_at from public.orders where id = '${g.orderId}'`);
    const r = await markNotSent("byeolbit_fan", g.orderNo);
    expect(r.error).toBeNull();
    const first = psql(`select fan_not_sent_at from public.orders where id = '${g.orderId}'`);
    expect(first).not.toBe("");
    expect(psql(`select registered_at from public.orders where id = '${g.orderId}'`)).toBe(before);
    psql(`begin; set local session_replication_role = replica; update public.orders set fan_not_sent_at = now() - interval '1 day' where id = '${g.orderId}'; commit;`);
    expect((await markNotSent("byeolbit_fan", g.orderNo)).error).toBeNull();
    const second = psql(`select fan_not_sent_at > now() - interval '1 minute' from public.orders where id = '${g.orderId}'`);
    expect(second).toBe("t");
    // 자동 처리 기한은 그대로 — 결제 + 720시간에 닫힌다
    backdatePaid(g.orderId, "720 hours");
    const run = await (await staff()).rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(run.error).toBeNull();
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("canceled");
  });

  it("INV-W10 (S10f, 실패경로): 남의 주문·없는 주문·상자가 다 온 주문·끝난 주문은 거부(같은 「없음」), 손님은 거부 — 아무것도 바뀌지 않는다", async () => {
    const g = await approvedGift(1);
    expect((await markNotSent("daltokki_fan", g.orderNo)).error?.code).toBe("P0002");
    expect((await markNotSent("haru_creator", g.orderNo)).error?.code).toBe("P0002");
    expect((await markNotSent("byeolbit_fan", "FC-NONE00")).error?.code).toBe("P0002");
    expect((await anonClient().rpc("mark_gift_not_sent", { p_order_no: g.orderNo })).error).not.toBeNull();
    const done = await approvedGift(1);
    const op = await staff();
    const s = await scanInbound(op, waybill(), { code: codeOf({ boxId: done.boxIds[0]! }) });
    expect((await op.rpc("office_confirm_label", { p_qr: (s.data as { qr: string }).qr })).error).toBeNull();
    expect((await markNotSent("byeolbit_fan", done.orderNo)).error?.code).toBe("P0002");
    const declined = await paidGift(1);
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: declined.requestId, p_block: false })).error).toBeNull();
    expect((await markNotSent("byeolbit_fan", declined.orderNo)).error?.code).toBe("P0002");
    expect(psql(`select count(*) from public.orders where id in ('${g.orderId}', '${done.orderId}', '${declined.orderId}') and fan_not_sent_at is not null`)).toBe("0");
  });

  it("INV-W10 (S10f): 팬 상자 읽기에 누른 시각이 실린다 — 아직 입고 전 상자에만, 도착한 상자·누르기 전에는 비어 있다", async () => {
    const g = await approvedGift(2);
    const boxes = async () => {
      const r = await (await signedInClient("byeolbit_fan")).rpc("my_gift_boxes", { p_order_no: g.orderNo });
      if (r.error) throw new Error(`my_gift_boxes 실패: ${r.error.code}`);
      return r.data as { box_id: string; not_sent_at: string | null }[];
    };
    expect((await boxes()).map((b) => b.not_sent_at)).toEqual([null, null]);
    const op = await staff();
    const s = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[0]! }) });
    expect((await op.rpc("office_confirm_label", { p_qr: (s.data as { qr: string }).qr })).error).toBeNull();
    const r = await markNotSent("byeolbit_fan", g.orderNo);
    expect(r.error).toBeNull();
    const rows = await boxes();
    expect(rows.find((b) => b.box_id === g.boxIds[0])?.not_sent_at).toBeNull();
    expect(Date.parse(rows.find((b) => b.box_id === g.boxIds[1])?.not_sent_at ?? "")).toBe(Date.parse(r.data as string));
    // 누른 뒤 그 상자에 송장번호를 넣었으면 보낸 상자다 — 「아직 보내지 않음」을 싣지 않는다(code-reviewer 2026-10-22 지적 2 ②)
    const w = await (await signedInClient("byeolbit_fan")).rpc("set_box_waybill", { p_box_id: g.boxIds[1], p_waybill: waybill() });
    expect(w.error).toBeNull();
    expect((await boxes()).find((b) => b.box_id === g.boxIds[1])?.not_sent_at).toBeNull();
    // 남의 주문번호로 읽으면 빈 목록 — 누른 시각도 새지 않는다
    expect((await (await signedInClient("daltokki_fan")).rpc("my_gift_boxes", { p_order_no: g.orderNo })).data).toEqual([]);
  });

  it("INV-W10 (실패경로): 「아직 보내지 않음」 기록은 사람이 직접 고칠 수 없다 — 앱 키로는 주문 줄에 쓸 수 없다", async () => {
    const g = await approvedGift(1);
    const fan = await signedInClient("byeolbit_fan");
    const r = await fan.from("orders").update({ fan_not_sent_at: new Date().toISOString() }).eq("id", g.orderId).select();
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
    expect(psql(`select fan_not_sent_at is null from public.orders where id = '${g.orderId}'`)).toBe("t");
  });
});

describe("INV-W10 운영자 「배송문제 확인」 목록", () => {
  it("INV-W10 (S10f): 결제 + 7일이 지났고 미입고 상자가 있는 진행 중 주문 — 주문번호·보낸 사람 닉네임·결제 시각·결제 후 경과일·미도착 상자 수·고객 답변·자동 취소일", async () => {
    const g = await approvedGift(3);
    const op = await staff();
    const s = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[0]! }) });
    expect((await op.rpc("office_confirm_label", { p_qr: (s.data as { qr: string }).qr })).error).toBeNull();
    backdatePaid(g.orderId, "167 hours");
    expect((await issues()).map((x) => x.order_no)).not.toContain(g.orderNo);
    backdatePaid(g.orderId, "240 hours");
    let row = (await issues()).find((x) => x.order_no === g.orderNo)!;
    expect(row).toMatchObject({ sender_nickname: "별빛", elapsed_days: 10, missing_boxes: 2, not_sent_at: null });
    expect(Object.keys(row).sort()).toEqual(["auto_cancel_at", "elapsed_days", "missing_boxes", "not_sent_at", "order_no", "paid_at", "sender_nickname"]);
    expect(Date.parse(row.auto_cancel_at) - Date.parse(row.paid_at)).toBe(720 * 3600 * 1000);
    expect((await markNotSent("byeolbit_fan", g.orderNo)).error).toBeNull();
    row = (await issues()).find((x) => x.order_no === g.orderNo)!;
    expect(row.not_sent_at).not.toBeNull();
    // 실명·주소·전화 꼴 칸이 없다
    expect(JSON.stringify(row)).not.toMatch(/phone|address|real_?name|recipient/i);
  });

  it("INV-W10 (실패경로): 승인 전 주문·상자가 다 온 주문·끝난 주문은 없다 · 팬·크리에이터·손님은 부를 수 없다", async () => {
    const pending = await paidGift(1); // 승인 전
    backdatePaid(pending.orderId, "200 hours");
    const o = await registerTestOrder(1, { senderId: SEED.otherFanId });
    await payTestOrder(o); // 승인 전
    const list = (await issues()).map((x) => x.order_no);
    expect(list).not.toContain(pending.orderNo);
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      const r = await (await signedInClient(login)).rpc("admin_shipping_issues");
      expect([login, r.error?.code]).toEqual([login, "42501"]);
    }
    expect((await anonClient().rpc("admin_shipping_issues")).error).not.toBeNull();
  });
});
