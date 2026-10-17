import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { adminClient, deleteTestOrders, holdRowLock, psql, SEED, signedInClient } from "./helpers";
import { codeOf, deleteTestUnmatched, FAN_PASS, fanSetsWaybill, inspect, paidGift, paidShare, parcelState, receiveAndLabel, scanInbound, waybill, type Unit } from "./office-helpers";
import { clearFanAddresses, deleteTestRevgifts, registerFanAddress, sampleEnvelope } from "./revgift-helpers";

// 반송 주소 확인 — 등록 주소를 상자에 복사하는 확인과 반송 송장의 주소 열기(개인정보 구역). supabase/manual/0020_return_address.sql 을 적용해야 돈다.
// 스펙: office-workflow INV-W15 (S15·S15b·S15c·S15e), address-protection INV-P17·P18 (S17c·S18·S18b·S18c), action-center INV-J1·J4 (S1d)
// 시드: 별빛(byeolbit_fan) = 보낸 팬, 달토끼(daltokki_fan) = 다른 팬, 하루(haru_creator) = 받는 크리에이터·역조공을 보내는 크리에이터, fankkuk_admin = 대표.
// 시험이 쓰는 등록 주소는 형식만 맞춘 봉투다(복호화는 송장 출력 함수의 유닛 시험이 본다). 하루의 주소 칸은 비어 있을 때만 시험 값을 넣고 끝나면 지운다.

const BYEOLBIT = SEED.fanId;
const DALTOKKI = "00000000-0000-4000-a000-000000000002";
const OWNER = "00000000-0000-4000-a000-000000000021";
const RETURN_FAIL = { ...FAN_PASS, outcome: "return" } as const;

let haruAddressAdded = false;

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
  clearFanAddresses([BYEOLBIT, DALTOKKI]);
});
afterAll(() => {
  if (haruAddressAdded) psql(`delete from pii.creator_addresses where creator_id = '${SEED.haruCreatorId}'`);
});

const staff = (): Promise<SupabaseClient> => signedInClient("fankkuk_staff");

async function returnWaitingGift(n = 1): Promise<{ g: Unit; qrs: string[] }> {
  const g = await paidGift(n);
  const op = await staff();
  const qrs: string[] = [];
  for (const boxId of g.boxIds) {
    const no = waybill();
    await fanSetsWaybill(boxId, no);
    const qr = await receiveAndLabel(op, no);
    expect(await inspect(op, qr, RETURN_FAIL)).toBe("return_waiting");
    qrs.push(qr);
  }
  return { g, qrs };
}

const confirm = async (orderNo: string, seq: number | null, login = "byeolbit_fan") =>
  (await signedInClient(login)).rpc("confirm_return_address", { p_order_no: orderNo, p_box_seq: seq });
const copyOf = (qr: string) =>
  psql(`select coalesce((select a.envelope::text from pii.return_addresses a join public.office_parcels p on p.id = a.parcel_id where p.qr_code = '${qr}'), 'none')`);
const copies = (qr: string) => psql(`select count(*) from pii.return_addresses a join public.office_parcels p on p.id = a.parcel_id where p.qr_code = '${qr}'`);
const confirmedAt = (qr: string) => psql(`select return_confirmed_at is not null from public.office_parcels where qr_code = '${qr}'`);
const backdateReturnWaiting = (qr: string, interval: string) =>
  psql(`update public.office_parcels set return_waiting_at = now() - interval '${interval}' where qr_code = '${qr}'`);
/** 송장 출력 함수(복호화 역할)가 부르는 봉투 내주기 — 시험은 DB 관리자 연결로 부른다(판정은 같다). 결과 json */
const claim = (qr: string, requester = OWNER) => JSON.parse(psql(`select public.return_claim_print('${qr}', '${requester}')::text`)) as Record<string, unknown>;
const logRows = (qr: string) =>
  psql(
    `select coalesce(string_agg(l.result || ':' || coalesce(l.print_no::text, l.deny_reason), ',' order by l.id), '') from public.return_decrypt_log l join public.office_parcels p on p.id = l.parcel_id where p.qr_code = '${qr}'`,
  );

describe("반송 주소 확인 (office-workflow INV-W15, address-protection INV-P17·P18)", () => {
  it("INV-W15 · P18 (S15): 등록 주소가 있는 별빛이 확인 → 그 암호문이 상자에 복사, 그 뒤 설정 주소를 바꾸거나 지워도 상자의 주소는 그대로(S17c)", async () => {
    const { g, qrs } = await returnWaitingGift();
    const home = sampleEnvelope();
    await registerFanAddress(await signedInClient("byeolbit_fan"), home);
    const r = await confirm(g.orderNo, 1);
    expect(r.error).toBeNull();
    expect(r.data).toBe("confirmed");
    expect(JSON.parse(copyOf(qrs[0]!))).toEqual(home);
    expect(confirmedAt(qrs[0]!)).toBe("t");
    await registerFanAddress(await signedInClient("byeolbit_fan"), sampleEnvelope());
    expect(JSON.parse(copyOf(qrs[0]!))).toEqual(home);
    expect((await (await signedInClient("byeolbit_fan")).rpc("delete_my_fan_address")).data).toBe("deleted");
    expect(JSON.parse(copyOf(qrs[0]!))).toEqual(home);
  });

  it("INV-W15 (S15): 등록 주소가 없으면 no_address — 아무것도 바뀌지 않는다. 그 자리에서 등록한 뒤 확인하면 같은 결과, 「바꾸기」로 새 주소 등록 뒤 다시 확인하면 새 주소가 복사된다", async () => {
    const { g, qrs } = await returnWaitingGift();
    expect((await confirm(g.orderNo, 1)).data).toBe("no_address");
    expect(copies(qrs[0]!)).toBe("0");
    expect(confirmedAt(qrs[0]!)).toBe("f");
    const first = sampleEnvelope();
    await registerFanAddress(await signedInClient("byeolbit_fan"), first);
    expect((await confirm(g.orderNo, 1)).data).toBe("confirmed");
    const changed = sampleEnvelope();
    await registerFanAddress(await signedInClient("byeolbit_fan"), changed);
    expect((await confirm(g.orderNo, 1)).data).toBe("confirmed");
    expect(copies(qrs[0]!)).toBe("1");
    expect(JSON.parse(copyOf(qrs[0]!))).toEqual(changed);
  });

  it("INV-W15 (S15b, 실패경로): 다른 팬·받는 크리에이터·없는 상자·로그인 없음은 같은 not_found, 아무것도 복사되지 않는다", async () => {
    const { g, qrs } = await returnWaitingGift();
    await registerFanAddress(await signedInClient("daltokki_fan"), sampleEnvelope());
    expect((await confirm(g.orderNo, 1, "daltokki_fan")).data).toBe("not_found");
    expect((await confirm(g.orderNo, 1, "haru_creator")).data).toBe("not_found");
    expect((await confirm(g.orderNo, 2)).data).toBe("not_found");
    expect((await confirm("FC-TNOSUCH", 1)).data).toBe("not_found");
    expect((await adminClient().rpc("confirm_return_address", { p_order_no: g.orderNo, p_box_seq: 1 })).error).not.toBeNull();
    expect(copies(qrs[0]!)).toBe("0");
  });

  it("INV-W15 (S15c, 실패경로): 반송 대기 + 720시간 정각부터는 처분 대상 전이라도 expired, 처분 대상이 된 뒤에도 expired. 반송 송장을 출력한 뒤에는 closed", async () => {
    const { g, qrs } = await returnWaitingGift(2);
    await registerFanAddress(await signedInClient("byeolbit_fan"), sampleEnvelope());
    backdateReturnWaiting(qrs[0]!, "720 hours");
    expect((await confirm(g.orderNo, 1)).data).toBe("expired");
    await (await staff()).rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(parcelState(qrs[0]!)).toBe("dispose_due");
    expect((await confirm(g.orderNo, 1)).data).toBe("expired");
    expect(copies(qrs[0]!)).toBe("0");
    // 둘째 상자: 확인 → 마무리로 반송 송장 출력 단계 → 다시 확인은 closed
    expect((await confirm(g.orderNo, 2)).data).toBe("confirmed");
    psql(`select public.return_finish_print('${qrs[1]}', '${waybill()}')`);
    expect(parcelState(qrs[1]!)).toBe("return_printed");
    expect((await confirm(g.orderNo, 2)).data).toBe("closed");
  });

  it("INV-W15 (S15e, 동시): 반송 대기 + 720시간 상자에 확인과 자동 처리가 같은 잠금 뒤에 줄 서도 하나만 — 처분 대상, 복사본 없음, 확인은 expired", async () => {
    const { g, qrs } = await returnWaitingGift();
    await registerFanAddress(await signedInClient("byeolbit_fan"), sampleEnvelope());
    backdateReturnWaiting(qrs[0]!, "720 hours");
    const fan = await signedInClient("byeolbit_fan");
    const op = await staff();
    const held = await holdRowLock(`select 1 from public.orders where id = '${g.orderId}' for update`, 2);
    const [c, e] = await Promise.all([fan.rpc("confirm_return_address", { p_order_no: g.orderNo, p_box_seq: 1 }), op.rpc("office_run_expiry", { p_order_no: g.orderNo })]);
    await held.released;
    expect(e.error).toBeNull();
    expect(c.data).toBe("expired");
    expect(parcelState(qrs[0]!)).toBe("dispose_due");
    expect(copies(qrs[0]!)).toBe("0");
  });

  // 719시간이면 336시간 재알림은 이미 나갔다 — 먼저 한 번 돌려 그 상태를 만든다. 그래야 둘 중 어느 쪽이 먼저 잠금을 잡아도 결과가 같다
  it("INV-W15 (S15e, 동시): 720시간 전 상자에 확인과 자동 처리가 겹치면 확인만 반영 — 반송 대기 그대로, 재알림이 더 늘지 않는다", async () => {
    const { g, qrs } = await returnWaitingGift();
    await registerFanAddress(await signedInClient("byeolbit_fan"), sampleEnvelope());
    backdateReturnWaiting(qrs[0]!, "719 hours 59 minutes");
    const fan = await signedInClient("byeolbit_fan");
    const op = await staff();
    await op.rpc("office_run_expiry", { p_order_no: g.orderNo });
    const reminders = (): string => psql(`select count(*) from public.notification_outbox where order_id = '${g.orderId}' and kind = 'return_address_reminder' and channel = 'email'`);
    expect(reminders()).toBe("1");
    const held = await holdRowLock(`select 1 from public.orders where id = '${g.orderId}' for update`, 2);
    const [c, e] = await Promise.all([fan.rpc("confirm_return_address", { p_order_no: g.orderNo, p_box_seq: 1 }), op.rpc("office_run_expiry", { p_order_no: g.orderNo })]);
    await held.released;
    expect(e.error).toBeNull();
    expect(c.data).toBe("confirmed");
    expect(parcelState(qrs[0]!)).toBe("return_waiting");
    expect(copies(qrs[0]!)).toBe("1");
    await op.rpc("office_run_expiry", { p_order_no: g.orderNo });
    expect(reminders()).toBe("1");
  });

  it("INV-J1 · J4 (S1d): 「확인」 뒤 다시 읽으면 그 상자의 「반송 주소 확인」 카드가 없다", async () => {
    const { g } = await returnWaitingGift();
    await registerFanAddress(await signedInClient("byeolbit_fan"), sampleEnvelope());
    const fan = await signedInClient("byeolbit_fan");
    const cards = async () => ((await fan.rpc("my_action_items")).data as { kind: string; order_no: string }[]).filter((c) => c.order_no === g.orderNo).map((c) => c.kind);
    expect(await cards()).toEqual(["return_address"]);
    expect((await confirm(g.orderNo, 1)).data).toBe("confirmed");
    expect(await cards()).toEqual([]);
  });

  it("INV-W15 · P18: 역조공 몫 상자는 보낸 크리에이터(하루)가 확인 — 하루의 등록 주소 암호문이 복사된다. 받는 팬(별빛)은 not_found", async () => {
    const existing = psql(`select count(*) from pii.creator_addresses where creator_id = '${SEED.haruCreatorId}'`);
    const envelope = sampleEnvelope();
    if (existing === "0") {
      const saved = await adminClient().rpc("set_creator_address", { p_actor_id: SEED.creatorProfileId, p_envelope: envelope, p_label: "home", p_method: "fake" });
      expect(saved.error).toBeNull();
      haruAddressAdded = true;
    }
    const s = await paidShare();
    const op = await staff();
    const scanned = await scanInbound(op, waybill(), { code: codeOf({ shareId: s.shareId }) });
    const qr = (scanned.data as { qr: string }).qr;
    await op.rpc("office_confirm_label", { p_qr: qr });
    expect(await inspect(op, qr, { surface: "found", prohibited: "clear", outcome: "return" })).toBe("return_waiting");
    expect((await confirm(s.orderNo, null)).data).toBe("not_found");
    expect((await confirm(s.orderNo, null, "haru_creator")).data).toBe("confirmed");
    expect(copyOf(qr)).toBe(psql(`select envelope::text from pii.creator_addresses where creator_id = '${SEED.haruCreatorId}'`));
  });
});

describe("반송 송장의 주소 열기 (address-protection INV-P18)", () => {
  async function confirmedBox(): Promise<{ g: Unit; qr: string }> {
    const { g, qrs } = await returnWaitingGift();
    await registerFanAddress(await signedInClient("byeolbit_fan"), sampleEnvelope());
    expect((await confirm(g.orderNo, 1)).data).toBe("confirmed");
    return { g, qr: qrs[0]! };
  }

  it("INV-P18 (S18): 확인한 반송 대기 상자 → 봉투와 보낸 계정을 내주고 연 줄 1, 별빛이 자기 열람 기록에서 본다. 반송 확정 → 복사본 지움·지운 기록 1, 다시 열기 거부", async () => {
    const { g, qr } = await confirmedBox();
    const opened = claim(qr);
    expect(opened).toMatchObject({ result: "opened", print_no: 1, order_no: g.orderNo, sender_id: BYEOLBIT, sender_creator_id: null });
    expect(opened.envelope).toEqual(JSON.parse(copyOf(qr)));
    expect(logRows(qr)).toBe("opened:1");
    const back = waybill();
    psql(`select public.return_finish_print('${qr}', '${back}')`);
    const log = await (await signedInClient("byeolbit_fan")).rpc("my_return_access_log", { p_order_no: g.orderNo });
    expect(log.error).toBeNull();
    expect((log.data as { kind: string; print_no: number | null }[]).map((r) => [r.kind, r.print_no])).toEqual([["opened", 1]]);
    // 다른 팬은 별빛 주문의 기록을 못 본다
    expect((await (await signedInClient("daltokki_fan")).rpc("my_return_access_log", { p_order_no: g.orderNo })).data).toEqual([]);

    expect((await (await staff()).rpc("office_confirm_return", { p_qr: qr, p_waybill: back })).error).toBeNull();
    expect(copies(qr)).toBe("0");
    expect(psql(`select string_agg(e.event || ',' || e.outcome, ';') from public.return_address_events e join public.office_parcels p on p.id = e.parcel_id where p.qr_code = '${qr}'`)).toBe("deleted,returned");
    expect(claim(qr)).toEqual({ result: "denied", reason: "order_not_printable" });
    const after = (await (await signedInClient("byeolbit_fan")).rpc("my_return_access_log", { p_order_no: g.orderNo })).data as { kind: string; outcome: string | null }[];
    expect(after.map((r) => [r.kind, r.outcome])).toEqual([["deleted", "returned"], ["opened", null]]);
  });

  it("INV-P7 · P18: 반송 송장으로 주소를 연 줄과 거부 줄이 운영자 내부 열람 기록에 「반송」 줄로 보인다 — 주문번호·결과·몇 번째·누가, 주소 칸은 없다", async () => {
    const { g, qr } = await confirmedBox();
    const unconfirmed = await returnWaitingGift();
    expect(claim(qr)).toMatchObject({ result: "opened", print_no: 1 });
    expect(claim(unconfirmed.qrs[0]!)).toEqual({ result: "denied", reason: "no_valid_approval" });
    // 「대표 아님」 거부 줄은 송장 출력 함수가 대표 판정에서 넣는다(print-return-label 의 logDenied) — 같은 줄을 넣는다
    psql(`insert into public.return_decrypt_log (parcel_id, requester_id, result, deny_reason) select id, '${DALTOKKI}', 'denied', 'not_owner' from public.office_parcels where qr_code = '${qr}'`);
    const read = await (await staff()).rpc("admin_access_log", { p_limit: 500 });
    expect(read.error).toBeNull();
    type Row = { target: string; order_no: string; result: string; print_no: number | null; deny_reason: string | null; requester: string; released: boolean };
    const rows = (read.data as Row[]).filter((r) => r.target === "return");
    const mine = rows.filter((r) => r.order_no === g.orderNo).map((r) => [r.result, r.print_no, r.deny_reason, r.requester, r.released]);
    expect(mine).toEqual([
      ["denied", null, "not_owner", "other", false],
      ["opened", 1, null, "owner", false],
    ]);
    expect(rows.filter((r) => r.order_no === unconfirmed.g.orderNo).map((r) => [r.result, r.deny_reason])).toEqual([["denied", "no_valid_approval"]]);
    // 칸 목록은 그대로 — 주소·봉투가 들어갈 칸이 없다
    expect(Object.keys((read.data as Row[])[0]!).sort()).toEqual(["at", "deny_reason", "order_no", "print_no", "released", "requester", "requester_nickname", "result", "target"]);
    // 운영자가 아니면 읽지 못한다
    expect((await (await signedInClient("byeolbit_fan")).rpc("admin_access_log", { p_limit: 10 })).error?.code).toBe("42501");
  });

  it("INV-P18 (S18b, 실패경로): 확인하지 않은 상자 · 어느 주문에도 이어지지 않은 상자 → 거부와 거부 줄", async () => {
    const { qrs } = await returnWaitingGift();
    expect(claim(qrs[0]!)).toEqual({ result: "denied", reason: "no_valid_approval" });
    expect(logRows(qrs[0]!)).toBe("denied:no_valid_approval");
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0]!, no);
    const qr = await receiveAndLabel(await staff(), no);
    await (await signedInClient("byeolbit_fan")).rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null });
    const pid = psql(`select id from public.office_parcels where qr_code = '${qr}'`);
    await (await staff()).rpc("admin_return_held_parcel", { p_id: pid });
    psql(`update public.office_parcels set state = 'return_waiting' where id = '${pid}'`);
    expect(claim(qr)).toEqual({ result: "denied", reason: "no_valid_approval" });
    expect(logRows(qr)).toBe("denied:no_valid_approval");
  });

  it("INV-P18 (실패경로): 상자마다 3회 — 넷째는 decrypt_limit_reached 거부 줄. 연 줄은 고치거나 지울 수 없다", async () => {
    const { qr } = await confirmedBox();
    for (let i = 1; i <= 3; i++) expect(claim(qr)).toMatchObject({ result: "opened", print_no: i });
    expect(claim(qr)).toEqual({ result: "denied", reason: "decrypt_limit_reached" });
    expect(logRows(qr)).toBe("opened:1,opened:2,opened:3,denied:decrypt_limit_reached");
    expect(() => psql(`delete from public.return_decrypt_log where parcel_id = (select id from public.office_parcels where qr_code = '${qr}')`)).toThrow();
  });

  it("INV-P18 (S18c): 봉투를 내줄 때 그 상자 주문을 보낸 계정을 같이 내준다 — 송장 출력 함수가 봉인 속 계정과 대조한다", async () => {
    const { qr } = await confirmedBox();
    const other = await returnWaitingGift();
    await registerFanAddress(await signedInClient("daltokki_fan"), sampleEnvelope());
    // 달토끼 주문이 아니어도 계정 칸은 상자 주문의 보낸 사람이다 — 별빛 상자에서 열면 별빛
    expect(claim(qr).sender_id).toBe(BYEOLBIT);
    expect(claim(other.qrs[0]!)).toEqual({ result: "denied", reason: "no_valid_approval" });
  });

  it("INV-P18: 복사본 칸·지운 기록 칸에는 주소 꼴의 이름이 public 에 없다 — 지운 기록은 상자·사건·결과·시각뿐", () => {
    expect(
      psql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'return_address_events'"),
    ).toBe("id,parcel_id,event,outcome,at");
  });
});
