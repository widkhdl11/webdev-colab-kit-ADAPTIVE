import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { differenceRow, labeled, measure, paidOrder, prepare } from "./difference-helpers";
import { resetPrices } from "./admin-pricing-helpers";
import { deleteTestOrders, psql, signedInClient } from "./helpers";
import { FAN_PASS, inspect } from "./office-helpers";

// 개인접수 (payment INV-M23, S23~S23d). 팬 선물 상자의 실측이 대형을 넘으면, 열린 주문에서는 검수 불합격으로 닫지 않고
// 운영자가 넣은 우체국 실비로 차액 결제를 요청한다. 그 뒤는 차액(INV-M11~M13) 기계 그대로.
// 요금은 시험 안에서 요금표에 넣고(스펙 S23 의 예시 요금 — 2026-11-07 결정), 기대값은 그 값으로 계산한다. 실비 상한은 DB 함수 personal_intake_cost_max_krw() 에서 읽는다.

// 스펙 S23·S23b 의 요금표(받는 값/택배 원가/검수비) — 시험이 끝나면 resetPrices 로 되돌린다
const SPEC_PRICES: Record<"small" | "medium" | "large", [number, number, number]> = {
  small: [5900, 3490, 900],
  medium: [7900, 4390, 900],
  large: [9900, 5500, 900],
};

function setPrices(): void {
  psql(
    [
      "begin;",
      ...Object.entries(SPEC_PRICES).map(
        ([tier, [p, c, i]]) => `update public.tier_prices set price_krw = ${p}, carrier_cost_krw = ${c}, inspection_fee_krw = ${i} where tier = '${tier}';`,
      ),
      "commit;",
    ].join(" "),
  );
}

type Price = { price: number; carrier: number; inspection: number };

function price(tier: "small" | "medium" | "large"): Price {
  const [p, c, i] = psql(`select price_krw || ',' || carrier_cost_krw || ',' || inspection_fee_krw from public.tier_prices where tier = '${tier}'`)
    .split(",")
    .map(Number);
  return { price: p!, carrier: c!, inspection: i! };
}

/** INV-M23 의 계산 — 개인접수 금액 = 실비 + 대형 검수비 + 대형 기본 서비스료, 칸마다 신고 구간과의 차. 「금액/상품/서비스료/검수비/배송비/상태」 */
function expectedRow(declared: Price, large: Price, cost: number): { amount: number; row: string } {
  const service = (p: Price) => p.price - p.carrier - p.inspection;
  const amount = cost + large.inspection + service(large) - declared.price;
  const row = `${amount}/0/${service(large) - service(declared)}/${large.inspection - declared.inspection}/${cost - declared.carrier}/pending`;
  return { amount, row };
}

function costMax(): number {
  return Number(psql(`select public.personal_intake_cost_max_krw()`));
}

function boxIntake(boxId: string): string {
  return psql(`select coalesce(measured_tier::text, 'none') || '/' || coalesce(personal_intake_cost_krw::text, 'none') from public.boxes where id = '${boxId}'`);
}

function alerts(orderId: string): string {
  return psql(`select count(*) from public.notification_outbox where order_id = '${orderId}' and kind = 'difference_due' and channel = 'email'`);
}

beforeAll(() => {
  deleteTestOrders();
  setPrices();
});
afterAll(() => {
  deleteTestOrders();
  resetPrices();
});

describe("INV-M23: 대형 초과 실측은 열린 주문에서 우체국 실비로 차액 결제를 요청한다(개인접수)", () => {
  it("INV-M23 S23: 대형 신고 상자가 대형 초과 + 실비 → 차액 = 실비 − 대형 택배 원가(배송비 칸만), 실측 구간은 대형, 실비는 상자에, 팬 알림 1번", async () => {
    const large = price("large");
    const cost = 13000;
    expect(cost).toBeGreaterThanOrEqual(large.carrier);
    const g = await paidOrder(["large"]);
    const qr = await labeled(g.boxIds[0]!);
    const want = expectedRow(large, large, cost);
    const r = await measure(qr, "oversize", "fankkuk_staff", cost);
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ result: "difference", amount_krw: want.amount });
    expect(differenceRow(g.orderId)).toBe(want.row);
    expect(want.row).toBe(`${cost - large.carrier}/0/0/0/${cost - large.carrier}/pending`);
    expect(boxIntake(g.boxIds[0]!)).toBe(`large/${cost}`);
    expect(alerts(g.orderId)).toBe("1");
  });

  it("INV-M23 S23b: 소형 신고 상자 → 차액 = 실비 + 대형 검수비 + 대형 기본 서비스료 − 소형 요금, 칸마다 차. 검수 통과면 반송이 아니라 검수 완료, 팬은 차액을 낼 수 있다", async () => {
    const small = price("small");
    const large = price("large");
    const cost = 13000;
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    const want = expectedRow(small, large, cost);
    expect((await measure(qr, "oversize", "fankkuk_staff", cost)).data).toEqual({ result: "difference", amount_krw: want.amount });
    expect(differenceRow(g.orderId)).toBe(want.row);
    // 스펙 S23b 예시와 같은 요금표라 같은 숫자 — 계산식이 스펙 문장과 같은지
    expect(want.row).toBe("11500/0/1990/0/9510/pending");
    expect(await inspect(await signedInClient("fankkuk_staff"), qr, FAN_PASS)).toBe("inspected");
    const prepared = await prepare(g.boxIds[0]!);
    expect(prepared.error).toBeNull();
    expect((prepared.data as { amount_krw: number }[])[0]!.amount_krw).toBe(want.amount);
  });

  it("INV-M23 ④: 팬 읽기는 그 상자를 「개인접수」로 준다 — 상자 줄의 크기 칸과 차액 줄의 실측 칸", async () => {
    const g = await paidOrder(["small", "small"]);
    const qr = await labeled(g.boxIds[0]!);
    await measure(qr, "oversize", "fankkuk_staff", 13000);
    const fan = await signedInClient("byeolbit_fan");
    const boxes = (await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data as { box_id: string; tier: string }[];
    expect(boxes.map((b) => b.tier)).toEqual(["personal_intake", "small"]);
    const diffs = (await fan.rpc("my_difference_payments", { p_order_no: g.orderNo })).data as { declared_tier: string; measured_tier: string }[];
    expect(diffs.map((d) => `${d.declared_tier}>${d.measured_tier}`)).toEqual(["small>personal_intake"]);
  });

  it("INV-M23 S23c (실패경로): 실비 없음 → 거부, 실측 기록 안 됨", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "oversize")).error?.code).toBe("P0110");
    expect((await measure(qr, "oversize", "fankkuk_staff", null)).error?.code).toBe("P0110");
    expect(boxIntake(g.boxIds[0]!)).toBe("none/none");
    expect(differenceRow(g.orderId)).toBe("");
  });

  it("INV-M23 S23c (실패경로): 실비 < 대형 택배 원가 → 거부, 원가와 같으면 받는다", async () => {
    const large = price("large");
    const g = await paidOrder(["small", "small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "oversize", "fankkuk_staff", large.carrier - 1)).error?.code).toBe("P0110");
    expect(boxIntake(g.boxIds[0]!)).toBe("none/none");
    expect(differenceRow(g.orderId)).toBe("");
    expect((await measure(qr, "oversize", "fankkuk_staff", large.carrier)).error).toBeNull();
    expect(boxIntake(g.boxIds[0]!)).toBe(`large/${large.carrier}`);
  });

  it("INV-M23 S23c (실패경로): 실비 > 상한 → 거부, 상한과 같으면 받는다", async () => {
    const max = costMax();
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "oversize", "fankkuk_staff", max + 1)).error?.code).toBe("P0110");
    expect(boxIntake(g.boxIds[0]!)).toBe("none/none");
    expect(differenceRow(g.orderId)).toBe("");
    expect((await measure(qr, "oversize", "fankkuk_staff", max)).error).toBeNull();
    expect(boxIntake(g.boxIds[0]!)).toBe(`large/${max}`);
  });

  it("INV-M23 S23c (실패경로): 소수 실비 → 거부, 실측 기록 안 됨", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "oversize", "fankkuk_staff", 13000.5)).error?.code).toBe("P0110");
    expect(boxIntake(g.boxIds[0]!)).toBe("none/none");
    expect(differenceRow(g.orderId)).toBe("");
  });

  it("INV-M23 (실패경로): 대형 이하 실측에 실비를 붙이면 거부 — 실비는 개인접수에만", async () => {
    const g = await paidOrder(["small"]);
    const qr = await labeled(g.boxIds[0]!);
    expect((await measure(qr, "medium", "fankkuk_staff", 13000)).error?.code).toBe("P0110");
    expect(boxIntake(g.boxIds[0]!)).toBe("none/none");
  });

  it("INV-M23 S23d (실패경로): 거절로 닫힌 주문은 지금처럼 검수 불합격 — 결제 요청·알림 없음, 실비를 넣어도 남기지 않는다", async () => {
    for (const cost of [undefined, 13000]) {
      const g = await paidOrder(["small"]);
      const qr = await labeled(g.boxIds[0]!);
      expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false })).error).toBeNull();
      expect((await measure(qr, "oversize", "fankkuk_staff", cost)).data).toEqual({ result: "inspection_failed" });
      expect(boxIntake(g.boxIds[0]!)).toBe("oversize/none");
      expect(differenceRow(g.orderId)).toBe("");
      expect(alerts(g.orderId)).toBe("0");
    }
  });
});
