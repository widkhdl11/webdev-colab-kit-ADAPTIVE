import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, holdRowLock, payTestOrder, psql, psqlError, registerTestOrder, SEED, signedInClient } from "./helpers";
import { codeOf, deleteTestUnmatched, paidGift, scanInbound, waybill } from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 물품 보관소 (docs/specs/inbound-address-code.md INV-C13 S13·S13b·S13c · INV-C10 · INV-C4 ②-가 S4h · INV-C5 S5f(꼴 검사) — 2026-10-21 배송 문제 재정리).
// 6자리 없이 왔고 입고 때 닉네임 없음이었던 보류 상자만 로그인한 회원에게 정해진 칸(도착일·택배사·크기·포장 모양)으로 보인다.
// 회원이 「내 물품 확인」에 송장번호·택배사·자기 입고 전 상자를 넣으면 맞을 때 운영자 확인 대기가 되고, 운영자가 「입고 처리」하면
// INV-C12 의 잇기와 같은 끝(그 주문 상자로 입고, 6자리 사용됨, 운영자 기록), 「주인 아님」이면 대기만 풀린다.
// 시드: 별빛(byeolbit_fan) · 달토끼(daltokki_fan) · 하루(haru_creator) · fankkuk_staff · fankkuk_admin.

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

const staff = (): Promise<SupabaseClient> => signedInClient("fankkuk_staff");

type HoldOpts = { senderName?: string; look?: string | null; tier?: string | null; phoneLast4?: string | null; code?: string | null };

/** 보류로 넣는다 — 직원이 송장 「보내는 분」 이름·포장 모양·크기를 적는다(시험 선반 T-S) */
async function hold(barcode: string, opts: HoldOpts = {}) {
  return (await staff()).rpc("office_scan_inbound", {
    p_barcode: barcode,
    p_code: opts.code ?? null,
    p_carrier: "cj",
    p_sender_name: opts.senderName ?? "김보관",
    p_shelf: "T-S1",
    p_look: opts.look === undefined ? "하늘색 종이 상자, 리본" : opts.look,
    p_tier: opts.tier === undefined ? "small" : opts.tier,
    p_phone_last4: opts.phoneLast4 ?? null,
  });
}

async function holdOk(barcode: string, opts: HoldOpts = {}): Promise<string> {
  const r = await hold(barcode, opts);
  if (r.error) throw new Error(`office_scan_inbound 실패: ${r.error.code} ${r.error.message}`);
  expect((r.data as { result: string }).result).toBe("hold");
  return psql(`select id from public.office_unmatched where waybill_no = '${barcode}'`);
}

type StorageRow = { id: string; arrived_at: string; carrier: string; tier: string | null; look: string | null; deadline_at: string; claim_pending: boolean };

async function storageList(login: string): Promise<StorageRow[]> {
  const r = await (await signedInClient(login)).rpc("storage_parcels");
  if (r.error) throw new Error(`storage_parcels 실패: ${r.error.code} ${r.error.message}`);
  return r.data as StorageRow[];
}

async function claim(login: string, id: string, boxId: string, no: string, carrier = "cj") {
  return (await signedInClient(login)).rpc("claim_storage_parcel", { p_id: id, p_box_id: boxId, p_waybill: no, p_carrier: carrier });
}

const heldState = (id: string) =>
  psql(`select case when matched_parcel_id is not null then 'matched' when expired_at is not null then 'expired' else 'waiting' end from public.office_unmatched where id = '${id}'`);
const claims = (id: string) => psql(`select coalesce(string_agg(status, ',' order by created_at), '') from public.office_storage_claims where unmatched_id = '${id}'`);
const parcelOfBox = (boxId: string) =>
  psql(`select coalesce((select state || '|' || coalesce(inbound_waybill_no, '') from public.office_parcels where box_id = '${boxId}' and state <> 'awaiting'), 'none')`);
const codeState = (boxId: string) => psql(`select state from public.inbound_codes where box_id = '${boxId}'`);
const wrongAttempts = (profileId: string) => psql(`select count(*) from public.office_match_attempts where profile_id = '${profileId}' and not matched`);

async function dalPaidBox(): Promise<string> {
  const o = await registerTestOrder(1, { senderId: SEED.otherFanId });
  await payTestOrder(o);
  return psql(`select id from public.boxes where order_id = '${o.orderId}'`);
}

describe("INV-C13 물품 보관소 목록 — 닉네임 없음 상자만, 정해진 칸만", () => {
  it("INV-C13 (S13): 닉네임 없음 상자만 보이고 닉네임 일치·분쟁 상자는 없다 — 칸은 도착일·택배사·크기·포장 모양(과 기한·내 확인 대기)뿐", async () => {
    const g = await paidGift(1);
    const none = waybill();
    const matched = waybill();
    const noneId = await holdOk(none);
    const matchedId = await holdOk(matched, { senderName: "별빛" });
    // 남의 6자리가 붙어 온 상자 — 분쟁 갈래
    const op = await staff();
    const first = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[0]! }) });
    expect((await op.rpc("office_confirm_label", { p_qr: (first.data as { qr: string }).qr })).error).toBeNull();
    const dispute = waybill();
    const disputeId = await holdOk(dispute, { code: codeOf({ boxId: g.boxIds[0]! }) });

    const rows = await storageList("daltokki_fan");
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(noneId);
    expect(ids).not.toContain(matchedId);
    expect(ids).not.toContain(disputeId);
    const row = rows.find((r) => r.id === noneId)!;
    expect(Object.keys(row).sort()).toEqual(["arrived_at", "carrier", "claim_pending", "deadline_at", "id", "look", "tier"]);
    expect(row).toMatchObject({ carrier: "cj", tier: "small", look: "하늘색 종이 상자, 리본", claim_pending: false });
    expect(Date.parse(row.deadline_at) - Date.parse(row.arrived_at)).toBe(720 * 3600 * 1000);
    // 응답 어디에도 송장번호·선반이 없다
    expect(JSON.stringify(rows)).not.toContain(none);
    expect(JSON.stringify(rows)).not.toContain("T-S1");
    // 크리에이터도 로그인 회원이다
    expect((await storageList("haru_creator")).map((r) => r.id)).toContain(noneId);
  });

  it("INV-C13 (S13, 실패경로): 손님은 거부 · 이어진 상자·반송 대상·도착 + 720시간이 지난 상자는 목록에 없다", async () => {
    const a = await holdOk(waybill());
    const anon = await anonClient().rpc("storage_parcels");
    expect(anon.error).not.toBeNull();
    psql(`update public.office_unmatched set arrived_at = now() - interval '720 hours' where id = '${a}'`);
    expect((await storageList("byeolbit_fan")).map((r) => r.id)).not.toContain(a);
    const b = await holdOk(waybill());
    expect((await (await staff()).rpc("admin_return_unmatched", { p_id: b })).error).toBeNull();
    expect((await storageList("byeolbit_fan")).map((r) => r.id)).not.toContain(b);
  });

  it("INV-C13: 포장 모양은 40자까지·크기는 구간 값만 — 넘으면 입고 거부, 보류 줄이 생기지 않는다", async () => {
    const long = waybill();
    expect((await hold(long, { look: "가".repeat(41) })).error?.code).toBe("22023");
    expect((await hold(long, { tier: "huge" })).error).not.toBeNull();
    expect(psql(`select count(*) from public.office_unmatched where waybill_no = '${long}'`)).toBe("0");
  });

  it("INV-C13: 운영자가 포장 모양을 수정하면 수정 기록(전·후·누가)이 추가만으로 남는다 — 팬·크리에이터는 수정할 수 없다", async () => {
    const id = await holdOk(waybill());
    const edit = await (await staff()).rpc("admin_set_unmatched_look", { p_id: id, p_look: "갈색 상자" });
    expect(edit.error).toBeNull();
    expect(psql(`select look from public.office_unmatched where id = '${id}'`)).toBe("갈색 상자");
    expect(
      psql(`select e.before_look || '|' || e.after_look || '|' || p.login_id from public.office_unmatched_look_edits e join public.profiles p on p.id = e.edited_by where e.unmatched_id = '${id}'`),
    ).toBe("하늘색 종이 상자, 리본|갈색 상자|fankkuk_staff");
    expect(psqlError(`update public.office_unmatched_look_edits set after_look = 'x' where unmatched_id = '${id}'`)).not.toBeNull();
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      expect([login, (await (await signedInClient(login)).rpc("admin_set_unmatched_look", { p_id: id, p_look: "x" })).error?.code]).toEqual([login, "42501"]);
    }
  });
});

describe("INV-C13 「내 물품 확인」 — 맞으면 운영자 확인 대기, 운영자가 입고 처리", () => {
  it("INV-C13 (S13b): 별빛이 맞는 두 값과 자기 입고 전 상자 → 확인 대기 1줄, 상자는 아직 보류 · 운영자 입고 처리 → 그 상자로 입고·6자리 사용됨·운영자 기록 1줄", async () => {
    const g = await paidGift(1);
    const no = waybill();
    const id = await holdOk(no);
    const r = await claim("byeolbit_fan", id, g.boxIds[0]!, no);
    expect(r.error).toBeNull();
    expect(r.data).toBe("pending");
    expect(claims(id)).toBe("pending");
    expect(heldState(id)).toBe("waiting");
    expect(parcelOfBox(g.boxIds[0]!)).toBe("none");
    expect(wrongAttempts(SEED.fanId)).toBe("0");
    // 요청한 본인 화면에서만 확인 대기
    expect((await storageList("byeolbit_fan")).find((x) => x.id === id)?.claim_pending).toBe(true);
    expect((await storageList("daltokki_fan")).find((x) => x.id === id)?.claim_pending).toBe(false);

    // 운영자 확인 목록 — 회원이 넣은 두 값·고른 상자·보관 위치
    const list = await (await staff()).rpc("admin_storage_claims");
    expect(list.error).toBeNull();
    const row = (list.data as Record<string, unknown>[]).find((x) => x.unmatched_id === id)!;
    expect(row).toMatchObject({ nickname: "별빛", waybill_no: no, carrier: "cj", order_no: g.orderNo, shelf: "T-S1", look: "하늘색 종이 상자, 리본" });

    const claimId = row.claim_id as string;
    const ok = await (await staff()).rpc("admin_accept_storage_claim", { p_claim_id: claimId, p_checked: true });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe("linked");
    expect(claims(id)).toBe("accepted");
    expect(heldState(id)).toBe("matched");
    expect(parcelOfBox(g.boxIds[0]!)).toBe(`received|${no}`);
    expect(codeState(g.boxIds[0]!)).toBe("used");
    expect(psql(`select pr.nickname || '|' || op.login_id || '|' || l.contents_checked from public.office_held_links l join public.profiles pr on pr.id = l.account_id join public.profiles op on op.id = l.linked_by where l.unmatched_id = '${id}'`)).toBe(
      "별빛|fankkuk_staff|true",
    );
    // 이어진 상자는 목록에서 빠진다
    expect((await storageList("byeolbit_fan")).map((x) => x.id)).not.toContain(id);
  });

  it("INV-C13 (S13b): 한 상자에 대기는 하나 — 대기 중인 상자에 달토끼가 맞는 두 값으로 찾아도 「찾을 수 없어요」 · 운영자가 「주인 아님」이면 대기가 풀리고 목록에 그대로", async () => {
    const g = await paidGift(1);
    const dalBox = await dalPaidBox();
    const no = waybill();
    const id = await holdOk(no);
    expect((await claim("byeolbit_fan", id, g.boxIds[0]!, no)).data).toBe("pending");
    expect((await claim("daltokki_fan", id, dalBox, no)).data).toBe("not_found");
    expect(claims(id)).toBe("pending");
    const claimId = psql(`select id from public.office_storage_claims where unmatched_id = '${id}' and status = 'pending'`);
    const rej = await (await staff()).rpc("admin_reject_storage_claim", { p_claim_id: claimId });
    expect(rej.error).toBeNull();
    expect(claims(id)).toBe("rejected");
    expect(heldState(id)).toBe("waiting");
    expect(parcelOfBox(g.boxIds[0]!)).toBe("none");
    expect((await storageList("byeolbit_fan")).find((x) => x.id === id)?.claim_pending).toBe(false);
    // 풀린 뒤에는 다른 회원이 확인을 요청할 수 있다
    expect((await claim("daltokki_fan", id, dalBox, no)).data).toBe("pending");
    // 끝난 요청은 다시 처리할 수 없다
    expect((await (await staff()).rpc("admin_reject_storage_claim", { p_claim_id: claimId })).error?.code).toBe("55000");
    expect((await (await staff()).rpc("admin_accept_storage_claim", { p_claim_id: claimId, p_checked: true })).error?.code).toBe("55000");
  });

  it("INV-C13·C10 (S13c, 실패경로): 틀린 두 값 → 「찾을 수 없어요」, 틀린 시도 1 · 거절된 주문의 상자·닫힌 상자 → 후보 아님(틀린 시도), 대기 줄 없음", async () => {
    const g = await paidGift(1);
    const no = waybill();
    const id = await holdOk(no);
    expect((await claim("byeolbit_fan", id, g.boxIds[0]!, waybill())).data).toBe("not_found");
    expect((await claim("byeolbit_fan", id, g.boxIds[0]!, no, "hanjin")).data).toBe("not_found");
    expect(wrongAttempts(SEED.fanId)).toBe("2");
    // 거절된 주문
    const declined = await paidGift(1);
    const d = await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: declined.requestId, p_block: false });
    expect(d.error).toBeNull();
    expect((await claim("byeolbit_fan", id, declined.boxIds[0]!, no)).data).toBe("not_candidate");
    // 「도착하지 않음」으로 닫힌 상자
    const closed = await paidGift(1);
    psql(`begin; set local session_replication_role = replica; update public.boxes set missing_at = now() where id = '${closed.boxIds[0]}'; commit;`);
    expect((await claim("byeolbit_fan", id, closed.boxIds[0]!, no)).data).toBe("not_candidate");
    // 남의 상자
    expect((await claim("byeolbit_fan", id, await dalPaidBox(), no)).data).toBe("not_candidate");
    expect(wrongAttempts(SEED.fanId)).toBe("5");
    expect(claims(id)).toBe("");
    // 다섯 번 틀리면 그날은 맞는 값도 거부(INV-C10 — 「받는 주소 없이 보냈어요」와 같이 센다)
    const r = await claim("byeolbit_fan", id, g.boxIds[0]!, no);
    expect(r.error?.code).toBe("P0045");
    expect(claims(id)).toBe("");
  });

  it("INV-C10·C13: 틀린 시도는 「받는 주소 없이 보냈어요」와 같이 센다 — 찾기 넷 + 물품 확인 하나면 그날 막힌다", async () => {
    const g = await paidGift(1);
    const no = waybill();
    const id = await holdOk(no);
    const fan = await signedInClient("byeolbit_fan");
    for (let i = 0; i < 4; i++) {
      const f = await fan.rpc("find_held_parcel", { p_box_id: g.boxIds[0], p_share_id: null, p_waybill: waybill(), p_carrier: "cj" });
      expect(f.data).toBe("not_found");
    }
    expect((await claim("byeolbit_fan", id, g.boxIds[0]!, waybill())).data).toBe("not_found");
    const blocked = await fan.rpc("find_held_parcel", { p_box_id: g.boxIds[0], p_share_id: null, p_waybill: no, p_carrier: "cj" });
    expect(blocked.error?.code).toBe("P0045");
  });

  it("INV-C13 (S13c): 도착 + 720시간에 자동 처리 → 목록에서 빠지고 반송 대상, 대기 줄은 닫힘(두 번 돌려도 한 번)", async () => {
    const g = await paidGift(1);
    const no = waybill();
    const id = await holdOk(no);
    expect((await claim("byeolbit_fan", id, g.boxIds[0]!, no)).data).toBe("pending");
    psql(`update public.office_unmatched set arrived_at = now() - interval '720 hours' where id = '${id}'`);
    const run = async () => (await staff()).rpc("office_run_expiry", {});
    expect((await run()).error).toBeNull();
    expect((await run()).error).toBeNull();
    expect(heldState(id)).toBe("expired");
    expect(claims(id)).toBe("closed");
    expect((await storageList("byeolbit_fan")).map((x) => x.id)).not.toContain(id);
    // 닫힌 요청은 입고 처리할 수 없다
    const claimId = psql(`select id from public.office_storage_claims where unmatched_id = '${id}'`);
    expect((await (await staff()).rpc("admin_accept_storage_claim", { p_claim_id: claimId, p_checked: true })).error?.code).toBe("55000");
    expect(parcelOfBox(g.boxIds[0]!)).toBe("none");
  });

  it("INV-C13 (실패경로): 대기 중 그 상자가 다른 길(운영자 잇기)로 이어지면 대기 줄이 닫힌다 · 입고 처리 때 그 상자가 이미 왔으면 「후보 아님」, 아무것도 바뀌지 않는다", async () => {
    const g = await paidGift(2);
    const no = waybill();
    const id = await holdOk(no);
    expect((await claim("byeolbit_fan", id, g.boxIds[0]!, no)).data).toBe("pending");
    // 고른 상자가 그 사이 6자리로 도착
    const op = await staff();
    const r = await scanInbound(op, waybill(), { code: codeOf({ boxId: g.boxIds[0]! }) });
    expect((await op.rpc("office_confirm_label", { p_qr: (r.data as { qr: string }).qr })).error).toBeNull();
    const claimId = psql(`select id from public.office_storage_claims where unmatched_id = '${id}' and status = 'pending'`);
    expect((await op.rpc("admin_accept_storage_claim", { p_claim_id: claimId, p_checked: true })).error?.code).toBe("P0047");
    expect(claims(id)).toBe("pending");
    expect(heldState(id)).toBe("waiting");
    // 운영자가 문의를 받고 둘째 상자에 이으면 대기는 닫힌다
    expect((await op.rpc("admin_link_held_parcel", { p_id: id, p_nickname: "별빛", p_box_id: g.boxIds[1], p_checked: true })).data).toBe("linked");
    expect(claims(id)).toBe("closed");
  });

  it("INV-C13 (실패경로): 팬·크리에이터·손님은 확인 요청 목록·입고 처리·주인 아님을 부를 수 없다 · 확인 표시 없는 입고 처리는 거부", async () => {
    const g = await paidGift(1);
    const no = waybill();
    const id = await holdOk(no);
    expect((await claim("byeolbit_fan", id, g.boxIds[0]!, no)).data).toBe("pending");
    const claimId = psql(`select id from public.office_storage_claims where unmatched_id = '${id}'`);
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(login);
      expect([login, (await c.rpc("admin_accept_storage_claim", { p_claim_id: claimId, p_checked: true })).error?.code]).toEqual([login, "42501"]);
      expect([login, (await c.rpc("admin_reject_storage_claim", { p_claim_id: claimId })).error?.code]).toEqual([login, "42501"]);
      expect([login, (await c.rpc("admin_storage_claims")).error?.code]).toEqual([login, "42501"]);
    }
    expect((await anonClient().rpc("admin_storage_claims")).error).not.toBeNull();
    expect((await anonClient().rpc("claim_storage_parcel", { p_id: id, p_box_id: g.boxIds[0], p_waybill: no, p_carrier: "cj" })).error).not.toBeNull();
    expect((await (await staff()).rpc("admin_accept_storage_claim", { p_claim_id: claimId, p_checked: false })).error?.code).toBe("22023");
    expect(claims(id)).toBe("pending");
  });

  it("INV-C13 (동시): 두 회원이 같은 상자에 동시에 맞는 확인 요청을 해도 대기는 하나", async () => {
    const g = await paidGift(1);
    const dalBox = await dalPaidBox();
    const no = waybill();
    const id = await holdOk(no);
    const lock = await holdRowLock(`select 1 from public.office_unmatched where id = '${id}' for update`, 1.5);
    const [a, b] = await Promise.all([claim("byeolbit_fan", id, g.boxIds[0]!, no), claim("daltokki_fan", id, dalBox, no)]);
    await lock.released;
    expect([a.data, b.data].filter((x) => x === "pending")).toHaveLength(1);
    expect(claims(id)).toBe("pending");
  });

  it("INV-C13: 확인 요청 후보 읽기 — 본인의 결제 끝·입고 전 상자만(선물 이름·크리에이터·결제일), 손님은 거부", async () => {
    const g = await paidGift(2);
    await registerTestOrder(1); // 결제 대기 — 후보 아님
    const r = await (await signedInClient("byeolbit_fan")).rpc("storage_claim_candidates");
    expect(r.error).toBeNull();
    const rows = r.data as Record<string, unknown>[];
    const mine = rows.filter((x) => String(x.label).startsWith(g.orderNo));
    expect(mine.map((x) => x.box_id).sort()).toEqual([...g.boxIds].sort());
    expect(Object.keys(mine[0]!).sort()).toEqual(["box_id", "creator_name", "item_kind", "label", "paid_at", "tier"]);
    const dal = await (await signedInClient("daltokki_fan")).rpc("storage_claim_candidates");
    expect((dal.data as { box_id: string }[]).map((x) => x.box_id)).not.toContain(g.boxIds[0]);
    expect((await anonClient().rpc("storage_claim_candidates")).error).not.toBeNull();
  });
});

describe("INV-C4 ②-가 (S4h) — 운영자가 팬 확인 없이 닉네임만으로 잇는 길이 없다", () => {
  it("INV-C4 (S4h): 별빛의 입고 전 주문이 하나여도 닉네임 일치 보류 상자를 운영자가 별빛 주문에 이을 수 없다 — 별빛이 두 값을 넣으면 이어진다", async () => {
    const g = await paidGift(1);
    const no = waybill();
    const id = await holdOk(no, { senderName: "별빛" });
    const op = await staff();
    // 운영자의 잇기 함수는 닉네임이 맞은 상자를 받지 않는다(확인 표시가 있어도)
    expect((await op.rpc("admin_link_held_parcel", { p_id: id, p_nickname: "별빛", p_box_id: g.boxIds[0], p_checked: true })).error?.code).toBe("P0047");
    // 상자를 고르지 않고 닉네임만으로 잇는 꼴도 없다
    expect((await op.rpc("admin_link_held_parcel", { p_id: id, p_nickname: "별빛", p_box_id: null, p_checked: true })).error?.code).toBe("22023");
    // 로그인 키로 부를 수 있는 함수 가운데 보류 상자를 주문 상자로 입고시키는 것(입고 마무리·잇기 판정을 부르는 것)은 모두 상자(또는 확인 요청)를 받는다 —
    // 보류 줄과 닉네임만으로 잇는 함수가 없다. 그런 함수가 실제로 있는지도 본다(목록이 비어 통과하지 않게)
    const linkers = psql(
      "select string_agg(p.proname || ':' || (pg_get_function_identity_arguments(p.oid) ~ 'p_box_id|p_share_id|p_claim_id'), ',' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute') and pg_get_functiondef(p.oid) ~ '(office_finish_held_receive|office_link_held_box)[(]'",
    ).split(",");
    expect(linkers).toContain("admin_link_held_parcel:true");
    expect(linkers).toContain("find_held_parcel:true");
    expect(linkers.filter((x) => x.endsWith(":false"))).toEqual([]);
    expect(parcelOfBox(g.boxIds[0]!)).toBe("none");
    // 물품 보관소에도 없다(닉네임 일치 상자) — 별빛 본인의 두 값으로만 이어진다
    expect((await storageList("byeolbit_fan")).map((x) => x.id)).not.toContain(id);
    const found = await (await signedInClient("byeolbit_fan")).rpc("find_held_parcel", { p_box_id: g.boxIds[0], p_share_id: null, p_waybill: no, p_carrier: "cj" });
    expect(found.data).toBe("matched");
    expect(parcelOfBox(g.boxIds[0]!)).toBe(`received|${no}`);
  });
});

describe("INV-C5 (S5f) 전화번호 뒤 4자리 꼴 — 숫자 넷이 아니면 입고 거부", () => {
  it("INV-C5 (S5f, 실패경로): 「010-1234-5678」·「56a8」·다섯 자리는 거부, 보류 줄이 생기지 않는다", async () => {
    const no = waybill();
    for (const bad of ["010-1234-5678", "56a8", "56789", "567"]) {
      const r = await hold(no, { phoneLast4: bad });
      expect([bad, r.error?.code]).toEqual([bad, "22023"]);
    }
    expect(psql(`select count(*) from public.office_unmatched where waybill_no = '${no}'`)).toBe("0");
  });
});
