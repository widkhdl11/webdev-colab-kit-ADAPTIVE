import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, holdRowLock, payTestOrder, psql, psqlError, registerTestOrder, SEED, signedInClient, instantNotices } from "./helpers";
import { codeOf, deleteTestUnmatched, fanSetsWaybill, paidGift, paidShare, scanInbound, waybill } from "./office-helpers";
import { ADDRESS_CODE_ALPHABET, addressCodeCheckChar } from "@/entities/parcel/model/address-code";
import { HELD_WITHOUT_CODE_REASONS, HOLD_REASONS } from "@/entities/parcel/model/office-lists";
import { deleteTestRevgifts } from "./revgift-helpers";

// 6자리 없이 온 팬 선물 상자를 닉네임으로 찾기 (docs/specs/inbound-address-code.md INV-C4 ②-가 · INV-C5 끝 문단 · INV-C9 · INV-C12,
// office-workflow INV-W5·W7, notifications INV-N21 — 2026-10-16 카드 d94).
// 직원은 송장 「보내는 분」 이름을 그대로 넣고, DB 는 그 이름이 닉네임과 맞는 계정만 상자에 남긴다(글자는 남기지 않는다).
// 시드: 별빛(byeolbit_fan) = 시험 주문의 팬, 달토끼(daltokki_fan) = 다른 팬, fankkuk_staff = 직원, fankkuk_admin = 대표.

// 상태 알림 줄(상자 도착·출고)을 보는 시험이 있다 — 별빛은 「바로 받기」를 켠 팬으로 둔다(꺼진 경우는 notification-batching INV-NB5 시험이 본다)
beforeEach(() => instantNotices(SEED.fanId));

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

const GUREUM = "00000000-0000-4000-a000-000000000003"; // 구름빵 — 시드 주문은 끝난 주문뿐

type ScanOut = { result: string; reason: string | null; nickname?: string | null };

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

/** 6자리 없이 온 상자를 보류로 넣는다 — 직원이 송장의 「보내는 분」 이름을 그대로 적는다 */
async function holdNoCode(barcode: string, senderName: string): Promise<ScanOut> {
  const r = await scanInbound(await staff(), barcode, { code: null, carrier: "cj", senderName, shelf: "T-N1" });
  expect(r.error).toBeNull();
  const out = r.data as ScanOut;
  expect(out.result).toBe("hold");
  return out;
}

function heldId(barcode: string): string {
  return psql(`select id from public.office_unmatched where waybill_no = '${barcode}'`);
}

function heldNickname(barcode: string): string {
  return psql(`select coalesce(p.nickname, 'none') from public.office_unmatched u left join public.profiles p on p.id = u.nickname_profile_id where u.waybill_no = '${barcode}'`);
}

function heldState(barcode: string): string {
  return psql(
    `select case when matched_parcel_id is not null then 'matched' when expired_at is not null then 'expired' else 'waiting' end from public.office_unmatched where waybill_no = '${barcode}'`,
  );
}

function parcelOfBox(boxId: string): string {
  // 결제 때 생기는 대기(awaiting) 줄은 「아직 안 옴」(none)으로 본다
  return psql(`select coalesce((select state || '|' || coalesce(inbound_waybill_no, '') from public.office_parcels where box_id = '${boxId}' and state <> 'awaiting'), 'none')`);
}

function codeState(boxId: string): string {
  return psql(`select state from public.inbound_codes where box_id = '${boxId}'`);
}

async function find(login: string, boxId: string, no: string, carrier = "cj") {
  return (await signedInClient(login)).rpc("find_held_parcel", { p_box_id: boxId, p_share_id: null, p_waybill: no, p_carrier: carrier });
}

/** 6자리로 입고하고 라벨 부착까지 확인한다(같은 직원의 다음 스캔이 막히지 않게, office-workflow INV-W2) */
async function receiveWithCode(boxId: string): Promise<void> {
  const op = await staff();
  const r = await scanInbound(op, waybill(), { code: codeOf({ boxId }) });
  expect((r.data as ScanOut).result).toBe("received");
  const c = await op.rpc("office_confirm_label", { p_qr: (r.data as { qr: string }).qr });
  expect(c.error).toBeNull();
}

/** 코드 없이 온 상자 알림 줄(이메일 통로) 수 — 받는 사람별 */
function noCodeAlerts(accountId: string, unmatchedId?: string): number {
  const extra = unmatchedId ? ` and unmatched_id = '${unmatchedId}'` : "";
  return Number(psql(`select count(*) from public.notification_outbox where kind = 'box_no_code' and channel = 'email' and account_id = '${accountId}'${extra}`));
}

/** 달토끼의 결제 끝난 주문 상자 하나 */
async function dalPaidBox(): Promise<string> {
  const o = await registerTestOrder(1, { senderId: SEED.otherFanId });
  await payTestOrder(o);
  return psql(`select id from public.boxes where order_id = '${o.orderId}'`);
}

async function link(login: string, unmatchedId: string, nickname: string, boxId: string, checked = true) {
  return (await signedInClient(login)).rpc("admin_link_held_parcel", { p_id: unmatchedId, p_nickname: nickname, p_box_id: boxId, p_checked: checked });
}

function linkLogs(unmatchedId: string): string {
  return psql(
    `select coalesce(string_agg(pr.nickname || '|' || op.login_id || '|' || l.contents_checked, ','), '') from public.office_held_links l join public.profiles pr on pr.id = l.account_id join public.profiles op on op.id = l.linked_by where l.unmatched_id = '${unmatchedId}'`,
  );
}

/** 「김민지」 뒤에 무작위 한글 세 자 — 다른 시험·시드와 겹치지 않는 실명 꼴 */
function realName(): string {
  const pool = "가나다라마바사아자차카타파하";
  return "김민지" + Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => pool[b % pool.length]).join("");
}

/** public·pii 스키마의 모든 표에서 그 글자가 든 줄 수 */
function rowsContaining(text: string): number {
  const out = psql(
    `do $$ declare t record; n bigint; total bigint := 0; begin
       for t in select schemaname, tablename from pg_tables where schemaname in ('public', 'pii') loop
         execute format('select count(*) from %I.%I x where row_to_json(x)::text like %L', t.schemaname, t.tablename, '%${text}%') into n;
         total := total + n;
       end loop;
       perform set_config('fankkuk_test.hits', total::text, false);
     end $$; select current_setting('fankkuk_test.hits')`,
  );
  return Number(out.split("\n").pop());
}

describe("INV-C5 6자리 없는 상자 — 송장 「보내는 분」 이름을 닉네임과 비교하고 글자는 남기지 않는다", () => {
  it("INV-C5 (S4): 송장 보내는 분 「별빛」 → 닉네임 일치 별빛으로 기록, 입고 결과에 그 닉네임", async () => {
    const barcode = waybill();
    const out = await holdNoCode(barcode, "별빛");
    expect(out).toMatchObject({ reason: "no_code", nickname: "별빛" });
    expect(heldNickname(barcode)).toBe("별빛");
  });

  it("INV-C5: 앞뒤 공백은 무시하고 비교한다", async () => {
    const barcode = waybill();
    await holdNoCode(barcode, "  별빛 ");
    expect(heldNickname(barcode)).toBe("별빛");
  });

  it("INV-C5 (S4g): 송장 보내는 분에 실명 → 「닉네임 없음」만, 그 글자는 DB 어디에도 없다", async () => {
    const name = realName();
    const barcode = waybill();
    const out = await holdNoCode(barcode, name);
    expect(out.nickname ?? null).toBeNull();
    expect(heldNickname(barcode)).toBe("none");
    expect(rowsContaining(name)).toBe(0);
    // 닉네임과 맞은 이름도 이름 글자 칸으로는 남지 않는다 — 옛 칸(이름 앞 한 글자)이 표에 없다
    expect(psql(`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'office_unmatched' and column_name = 'sender_initial'`)).toBe("0");
  });

  it("INV-C5 (실패경로): 보류인데 보내는 분 이름이 비었으면 아무것도 바꾸지 않고 다시 묻는다. 40자를 넘으면 꼴 오류", async () => {
    const op = await staff();
    const barcode = waybill();
    const asked = await scanInbound(op, barcode, { code: null, carrier: "cj", senderName: "  ", shelf: "T-N1" });
    expect(asked.data).toMatchObject({ result: "need_details", reason: "no_code" });
    expect(heldId(barcode)).toBe("");
    const long = await scanInbound(op, barcode, { code: null, carrier: "cj", senderName: "가".repeat(41), shelf: "T-N1" });
    expect(long.error?.code).toBe("22023");
    expect(heldId(barcode)).toBe("");
  });
});

describe("INV-C4 ②-가 팬의 찾기 — 송장번호 + 택배사 + 상자의 닉네임 일치 계정 = 로그인한 팬", () => {
  it("INV-C4 (S4): 닉네임 일치 별빛 상자를 별빛이 송장번호·택배사로 찾으면 별빛 주문의 상자로 입고, 6자리 사용됨", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, "별빛");
    const r = await find("byeolbit_fan", g.boxIds[0], barcode);
    expect(r.error).toBeNull();
    expect(r.data).toBe("matched");
    expect(parcelOfBox(g.boxIds[0])).toBe(`received|${barcode}`);
    expect(heldState(barcode)).toBe("matched");
    expect(codeState(g.boxIds[0])).toBe("used");
  });

  it("INV-C4 (S4, 실패경로): 택배사나 송장번호가 다르면 이어지지 않는다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, "별빛");
    expect((await find("byeolbit_fan", g.boxIds[0], barcode, "hanjin")).data).toBe("not_found");
    expect((await find("byeolbit_fan", g.boxIds[0], waybill())).data).toBe("not_found");
    expect(parcelOfBox(g.boxIds[0])).toBe("none");
    expect(heldState(barcode)).toBe("waiting");
  });

  it("INV-C4 (S4, 실패경로): 달토끼가 같은 송장번호·택배사를 자기 결제 완료 상자로 넣어도 이어지지 않는다(닉네임 일치 계정이 아님)", async () => {
    const dalBox = await dalPaidBox();
    const barcode = waybill();
    await holdNoCode(barcode, "별빛");
    expect((await find("daltokki_fan", dalBox, barcode)).data).toBe("not_found");
    expect(parcelOfBox(dalBox)).toBe("none");
    expect(heldState(barcode)).toBe("waiting");
  });

  it("INV-C4 (실패경로): 닉네임 없음 상자는 진짜 주인도 이 갈래로 찾지 못한다 — 운영자 확인(INV-C12)으로만", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    expect((await find("byeolbit_fan", g.boxIds[0], barcode)).data).toBe("not_found");
    expect(heldState(barcode)).toBe("waiting");
  });

  it("INV-C4 ②-나: 역조공을 보낸 크리에이터는 이름 글자 없이 송장번호·택배사 두 값으로 자기 입고 전 몫에 잇는다. 택배사가 다르면 이어지지 않는다", async () => {
    const share = await paidShare();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const haru = await signedInClient("haru_creator");
    const args = { p_box_id: null, p_share_id: share.shareId, p_waybill: barcode };
    expect((await haru.rpc("find_held_parcel", { ...args, p_carrier: "hanjin" })).data).toBe("not_found");
    expect((await haru.rpc("find_held_parcel", { ...args, p_carrier: "cj" })).data).toBe("matched");
    expect(psql(`select state || '|' || inbound_waybill_no from public.office_parcels where share_id = '${share.shareId}'`)).toBe(`received|${barcode}`);
  });

  it("INV-C4: 찾기 함수는 이름 글자를 받지 않는다 — 인자에 이름·주문번호가 없다", () => {
    const args = psql(`select pg_get_function_identity_arguments('public.find_held_parcel'::regproc)`);
    expect(args).not.toMatch(/initial|name|order/);
    expect(args).toMatch(/p_waybill/);
  });
});

describe("INV-N21 코드 없이 온 상자 알림 — 닉네임 일치 계정에 결제 완료·입고 전 팬 선물 주문이 있으면 상자마다 한 번", () => {
  it("INV-N21 (S12): 닉네임 일치 별빛 상자, 별빛에게 결제 완료·입고 전 주문 → 별빛에게 알림 1줄. 같은 바코드를 다시 찍어도 1줄", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, "별빛");
    const id = heldId(barcode);
    expect(noCodeAlerts(SEED.fanId, id)).toBe(1);
    // 줄은 별빛의 결제 완료·입고 전 주문 하나를 가리킨다(시드에도 별빛의 진행 중 주문이 있어 가장 먼저 결제한 주문이다)
    const orderId = psql(`select order_id from public.notification_outbox where kind = 'box_no_code' and unmatched_id = '${id}' and channel = 'email'`);
    expect(psql(`select fan_id || '|' || status from public.orders where id = '${orderId}'`)).toBe(`${SEED.fanId}|registered`);
    expect(g.orderId).toBeTruthy();
    expect((await scanInbound(await staff(), barcode, { code: null, carrier: "cj", senderName: "별빛", shelf: "T-N1" })).data).toMatchObject({ result: "hold_recorded" });
    expect(noCodeAlerts(SEED.fanId, id)).toBe(1);
    // 상자마다 — 둘째 상자에도 한 번
    const second = waybill();
    await holdNoCode(second, "별빛");
    expect(noCodeAlerts(SEED.fanId)).toBe(2);
  });

  it("INV-N21 (S12, 실패경로): 결제 완료·입고 전 주문이 없으면 알림 없음 — 주문 없음·결제 대기뿐·상자가 다 옴", async () => {
    // 달토끼: 주문이 하나도 없다
    await holdNoCode(waybill(), "달토끼");
    expect(noCodeAlerts(SEED.otherFanId)).toBe(0);
    // 달토끼: 결제 대기 주문뿐
    await registerTestOrder(1, { senderId: SEED.otherFanId });
    await holdNoCode(waybill(), "달토끼");
    expect(noCodeAlerts(SEED.otherFanId)).toBe(0);
    // 구름빵: 결제 끝난 주문의 상자가 이미 6자리로 입고됐다(시드의 구름빵 주문은 끝난 주문뿐)
    const o = await registerTestOrder(1, { senderId: GUREUM });
    await payTestOrder(o);
    await receiveWithCode(psql(`select id from public.boxes where order_id = '${o.orderId}'`));
    await holdNoCode(waybill(), "구름빵");
    expect(noCodeAlerts(GUREUM)).toBe(0);
  });

  it("INV-N21 (실패경로): 닉네임 없음 상자는 누구에게도 알림이 없다", async () => {
    await paidGift();
    const before = Number(psql(`select count(*) from public.notification_outbox where kind = 'box_no_code'`));
    await holdNoCode(waybill(), realName());
    expect(Number(psql(`select count(*) from public.notification_outbox where kind = 'box_no_code'`))).toBe(before);
  });

  it("INV-N21: 꼭 가는 알림이고, 꺼낸 줄에 송장번호·택배사가 없다", async () => {
    await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, "별빛");
    expect(psql(`select public.notification_kind_must_deliver('box_no_code')`)).toBe("t");
    const row = psql(`select row_to_json(n)::text from public.notification_outbox n where kind = 'box_no_code' and unmatched_id = '${heldId(barcode)}' and channel = 'email'`);
    expect(row).not.toContain(barcode);
    expect(row).not.toMatch(/"cj"/);
  });
});

describe("INV-C12 운영자 잇기 — 운영자만, 문의한 계정의 결제 완료·입고 전 주문에만, 확인 표시 필수, 기록은 추가만", () => {
  it("INV-C12 (S12b): 닉네임 없음 상자를 직원이 확인 표시와 함께 별빛 주문 상자에 이으면 입고, 6자리 사용됨, 운영자 기록 1줄", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    const r = await link("fankkuk_staff", id, "별빛", g.boxIds[0]);
    expect(r.error).toBeNull();
    expect(r.data).toBe("linked");
    expect(parcelOfBox(g.boxIds[0])).toBe(`received|${barcode}`);
    expect(codeState(g.boxIds[0])).toBe("used");
    expect(heldState(barcode)).toBe("matched");
    expect(linkLogs(id)).toBe("별빛|fankkuk_staff|true");
    // 이은 상자는 상자 도착 알림이 별빛에게 간다(6자리로 입고될 때와 같은 끝)
    expect(psql(`select count(*) from public.notification_outbox where kind = 'box_arrived' and channel = 'email' and account_id = '${SEED.fanId}' and order_id = '${g.orderId}'`)).toBe("1");
  });

  it("INV-C12: 대표도 잇는다 — 닉네임은 앞뒤 공백을 무시하고 고른다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    expect((await link("fankkuk_admin", heldId(barcode), " 별빛 ", g.boxIds[0])).data).toBe("linked");
    expect(linkLogs(heldId(barcode))).toBe("별빛|fankkuk_admin|true");
  });

  it("INV-C12 (S12b, 실패경로): 확인 표시가 없으면 거부, 아무것도 바뀌지 않는다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    const r = await link("fankkuk_staff", id, "별빛", g.boxIds[0], false);
    expect(r.error?.code).toBe("22023");
    expect(parcelOfBox(g.boxIds[0])).toBe("none");
    expect(codeState(g.boxIds[0])).toBe("valid");
    expect(heldState(barcode)).toBe("waiting");
    expect(linkLogs(id)).toBe("");
  });

  it("INV-C12 (S12b, 실패경로): 문의한 계정이 아닌 주문(달토끼 주문)·결제 대기 주문·이미 상자가 온 주문은 「후보 아님」, 변화 없음", async () => {
    const g = await paidGift();
    const dalBox = await dalPaidBox();
    const pending = await registerTestOrder(1);
    const pendingBox = psql(`select id from public.boxes where order_id = '${pending.orderId}'`);
    const arrived = await paidGift();
    await receiveWithCode(arrived.boxIds[0]);
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    for (const box of [dalBox, pendingBox, arrived.boxIds[0]]) {
      const r = await link("fankkuk_staff", id, "별빛", box);
      expect([box, r.error?.code]).toEqual([box, "P0047"]);
    }
    expect(parcelOfBox(dalBox)).toBe("none");
    expect(parcelOfBox(pendingBox)).toBe("none");
    expect(heldState(barcode)).toBe("waiting");
    expect(linkLogs(id)).toBe("");
    // 별빛의 입고 전 상자는 아직 후보다
    expect((await link("fankkuk_staff", id, "별빛", g.boxIds[0])).data).toBe("linked");
  });

  it("INV-C12 (S12b, 실패경로): 팬·크리에이터·손님은 권한 거부, 변화 없음", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      const r = await link(login, id, "별빛", g.boxIds[0]);
      expect([login, r.error?.code]).toEqual([login, "42501"]);
    }
    const anon = await anonClient().rpc("admin_link_held_parcel", { p_id: id, p_nickname: "별빛", p_box_id: g.boxIds[0], p_checked: true });
    expect(anon.error).not.toBeNull();
    expect(parcelOfBox(g.boxIds[0])).toBe("none");
    expect(heldState(barcode)).toBe("waiting");
  });

  it("INV-C12 (실패경로): 이미 이어졌거나 반송 대상인 상자·168시간이 지난 상자·6자리가 붙어 온 보류 상자는 잇지 않는다(55000)", async () => {
    const g = await paidGift();
    const other = await paidGift();
    const op = await staff();
    // 반송으로 넘긴 상자
    const returned = waybill();
    await holdNoCode(returned, realName());
    expect((await op.rpc("admin_return_unmatched", { p_id: heldId(returned) })).error).toBeNull();
    expect((await link("fankkuk_staff", heldId(returned), "별빛", g.boxIds[0])).error?.code).toBe("55000");
    // 도착 + 168시간이 지난 상자(자동 처리 전이어도)
    const late = waybill();
    await holdNoCode(late, realName());
    psql(`update public.office_unmatched set arrived_at = now() - interval '168 hours 1 minute' where waybill_no = '${late}'`);
    expect((await link("fankkuk_staff", heldId(late), "별빛", g.boxIds[0])).error?.code).toBe("55000");
    // 남의 6자리가 붙어 온 보류 상자(분쟁) — 6자리 없이 온 상자가 아니다
    await receiveWithCode(other.boxIds[0]);
    const dispute = waybill();
    await scanInbound(op, dispute, { code: codeOf({ boxId: other.boxIds[0] }), carrier: "cj", senderName: "별빛", shelf: "T-N1" });
    expect((await link("fankkuk_staff", heldId(dispute), "별빛", g.boxIds[0])).error?.code).toBe("55000");
    // 이미 이어진 상자
    const done = waybill();
    await holdNoCode(done, realName());
    expect((await link("fankkuk_staff", heldId(done), "별빛", g.boxIds[0])).data).toBe("linked");
    const third = await paidGift();
    expect((await link("fankkuk_staff", heldId(done), "별빛", third.boxIds[0])).error?.code).toBe("55000");
    expect(parcelOfBox(g.boxIds[0])).toBe(`received|${done}`);
  });

  it("INV-C12 (실패경로): 없는 닉네임은 「없음」(P0002)", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    expect((await link("fankkuk_staff", heldId(barcode), realName(), g.boxIds[0])).error?.code).toBe("P0002");
  });

  it("INV-C12: 운영자 기록은 추가만 — 고치거나 지울 수 없다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    await link("fankkuk_staff", id, "별빛", g.boxIds[0]);
    expect(psqlError(`update public.office_held_links set contents_checked = true where unmatched_id = '${id}'`)).not.toBeNull();
    expect(psqlError(`delete from public.office_held_links where unmatched_id = '${id}'`)).not.toBeNull();
    expect(linkLogs(id)).toBe("별빛|fankkuk_staff|true");
  });

  it("INV-C12: 잇기 후보 읽기 — 그 닉네임 계정의 결제 완료·입고 전 상자만, 운영자에게만", async () => {
    const g = await paidGift(2);
    await registerTestOrder(1); // 결제 대기 — 후보 아님
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    const r = await (await staff()).rpc("admin_held_link_candidates", { p_id: id, p_nickname: "별빛" });
    expect(r.error).toBeNull();
    const rows = r.data as { box_id: string; label: string; tier: string }[];
    // 시드의 별빛 진행 중 주문(FC-R2D8Q)도 후보다 — 이 시험이 만든 주문의 줄만 본다. 결제 대기 주문의 상자는 없다
    const mine = rows.filter((x) => x.label.startsWith(g.orderNo));
    expect(mine.map((x) => x.box_id).sort()).toEqual([...g.boxIds].sort());
    expect(mine.map((x) => x.label).sort()).toEqual([`${g.orderNo}-1`, `${g.orderNo}-2`]);
    expect(rows.every((x) => psql(`select o.fan_id || '|' || o.status from public.boxes b join public.orders o on o.id = b.order_id where b.id = '${x.box_id}'`) === `${SEED.fanId}|registered`)).toBe(true);
    expect(Object.keys(rows[0]!).sort()).toEqual(["box_id", "label", "paid_at", "tier"]);
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      expect((await (await signedInClient(login)).rpc("admin_held_link_candidates", { p_id: id, p_nickname: "별빛" })).data ?? []).toHaveLength(0);
    }
  });

  it("INV-C12 (동시): 잇기와 반송 넘기기가 같은 상자에 동시에 와도 하나만 반영된다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    const op = await staff();
    const admin = await signedInClient("fankkuk_admin");
    const lock = await holdRowLock(`select 1 from public.office_unmatched where id = '${id}' for update`, 1.5);
    const [linked, returned] = await Promise.all([
      admin.rpc("admin_link_held_parcel", { p_id: id, p_nickname: "별빛", p_box_id: g.boxIds[0], p_checked: true }),
      op.rpc("admin_return_unmatched", { p_id: id }),
    ]);
    await lock.released;
    const ok = [linked.error === null, returned.error === null];
    expect(ok.filter(Boolean)).toHaveLength(1);
    const state = heldState(barcode);
    if (linked.error === null) {
      expect(state).toBe("matched");
      expect(parcelOfBox(g.boxIds[0])).toBe(`received|${barcode}`);
    } else {
      expect(linked.error.code).toBe("55000");
      expect(state).toBe("expired");
      expect(parcelOfBox(g.boxIds[0])).toBe("none");
    }
  });

  it("INV-C12 (동시): 반송 넘기기가 보류 줄을 쥐고 처리하는 중에 온 잇기는 기다렸다가 끝난 상태(반송 대상)를 보고 거부된다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    // 다른 연결이 반송 넘기기와 같은 쓰기(반송 대상으로 바꿈)를 하고 1.5초 쥐고 있다
    const lock = await holdRowLock(`update public.office_unmatched set expired_at = now() where id = '${id}'`, 1.5);
    const linked = await link("fankkuk_admin", id, "별빛", g.boxIds[0]);
    await lock.released;
    expect(linked.error?.code).toBe("55000");
    expect(heldState(barcode)).toBe("expired");
    expect(psql(`select matched_parcel_id is null from public.office_unmatched where id = '${id}'`)).toBe("t");
    expect(parcelOfBox(g.boxIds[0])).toBe("none");
  });

  it("INV-C12 (동시): 잇기와 주인의 찾기가 같은 상자에 동시에 와도 하나만 반영된다", async () => {
    const g = await paidGift(2);
    const barcode = waybill();
    await holdNoCode(barcode, "별빛");
    const id = heldId(barcode);
    const admin = await signedInClient("fankkuk_admin");
    const fan = await signedInClient("byeolbit_fan");
    const lock = await holdRowLock(`select 1 from public.office_unmatched where id = '${id}' for update`, 1.5);
    const [linked, found] = await Promise.all([
      admin.rpc("admin_link_held_parcel", { p_id: id, p_nickname: "별빛", p_box_id: g.boxIds[1], p_checked: true }),
      fan.rpc("find_held_parcel", { p_box_id: g.boxIds[0], p_share_id: null, p_waybill: barcode, p_carrier: "cj" }),
    ]);
    await lock.released;
    const wins = [linked.error === null && linked.data === "linked", found.error === null && found.data === "matched"];
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(Number(psql(`select count(*) from public.office_parcels where inbound_waybill_no = '${barcode}'`))).toBe(1);
  });
});

describe("INV-C9 · INV-W7 운영자 목록 — 닉네임 일치 여부(일치면 그 닉네임)만", () => {
  it("INV-C9 (S9): 보류 목록에 닉네임 칸 — 일치면 그 닉네임, 없으면 비어 있고 이름 글자 칸은 없다", async () => {
    const matched = waybill();
    const none = waybill();
    const name = realName();
    await holdNoCode(matched, "별빛");
    await holdNoCode(none, name);
    const r = await (await staff()).rpc("admin_unmatched_parcels");
    expect(r.error).toBeNull();
    const rows = r.data as Record<string, unknown>[];
    expect(rows.find((x) => x.waybill_no === matched)).toMatchObject({ nickname: "별빛" });
    expect(rows.find((x) => x.waybill_no === none)).toMatchObject({ nickname: null });
    expect(Object.keys(rows[0]!)).not.toContain("sender_initial");
    expect(JSON.stringify(rows)).not.toContain(name);
  });
});

// ── 리뷰 반영 (2026-10-16) ─────────────────────────────────────

/** 발급되지 않은, 확인 문자가 맞는 6자리 — 「없는 6자리」로 온 상자를 만든다 */
function unissuedCode(): string {
  for (;;) {
    const body = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ADDRESS_CODE_ALPHABET[b % 20]).join("");
    const code = body + addressCodeCheckChar(body);
    if (psql(`select count(*) from public.inbound_codes where code = '${code}'`) === "0") return code;
  }
}

describe("리뷰 반영 — 운영자 잇기의 한계 (INV-C12 ②·③, INV-C7)", () => {
  it("INV-C12 (S12b, 실패경로): 닉네임이 맞은 보류 상자는 그 계정이 아닌 팬에게 잇지 못한다(P0047) — 운영자 잇기는 닉네임 없음 상자의 길", async () => {
    const dalBox = await dalPaidBox();
    const g = await paidGift();
    const barcode = waybill();
    await holdNoCode(barcode, "별빛");
    const id = heldId(barcode);
    expect((await link("fankkuk_staff", id, "달토끼", dalBox)).error?.code).toBe("P0047");
    expect(parcelOfBox(dalBox)).toBe("none");
    expect(heldState(barcode)).toBe("waiting");
    expect(linkLogs(id)).toBe("");
    // 닉네임이 맞은 그 계정에게는 이을 수 있다
    expect((await link("fankkuk_staff", id, "별빛", g.boxIds[0])).data).toBe("linked");
  });

  it("INV-C12 · INV-C7 (실패경로): 같은 송장번호를 다른 상자에 등록해 둔 팬이 있으면 운영자 잇기를 거부한다(P0048) — 분쟁 사안", async () => {
    const dalBox = await dalPaidBox();
    const g = await paidGift();
    const barcode = waybill();
    await fanSetsWaybill(dalBox, barcode, "daltokki_fan");
    await holdNoCode(barcode, realName());
    const id = heldId(barcode);
    expect((await link("fankkuk_staff", id, "별빛", g.boxIds[0])).error?.code).toBe("P0048");
    expect(parcelOfBox(g.boxIds[0])).toBe("none");
    expect(heldState(barcode)).toBe("waiting");
  });

  it("INV-C12 · INV-C7: 그 송장번호를 고른 상자 자신에 등록해 둔 경우는 분쟁이 아니다 — 이어진다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await fanSetsWaybill(g.boxIds[0], barcode);
    await holdNoCode(barcode, realName());
    expect((await link("fankkuk_staff", heldId(barcode), "별빛", g.boxIds[0])).data).toBe("linked");
  });
});

describe("리뷰 반영 — 「6자리 없이 온 상자」는 6자리 없음·없는 6자리 둘 (INV-C5·C12·N21)", () => {
  it("INV-N21 · INV-C12: 없는 6자리로 온 닉네임 일치 상자도 알림이 가고, 닉네임 없음이면 운영자가 잇는다", async () => {
    const g = await paidGift();
    const op = await staff();
    const matched = waybill();
    expect((await scanInbound(op, matched, { code: unissuedCode(), carrier: "cj", senderName: "별빛", shelf: "T-N1" })).data).toMatchObject({ result: "hold", reason: "unknown_code" });
    expect(noCodeAlerts(SEED.fanId, heldId(matched))).toBe(1);
    const none = waybill();
    await scanInbound(op, none, { code: unissuedCode(), carrier: "cj", senderName: realName(), shelf: "T-N1" });
    expect((await link("fankkuk_staff", heldId(none), "별빛", g.boxIds[0])).data).toBe("linked");
  });

  it("INV-N21 (실패경로): 6자리가 붙어 온 보류 상자(분쟁)는 닉네임이 맞아도 「코드 없이 온 상자」 알림이 없다", async () => {
    const g = await paidGift();
    await receiveWithCode(g.boxIds[0]);
    const second = waybill();
    await scanInbound(await staff(), second, { code: codeOf({ boxId: g.boxIds[0] }), carrier: "cj", senderName: "별빛", shelf: "T-N1" });
    expect(noCodeAlerts(SEED.fanId, heldId(second))).toBe(0);
  });
});

describe("리뷰 반영 — 6자리가 붙어 온 보류 상자는 그 6자리 주인이 닉네임 없이 찾는다 (INV-C4 ②-가·C5)", () => {
  it("INV-C4 · INV-C5: 같은 6자리 분쟁의 둘째 상자(닉네임 없음) — 남이 같은 값을 넣으면 안 이어지고, 진짜 주인이 송장번호·택배사를 넣으면 이어진다", async () => {
    const g = await paidGift();
    const dalBox = await dalPaidBox();
    await receiveWithCode(g.boxIds[0]);
    const second = waybill();
    const r = await scanInbound(await staff(), second, { code: codeOf({ boxId: g.boxIds[0] }), carrier: "cj", senderName: realName(), shelf: "T-N1" });
    expect(r.data).toMatchObject({ result: "hold", reason: "code_dispute", nickname: null });
    expect((await find("daltokki_fan", dalBox, second)).data).toBe("not_found");
    expect(heldState(second)).toBe("waiting");
    expect((await find("byeolbit_fan", g.boxIds[0], second)).data).toBe("matched");
    expect(parcelOfBox(g.boxIds[0])).toBe(`received|${second}`);
  });
});

describe("리뷰 반영 — 닉네임 비교는 대소문자·앞뒤 공백을 무시한다 (INV-C5)", () => {
  it("INV-C5: 영문 닉네임 「Star」 계정, 송장 이름 「 star 」 → 닉네임 일치", async () => {
    const before = psql(`select nickname from public.profiles where id = '${GUREUM}'`);
    psql(`update public.profiles set nickname = 'Star' where id = '${GUREUM}'`);
    try {
      const barcode = waybill();
      const out = await holdNoCode(barcode, " star ");
      expect(out.nickname).toBe("Star");
      expect(heldNickname(barcode)).toBe("Star");
    } finally {
      psql(`update public.profiles set nickname = '${before}' where id = '${GUREUM}'`);
    }
  });

  it("INV-C9: 13~20자 닉네임과 맞은 상자도 운영자 목록에 그 닉네임으로 나온다(닉네임 칸은 20자까지)", async () => {
    const before = psql(`select nickname from public.profiles where id = '${GUREUM}'`);
    const long = "가나다라마바사아자차카타파하가나다라"; // 18자
    psql(`update public.profiles set nickname = '${long}' where id = '${GUREUM}'`);
    try {
      const barcode = waybill();
      await holdNoCode(barcode, long);
      const rows = (await (await staff()).rpc("admin_unmatched_parcels")).data as { waybill_no: string; nickname: string | null }[];
      expect(rows.find((x) => x.waybill_no === barcode)?.nickname).toBe(long);
    } finally {
      psql(`update public.profiles set nickname = '${before}' where id = '${GUREUM}'`);
    }
  });
});

describe("리뷰 반영 — 「6자리 없이 온 상자」 판정은 DB 와 앱이 같은 목록", () => {
  it("INV-C5·C12·N21: 보류 사유마다 DB 판정(inbound_held_without_code)이 앱 목록(HELD_WITHOUT_CODE_REASONS)과 같다", () => {
    const db = psql(`select string_agg(r || '=' || public.inbound_held_without_code(r), ',' order by r) from unnest(array[${HOLD_REASONS.map((r) => `'${r}'`).join(",")}]) as r`);
    const app = [...HOLD_REASONS].sort().map((r) => `${r}=${HELD_WITHOUT_CODE_REASONS.includes(r) ? "true" : "false"}`).join(",");
    expect(db).toBe(app);
  });
});
