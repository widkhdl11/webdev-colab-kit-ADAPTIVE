import { afterEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, payTestOrder, psql, psqlError, registerTestOrder, signedInClient } from "./helpers";

// 제주·도서 할증 — 마이그레이션 20261108000001_surcharge.sql 만으로 도는 부분 (payment INV-M24 ①④⑤, address-protection INV-P20 ③).
// 크리에이터 주소의 구분은 사람이 적용하는 manual/0030 이 만든다 — 그 전에는 등록 함수의 구분 읽기가 늘 「할증 없음」이다.
// 구분에 따라 할증이 붙는 것(S24)은 surcharge-region-db 가 본다(manual/0030 뒤). 여기서는 할증이 붙은 주문을 트리거를 끈 채 만들어
// 저장 칸 검사와 환불 계산을 본다 — 등록 함수가 만드는 모양(상자마다 같은 몫을 금액·배송비 칸에 더하고 할증 칸에 적음)과 같게.

afterEach(() => {
  psql("delete from public.surcharge_region_mismatches where box_id in (select b.id from public.boxes b join public.orders o on o.id = b.order_id where o.item_kind in ('시험 선물', '통합 시험 선물'))");
  deleteTestOrders();
});

const setup = (sql: string) => psql(`begin; set local session_replication_role = replica; ${sql}; commit;`);
const fee = (region: "jeju" | "island") => Number(psql(`select fee_krw from public.surcharge_fees where region = '${region}'`));

/** 결제까지 끝난 소형 n 상자 주문에, 등록 함수가 만드는 모양 그대로 상자마다 할증을 얹는다 */
async function paidWithSurcharge(boxCount: number, perBox: number) {
  const o = await registerTestOrder(boxCount);
  await payTestOrder(o);
  setup(
    `update public.boxes set price_krw = price_krw + ${perBox}, shipping_fee_krw = shipping_fee_krw + ${perBox}, surcharge_krw = ${perBox} where order_id = '${o.orderId}';
     update public.payments set amount_krw = amount_krw + ${perBox * boxCount}, shipping_fee_krw = shipping_fee_krw + ${perBox * boxCount}, surcharge_krw = ${perBox * boxCount}
       where order_id = '${o.orderId}' and kind = 'initial'`,
  );
  const paymentId = psql(`select id from public.payments where order_id = '${o.orderId}' and kind = 'initial'`);
  const boxes = psql(`select id || '|' || price_krw || '|' || shipping_fee_krw || '|' || inspection_fee_krw from public.boxes where order_id = '${o.orderId}' order by seq`)
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [id, price, shipping, inspection] = l.split("|");
      return { id: id!, price: Number(price), shipping: Number(shipping), inspection: Number(inspection) };
    });
  return { ...o, paymentId, boxes };
}

describe("INV-M24 ①: 할증 설정값과 저장 칸", () => {
  it("INV-M24: 할증 설정값의 첫 값 — 제주 4,000 · 도서 5,000", () => {
    expect(psql("select region || '=' || fee_krw from public.surcharge_fees order by region")).toBe("island=5000\njeju=4000");
  });

  it("INV-M24 (실패경로): 설정값 표는 화면 쪽 키로 읽지도 쓰지도 못한다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const c of [anonClient(), fan]) {
      expect((await c.from("surcharge_fees").select("*")).error).not.toBeNull();
      expect((await c.from("surcharge_fees").update({ fee_krw: 0 }).eq("region", "jeju")).error).not.toBeNull();
    }
    expect(fee("jeju")).toBe(4000);
  });

  it("INV-M24 S24b: 주소 구분이 없으면(자리 함수) 할증 없이 등록된다 — 결제·상자 할증 칸 0, 금액은 요금표 합 그대로", async () => {
    const o = await registerTestOrder(2);
    expect(psql(`select surcharge_krw || '|' || amount_krw from public.payments where order_id = '${o.orderId}'`)).toBe(
      `0|${psql("select price_krw * 2 from public.tier_prices where tier = 'small'")}`,
    );
    expect(psql(`select string_agg(surcharge_krw::text, ',') from public.boxes where order_id = '${o.orderId}'`)).toBe("0,0");
  });

  it("INV-M24 (실패경로): 상자 할증이 배송비 칸보다 크면 저장되지 않는다", async () => {
    const o = await registerTestOrder(1);
    expect(psqlError(`update public.boxes set surcharge_krw = shipping_fee_krw + 1 where order_id = '${o.orderId}'`)).toMatch(/boxes_surcharge_within_shipping/);
    expect(psqlError(`update public.payments set surcharge_krw = shipping_fee_krw + 1 where order_id = '${o.orderId}'`)).toMatch(/payments_surcharge_within_shipping/);
    expect(psqlError(`update public.boxes set surcharge_krw = -1 where order_id = '${o.orderId}'`)).toMatch(/boxes_surcharge_within_shipping/);
  });

  it("INV-M24 ① (실패경로): 상자 할증의 합이 결제 할증과 다르면 처리 끝에 거부된다(INV-M14 칸 합)", async () => {
    const o = await registerTestOrder(2);
    expect(psqlError(`update public.payments set surcharge_krw = 1 where order_id = '${o.orderId}'`)).toMatch(/할증의 합/);
    expect(psqlError(`update public.boxes set surcharge_krw = 1 where order_id = '${o.orderId}' and seq = 1`)).toMatch(/할증의 합/);
  });
});

describe("INV-M24 ⑤ (S24c): 크리에이터 구분을 직접 읽는 함수는 누구도 부르지 못한다", () => {
  it("INV-M24 S24c (실패경로): 팬·크리에이터 로그인 토큰, 익명, 서비스 키 모두 거부", async () => {
    const creatorId = psql("select id from public.creators order by created_at limit 1");
    for (const c of [await signedInClient("byeolbit_fan"), await signedInClient("haru_creator"), anonClient(), adminClient()]) {
      const r = await c.rpc("creator_surcharge_region", { p_creator_id: creatorId });
      expect(r.error).not.toBeNull();
      expect(r.data).toBeNull();
    }
  });
});

describe("INV-M24 ④: 환불에서 할증은 배송비 칸과 같이 — 반송 택배비에는 넣지 않는다", () => {
  it("INV-M24 ④: 입고 전 거절로 끝나고 살려 둔 상자 — 주문 환불 = 상자 금액 − (배송비 칸 − 할증), 닫히면 상자 환불 = 배송비 칸 − 할증, 합은 결제 금액", async () => {
    const perBox = fee("jeju");
    const o = await paidWithSurcharge(1, perBox);
    const b = o.boxes[0]!;
    setup(`update public.orders set status = 'rejected' where id = '${o.orderId}'; update public.inbound_codes set kept_at = now() where box_id = '${b.id}' and state = 'valid'`);
    const orderDue = Number(psql(`select public.refund_due_of_payment('${o.paymentId}')`));
    expect(orderDue).toBe(b.price - (b.shipping - perBox));
    setup(`update public.inbound_codes set state = 'void', voided_at = now() where box_id = '${b.id}'; update public.boxes set missing_at = now() where id = '${b.id}'`);
    const boxDue = Number(psql(`select public.refund_due_of_box('${b.id}')`));
    expect(boxDue).toBe(b.shipping - perBox);
    expect(orderDue + boxDue).toBe(b.price);
  });

  it("INV-M24 ④: 입고 뒤 거절 — 도착한 상자는 상자 금액 − (배송비 칸 − 할증), 할증은 돌아간다", async () => {
    const perBox = fee("island");
    const o = await paidWithSurcharge(2, perBox);
    setup(
      `update public.orders set status = 'rejected', received_at = now() where id = '${o.orderId}';
       update public.office_parcels set state = 'received', received_at = now() where box_id in (select id from public.boxes where order_id = '${o.orderId}')`,
    );
    const due = Number(psql(`select public.refund_due_of_payment('${o.paymentId}')`));
    expect(due).toBe(o.boxes.reduce((n, b) => n + b.price - (b.shipping - perBox), 0));
  });

  it("INV-M24 ④: 입고 뒤 취소 — 도착한 상자는 상자 금액 − 검수비 − (배송비 칸 − 할증)", async () => {
    const perBox = fee("jeju");
    const o = await paidWithSurcharge(1, perBox);
    const b = o.boxes[0]!;
    setup(
      `update public.orders set status = 'canceled', received_at = now() where id = '${o.orderId}';
       update public.office_parcels set state = 'received', received_at = now() where box_id = '${b.id}'`,
    );
    expect(Number(psql(`select public.refund_due_of_payment('${o.paymentId}')`))).toBe(b.price - b.inspection - (b.shipping - perBox));
  });

  it("INV-M24 ④: 받는 주소를 본 적 없이 끝난 주문은 할증까지 결제 금액 전액", async () => {
    const o = await paidWithSurcharge(2, fee("jeju"));
    setup(`update public.orders set status = 'expired' where id = '${o.orderId}'`);
    expect(Number(psql(`select public.refund_due_of_payment('${o.paymentId}')`))).toBe(o.boxes.reduce((n, b) => n + b.price, 0));
  });

  it("INV-M24 ④: 할증이 없는 주문의 환불은 지금과 같다(입고 뒤 거절 = 상자 금액 − 배송비 칸)", async () => {
    const o = await paidWithSurcharge(1, 0);
    const b = o.boxes[0]!;
    setup(
      `update public.orders set status = 'rejected', received_at = now() where id = '${o.orderId}';
       update public.office_parcels set state = 'received', received_at = now() where box_id = '${b.id}'`,
    );
    expect(Number(psql(`select public.refund_due_of_payment('${o.paymentId}')`))).toBe(b.price - b.shipping);
  });
});

describe("INV-P20 ③: 할증 지역 불일치 줄 — 운영자만 읽는다", () => {
  it("INV-P20 S20c: 운영자는 상자·저장 구분·출력 때 구분·시각을 읽는다 — 주소 칸은 없다", async () => {
    const o = await registerTestOrder(2);
    const box2 = psql(`select id from public.boxes where order_id = '${o.orderId}' and seq = 2`);
    psql(`insert into public.surcharge_region_mismatches (box_id, stored_region, opened_region) values ('${box2}', 'none', 'jeju')`);
    const owner = await signedInClient("fankkuk_admin");
    const { data, error } = await owner.rpc("admin_surcharge_mismatches");
    expect(error).toBeNull();
    const mine = (data as Record<string, unknown>[]).filter((r) => r.order_no === o.orderNo);
    expect(mine).toEqual([{ at: expect.any(String), order_no: o.orderNo, box_seq: 2, box_count: 2, stored_region: "none", opened_region: "jeju" }]);
  });

  it("INV-P20 (실패경로): 팬·크리에이터·익명은 불일치 줄을 읽지 못한다(함수·표 모두)", async () => {
    for (const c of [await signedInClient("byeolbit_fan"), await signedInClient("haru_creator"), anonClient()]) {
      expect((await c.rpc("admin_surcharge_mismatches")).error).not.toBeNull();
      expect((await c.from("surcharge_region_mismatches").select("*")).error).not.toBeNull();
    }
  });

  it("INV-P20 (실패경로): 두 구분이 같거나 목록 밖이면 줄이 생기지 않는다", async () => {
    const o = await registerTestOrder(1);
    const box = psql(`select id from public.boxes where order_id = '${o.orderId}'`);
    expect(psqlError(`insert into public.surcharge_region_mismatches (box_id, stored_region, opened_region) values ('${box}', 'jeju', 'jeju')`)).toMatch(/differ/);
    expect(psqlError(`insert into public.surcharge_region_mismatches (box_id, stored_region, opened_region) values ('${box}', 'none', '63309')`)).not.toBeNull();
  });
});
