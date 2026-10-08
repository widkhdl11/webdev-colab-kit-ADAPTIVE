import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { differenceToss, labeled, measure, paidOrder } from "./difference-helpers";
import { adminClient, anonClient, deleteTestOrders, payTestOrder, psql, psqlError, registerTestOrder, SEED, signedInClient } from "./helpers";

// 팬의 결제 금액 읽기 (payment INV-M14, S14·S14b·S14c).
// 금액은 결제할 때 저장한 값만 — 상자마다 등록 순간의 요금으로 정한 금액을 저장하고, 그 합은 첫 결제 금액과 같다(DB 가 검사한다).
// 지금 요금표로 다시 계산하지 않는다. 환불은 서버가 정한 금액과 상태를 그대로 보여 준다. 칸 나눔(서비스료·검수비·배송비)은 돌려주지 않는다.

const OWNER_ID = "00000000-0000-4000-a000-000000000021"; // 팬꾹 운영(대표)

type Payment = {
  order_no: string;
  paid_krw: number;
  paid_at: string;
  boxes: { label: string; tier: string; amount_krw: number }[];
  refunds: { amount_krw: number; status: string; at: string }[];
};

let savedSmallPrice: string | null = null;

afterEach(() => {
  if (savedSmallPrice !== null) {
    psql(`update public.tier_prices set price_krw = ${savedSmallPrice} where tier = 'small'`);
    savedSmallPrice = null;
  }
  deleteTestOrders();
});

function code(n: number): string {
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join("");
}

/** 별빛 → 하루, 소형 1·중형 1 (등록 순간 요금 6,900 + 8,900 = 15,800). 결제까지 끝낸다. */
async function smallMediumOrder(): Promise<{ orderId: string; orderNo: string; tossOrderId: string }> {
  const orderNo = `FC-T${code(6)}`;
  const tossOrderId = `pay_test_${code(12).toLowerCase()}`;
  const { data, error } = await adminClient().rpc("register_order", {
    p_fan_id: SEED.fanId,
    p_creator_id: SEED.haruCreatorId,
    p_order_no: orderNo,
    p_item_kind: "시험 선물",
    p_has_electronics_or_metal: false,
    p_tiers: ["small", "medium"],
    p_toss_order_id: tossOrderId,
    p_goods_krw: 0,
    p_service_fee_krw: 3300,
    p_inspection_fee_krw: 3500,
    p_shipping_fee_krw: 9000,
    p_amount_krw: 15800,
  });
  if (error) throw new Error(`register_order 실패: ${error.message}`);
  const o = { orderId: data as string, orderNo, tossOrderId };
  await payTestOrder(o);
  return o;
}

async function readAs(login: string, orderNo: string) {
  const client = await signedInClient(login);
  return client.rpc("my_gift_payment", { p_order_no: orderNo });
}

async function paymentOf(login: string, orderNo: string): Promise<Payment | null> {
  const r = await readAs(login, orderNo);
  expect(r.error).toBeNull();
  return r.data as Payment | null;
}

describe("INV-M14: 상자 금액은 등록 순간의 요금으로 저장되고 그 값만 읽힌다", () => {
  it("INV-M14: 등록하면 상자마다 그 순간의 요금이 저장된다(소형 6,900 · 중형 8,900)", async () => {
    const o = await smallMediumOrder();
    expect(psql(`select string_agg(price_krw::text, ',' order by seq) from public.boxes where order_id = '${o.orderId}'`)).toBe("6900,8900");
  });

  it("INV-M14 S14: 소형 요금을 7,400 으로 바꾼 뒤에 읽어도 상자 금액은 6,900·8,900, 합계 15,800", async () => {
    const o = await smallMediumOrder();
    savedSmallPrice = psql("select price_krw from public.tier_prices where tier = 'small'");
    psql("update public.tier_prices set price_krw = 7400 where tier = 'small'");
    const p = await paymentOf("byeolbit_fan", o.orderNo);
    expect(p?.boxes.map((b) => [b.tier, b.amount_krw])).toEqual([
      ["small", 6900],
      ["medium", 8900],
    ]);
    expect(p?.paid_krw).toBe(15800);
    expect(p?.boxes.map((b) => b.label)).toEqual([`${o.orderNo}-1`, `${o.orderNo}-2`]);
  });

  it("INV-M14: 등록 순간의 요금이 바뀌어 있으면 그 요금이 상자 금액이 된다(바뀐 요금으로 등록)", async () => {
    savedSmallPrice = psql("select price_krw from public.tier_prices where tier = 'small'");
    psql("update public.tier_prices set price_krw = 7400 where tier = 'small'");
    const orderNo = `FC-T${code(6)}`;
    const { data, error } = await adminClient().rpc("register_order", {
      p_fan_id: SEED.fanId,
      p_creator_id: SEED.haruCreatorId,
      p_order_no: orderNo,
      p_item_kind: "시험 선물",
      p_has_electronics_or_metal: false,
      p_tiers: ["small"],
      p_toss_order_id: `pay_test_${code(12).toLowerCase()}`,
      p_goods_krw: 0,
      p_service_fee_krw: 1900,
      p_inspection_fee_krw: 1500,
      p_shipping_fee_krw: 4000,
      p_amount_krw: 7400,
    });
    expect(error).toBeNull();
    expect(psql(`select price_krw from public.boxes where order_id = '${data as string}'`)).toBe("7400");
  });
});

describe("INV-M14 S14b: 남의 주문·결제 전 주문은 읽히지 않고 칸 나눔도 없다", () => {
  it("INV-M14 S14b (실패경로): 별빛의 주문을 달토끼로 읽으면 0줄", async () => {
    const o = await smallMediumOrder();
    expect(await paymentOf("daltokki_fan", o.orderNo)).toBeNull();
    expect(await paymentOf("haru_creator", o.orderNo)).toBeNull();
    expect(await paymentOf("fankkuk_admin", o.orderNo)).toBeNull();
    // 보낸 사람 본인은 읽는다(조건이 없어서 안 나온 것이 아니다)
    expect((await paymentOf("byeolbit_fan", o.orderNo))?.paid_krw).toBe(15800);
  });

  it("INV-M14 (실패경로): 로그인하지 않으면 읽지 못한다", async () => {
    const o = await smallMediumOrder();
    const r = await anonClient().rpc("my_gift_payment", { p_order_no: o.orderNo });
    expect(r.data ?? null).toBeNull();
  });

  it("INV-M14 (실패경로): 결제가 끝나지 않은 주문은 돌려주지 않는다", async () => {
    const pending = await registerTestOrder();
    expect(await paymentOf("byeolbit_fan", pending.orderNo)).toBeNull();
  });

  it("INV-M14 S14b: 응답 어디에도 상품 대금·서비스료·검수비·배송비 칸이 없다", async () => {
    const o = await smallMediumOrder();
    const p = await paymentOf("byeolbit_fan", o.orderNo);
    expect(p).not.toBeNull();
    expect(Object.keys(p ?? {}).sort()).toEqual(["boxes", "order_no", "paid_at", "paid_krw", "refunds"]);
    for (const b of p?.boxes ?? []) expect(Object.keys(b).sort()).toEqual(["amount_krw", "label", "missing", "tier"]);
    const text = JSON.stringify(p);
    for (const leak of ["goods", "service", "inspection", "shipping", "carrier", "3300", "3500", "9000", "toss", "payment_key"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("INV-M14 S14b (실패경로): 상자 금액의 합이 결제 금액과 달라지는 저장은 DB 가 거부한다", async () => {
    const o = await smallMediumOrder();
    const err = psqlError(`update public.boxes set price_krw = price_krw + 100 where order_id = '${o.orderId}' and seq = 1`);
    expect(err).not.toBeNull();
    expect(psql(`select string_agg(price_krw::text, ',' order by seq) from public.boxes where order_id = '${o.orderId}'`)).toBe("6900,8900");
  });

  it("INV-M14 S14b (실패경로): 결제 금액을 상자 합과 다르게 바꾸는 저장도 DB 가 거부한다", async () => {
    const o = await registerTestOrder();
    const err = psqlError(`update public.payments set amount_krw = 7000, service_fee_krw = service_fee_krw + 100 where order_id = '${o.orderId}' and kind = 'initial'`);
    expect(err).not.toBeNull();
  });

  it("INV-M14 S14b (실패경로): 로그인한 사용자는 상자 금액을 직접 고치지 못한다", async () => {
    const o = await smallMediumOrder();
    const fan = await signedInClient("byeolbit_fan");
    await fan.from("boxes").update({ price_krw: 1 }).eq("order_id", o.orderId);
    expect(psql(`select string_agg(price_krw::text, ',' order by seq) from public.boxes where order_id = '${o.orderId}'`)).toBe("6900,8900");
  });
});

describe("INV-M14 S14c: 환불은 서버가 정한 금액과 상태가 보인다", () => {
  function refund(orderId: string, amount: number, status: "requesting" | "done" | "failed"): void {
    psql(
      `insert into public.refunds (payment_id, amount_krw, status, requested_by, settled_at)
       values ((select id from public.payments where order_id = '${orderId}' and kind = 'initial'), ${amount}, '${status}', '${OWNER_ID}', ${status === "done" ? "now()" : "null"})`,
    );
  }

  it("INV-M14 S14c: 입고 뒤 거절로 환불된 주문 — 환불 금액과 완료 상태", async () => {
    const o = await registerTestOrder();
    await payTestOrder(o);
    refund(o.orderId, 5400, "done");
    const p = await paymentOf("byeolbit_fan", o.orderNo);
    expect(p?.refunds.map((r) => [r.amount_krw, r.status])).toEqual([[5400, "done"]]);
    expect(p?.paid_krw).toBe(6900);
  });

  it("INV-M14 S14c: 처리 중인 환불은 「처리 중」으로 보인다, 환불이 없으면 빈 목록", async () => {
    const a = await registerTestOrder();
    await payTestOrder(a);
    expect((await paymentOf("byeolbit_fan", a.orderNo))?.refunds).toEqual([]);
    refund(a.orderId, 6900, "requesting");
    expect((await paymentOf("byeolbit_fan", a.orderNo))?.refunds.map((r) => [r.amount_krw, r.status])).toEqual([[6900, "requesting"]]);
  });
});

describe("INV-M14: 보낸 사람이 크리에이터여도, 차액 결제에 걸린 환불도 읽힌다", () => {
  const HARU_PROFILE = SEED.creatorProfileId;
  const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";

  it("INV-M14: 크리에이터(하루)가 다른 크리에이터(모모)에게 보낸 주문을 하루 본인이 읽는다 — 받는 모모는 못 읽는다", async () => {
    // 크리에이터 → 크리에이터는 팔로우가 있어야 등록된다(session-login INV-L9). 시험이 깐 팔로우만 지운다
    const hadFollow = psql(`select count(*) from public.follows where fan_id = '${HARU_PROFILE}' and creator_id = '${MOMO_CREATOR_ID}'`) === "1";
    if (!hadFollow) psql(`insert into public.follows (fan_id, creator_id) values ('${HARU_PROFILE}', '${MOMO_CREATOR_ID}')`);
    try {
      const o = await registerTestOrder(1, { senderId: HARU_PROFILE, creatorId: MOMO_CREATOR_ID });
      await payTestOrder(o);
      const p = await paymentOf("haru_creator", o.orderNo);
      expect(p?.paid_krw).toBe(6900);
      expect(p?.boxes.map((b) => b.amount_krw)).toEqual([6900]);
      expect(await paymentOf("momo_creator", o.orderNo)).toBeNull();
    } finally {
      if (!hadFollow) psql(`delete from public.follows where fan_id = '${HARU_PROFILE}' and creator_id = '${MOMO_CREATOR_ID}'`);
    }
  });

  it("INV-M14 S14c: 차액 결제(완료)에 걸린 환불도 금액·상태가 보인다", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "medium")).error).toBeNull();
    // 결제창에서 돌아온 차액을 서버가 확인 중으로 잡고(승인 API 자리) 완료로 기록한다
    const toss = differenceToss(g.orderId);
    expect((await adminClient().rpc("claim_difference_payment", { p_toss_order_id: toss })).data).toBe(true);
    const settled = await adminClient().rpc("settle_difference_payment", {
      p_toss_order_id: toss,
      p_status: "done",
      p_payment_key: `pk_${code(10)}`,
    });
    expect(settled.error).toBeNull();
    expect(psql(`select status from public.payments where order_id = '${g.orderId}' and kind = 'difference'`)).toBe("done");
    psql(
      `insert into public.refunds (payment_id, amount_krw, status, requested_by, settled_at)
       values ((select id from public.payments where order_id = '${g.orderId}' and kind = 'difference'), 1000, 'done', '${OWNER_ID}', now())`,
    );
    const p = await paymentOf("byeolbit_fan", g.orderNo);
    expect(p?.refunds.map((r) => [r.amount_krw, r.status])).toEqual([[1000, "done"]]);
  });
});

describe("INV-M14: 기존 주문 상자 금액 채우기(20261006000016) — 합은 결제 금액, 원 단위 나머지는 마지막 상자", () => {
  /** 마이그레이션 파일의 채우기 문장 그대로(with base as … 부터 첫 update 문 끝까지). */
  function fillStatement(): string {
    const text = readFileSync(new URL("../../supabase/migrations/20261006000016_box_amounts.sql", import.meta.url), "utf8");
    const start = text.indexOf("with base as (");
    const end = text.indexOf("where f.id = b.id;", start);
    if (start < 0 || end < 0) throw new Error("채우기 문장을 찾지 못했다");
    return text.slice(start, end + "where f.id = b.id;".length);
  }

  /** 한 트랜잭션 안에서 실행하고 되돌린다 — 명령 태그 없이 select 결과만 돌려준다. */
  function psqlRolledBack(sql: string): string {
    return execFileSync(
      "docker",
      ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
      { input: ["begin;", sql, "rollback;", ""].join(String.fromCharCode(10)), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  }

  it("INV-M14: 소형+중형 주문의 결제 금액이 요금 비율로 나누어떨어지지 않아도 합은 결제 금액과 같고 나머지는 마지막 상자에 붙는다", async () => {
    const o = await smallMediumOrder();
    const [small, medium] = ["small", "medium"].map((t) => Number(psql(`select price_krw from public.tier_prices where tier = '${t}'`)));
    // 결제 금액을 20,001원으로 바꾼 것처럼 두고(칸 나눔 합도 맞춘다) 채우기 문장을 돌린다 — 되돌리므로 DB 는 그대로다
    const paid = 20001;
    const out = psqlRolledBack(
      [
        `update public.payments set amount_krw = ${paid}, service_fee_krw = service_fee_krw + (${paid} - amount_krw) where order_id = '${o.orderId}' and kind = 'initial';`,
        fillStatement(),
        `select string_agg(price_krw::text, ',' order by seq) from public.boxes where order_id = '${o.orderId}';`,
      ].join(String.fromCharCode(10)),
    );
    const firstShare = Math.floor((paid * small) / (small + medium));
    const lastShare = Math.floor((paid * medium) / (small + medium));
    const remainder = paid - firstShare - lastShare;
    expect(remainder).toBeGreaterThan(0); // 나누어떨어지지 않는 경우여야 이 시험이 뜻이 있다
    expect(out).toBe(`${firstShare},${lastShare + remainder}`);
    // 되돌렸으므로 저장된 값은 등록 때 그대로
    expect(psql(`select string_agg(price_krw::text, ',' order by seq) from public.boxes where order_id = '${o.orderId}'`)).toBe(`${small},${medium}`);
  });
});
