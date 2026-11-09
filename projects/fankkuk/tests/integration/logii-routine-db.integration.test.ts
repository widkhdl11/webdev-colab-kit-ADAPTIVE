import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monthlyShipmentsFromRow } from "@/entities/payment/model/monthly-shipments";
import { OWNER_ID, resetPrices } from "./admin-pricing-helpers";
import { psql, signedInClient } from "./helpers";
import { paidGift, waybill } from "./office-helpers";

// 로지아이 답 반영 (DECISIONS 2026-11-09) — admin-console INV-K17(월 발송 건수·경로 재검토)·INV-K15 S15c(요금표 원가를 기본 경로 값으로 맞춤).
// 시드: fankkuk_staff = 직원 운영자, byeolbit_fan = 팬.

// 주문 등록 도우미는 첫 요금표 값으로 금액을 맞춘다
beforeAll(() => {
  resetPrices();
});
afterAll(() => {
  resetPrices();
});

async function monthly() {
  const staff = await signedInClient("fankkuk_staff");
  const { data, error } = await staff.rpc("admin_monthly_shipments");
  expect(error).toBeNull();
  const s = monthlyShipmentsFromRow(data);
  expect(s).not.toBeNull();
  return s!;
}

function thisMonthCount(s: Awaited<ReturnType<typeof monthly>>): number {
  return s.months.find((m) => m.month === s.currentMonth)!.count;
}

/** 상자 셋 — 출고 확정 · 개인접수 상자 출고 확정 · 반송 확정. 상태 전환 함수는 이 시험의 대상이 아니라 표를 바로 고친다. */
async function threeParcels(): Promise<void> {
  const g = await paidGift(3);
  const [shipped, personal, returned] = g.boxIds;
  const sql = [
    "begin; set local session_replication_role = replica;",
    `update public.office_parcels set state = 'shipped', received_at = now(), shipped_at = now(), printed_at = now(), outbound_waybill_no = '${waybill()}' where box_id = '${shipped}';`,
    `update public.boxes set measured_tier = 'large', personal_intake_cost_krw = 13000 where id = '${personal}';`,
    `update public.office_parcels set state = 'shipped', received_at = now(), shipped_at = now(), printed_at = now(), outbound_waybill_no = '${waybill()}' where box_id = '${personal}';`,
    `update public.office_parcels set state = 'returned', received_at = now(), returned_at = now(), return_printed_at = now(), return_waybill_no = '${waybill()}' where box_id = '${returned}';`,
    "commit;",
  ];
  psql(sql.join(" "));
}

describe("월 발송 건수 (admin-console INV-K17)", () => {
  it("INV-K17 (S17d): 출고 확정·반송 확정은 세고, 우체국으로 가는 개인접수 상자는 세지 않는다", async () => {
    const before = thisMonthCount(await monthly());
    await threeParcels();
    const after = await monthly();
    expect(thisMonthCount(after)).toBe(before + 2);
    expect(after.firstMonth).not.toBeNull();
    expect(after.months.at(-1)!.month).toBe(after.currentMonth);
  });

  it("INV-K17 (S17d, 실패경로): 운영자가 아니면 빈 값이고, 건수 말고 다른 칸이 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const { data, error } = await fan.rpc("admin_monthly_shipments");
    expect(error).toBeNull();
    expect(data).toBeNull();
    const staff = await signedInClient("fankkuk_staff");
    const row = (await staff.rpc("admin_monthly_shipments")).data as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["current_month", "first_month", "min_monthly", "months", "months_needed"]);
    expect(Object.keys((row.months as Record<string, unknown>[])[0]!).sort()).toEqual(["count", "month"]);
  });

  it("INV-K17 (S17d): 기준 건수·달 수는 DB 설정값이고, 화면 판정이 그 값을 따른다", async () => {
    const saved = psql("select route_review_min_monthly || ',' || route_review_months from public.pricing_settings");
    try {
      const now = await monthly();
      expect([now.minMonthly, now.monthsNeeded]).toEqual(saved.split(",").map(Number));
      psql("update public.pricing_settings set route_review_min_monthly = 7, route_review_months = 3");
      const changed = await monthly();
      expect([changed.minMonthly, changed.monthsNeeded]).toEqual([7, 3]);
      expect(psql("select count(*) from pg_constraint where conname = 'pricing_settings_route_review'")).toBe("1");
      expect(() => psql("update public.pricing_settings set route_review_months = 0")).toThrow();
    } finally {
      const [min, months] = saved.split(",");
      psql(`update public.pricing_settings set route_review_min_monthly = ${min}, route_review_months = ${months}`);
    }
  });
});

describe("요금표 원가를 기본 경로 값으로 맞춤 (admin-console INV-K15 S15c)", () => {
  function arrange(costs: [number, number, number], inspection: number): void {
    psql(
      [
        "begin;",
        "update public.pricing_settings set default_route = 'logii_cj_a';",
        ...["small", "medium", "large"].map((t, i) => `update public.tier_prices set price_krw = ${[5900, 7900, 9900][i]}, carrier_cost_krw = ${costs[i]}, inspection_fee_krw = ${inspection} where tier = '${t}';`),
        "set local session_replication_role = replica;",
        "delete from public.tier_price_changes;",
        "commit;",
      ].join(" "),
    );
  }
  const route = () =>
    psql("select string_agg(cost_krw::text, ',' order by array_position(array['small','medium','large'], tier)) from public.carrier_route_costs where route = 'logii_cj_a' and tier <> 'xsmall'")
      .split(",")
      .map(Number);
  const costsNow = () => psql("select string_agg(carrier_cost_krw::text, ',' order by tier) from public.tier_prices").split(",").map(Number);

  it("INV-K15 (S15c): 원가 칸이 기본 경로 값과 다르면 그 경로 값으로 맞추고, 바뀐 칸마다 대표 이름으로 기록한다", () => {
    arrange([4000, 5000, 6500], 900);
    expect(psql("select public.pricing_sync_carrier_costs()")).toBe("3");
    expect(costsNow()).toEqual(route());
    expect(psql(`select string_agg(tier || ':' || before_krw || '>' || after_krw || ':' || (changed_by = '${OWNER_ID}'), ',' order by tier) from public.tier_price_changes where field = 'carrier_cost_krw'`)).toBe(
      `small:4000>${route()[0]}:true,medium:5000>${route()[1]}:true,large:6500>${route()[2]}:true`,
    );
    // 이미 맞으면 아무것도 하지 않는다
    expect(psql("select public.pricing_sync_carrier_costs()")).toBe("0");
  });

  it("INV-K15 (S15c, 실패경로): 받는 값 < 경로 원가 + 검수비가 되는 구간은 건너뛴다", () => {
    arrange([3000, 4000, 5000], 2500); // 소형: 5,900 < 3,490 + 2,500
    expect(psql("select public.pricing_sync_carrier_costs()")).toBe("2");
    expect(costsNow()).toEqual([3000, route()[1], route()[2]]);
  });

  it("INV-K15 (S15c, 실패경로): 화면·API 로는 부를 수 없다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("pricing_sync_carrier_costs")).error).not.toBeNull();
  });
});
