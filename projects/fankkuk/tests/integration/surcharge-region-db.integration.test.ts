import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminClient, deleteTestOrders, psql, psqlError, registerTestOrder, signedInClient } from "./helpers";
import { sampleEnvelope } from "./revgift-helpers";
import { createTestCreator, removeTestCreator, TEST_CREATOR } from "./test-creator";

// 할증 지역 구분 — 개인정보 구역(pii) 주소 줄의 구분 칸과 그것을 읽는 함수. supabase/manual/0030_surcharge_region.sql 을 적용해야 돈다(manual/0030 뒤).
// 스펙: address-protection INV-P20(S20·S20c), payment INV-M24(S24~S24c).
// 시험 전용 크리에이터(test-creator.ts)의 주소 칸만 쓰고, 끝나면 그 크리에이터를 주소·기록째 지운다.

const fee = (region: "jeju" | "island") => Number(psql(`select fee_krw from public.surcharge_fees where region = '${region}'`));
const smallPrice = () => Number(psql("select price_krw from public.tier_prices where tier = 'small'"));
const smallCarrier = () => Number(psql("select carrier_cost_krw from public.tier_prices where tier = 'small'"));
const setup = (sql: string) => psql(`begin; set local session_replication_role = replica; ${sql}; commit;`);

function setCreatorAddress(region: string | null, label = "home") {
  return adminClient().rpc("set_creator_address", { p_actor_id: TEST_CREATOR.profileId, p_envelope: sampleEnvelope(), p_label: label, p_region: region, p_method: "fake" });
}
const storedRegion = () => psql(`select coalesce(surcharge_region, '-') from pii.creator_addresses where creator_id = '${TEST_CREATOR.creatorId}'`);
const clearAddress = () => psql(`delete from pii.creator_addresses where creator_id = '${TEST_CREATOR.creatorId}'`);
const toTestCreator = (boxes: number) => registerTestOrder(boxes, { creatorId: TEST_CREATOR.creatorId });
const paymentRow = (orderId: string) =>
  psql(`select amount_krw || '|' || shipping_fee_krw || '|' || surcharge_krw from public.payments where order_id = '${orderId}' and kind = 'initial'`);
const boxRows = (orderId: string) =>
  psql(`select string_agg(price_krw || '/' || shipping_fee_krw || '/' || surcharge_krw, ',' order by seq) from public.boxes where order_id = '${orderId}'`);

beforeAll(() => {
  removeTestCreator();
  createTestCreator();
});
afterEach(() => {
  psql(`delete from public.surcharge_region_mismatches where box_id in (select b.id from public.boxes b join public.orders o on o.id = b.order_id where o.creator_id = '${TEST_CREATOR.creatorId}')`);
  deleteTestOrders();
});
afterAll(() => {
  removeTestCreator();
});

describe("INV-P20 ②: 주소 줄에는 암호문과 구분만 — 우편번호 칸이 없다 (manual/0030 뒤)", () => {
  it("INV-P20 S20: 구분 「제주」로 저장하면 주소 줄에 그 구분이 저장된다 — 주소 줄에 우편번호 칸이 없다", async () => {
    clearAddress();
    const { data, error } = await setCreatorAddress("jeju");
    expect(error).toBeNull();
    expect(data).toBe("saved");
    expect(storedRegion()).toBe("jeju");
    const columns = psql("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'pii' and table_name in ('creator_addresses', 'fan_addresses')");
    expect(columns).not.toMatch(/zip|postal|postcode/);
  });

  it("INV-P20 S20 (실패경로): 구분이 없거나 목록 밖(우편번호 포함)이면 22023, 아무것도 바뀌지 않는다", async () => {
    clearAddress();
    await setCreatorAddress("none");
    const before = psql(`select envelope::text from pii.creator_addresses where creator_id = '${TEST_CREATOR.creatorId}'`);
    for (const bad of [null, "", "63309", "JEJU"]) expect((await setCreatorAddress(bad)).error?.code).toBe("22023");
    expect(storedRegion()).toBe("none");
    expect(psql(`select envelope::text from pii.creator_addresses where creator_id = '${TEST_CREATOR.creatorId}'`)).toBe(before);
  });

  it("INV-P20 (실패경로): 구분 없이 저장하던 옛 함수(네 인자)는 없다", () => {
    expect(psql("select count(*) from pg_proc where proname = 'set_creator_address' and pronargs = 4")).toBe("0");
    expect(psql("select count(*) from pg_proc where proname = 'set_my_fan_address' and pronargs = 2")).toBe("0");
  });

  it("INV-P20 S20: 팬 받을 주소도 구분과 함께 저장된다 — 목록 밖이면 22023", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const fanId = psql("select id from public.profiles where login_id = 'byeolbit_fan'");
    const before = psql(`select coalesce(envelope::text, '') || '|' || coalesce(label, '') || '|' || coalesce(surcharge_region, '') from pii.fan_addresses where account_id = '${fanId}'`);
    try {
      expect((await fan.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home", p_region: "island" })).data).toBe("saved");
      expect(psql(`select surcharge_region from pii.fan_addresses where account_id = '${fanId}'`)).toBe("island");
      expect((await fan.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home", p_region: "23100" })).error?.code).toBe("22023");
    } finally {
      if (before === "") psql(`delete from pii.fan_addresses where account_id = '${fanId}'`);
      else {
        const [envelope, label, region] = before.split("|");
        psql(`update pii.fan_addresses set envelope = '${envelope}'::jsonb, label = '${label}', surcharge_region = '${region}' where account_id = '${fanId}'`);
      }
    }
  });
});

describe("INV-M24: 결제 대기를 만드는 순간의 주소 구분으로 상자마다 할증 (manual/0030 뒤)", () => {
  it("INV-M24 S24: 구분 「제주」 크리에이터, 소형 2상자 — 금액 = 소형 요금 × 2 + 제주 할증 × 2, 배송비 칸·상자 배송비 각각에 할증", async () => {
    clearAddress();
    await setCreatorAddress("jeju");
    const o = await toTestCreator(2);
    const f = fee("jeju");
    expect(paymentRow(o.orderId)).toBe(`${smallPrice() * 2 + f * 2}|${smallCarrier() * 2 + f * 2}|${f * 2}`);
    const box = `${smallPrice() + f}/${smallCarrier() + f}/${f}`;
    expect(boxRows(o.orderId)).toBe(`${box},${box}`);
  });

  it("INV-M24: 구분 「도서」면 도서 할증(설정값)", async () => {
    clearAddress();
    await setCreatorAddress("island");
    const o = await toTestCreator(1);
    expect(paymentRow(o.orderId)).toBe(`${smallPrice() + fee("island")}|${smallCarrier() + fee("island")}|${fee("island")}`);
  });

  it("INV-M24: 할증 설정값을 바꾸면 그 뒤 결제 대기부터 바뀐 값", async () => {
    clearAddress();
    await setCreatorAddress("jeju");
    const saved = fee("jeju");
    try {
      psql(`update public.surcharge_fees set fee_krw = ${saved + 1000} where region = 'jeju'`);
      const o = await toTestCreator(1);
      expect(paymentRow(o.orderId).split("|")[2]).toBe(String(saved + 1000));
    } finally {
      psql(`update public.surcharge_fees set fee_krw = ${saved} where region = 'jeju'`);
    }
  });

  it("INV-M24 S24b: 주소 없는 크리에이터 — 할증 없음. 결제 뒤 제주 주소를 등록해도 이미 만든 금액은 그대로", async () => {
    clearAddress();
    const o = await toTestCreator(1);
    const before = paymentRow(o.orderId);
    expect(before.split("|")[2]).toBe("0");
    await setCreatorAddress("jeju");
    expect(paymentRow(o.orderId)).toBe(before);
    expect(boxRows(o.orderId)).toBe(`${smallPrice()}/${smallCarrier()}/0`);
  });

  it("INV-M24 S24c (실패경로): 팬·크리에이터·서비스 키 모두 크리에이터 구분을 직접 읽지 못한다", async () => {
    clearAddress();
    await setCreatorAddress("jeju");
    for (const c of [await signedInClient("byeolbit_fan"), await signedInClient("haru_creator"), adminClient()]) {
      const r = await c.rpc("creator_surcharge_region", { p_creator_id: TEST_CREATOR.creatorId });
      expect(r.error).not.toBeNull();
      expect(r.data).toBeNull();
    }
  });

  it("INV-M24 ⑤: 등록 함수 밖에서 pii 주소 줄의 구분 칸을 읽는 공개 함수는 구분 읽기 함수·재판정 함수 둘뿐이다", () => {
    const readers = psql(
      "select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc like '%surcharge_region%' and p.prosrc like '%pii.%'",
    );
    expect(readers).toBe("creator_surcharge_region,invoice_report_surcharge_region");
  });
});

describe("INV-P20 ③: 송장 출력 때 재판정 — 다르면 운영자 화면에 한 줄 (manual/0030 뒤)", () => {
  async function printedBox(): Promise<{ boxId: string; orderNo: string }> {
    const o = await toTestCreator(1);
    const boxId = psql(`select id from public.boxes where order_id = '${o.orderId}'`);
    setup(`update public.office_parcels set state = 'label_printed', printed_at = now() where box_id = '${boxId}'`);
    return { boxId, orderNo: o.orderNo };
  }
  const report = (boxId: string, region: string) =>
    psql(`begin; set local role address_decryptor; select public.invoice_report_surcharge_region('${boxId}', '${region}'); commit;`).split("\n").find((l) => l === "t" || l === "f");

  it("INV-P20 S20c: 저장 「할증 없음」, 연 우편번호가 제주 — 한 줄(상자·두 구분)이 남고 운영자가 읽는다", async () => {
    clearAddress();
    await setCreatorAddress("none");
    const { boxId, orderNo } = await printedBox();
    expect(report(boxId, "jeju")).toBe("t");
    expect(psql(`select stored_region || '>' || opened_region from public.surcharge_region_mismatches where box_id = '${boxId}'`)).toBe("none>jeju");
    const rows = ((await (await signedInClient("fankkuk_admin")).rpc("admin_surcharge_mismatches")).data as { order_no: string }[]).filter((r) => r.order_no === orderNo);
    expect(rows).toHaveLength(1);
  });

  it("INV-P20 (실패경로): 같은 구분이거나 송장이 나오지 않은 상자면 줄이 없다", async () => {
    clearAddress();
    await setCreatorAddress("jeju");
    const { boxId } = await printedBox();
    expect(report(boxId, "jeju")).toBe("f");
    const o = await toTestCreator(1);
    const unprinted = psql(`select id from public.boxes where order_id = '${o.orderId}'`);
    expect(report(unprinted, "none")).toBe("f");
    expect(psql(`select count(*) from public.surcharge_region_mismatches where box_id in ('${boxId}', '${unprinted}')`)).toBe("0");
  });

  it("INV-P20 (실패경로): 목록 밖 구분(우편번호)은 22023, 복호화 전용 역할이 아니면 부르지 못한다", async () => {
    clearAddress();
    await setCreatorAddress("none");
    const { boxId } = await printedBox();
    expect(psqlError(`begin; set local role address_decryptor; select public.invoice_report_surcharge_region('${boxId}', '63309'); commit;`)).toMatch(/22023|목록에 없다/);
    for (const c of [await signedInClient("fankkuk_admin"), adminClient()]) {
      expect((await c.rpc("invoice_report_surcharge_region", { p_box_id: boxId, p_opened_region: "jeju" })).error).not.toBeNull();
    }
    expect(psql(`select count(*) from public.surcharge_region_mismatches where box_id = '${boxId}'`)).toBe("0");
  });
});
