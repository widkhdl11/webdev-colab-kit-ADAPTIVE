import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, psql, psqlError, SEED, signedInClient } from "./helpers";
import { paidGift, paidShare } from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 팬꾹 주소를 DB 설정으로 — 대표만 바꾸고, 기록이 남고, 6자리를 받은 사람과 운영자만 읽는다 (admin-console INV-K19).
// 시드: fankkuk_admin = 대표, fankkuk_staff = 직원, byeolbit_fan = 시험 주문의 팬, daltokki_fan = 다른 팬, haru_creator = 크리에이터.

const NEW_ADDRESS = "서울특별시 강남구 테헤란로 1, 2층 팬꾹 검수센터";
let original = "";

function addressNow(): string {
  return psql("select address from public.office_address_setting");
}

function changeCount(): number {
  return Number(psql("select count(*) from public.office_address_changes"));
}

function restore(): void {
  psql(`update public.office_address_setting set address = '${original.replaceAll("'", "''")}'`);
  psql("alter table public.office_address_changes disable trigger user; delete from public.office_address_changes; alter table public.office_address_changes enable trigger user;");
}

beforeAll(() => {
  original = addressNow();
});

afterEach(() => {
  restore();
  deleteTestOrders();
  deleteTestRevgifts();
});

afterAll(() => {
  restore();
});

describe("팬꾹 주소는 대표만 바꾼다 (INV-K19 ①②③)", () => {
  it("INV-K19 (S19): 대표가 저장하면 새 값이 되고 기록 한 줄(이전·새 값·대표)이 남는다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const { error } = await owner.rpc("admin_set_office_address", { p_address: `  ${NEW_ADDRESS}  ` });
    expect(error).toBeNull();
    expect(addressNow()).toBe(NEW_ADDRESS);
    expect(psql("select before_address || '|' || after_address || '|' || changed_by from public.office_address_changes")).toBe(
      `${original}|${NEW_ADDRESS}|00000000-0000-4000-a000-000000000021`,
    );
    const { data } = await owner.rpc("admin_office_address_changes");
    expect((data as { before_address: string; after_address: string; changed_by_nickname: string }[])[0]).toMatchObject({
      before_address: original,
      after_address: NEW_ADDRESS,
      changed_by_nickname: "팬꾹 운영",
    });
  });

  it("INV-K19 (S19b, 실패경로): 직원 운영자·팬·크리에이터의 저장은 거부, 값과 기록 그대로", async () => {
    for (const id of ["fankkuk_staff", "byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(id);
      const w = await c.rpc("admin_set_office_address", { p_address: NEW_ADDRESS });
      expect(w.error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("admin_set_office_address", { p_address: NEW_ADDRESS })).error).not.toBeNull();
    expect(addressNow()).toBe(original);
    expect(changeCount()).toBe(0);
  });

  it("INV-K19 (S19b, 실패경로): 설정 표를 직접 고칠 수 없다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    await owner.from("office_address_setting").update({ address: NEW_ADDRESS }).eq("id", true);
    expect(addressNow()).toBe(original);
  });

  it("INV-K19 (S19c, 실패경로): 공백뿐·4자·121자·줄바꿈·제어 문자는 거부, 그대로", async () => {
    const owner = await signedInClient("fankkuk_admin");
    for (const bad of ["     ", "서울 1", "가".repeat(121), "서울특별시 강남구\n4층", "서울특별시 강남구\t4층", "서울특별시 강남구\u00854층", "서울특별시 강남구\u20284층", "서울특별시 강남구\u202E4층", "서울특별시 강남구\u200B4층"]) {
      const w = await owner.rpc("admin_set_office_address", { p_address: bad });
      expect(w.error?.code, JSON.stringify(bad)).toBe("22023");
    }
    expect(addressNow()).toBe(original);
    expect(changeCount()).toBe(0);
  });

  it("INV-K19 (S19c): 경계 — 5자와 120자는 저장된다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_office_address", { p_address: "서울 강남" })).error).toBeNull();
    expect(addressNow()).toBe("서울 강남");
    expect((await owner.rpc("admin_set_office_address", { p_address: "가".repeat(120) })).error).toBeNull();
    expect(addressNow()).toBe("가".repeat(120));
  });

  it("INV-K19 (S19c): 함수를 직접 불러도 앞뒤 전각 공백·NBSP 는 잘라 저장한다(앱 trim 과 같다)", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_office_address", { p_address: `\u3000${NEW_ADDRESS}\u00A0` })).error).toBeNull();
    expect(addressNow()).toBe(NEW_ADDRESS);
  });

  it("INV-K19 (S19c): 지금 값과 같은 값이면 바뀌는 것도 기록도 없다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_office_address", { p_address: original })).error).toBeNull();
    expect(changeCount()).toBe(0);
  });

  it("INV-K19 (S19e, 실패경로): 변경 기록은 고치거나 지울 수 없다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    await owner.rpc("admin_set_office_address", { p_address: NEW_ADDRESS });
    expect(psqlError("update public.office_address_changes set after_address = 'x'")).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError("delete from public.office_address_changes")).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError("truncate public.office_address_changes")).toMatch(/고치거나 지울 수 없다/);
    expect(changeCount()).toBe(1);
  });

  it("INV-K19 (S19b, 실패경로): 앱 서버 관리자 키도 설정 표·기록 표를 직접 고치지 못한다", async () => {
    const admin = adminClient();
    await admin.from("office_address_setting").update({ address: NEW_ADDRESS }).eq("id", true);
    expect(addressNow()).toBe(original);
    const ins = await admin.from("office_address_changes").insert({ changed_by: SEED.fanId, before_address: "가", after_address: "나" });
    expect(ins.error).not.toBeNull();
    expect(changeCount()).toBe(0);
  });
});

describe("팬꾹 주소는 6자리를 받은 사람과 운영자만 읽는다 (INV-K19 ④⑤)", () => {
  it("INV-K19 (S19d): 6자리를 받은 팬은 값을 읽고, 대표가 바꾸면 바로 새 값을 읽는다", async () => {
    await paidGift(1);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("office_address")).data).toBe(original);
    const owner = await signedInClient("fankkuk_admin");
    await owner.rpc("admin_set_office_address", { p_address: NEW_ADDRESS });
    expect((await fan.rpc("office_address")).data).toBe(NEW_ADDRESS);
  });

  it("INV-K19 (S19d): 역조공 6자리를 받은 크리에이터는 값을 읽는다", async () => {
    await paidShare();
    const creator = await signedInClient("haru_creator");
    expect((await creator.rpc("office_address")).data).toBe(original);
  });

  it("INV-K19 (S19d): 운영자(직원 포함)는 값을 읽는다", async () => {
    for (const id of ["fankkuk_staff", "fankkuk_admin"]) {
      const c = await signedInClient(id);
      expect((await c.rpc("office_address")).data).toBe(original);
      expect((await c.rpc("admin_office_address")).data).toBe(original);
    }
  });

  it("INV-K19 (S19d, 실패경로): 6자리가 없는 팬과 로그인 안 한 키는 빈 값", async () => {
    await paidGift(1); // 별빛만 6자리를 받는다
    // 전제: 달토끼에게 발급된 6자리가 없다
    expect(
      psql(`select count(*) from public.inbound_codes c join public.boxes b on b.id = c.box_id join public.orders o on o.id = b.order_id
            where o.fan_id = '${SEED.otherFanId}'`),
    ).toBe("0");
    const other = await signedInClient("daltokki_fan");
    expect((await other.rpc("office_address")).data).toBeNull();
    expect((await other.rpc("admin_office_address")).data).toBeNull();
    const anon = await anonClient().rpc("office_address");
    expect(anon.data ?? null).toBeNull();
  });
});
