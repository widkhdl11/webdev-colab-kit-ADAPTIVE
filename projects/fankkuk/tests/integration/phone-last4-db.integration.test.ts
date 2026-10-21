import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { deleteTestUnmatched, paidGift, waybill } from "./office-helpers";

// 원 송장 전화번호 뒤 4자리 (inbound-address-code INV-C5 S5f · INV-C12 ③ S12c, office-workflow INV-W5·W7 S5d, admin-console INV-K8 — 2026-10-21 사용자 「B로 하자」).
// 이 파일은 supabase/manual/0023_phone_last4.sql 이 적용된 DB 에서만 통과한다 — pii 구역의 표·저장·검색·지우기가 그 파일에 있다(사람이 적용).
// 적용 전에는 입고에 뒤 4자리를 넣으면 「아직 받을 수 없음」(0A000)으로 거부되고 검색 함수가 없어 여기 시험이 모두 실패한다.

afterEach(() => {
  deleteTestOrders();
  deleteTestUnmatched();
});

const staff = (): Promise<SupabaseClient> => signedInClient("fankkuk_staff");

async function holdWithPhone(barcode: string, last4: string | null, senderName = "김보관"): Promise<string> {
  const r = await (await staff()).rpc("office_scan_inbound", {
    p_barcode: barcode,
    p_code: null,
    p_carrier: "cj",
    p_sender_name: senderName,
    p_shelf: "T-P1",
    p_look: "흰 비닐 봉투",
    p_tier: "small",
    p_phone_last4: last4,
  });
  if (r.error) throw new Error(`office_scan_inbound 실패: ${r.error.code} ${r.error.message}`);
  expect((r.data as { result: string }).result).toBe("hold");
  return psql(`select id from public.office_unmatched where waybill_no = '${barcode}'`);
}

const stored = (id: string) => psql(`select coalesce((select last4 from pii.unmatched_phone_last4 where unmatched_id = '${id}'), 'empty')`);

describe("INV-C5 뒤 4자리만 저장하고, 이어지거나 반송되면 지운다", () => {
  it("INV-C5 (S5f): 직원이 「5678」 → 상자에 「5678」만 · 번호가 없으면 빈 칸", async () => {
    const a = await holdWithPhone(waybill(), "5678");
    expect(stored(a)).toBe("5678");
    const b = await holdWithPhone(waybill(), null);
    expect(stored(b)).toBe("empty");
    // 표는 숫자 넷만 받는다(직접 넣어도) · public 보류 줄에는 그 칸이 없다(개인정보는 pii 구역에만)
    expect(() => psql(`update pii.unmatched_phone_last4 set last4 = '12a4' where unmatched_id = '${a}'`)).toThrow();
    expect(psql("select count(*) from information_schema.columns where table_schema = 'public' and column_name ~ 'phone'")).toBe("0");
    // 데이터 API 키로는 그 표를 못 읽는다
    expect(psql("select has_table_privilege('authenticated', 'pii.unmatched_phone_last4', 'select') or has_table_privilege('anon', 'pii.unmatched_phone_last4', 'select')")).toBe("f");
  });

  it("INV-C5 (S5f): 운영자가 이으면 그 칸이 비어 있다 · 반송 대상으로 넘기면 비어 있다 · 자동 처리가 반송 대상으로 바꿔도 비어 있다", async () => {
    const g = await paidGift(1);
    const linked = await holdWithPhone(waybill(), "5678");
    const r = await (await staff()).rpc("admin_link_held_parcel", { p_id: linked, p_nickname: "별빛", p_box_id: g.boxIds[0], p_checked: true });
    expect(r.data).toBe("linked");
    expect(stored(linked)).toBe("empty");

    const returned = await holdWithPhone(waybill(), "1234");
    expect((await (await staff()).rpc("admin_return_unmatched", { p_id: returned })).error).toBeNull();
    expect(stored(returned)).toBe("empty");

    const expired = await holdWithPhone(waybill(), "4321");
    psql(`update public.office_unmatched set arrived_at = now() - interval '720 hours' where id = '${expired}'`);
    expect((await (await staff()).rpc("office_run_expiry", {})).error).toBeNull();
    expect(stored(expired)).toBe("empty");
  });
});

describe("INV-C12 ③ 운영자 뒤 4자리 검색 · INV-W5·W7 운영자 목록", () => {
  it("INV-C12 (S12c): 「5678」 상자 둘·「1111」 하나 → 운영자가 「5678」 검색하면 둘만, 칸은 운영자 목록과 같다", async () => {
    const a = await holdWithPhone(waybill(), "5678");
    const b = await holdWithPhone(waybill(), "5678");
    const c = await holdWithPhone(waybill(), "1111");
    const r = await (await staff()).rpc("admin_unmatched_by_phone_last4", { p_last4: "5678" });
    expect(r.error).toBeNull();
    const rows = r.data as Record<string, unknown>[];
    const ids = rows.map((x) => x.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
    expect(ids).not.toContain(c);
    expect(rows.every((x) => x.phone_last4 === "5678")).toBe(true);
    const all = await (await staff()).rpc("admin_unmatched_parcels");
    expect(Object.keys(rows[0]!).sort()).toEqual(Object.keys((all.data as Record<string, unknown>[])[0]!).sort());
  });

  it("INV-C12 (S12c, 실패경로): 팬·크리에이터·손님은 검색할 수 없다 · 숫자 넷이 아닌 검색어는 거부", async () => {
    await holdWithPhone(waybill(), "5678");
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      const r = await (await signedInClient(login)).rpc("admin_unmatched_by_phone_last4", { p_last4: "5678" });
      expect([login, r.error?.code]).toEqual([login, "42501"]);
    }
    expect((await anonClient().rpc("admin_unmatched_by_phone_last4", { p_last4: "5678" })).error).not.toBeNull();
    expect((await (await staff()).rpc("admin_unmatched_by_phone_last4", { p_last4: "010-1234-5678" })).error?.code).toBe("22023");
  });

  it("INV-W5·W7 (S5d): 운영자 미확인 목록에 「5678」 칸이 있고 전체 번호·이름·주소 꼴 값은 없다", async () => {
    const id = await holdWithPhone(waybill(), "5678", "김민지");
    const r = await (await staff()).rpc("admin_unmatched_parcels");
    const row = (r.data as Record<string, unknown>[]).find((x) => x.id === id)!;
    expect(row.phone_last4).toBe("5678");
    const text = JSON.stringify(row);
    expect(text).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(text).not.toContain("김민지");
  });

  it("INV-C13·K8: 뒤 4자리는 회원 물품 보관소 목록·알림 어디에도 나오지 않는다", async () => {
    const id = await holdWithPhone(waybill(), "9876");
    const list = await (await signedInClient("byeolbit_fan")).rpc("storage_parcels");
    const row = (list.data as Record<string, unknown>[]).find((x) => x.id === id)!;
    expect(row).toBeDefined();
    expect(JSON.stringify(list.data)).not.toContain("9876");
    expect(psql(`select count(*) from public.notification_outbox n where row_to_json(n)::text like '%9876%'`)).toBe("0");
  });
});
