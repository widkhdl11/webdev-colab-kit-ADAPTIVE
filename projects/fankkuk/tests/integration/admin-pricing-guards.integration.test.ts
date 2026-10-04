import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createSupabaseRevgiftStore } from "@/features/revgift-send/api/supabase-revgift-store";
import {
  deleteTestRevgifts,
  FIRST,
  FIRST_TEXT,
  orderArgs,
  OWNER_ID,
  pricesNow,
  resetPrices,
  SMALL_FIRST,
  table,
  type TablePatch,
} from "./admin-pricing-helpers";
import { adminClient, anonClient, deleteTestOrders, psql, psqlError, SEED, signedInClient } from "./helpers";
import { followHaru, PROFILE, revgiftArgs, unfollowHaru } from "./revgift-helpers";

// 요금표 장치 하나하나를 붙드는 시험 (admin-console INV-K1~K6). 각 시험은 한 칸만 틀리게 보내고 오류 코드까지 고정한다 —
// 그 장치 하나만 지우면 이 시험이 빨개져야 한다.

afterEach(() => {
  resetPrices();
  deleteTestOrders();
  deleteTestRevgifts();
});

afterAll(() => {
  unfollowHaru([PROFILE.gureumppang]);
});

async function saveAsOwner(patch: TablePatch): Promise<void> {
  const owner = await signedInClient("fankkuk_admin");
  const { error } = await owner.rpc("admin_set_tier_prices", { p_rows: table(patch) });
  if (error) throw new Error(`대표 저장 실패: ${error.code}`);
}

describe("요금 공개 범위 (INV-K3·K6 읽기)", () => {
  it("INV-K3: 로그인 안 한 사람이 읽는 공개 요금표는 구간·받는 값·역조공 값 세 칸뿐이다", async () => {
    const { data, error } = await anonClient().rpc("public_tier_prices");
    expect(error).toBeNull();
    expect(data).toEqual([
      { tier: "small", price_krw: 6900, revgift_price_krw: 5400 },
      { tier: "medium", price_krw: 8900, revgift_price_krw: 6900 },
      { tier: "large", price_krw: 10900, revgift_price_krw: 8400 },
    ]);
  });

  it("INV-K3 (실패경로): 택배 원가·검수비가 든 전체 요금표는 로그인 안 한 사람·팬 키로 읽을 수 없다(42501)", async () => {
    expect((await anonClient().rpc("current_tier_prices")).error?.code).toBe("42501");
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("current_tier_prices")).error?.code).toBe("42501");
  });

  it("INV-K3: 앱 서버 키는 등록 계산에 쓰는 전체 요금표를 읽는다", async () => {
    const { data, error } = await adminClient().rpc("current_tier_prices");
    expect(error).toBeNull();
    expect(data).toEqual(FIRST);
  });
});

describe("관리자 읽기는 운영자만 (INV-K1)", () => {
  it("INV-K1 (S1b, 실패경로): 기록이 한 줄 있어도 팬·크리에이터가 읽는 요금 변경 기록은 빈 결과", async () => {
    await saveAsOwner({ small: { price_krw: 7400 } });
    expect(psql("select count(*) from public.tier_price_changes")).toBe("1");
    for (const id of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(id);
      const { data, error } = await c.rpc("admin_price_changes");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    // 같은 기록을 운영자는 읽는다 — 빈 결과가 기록이 없어서가 아님을 확인
    const staff = await signedInClient("fankkuk_staff");
    expect(((await staff.rpc("admin_price_changes")).data as unknown[]).length).toBe(1);
  });
});

describe("등록 금액은 칸마다 등록 순간 요금표로 다시 계산한다 (INV-K3)", () => {
  // 소형 하나 = 6,900 (서비스 1,400 · 검수 1,500 · 배송 4,000)
  it.each([
    ["상품값만", { ...SMALL_FIRST, goods: 100 }],
    ["배송비만", { ...SMALL_FIRST, shipping: 4100 }],
    ["서비스비만", { ...SMALL_FIRST, service: 1500 }],
    ["검수비만", { ...SMALL_FIRST, inspection: 1600 }],
  ])("INV-K3 (실패경로): register_order — %s 틀리면 P0031, 아무것도 남지 않는다", async (_label, amounts) => {
    const args = orderArgs(["small"], amounts);
    expect((await adminClient().rpc("register_order", args)).error?.code).toBe("P0031");
    expect(psql(`select count(*) from public.orders where order_no = '${args.p_order_no}'`)).toBe("0");
  });

  it("INV-K3: 같은 인자에 칸을 고치지 않으면 등록된다 — 위 시험들이 다른 이유로 거부된 게 아님", async () => {
    expect((await adminClient().rpc("register_order", orderArgs(["small"], SMALL_FIRST))).error).toBeNull();
  });
});

describe("역조공 등록 금액도 칸마다 다시 계산한다 (INV-K3 · reverse-gift INV-R3)", () => {
  // 별빛·구름빵에게 소형 하나씩: 몫 5,400(배송 4,000) × 2, 결제 10,800 = 서비스 2,800 + 배송 8,000
  const twoSmall = () => {
    followHaru([PROFILE.gureumppang]);
    return revgiftArgs([
      { fanId: PROFILE.byeolbit, tier: "small" },
      { fanId: PROFILE.gureumppang, tier: "small" },
    ]);
  };
  type Args = ReturnType<typeof twoSmall>;
  const shift = (a: Args, key: "amount_krw" | "shipping_fee_krw"): Args => ({
    ...a,
    // 한 몫은 +100, 다른 몫은 −100 — 몫 합계는 그대로라 합계 검사에 먼저 걸리지 않는다
    p_shares: a.p_shares.map((s, i) => ({ ...s, [key]: s[key] + (i === 0 ? 100 : -100) })),
  });

  it.each([
    ["몫 금액만", (a: Args) => shift(a, "amount_krw")],
    ["몫 배송비만", (a: Args) => shift(a, "shipping_fee_krw")],
    ["상품값만", (a: Args) => ({ ...a, p_goods_krw: 100 })],
    ["검수비만", (a: Args) => ({ ...a, p_inspection_fee_krw: 100 })],
    ["배송비만", (a: Args) => ({ ...a, p_shipping_fee_krw: a.p_shipping_fee_krw + 100 })],
    ["서비스비만", (a: Args) => ({ ...a, p_service_fee_krw: a.p_service_fee_krw + 100 })],
  ])("INV-K3 (실패경로): register_revgift — %s 틀리면 P0031, 아무것도 남지 않는다", async (_label, bend) => {
    const args = bend(twoSmall());
    expect((await adminClient().rpc("register_revgift", args)).error?.code).toBe("P0031");
    expect(psql(`select count(*) from public.revgift_sends where toss_order_id = '${args.p_toss_order_id}'`)).toBe("0");
  });

  it("INV-R3 (실패경로): register_revgift — 결제 금액만 틀리면 몫 합계 검사가 먼저 거부한다(22023)", async () => {
    // 몫이 모두 요금표와 맞으면 몫 합계 = 요금표 합계라, 결제 금액만 다른 요청은 합계 검사에서 먼저 걸린다
    const args = { ...twoSmall(), p_amount_krw: 10900 };
    expect((await adminClient().rpc("register_revgift", args)).error?.code).toBe("22023");
    expect(psql(`select count(*) from public.revgift_sends where toss_order_id = '${args.p_toss_order_id}'`)).toBe("0");
  });

  it("INV-K3: 칸을 고치지 않은 같은 요청은 등록된다 — 위 시험들이 다른 이유로 거부된 게 아님", async () => {
    expect((await adminClient().rpc("register_revgift", twoSmall())).error).toBeNull();
  });

  it("INV-K3 (실패경로): 역조공 저장소는 DB 의 금액 거부(P0031)를 price_changed 로 알린다 — 화면에 409 가 가는 자리", async () => {
    const a = shift(twoSmall(), "amount_krw");
    const store = createSupabaseRevgiftStore(adminClient());
    await expect(
      store.create({
        senderId: PROFILE.haru,
        tossOrderId: a.p_toss_order_id,
        charge: { goodsKrw: 0, serviceFeeKrw: a.p_service_fee_krw, inspectionFeeKrw: 0, shippingFeeKrw: a.p_shipping_fee_krw, totalKrw: a.p_amount_krw },
        shares: a.p_shares.map((s) => ({
          fanId: s.fan_id,
          tier: s.tier,
          orderNo: s.order_no,
          amountKrw: s.amount_krw,
          shippingFeeKrw: s.shipping_fee_krw,
        })),
      }),
    ).rejects.toSatisfy((e) => (e as { refusal?: unknown }).refusal === "price_changed");
  });
});

describe("요금표 저장 조건 (INV-K4)", () => {
  it.each([
    // 대형 원가 8,500: 소형 4,000 ≤ 중형 5,000 ≤ 대형 8,500 순서는 지키고, 8,500 + 2,500 > 10,900 만 어긴다
    ["(b) 순서는 지키고 택배 원가 + 검수비 > 받는 값만", table({ large: { carrier_cost_krw: 8500 } })],
    ["(a) 소수", table({ small: { price_krw: 6900.5 } })],
    ["(a) 문자", table({ small: { price_krw: "6900" as unknown as number } })],
    ["(a) 1천만 초과", table({ large: { price_krw: 10_000_001 } })],
    ["(a) 택배 원가 음수", table({ small: { carrier_cost_krw: -1 } })],
    ["네 줄", [...FIRST, FIRST[0]]],
  ])("INV-K4 (S4, 실패경로): %s → 22023, 요금표·기록 그대로", async (_label, rows) => {
    const owner = await signedInClient("fankkuk_admin");
    const { error } = await owner.rpc("admin_set_tier_prices", { p_rows: rows });
    expect(error?.code).toBe("22023");
    expect(pricesNow()).toBe(FIRST_TEXT);
    expect(psql("select count(*) from public.tier_price_changes")).toBe("0");
  });

  it("INV-K4 (실패경로): 배열이 아닌 몸통 → 22023", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_tier_prices", { p_rows: { small: FIRST[0] } })).error?.code).toBe("22023");
    expect(pricesNow()).toBe(FIRST_TEXT);
  });

  it("INV-K4 (c, 실패경로): DB 에서 직접 구간 행을 지우면 처리 끝의 표 전체 검사가 거부한다", () => {
    try {
      expect(psqlError("delete from public.tier_prices where tier = 'large'")).toMatch(/소형·중형·대형이 모두/);
      expect(pricesNow()).toBe(FIRST_TEXT);
    } finally {
      // 검사가 빠진 상태에서 지워졌더라도 다음 시험이 대형 없는 표로 돌지 않게 되돌린다
      psql("insert into public.tier_prices (tier, price_krw, carrier_cost_krw, inspection_fee_krw) values ('large', 10900, 6500, 2500) on conflict (tier) do nothing");
    }
  });
});

describe("요금 관련 표는 대표도 직접 고칠 수 없다 (INV-K2·K4·K5)", () => {
  it("INV-K2·K4 (실패경로): 대표가 요금표를 직접 update/insert/delete → 42501, 값 그대로", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.from("tier_prices").update({ price_krw: 7400 }).eq("tier", "small")).error?.code).toBe("42501");
    expect((await owner.from("tier_prices").insert({ tier: "oversize", price_krw: 1, carrier_cost_krw: 0, inspection_fee_krw: 0 })).error?.code).toBe("42501");
    expect((await owner.from("tier_prices").delete().eq("tier", "large")).error?.code).toBe("42501");
    expect(pricesNow()).toBe(FIRST_TEXT);
  });

  it("INV-K5 (실패경로): 대표가 요금 변경 기록을 직접 insert/update/delete → 42501, 기록 그대로", async () => {
    await saveAsOwner({ small: { price_krw: 7400 } });
    const before = psql("select id || '|' || before_krw || '|' || after_krw from public.tier_price_changes");
    const owner = await signedInClient("fankkuk_admin");
    const fake = { changed_by: OWNER_ID, tier: "medium", field: "price_krw", before_krw: 1, after_krw: 2 };
    expect((await owner.from("tier_price_changes").insert(fake)).error?.code).toBe("42501");
    expect((await owner.from("tier_price_changes").update({ after_krw: 1 }).gte("id", 0)).error?.code).toBe("42501");
    expect((await owner.from("tier_price_changes").delete().gte("id", 0)).error?.code).toBe("42501");
    expect(psql("select id || '|' || before_krw || '|' || after_krw from public.tier_price_changes")).toBe(before);
  });

  it("INV-K2 (실패경로): 대표가 대표 설정 표를 직접 update/insert/delete → 42501, 대표 그대로", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.from("owner_setting").update({ owner_user_id: SEED.fanId }).eq("id", true)).error?.code).toBe("42501");
    expect((await owner.from("owner_setting").insert({ id: true, owner_user_id: SEED.fanId })).error?.code).toBe("42501");
    expect((await owner.from("owner_setting").delete().eq("id", true)).error?.code).toBe("42501");
    expect(psql("select owner_user_id from public.owner_setting")).toBe(OWNER_ID);
  });
});

describe("대표 판정 안의 운영자 조건 (INV-K2)", () => {
  it("INV-K2 (실패경로): 대표 설정에 운영자가 아닌 계정이 적혀 있어도 그 계정의 요금 변경은 거부된다(42501)", async () => {
    psql(`update public.owner_setting set owner_user_id = '${SEED.fanId}'`);
    try {
      const fan = await signedInClient("byeolbit_fan");
      const { error } = await fan.rpc("admin_set_tier_prices", { p_rows: table({ small: { price_krw: 7400 } }) });
      expect(error?.code).toBe("42501");
      expect(pricesNow()).toBe(FIRST_TEXT);
    } finally {
      psql(`update public.owner_setting set owner_user_id = '${OWNER_ID}'`);
    }
    expect(psql("select owner_user_id from public.owner_setting")).toBe(OWNER_ID);
  });
});

describe("대형을 넘는 상자 (INV-K6)", () => {
  it("INV-K6 (실패경로): oversize 신고는 금액을 양수로 맞춰 보내도 받을 수 없는 구간(22023)", async () => {
    const args = orderArgs(["oversize"], { service: 1900, inspection: 2500, shipping: 6500, total: 10900 });
    const { error } = await adminClient().rpc("register_order", args);
    expect(error?.code).toBe("22023");
    expect(error?.message).toContain("받을 수 없는 상자 구간");
    expect(psql(`select count(*) from public.orders where order_no = '${args.p_order_no}'`)).toBe("0");
  });
});
