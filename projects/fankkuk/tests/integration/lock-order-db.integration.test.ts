import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { deleteTestBlocks, deleteTestOrders, holdRowLock, payTestOrder, psql, psqlError, registerTestOrder, signedInClient } from "./helpers";
import { approve, codeOf, deleteTestUnmatched, FAN_PASS, inspect, paidGift, paidShare, parcelState, scanInbound, waybill } from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 잠금 순서 하나 (docs/specs/office-workflow.md INV-W12 · S12·S12b).
// 같은 주문을 만지는 처리는 모두 상자 → 승인 요청 → 주문 → 6자리 → 사무소 상자 줄 순으로 잠근다.
// 시험 방법: 다른 연결이 앞 단계 줄(상자나 주문)을 쥔 동안 처리를 보내고, 그 처리가 기다리는 사이에
// 사무소 상자 줄을 nowait 로 잠가 본다 — 잠기면 처리가 아직 그 줄을 잡지 않은 것(순서를 지킴), 실패하면 먼저 잡은 것이다.

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
  deleteTestBlocks();
});

const HANEUL = "00000000-0000-4000-a000-000000000005"; // 하늘 — 하루에게 보낸 시드 주문이 없다

type RpcResult ={ error: { code?: string; message: string } | null };

/** 6자리로 입고 + 라벨 부착 확인. 돌려주는 값은 내부 QR. */
async function receive(op: SupabaseClient, unit: string | { shareId: string }): Promise<string> {
  const r = await scanInbound(op, waybill(), { code: codeOf(typeof unit === "string" ? { boxId: unit } : unit) });
  expect(r.data).toMatchObject({ result: "received" });
  const qr = (r.data as { qr: string }).qr;
  expect((await op.rpc("office_confirm_label", { p_qr: qr })).error).toBeNull();
  return qr;
}

/** 이름이 fn 인 함수를 부른 요청이 줄 잠금을 기다리기 시작할 때까지 */
async function waitUntilBlocked(fn: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const n = psql(`select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%${fn}%' and pid <> pg_backend_pid()`);
    if (n !== "0") return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`${fn} 이 잠금을 기다리지 않는다`);
}

/** 그 사무소 상자 줄을 지금 바로 잠글 수 있는지 — 잠글 수 없으면 오류 문구 */
const probeParcel = (qr: string) => psqlError(`select 1 from public.office_parcels where qr_code = '${qr}' for update nowait`);
const probeOrder = (orderId: string) => psqlError(`select 1 from public.orders where id = '${orderId}' for update nowait`);

/** holdSql 로 줄 하나를 쥔 채 call 을 보내고, call 이 그 줄을 기다리는 동안 probe 를 돌린다. call 의 결과를 돌려준다. */
async function whileBlocked(holdSql: string, fn: string, call: () => PromiseLike<RpcResult>, probe: () => void): Promise<RpcResult> {
  const lock = await holdRowLock(holdSql, 2);
  // supabase 클라이언트는 then 이 붙어야 요청을 보낸다
  const pending = Promise.resolve(call());
  await waitUntilBlocked(fn);
  probe();
  await lock.released;
  return pending;
}


describe("INV-W12 잠금 순서 — 사무소 상자 줄은 상자·승인 요청·주문 줄 뒤에", () => {
  const measure = (op: SupabaseClient, qr: string) => () => op.rpc("office_record_measurement", { p_qr: qr, p_tier: "small" });
  const cancel = (owner: SupabaseClient, orderNo: string) => () => owner.rpc("admin_cancel_received_gift", { p_order_no: orderNo, p_reason: "1:1 문의" });

  it("INV-W12 (S12): 상자 줄을 다른 처리가 쥐고 있으면 실측은 주문 줄도 사무소 상자 줄도 잡기 전에 기다린다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const qr = await receive(op, g.boxIds[0]!);
    const r = await whileBlocked(`select 1 from public.boxes where id = '${g.boxIds[0]}' for update`, "office_record_measurement", measure(op, qr), () => {
      expect(probeOrder(g.orderId)).toBeNull();
      expect(probeParcel(qr)).toBeNull();
    });
    expect(r.error).toBeNull();
  });

  it("INV-W12 (S12): 승인 요청 줄을 다른 처리가 쥐고 있으면 실측은 사무소 상자 줄을 잡기 전에 기다린다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const qr = await receive(op, g.boxIds[0]!);
    const r = await whileBlocked(`select 1 from public.approval_requests where order_id = '${g.orderId}' for update`, "office_record_measurement", measure(op, qr), () => {
      expect(probeParcel(qr)).toBeNull();
    });
    expect(r.error).toBeNull();
  });

  it("INV-W12 (S12): 주문 줄을 다른 처리가 쥐고 있으면 실측·검수 완료 스캔은 사무소 상자 줄을 잡기 전에 기다린다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const qr = await receive(op, g.boxIds[0]!);
    const holdOrder = `select 1 from public.orders where id = '${g.orderId}' for update`;
    expect((await whileBlocked(holdOrder, "office_record_measurement", measure(op, qr), () => expect(probeParcel(qr)).toBeNull())).error).toBeNull();
    expect((await op.rpc("office_record_inspection", { p_qr: qr, p_result: FAN_PASS })).error).toBeNull();
    const r = await whileBlocked(holdOrder, "office_scan_inspect", () => op.rpc("office_scan_inspect", { p_qr: qr }), () => expect(probeParcel(qr)).toBeNull());
    expect(r.error).toBeNull();
  });

  it("INV-W12 (S12): 역조공 몫 줄을 다른 처리가 쥐고 있으면 그 몫 상자의 QR 처리는 사무소 상자 줄을 잡기 전에 기다린다", async () => {
    const op = await staff();
    const sh = await paidShare();
    const qr = await receive(op, { shareId: sh.shareId });
    const r = await whileBlocked(`select 1 from public.revgift_shares where id = '${sh.shareId}' for update`, "office_record_measurement", measure(op, qr), () => {
      expect(probeParcel(qr)).toBeNull();
    });
    // 실측은 팬 선물 상자만 — 몫 상자는 잠금을 지나 거부된다
    expect(r.error?.code).toBe("22023");
  });

  it("INV-W12 (S12): 상자 줄·승인 요청 줄·주문 줄·6자리 줄 어느 것을 다른 처리가 쥐고 있어도 대표의 입고 뒤 취소는 사무소 상자 줄을 잡기 전에 기다린다", async () => {
    const op = await staff();
    const owner = await signedInClient("fankkuk_admin");
    for (const hold of ["boxes", "approval_requests", "orders", "inbound_codes"] as const) {
      const g = await paidGift(1);
      const qr = await receive(op, g.boxIds[0]!);
      const where = {
        boxes: `id = '${g.boxIds[0]}'`,
        approval_requests: `order_id = '${g.orderId}'`,
        orders: `id = '${g.orderId}'`,
        inbound_codes: `box_id = '${g.boxIds[0]}'`,
      }[hold];
      const r = await whileBlocked(`select 1 from public.${hold} where ${where} for update`, "admin_cancel_received_gift", cancel(owner, g.orderNo), () => {
        expect(probeParcel(qr), hold).toBeNull();
      });
      expect(r.error, hold).toBeNull();
    }
  });

  it("INV-W12 (S12, 실패경로): 순서를 바꾼 QR 잠금도 없는 QR 은 P0002, 꼴이 틀린 QR 은 22023 으로 거부하고 아무것도 바꾸지 않는다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const qr = await receive(op, g.boxIds[0]!);
    expect((await op.rpc("office_record_measurement", { p_qr: "Q-000000", p_tier: "small" })).error?.code).toBe("P0002");
    expect((await op.rpc("office_record_measurement", { p_qr: "Q-12", p_tier: "small" })).error?.code).toBe("22023");
    expect(psql(`select coalesce(measured_tier::text, '') from public.boxes where id = '${g.boxIds[0]}'`)).toBe("");
    expect((await op.rpc("office_record_measurement", { p_qr: qr, p_tier: "small" })).error).toBeNull();
  });
});

describe("INV-W12 자동 처리 — 주문마다·상자마다 같은 순서로", () => {
  const runExpiry = (op: SupabaseClient, orderNo: string) => () => op.rpc("office_run_expiry", { p_order_no: orderNo });
  const holdOrder = (orderId: string) => `select 1 from public.orders where id = '${orderId}' for update`;

  it("INV-W12 (S12): 7일 반려는 그 주문의 상자 줄을 먼저 잠근다 — 상자 줄을 쥐고 있으면 주문 줄을 잡기 전에 기다린다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    await receive(op, g.boxIds[0]!);
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    const r = await whileBlocked(`select 1 from public.boxes where id = '${g.boxIds[0]}' for update`, "office_run_expiry", runExpiry(op, g.orderNo), () => {
      expect(probeOrder(g.orderId)).toBeNull();
    });
    expect(r.error).toBeNull();
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("expired");
  });

  it("INV-W12 (S12): 보관 168시간 반송 대기는 주문 줄을 쥐고 있으면 사무소 상자 줄을 잡기 전에 기다린다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const qr = await receive(op, g.boxIds[0]!);
    expect(await inspect(op, qr, { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" })).toBe("held");
    psql(`update public.office_parcels set inspected_at = now() - interval '169 hours' where qr_code = '${qr}'`);
    const r = await whileBlocked(holdOrder(g.orderId), "office_run_expiry", runExpiry(op, g.orderNo), () => expect(probeParcel(qr)).toBeNull());
    expect(r.error).toBeNull();
    expect(parcelState(qr)).toBe("return_waiting");
  });

  it("INV-W12 (S12): 나갈 수 없게 된 검수 완료 상자의 반송 대기는 주문 줄을 쥐고 있으면 사무소 상자 줄을 잡기 전에 기다린다", async () => {
    const op = await staff();
    const g = await paidGift(1);
    const qr = await receive(op, g.boxIds[0]!);
    expect(await inspect(op, qr, FAN_PASS)).toBe("inspected");
    await approve(g);
    // 차액 요청 뒤 168시간 미납 — 자동 처리가 차액에 기한 지남을 적으면 이 상자는 나갈 수 없게 된다(payment INV-M13)
    psql(
      `insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, created_at) values ('${g.orderId}', 'difference', '${g.boxIds[0]}', 'pay_test_lock_${g.orderNo.slice(4).toLowerCase()}', 2000, 0, 500, 0, 1500, 'pending', now() - interval '169 hours')`,
    );
    const r = await whileBlocked(holdOrder(g.orderId), "office_run_expiry", runExpiry(op, g.orderNo), () => expect(probeParcel(qr)).toBeNull());
    expect(r.error).toBeNull();
    expect(parcelState(qr)).toBe("return_waiting");
  });
});

// 실측과 대표 취소를 같은 상자 줄 앞에 줄 세운다 — 취소가 먼저 줄을 서고, 실측이 그 뒤에 선다(둘 다 기다리는 것을 확인).
// 옛 순서에서는 실측이 사무소 상자 줄을 먼저 쥐고 기다리므로, 상자 줄을 받은 취소가 사무소 상자 줄에서 실측을 기다려 매번 교착이 났다.
describe("INV-W12 동시 — 같은 주문의 실측과 대표 취소", () => {
  it("INV-W12 (S12b, 동시): 대표 취소와 실측이 같은 상자 줄을 기다리다 풀려도 교착(40P01) 없이 둘 다 끝난다", async () => {
    const op = await staff();
    const owner = await signedInClient("fankkuk_admin");
    const g = await paidGift(1);
    const qr = await receive(op, g.boxIds[0]!);
    const lock = await holdRowLock(`select 1 from public.boxes where id = '${g.boxIds[0]}' for update`, 2);
    const canceled = Promise.resolve(owner.rpc("admin_cancel_received_gift", { p_order_no: g.orderNo, p_reason: "1:1 문의" }));
    await waitUntilBlocked("admin_cancel_received_gift");
    const measured = Promise.resolve(op.rpc("office_record_measurement", { p_qr: qr, p_tier: "small" }));
    await waitUntilBlocked("office_record_measurement");
    await lock.released;
    const [m, c] = await Promise.all([measured, canceled]);
    expect(c.error?.code).not.toBe("40P01");
    expect(m.error?.code).not.toBe("40P01");
    // 취소가 먼저 끝나고, 실측은 그 뒤에 구간 기록을 받는다
    expect(c.error).toBeNull();
    expect(m.error).toBeNull();
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("canceled");
  });
});

// 크리에이터의 거절(차단 포함)은 상자 줄을 잠그지 않고 승인 요청 → 주문 → 6자리(트리거) → 사무소 상자 줄 순이다 — 같은 순서에서 상자만 뺀 꼴.
// 검수 완료 상자가 있는 주문을 거절하면 그 사무소 상자 줄을 반송 대기로 바꾸므로, 그 줄을 쥔 QR 처리와 겹칠 수 있다.
describe("INV-W12 거절 — 크리에이터 거절도 같은 순서로", () => {
  const decline = (haru: SupabaseClient, requestId: string) => () => haru.rpc("decline_gift", { p_request_id: requestId, p_block: false });

  it("INV-W12: 승인 요청 줄·주문 줄 어느 것을 다른 처리가 쥐고 있어도 거절은 그 뒤 단계 줄을 잡기 전에 기다린다", async () => {
    const op = await staff();
    const haru = await signedInClient("haru_creator");
    // 6자리 줄은 빠진다 — 입고 때 이미 사용됨이 되어, 거절의 무효 트리거는 유효한 6자리만 건드린다
    for (const hold of ["approval_requests", "orders"] as const) {
      const g = await paidGift(1);
      const qr = await receive(op, g.boxIds[0]!);
      expect(await inspect(op, qr, FAN_PASS)).toBe("inspected");
      const where = {
        approval_requests: `order_id = '${g.orderId}'`,
        orders: `id = '${g.orderId}'`,
      }[hold];
      const r = await whileBlocked(`select 1 from public.${hold} where ${where} for update`, "decline_gift", decline(haru, g.requestId), () => {
        // 승인 요청 줄에서 기다리면 주문 줄은 아직 비어 있다(승인 요청 → 주문)
        if (hold === "approval_requests") expect(probeOrder(g.orderId), hold).toBeNull();
        expect(probeParcel(qr), hold).toBeNull();
      });
      expect(r.error, hold).toBeNull();
      expect(parcelState(qr), hold).toBe("return_waiting");
    }
  });

  // 차단은 같은 팬의 다른 진행 중 주문도 거절한다 — 그 주문들도 승인 요청 줄 → 주문 줄 순으로(승인과 같은 순서).
  it("INV-W12: 차단이 함께 거절하는 다른 주문의 주문 줄을 다른 처리가 쥐고 있으면, 차단은 그 주문의 승인 요청 줄을 먼저 잠그고 기다린다", async () => {
    const haru = await signedInClient("haru_creator");
    // 차단은 그 쌍의 진행 중 주문을 전부 거절한다 — 시드 주문이 없는 쌍(하늘 → 하루)으로. 기본 쌍(별빛 → 하루)이면 시드 FC-P4X7N 까지 거절된다.
    const fromHaneul = async () => {
      const o = await registerTestOrder(1, { senderId: HANEUL });
      return { ...o, requestId: await payTestOrder(o) };
    };
    const a = await fromHaneul();
    const b = await fromHaneul();
    const probeRequest = () => psqlError(`select 1 from public.approval_requests where order_id = '${b.orderId}' for update nowait`);
    expect(probeRequest()).toBeNull();
    const r = await whileBlocked(`select 1 from public.orders where id = '${b.orderId}' for update`, "decline_gift", () => haru.rpc("decline_gift", { p_request_id: a.requestId, p_block: true }), () => {
      expect(probeRequest()).not.toBeNull();
    });
    expect(r.error).toBeNull();
    expect(r).toMatchObject({ data: { result: "declined", also_declined: [b.orderNo] } });
  });

  // 거절이 승인 요청 줄 앞에 먼저 서고, 검수 완료 스캔이 그 뒤에 선다. 옛 순서에서는 스캔이 사무소 상자 줄을 먼저 쥐고
  // 승인 요청 줄을 기다리므로, 승인 요청·주문 줄을 받은 거절이 사무소 상자 줄에서 스캔을 기다려 교착이 났다.
  it("INV-W12 (동시): 거절과 검수 완료 스캔이 같은 승인 요청 줄을 기다리다 풀려도 교착(40P01) 없이 거절이 끝난다", async () => {
    const op = await staff();
    const haru = await signedInClient("haru_creator");
    const g = await paidGift(1);
    const qr = await receive(op, g.boxIds[0]!);
    expect(await inspect(op, qr, FAN_PASS)).toBe("inspected");
    const lock = await holdRowLock(`select 1 from public.approval_requests where order_id = '${g.orderId}' for update`, 2);
    const declined = Promise.resolve(decline(haru, g.requestId)());
    await waitUntilBlocked("decline_gift");
    const scanned = Promise.resolve(op.rpc("office_scan_inspect", { p_qr: qr }));
    await waitUntilBlocked("office_scan_inspect");
    await lock.released;
    const [d, s] = await Promise.all([declined, scanned]);
    // 스캔은 거절이 끝난 뒤의 상태(반송 대기)를 보고 단계 오류로 거부한다 — 교착이나 다른 잠금 오류가 아니다
    expect(s.error?.code).toBe("55000");
    expect(d.error).toBeNull();
    expect(d.data).toMatchObject({ result: "declined" });
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("rejected");
    expect(parcelState(qr)).toBe("return_waiting");
  });
});

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

