import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  deleteTestRevgifts,
  FIRST,
  FIRST_TEXT,
  orderArgs,
  OWNER_ID,
  pricesNow,
  resetPrices,
  type Row,
  SMALL_FIRST,
  SMALL_RAISED,
  STAFF_ID,
  table,
} from "./admin-pricing-helpers";
import { adminClient, anonClient, deleteTestOrders, psql, psqlError, signedInClient } from "./helpers";
import { followHaru, PROFILE, revgiftArgs, unfollowHaru } from "./revgift-helpers";

// 관리자 화면 — 운영자 판정·요금표 (admin-console INV-K1~K6). 시드: fankkuk_admin = 대표 운영자, fankkuk_staff = 직원 운영자.

afterEach(() => {
  resetPrices();
  deleteTestOrders();
});

afterAll(() => {
  deleteTestRevgifts();
});

describe("운영자만 관리자 읽기·쓰기 (INV-K1)", () => {
  it("INV-K1 (S1): 운영자는 요금표를 읽는다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const { data, error } = await staff.rpc("admin_tier_prices");
    expect(error).toBeNull();
    expect((data as Row[]).map((r) => r.tier)).toEqual(["small", "medium", "large"]);
  });

  it("INV-K1 (S1b, 실패경로): 팬·크리에이터의 관리자 읽기는 빈 결과, 쓰기는 거부되고 요금표 그대로", async () => {
    for (const id of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(id);
      expect((await c.rpc("admin_tier_prices")).data).toEqual([]);
      expect((await c.rpc("admin_price_changes")).data).toEqual([]);
      const w = await c.rpc("admin_set_tier_prices", { p_rows: table({ small: { price_krw: 100, carrier_cost_krw: 0, inspection_fee_krw: 0 } }) });
      expect(w.error?.code).toBe("42501");
    }
    expect(pricesNow()).toBe(FIRST_TEXT);
  });

  it("INV-K1 (실패경로): 로그인하지 않은 키로는 관리자 쓰기를 할 수 없다", async () => {
    expect((await anonClient().rpc("admin_set_tier_prices", { p_rows: table() })).error).not.toBeNull();
    expect(pricesNow()).toBe(FIRST_TEXT);
  });

  it("INV-K1: 운영자도 계정 역할을 바꿀 수 없다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    await owner.from("profiles").update({ role: "fan" }).eq("id", STAFF_ID);
    expect(psql(`select role from public.profiles where id = '${STAFF_ID}'`)).toBe("operator");
  });
});

describe("요금은 대표만 바꾼다 (INV-K2)", () => {
  it("INV-K2 (S2): 대표가 소형 받는 값을 7,400 으로 바꾸면 저장된다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const { error } = await owner.rpc("admin_set_tier_prices", { p_rows: table({ small: { price_krw: 7400 } }) });
    expect(error).toBeNull();
    expect(pricesNow()).toBe("small:7400/4000/1500,medium:8900/5000/2000,large:10900/6500/2500");
  });

  it("INV-K2 (S2b, 실패경로): 직원 운영자가 바꾸면 거부, 요금표 그대로", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const { error } = await staff.rpc("admin_set_tier_prices", { p_rows: table({ small: { price_krw: 7400 } }) });
    expect(error?.code).toBe("42501");
    expect(pricesNow()).toBe(FIRST_TEXT);
  });

  it("INV-K2 (실패경로): 대표 설정 표는 로그인한 누구도 고칠 수 없다 — 운영자도", async () => {
    for (const id of ["fankkuk_staff", "fankkuk_admin"]) {
      const c = await signedInClient(id);
      await c.from("owner_setting").update({ owner_user_id: STAFF_ID }).eq("id", true);
    }
    expect(psql("select owner_user_id from public.owner_setting")).toBe(OWNER_ID);
  });
});

describe("결제 금액은 등록 순간의 요금표 (INV-K3)", () => {
  it("INV-K3 (S3): 바꾸기 전에 등록한 결제 대기는 바꾼 뒤에도 6,900 그대로", async () => {
    const reg = await adminClient().rpc("register_order", orderArgs(["small"], SMALL_FIRST));
    expect(reg.error).toBeNull();
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_tier_prices", { p_rows: table({ small: { price_krw: 7400 } }) })).error).toBeNull();
    expect(psql(`select amount_krw from public.payments where order_id = '${reg.data as string}'`)).toBe("6900");
  });

  it("INV-K3 (S3b): 바꾼 뒤 새 등록은 7,400 — 옛 요금으로 계산한 금액은 거부되고 아무것도 남지 않는다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_tier_prices", { p_rows: table({ small: { price_krw: 7400 } }) })).error).toBeNull();
    const stale = orderArgs(["small"], SMALL_FIRST);
    expect((await adminClient().rpc("register_order", stale)).error?.code).toBe("P0031");
    expect(psql(`select count(*) from public.orders where order_no = '${stale.p_order_no}'`)).toBe("0");
    expect((await adminClient().rpc("register_order", orderArgs(["small"], SMALL_RAISED))).error).toBeNull();
  });

  it("INV-K3 (실패경로): 합은 맞고 칸 나눔만 다른 금액도 거부", async () => {
    const shifted = orderArgs(["small"], { service: 1500, inspection: 1400, shipping: 4000, total: 6900 });
    expect((await adminClient().rpc("register_order", shifted)).error?.code).toBe("P0031");
  });

  it("INV-K3 (S3c, 동시): 등록과 요금 변경이 겹쳐도 결제 기록의 네 칸은 한 요금표의 값과 맞는다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const jobs: PromiseLike<unknown>[] = [];
    for (let i = 0; i < 16; i++) {
      jobs.push(adminClient().rpc("register_order", orderArgs(["small", "medium"], i % 2 ? { service: 1900 + 1900, inspection: 3500, shipping: 9000, total: 7400 + 8900 } : { service: 1400 + 1900, inspection: 3500, shipping: 9000, total: 6900 + 8900 })));
      if (i % 3 === 0) jobs.push(owner.rpc("admin_set_tier_prices", { p_rows: table(i % 2 ? {} : { small: { price_krw: 7400 } }) }));
    }
    await Promise.all(jobs);
    const rows = psql(
      "select distinct p.amount_krw || '/' || p.service_fee_krw || '/' || p.inspection_fee_krw || '/' || p.shipping_fee_krw from public.payments p join public.orders o on o.id = p.order_id where o.item_kind = '시험 선물'",
    )
      .split("\n")
      .filter(Boolean);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(["15800/3300/3500/9000", "16300/3800/3500/9000"]).toContain(r);
  });
});

describe("요금표 저장 조건 (INV-K4)", () => {
  it.each([
    ["(b) 택배 원가 + 검수비 > 받는 값", { medium: { carrier_cost_krw: 7000 } }],
    ["(c) 중형 받는 값 < 소형", { medium: { price_krw: 6800, carrier_cost_krw: 4000, inspection_fee_krw: 1500 } }],
    ["(c) 대형 택배 원가 < 중형", { large: { carrier_cost_krw: 4900 } }],
    ["(a) 음수", { small: { inspection_fee_krw: -1 } }],
    ["(a) 받는 값 0", { small: { price_krw: 0, carrier_cost_krw: 0, inspection_fee_krw: 0 } }],
  ])("INV-K4 (S4, 실패경로): %s 이면 통째로 거부", async (_label, patch) => {
    const owner = await signedInClient("fankkuk_admin");
    const { error } = await owner.rpc("admin_set_tier_prices", { p_rows: table(patch as Partial<Record<string, Partial<Row>>>) });
    expect(error?.code).toBe("22023");
    expect(pricesNow()).toBe(FIRST_TEXT);
    expect(psql("select count(*) from public.tier_price_changes")).toBe("0");
  });

  it("INV-K4 (실패경로): 구간이 빠지거나 겹친 표는 거부", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_tier_prices", { p_rows: FIRST.slice(0, 2) })).error?.code).toBe("22023");
    expect((await owner.rpc("admin_set_tier_prices", { p_rows: [FIRST[0], FIRST[0], FIRST[2]] })).error?.code).toBe("22023");
    expect(pricesNow()).toBe(FIRST_TEXT);
  });

  it("INV-K4: 함수를 거치지 않은 쓰기도 DB 요금표가 받지 않는다", () => {
    expect(psqlError("update public.tier_prices set carrier_cost_krw = 9000 where tier = 'small'")).not.toBeNull();
    expect(psqlError("update public.tier_prices set price_krw = 9900 where tier = 'small'")).not.toBeNull();
    expect(pricesNow()).toBe(FIRST_TEXT);
  });
});

describe("요금 변경 기록 (INV-K5)", () => {
  it("INV-K5 (S5): 바꾼 칸마다 한 줄 — 시각·대표·구간·칸·전·후", async () => {
    const owner = await signedInClient("fankkuk_admin");
    await owner.rpc("admin_set_tier_prices", { p_rows: table({ small: { price_krw: 7400 } }) });
    expect(psql("select changed_by || '|' || tier || '|' || field || '|' || before_krw || '|' || after_krw from public.tier_price_changes")).toBe(
      `${OWNER_ID}|small|price_krw|6900|7400`,
    );
    const { data } = await owner.rpc("admin_price_changes");
    expect((data as unknown[]).length).toBe(1);
  });

  it("INV-K5: 아무것도 안 바꾼 저장은 기록을 남기지 않는다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_tier_prices", { p_rows: table() })).error).toBeNull();
    expect(psql("select count(*) from public.tier_price_changes")).toBe("0");
  });

  it("INV-K5 (S5b, 실패경로): 기록은 고치거나 지울 수 없다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    await owner.rpc("admin_set_tier_prices", { p_rows: table({ small: { price_krw: 7400 } }) });
    expect(psqlError("update public.tier_price_changes set after_krw = 1")).not.toBeNull();
    expect(psqlError("delete from public.tier_price_changes")).not.toBeNull();
    expect(psql("select count(*) from public.tier_price_changes")).toBe("1");
  });
});

describe("대형 구간 (INV-K6)", () => {
  it("INV-K6 (S6c): 대형 상자 하나는 10,900원으로 등록된다", async () => {
    const { error } = await adminClient().rpc("register_order", orderArgs(["large"], { service: 1900, inspection: 2500, shipping: 6500, total: 10900 }));
    expect(error).toBeNull();
  });

  it("INV-K6 (S6c): 역조공 대형 몫은 8,400원(받는 값 − 검수비)으로 등록되고, 다른 금액은 거부된다", async () => {
    followHaru([PROFILE.gureumppang]);
    try {
      expect((await adminClient().rpc("register_revgift", revgiftArgs([{ fanId: PROFILE.gureumppang, tier: "large" }]))).error).toBeNull();
      const wrong = revgiftArgs([{ fanId: PROFILE.gureumppang, tier: "large" }]);
      const share = { ...wrong.p_shares[0]!, amount_krw: 10900 };
      const bad = { ...wrong, p_shares: [share], p_amount_krw: 10900, p_service_fee_krw: 1900, p_inspection_fee_krw: 2500 };
      expect((await adminClient().rpc("register_revgift", bad)).error?.code).toBe("P0031");
    } finally {
      unfollowHaru([PROFILE.gureumppang]);
    }
  });

  it("INV-K6 (실패경로): 대형을 넘는 신고는 받지 않는다", async () => {
    const { error } = await adminClient().rpc("register_order", orderArgs(["oversize"], { service: 0, inspection: 0, shipping: 0, total: 0 }));
    expect(error).not.toBeNull();
  });
});
