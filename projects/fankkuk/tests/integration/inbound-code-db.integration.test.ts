import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { ADDRESS_CODE_ALPHABET, addressCodeCheckChar, parseAddressCode } from "@/entities/parcel/model/address-code";
import { adminClient, anonClient, clearWaybillAttempts, deleteTestOrders, holdRowLock, psql, psqlError, registerTestOrder, SEED, signedInClient } from "./helpers";
import {
  approve,
  codeOf,
  deleteTestUnmatched,
  FAN_PASS,
  fanSetsWaybill,
  HOLD_DETAILS,
  inspect,
  orderStatus,
  paidGift,
  paidShare,
  scanInbound,
  sentWithAddress,
  waybill,
} from "./office-helpers";
import { deleteTestRevgifts } from "./revgift-helpers";

// 상자별 받는 주소 6자리 (docs/specs/inbound-address-code.md INV-C1~C10, notifications INV-N14).
// 시드: 별빛(byeolbit_fan) = 시험 주문의 팬, 달토끼(daltokki_fan) = 다른 팬, 하루(haru_creator) = 받는 크리에이터,
//       fankkuk_staff·fankkuk_admin = 운영자(입고 작업자 둘).

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

type ScanOut = { result: string; qr: string | null; order_no: string | null; reason: string | null };

function codeState(boxId: string): string {
  return psql(`select state from public.inbound_codes where box_id = '${boxId}'`);
}

function parcelOf(boxId: string): { id: string; qr: string; state: string; hold: string; barcode: string } {
  const [id, qr, state, hold, barcode] = psql(
    `select id || '|' || qr_code || '|' || state || '|' || coalesce(hold_reason, '') || '|' || coalesce(inbound_waybill_no, '') from public.office_parcels where box_id = '${boxId}'`,
  ).split("|");
  return { id, qr, state, hold, barcode };
}

function holdRow(barcode: string): { reason: string; theft: string; matched: string; expired: string } | null {
  const row = psql(
    `select reason || '|' || suspected_theft || '|' || (matched_parcel_id is not null) || '|' || (expired_at is not null) from public.office_unmatched where waybill_no = '${barcode}'`,
  );
  if (!row) return null;
  const [reason, theft, matched, expired] = row.split("|");
  return { reason, theft, matched, expired };
}

/** 발급되지 않은, 확인 문자가 맞는 6자리 */
function unissuedCode(): string {
  for (;;) {
    const body = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ADDRESS_CODE_ALPHABET[b % 20]).join("");
    const code = body + addressCodeCheckChar(body);
    if (psql(`select count(*) from public.inbound_codes where code = '${code}'`) === "0") return code;
  }
}

/** 한 글자를 바꾼 값(확인 문자가 틀린 값) */
function typo(code: string): string {
  const i = 2;
  const next = ADDRESS_CODE_ALPHABET[(ADDRESS_CODE_ALPHABET.indexOf(code[i]) + 1) % 20];
  return code.slice(0, i) + next + code.slice(i + 1);
}

async function staff(): Promise<SupabaseClient> {
  return signedInClient("fankkuk_staff");
}

async function confirmLabel(client: SupabaseClient, qr: string): Promise<void> {
  const r = await client.rpc("office_confirm_label", { p_qr: qr });
  if (r.error) throw new Error(`office_confirm_label 실패: ${r.error.code} ${r.error.message}`);
}

/** 6자리로 입고 + 라벨 부착 확인. 돌려주는 값은 내부 QR. */
async function receiveWithCode(client: SupabaseClient, boxId: string, barcode = waybill()): Promise<string> {
  const r = await scanInbound(client, barcode, { code: codeOf({ boxId }) });
  expect(r.error).toBeNull();
  const out = r.data as ScanOut;
  expect(out.result).toBe("received");
  await confirmLabel(client, out.qr!);
  return out.qr!;
}

/** 출고 확정까지 */
async function shipAll(client: SupabaseClient, unit: Awaited<ReturnType<typeof paidGift>>, qr: string): Promise<void> {
  await inspect(client, qr, FAN_PASS);
  await approve(unit);
  const owner = await signedInClient("fankkuk_admin");
  const out = waybill();
  const printed = await owner.rpc("office_print_label", { p_qr: qr, p_waybill: out });
  if (printed.error) throw new Error(`office_print_label 실패: ${printed.error.code} ${printed.error.message}`);
  const shipped = await client.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out });
  if (shipped.error) throw new Error(`office_confirm_shipment 실패: ${shipped.error.code} ${shipped.error.message}`);
}

async function find(login: string, target: { boxId?: string; shareId?: string }, no: string, carrier = "cj", initial = "별") {
  const client = await signedInClient(login);
  return client.rpc("find_held_parcel", {
    p_box_id: target.boxId ?? null,
    p_share_id: target.shareId ?? null,
    p_waybill: no,
    p_carrier: carrier,
    p_sender_initial: initial,
  });
}

/** 6자리 없이 온 상자를 보류로 넣는다 */
async function holdWithoutCode(barcode: string, initial = "별"): Promise<void> {
  const r = await scanInbound(await staff(), barcode, { code: null, carrier: "cj", initial, shelf: "T-1" });
  expect(r.error).toBeNull();
  expect((r.data as ScanOut).result).toBe("hold");
}

describe("INV-C1 발급 — 결제가 끝난 주문의 상자마다 하나, 무작위 + 확인 문자", () => {
  it("INV-C1 (S1): 상자 3개 주문이 결제 완료되면 6자리 3개, 서로 다르고 확인 문자가 맞다. 결제 대기 주문에는 0개", async () => {
    const pending = await registerTestOrder(2);
    expect(psql(`select count(*) from public.inbound_codes c join public.boxes b on b.id = c.box_id where b.order_id = '${pending.orderId}'`)).toBe("0");

    const g = await paidGift(3);
    const codes = g.boxIds.map((id) => codeOf({ boxId: id }));
    expect(codes.every((c) => c !== null)).toBe(true);
    expect(new Set(codes).size).toBe(3);
    for (const c of codes) expect(parseAddressCode(c!)).toEqual({ ok: true, value: c });
    for (const id of g.boxIds) expect(codeState(id)).toBe("valid");
    // 상자마다 작업 줄이 '입고 전'으로 미리 생긴다
    for (const id of g.boxIds) expect(parcelOf(id).state).toBe("awaiting");
  });

  it("INV-C1: 역조공 몫도 결제가 끝나면 6자리 하나(보낸 크리에이터용)", async () => {
    const s = await paidShare();
    const code = codeOf({ shareId: s.shareId });
    expect(code).not.toBeNull();
    expect(parseAddressCode(code!).ok).toBe(true);
  });

  it("INV-C1: DB 의 확인 문자 계산과 앱(TS)의 계산이 같은 답을 낸다 — 무작위 300개", () => {
    const bodies = Array.from({ length: 300 }, () =>
      Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ADDRESS_CODE_ALPHABET[b % 20]).join(""),
    );
    const list = bodies.map((b) => `'${b}'`).join(",");
    const fromDb = psql(`select string_agg(public.inbound_code_check_char(b), '' order by o) from unnest(array[${list}]) with ordinality t(b, o)`);
    expect(fromDb).toBe(bodies.map(addressCodeCheckChar).join(""));
  });

  it("INV-C1: 6자리 칸은 꼴 검사를 한다 — 확인 문자가 틀린 값·20자 밖 글자는 표에 들어가지 않는다", async () => {
    const g = await paidGift();
    const good = codeOf({ boxId: g.boxIds[0] })!;
    expect(psqlError(`update public.inbound_codes set code = '${typo(good)}' where box_id = '${g.boxIds[0]}'`)).not.toBeNull();
    const pending = await registerTestOrder(1);
    const box = psql(`select id from public.boxes where order_id = '${pending.orderId}'`);
    expect(psqlError(`insert into public.inbound_codes (code, box_id) values ('${typo(good)}', '${box}')`)).toMatch(/check/i);
    expect(psqlError(`insert into public.inbound_codes (code, box_id) values ('K7M3Q0', '${box}')`)).toMatch(/check/i);
  });

  it("INV-C1 (S1c): 최근 1년 안에 사용됨·무효가 된 값, 지금 유효한 값을 뽑으면 다시 뽑는다. 1년이 지난 값은 다시 쓸 수 있다", async () => {
    const used = await paidGift();
    const usedCode = codeOf({ boxId: used.boxIds[0] })!;
    await receiveWithCode(await staff(), used.boxIds[0]);
    const valid = await paidGift();
    const validCode = codeOf({ boxId: valid.boxIds[0] })!;
    // 1년 안에 무효가 된 값 — 크리에이터 거절로 지금 무효
    const voided = await paidGift();
    const voidedCode = codeOf({ boxId: voided.boxIds[0] })!;
    expect((await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: voided.requestId, p_block: false })).error).toBeNull();
    expect(codeState(voided.boxIds[0])).toBe("void");
    const old = await paidGift();
    const oldCode = codeOf({ boxId: old.boxIds[0] })!;
    psql(`update public.inbound_codes set state = 'void', voided_at = now() - interval '13 months' where box_id = '${old.boxIds[0]}'`);

    // 발급 함수에 후보를 앞에서부터 준다(시험용 인자) — 겹치는 셋(사용됨·유효·1년 안 무효)은 건너뛰고 넷째(1년 지난 값)를 쓴다
    const fresh = await registerTestOrder(1);
    const box = psql(`select id from public.boxes where order_id = '${fresh.orderId}'`);
    psql(`select public.inbound_issue_code('${box}', null, array['${usedCode}', '${validCode}', '${voidedCode}', '${oldCode}'])`);
    expect(codeOf({ boxId: box })).toBe(oldCode);
    for (const c of [usedCode, validCode, voidedCode]) expect(psql(`select count(*) from public.inbound_codes where code = '${c}'`)).toBe("1");
  });

  it("INV-C1: 유효한 값은 동시에 둘일 수 없고, 사용됨·무효에서 유효로 돌아가지 않는다", async () => {
    const a = await paidGift();
    const b = await paidGift();
    const codeA = codeOf({ boxId: a.boxIds[0] })!;
    expect(psqlError(`delete from public.inbound_codes where box_id = '${b.boxIds[0]}'; insert into public.inbound_codes (code, box_id) values ('${codeA}', '${b.boxIds[0]}')`)).toMatch(/duplicate|unique/i);
    await receiveWithCode(await staff(), a.boxIds[0]);
    expect(psqlError(`update public.inbound_codes set state = 'valid', used_at = null where box_id = '${a.boxIds[0]}'`)).not.toBeNull();
    expect(codeState(a.boxIds[0])).toBe("used");
  });
});

describe("INV-C2 6자리는 그 주문의 주인에게만", () => {
  it("INV-C2 (S2): 별빛은 선물 상세(상자 읽기)에서 6자리를 받는다. 달토끼·로그인 안 함은 0줄", async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const fan = await signedInClient("byeolbit_fan");
    // 승인 전 주문은 「먼저 보내기」를 눌러야 6자리가 나온다(approval-signature INV-S9)
    expect((await fan.rpc("ack_early_send", { p_order_no: g.orderNo })).error).toBeNull();
    const mine = await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo });
    expect(mine.error).toBeNull();
    expect((mine.data as { address_code: string | null }[])[0].address_code).toBe(code);

    const other = await (await signedInClient("daltokki_fan")).rpc("my_gift_boxes", { p_order_no: g.orderNo });
    expect(other.data ?? []).toHaveLength(0);
    const anon = await anonClient().rpc("my_gift_boxes", { p_order_no: g.orderNo });
    expect(anon.data ?? []).toHaveLength(0);
  });

  it("INV-C2 (S2): 받는 크리에이터(하루)·운영자의 읽기 함수에는 6자리가 어디에도 없다 — 읽기가 실제로 무언가를 돌려준 상태에서", async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const op = await staff();
    // 이 6자리를 단 상자가 입고되고, 같은 6자리로 둘째 상자가 와 보류 목록에 두 줄(보류 상자 · 멈춘 상자)이 생긴 상태
    const qr = await receiveWithCode(op, g.boxIds[0]);
    const second = waybill();
    expect((await scanInbound(op, second, { code, ...HOLD_DETAILS })).data).toMatchObject({ result: "hold", reason: "code_dispute" });
    // 하루가 보낸 사람인 다른 주문(하루 → 모모) — 하루의 상자 읽기가 빈 응답만 주는 것이 아님을 보이는 짝
    const own = await registerTestOrder(1, { senderId: SEED.creatorProfileId, creatorId: "00000000-0000-4000-b000-000000000002" });
    const { payTestOrder } = await import("./helpers");
    await payTestOrder(own);
    const haru = await signedInClient("haru_creator");
    // 하루가 보낸 주문도 승인 전이라 「먼저 보내기」를 눌러야 6자리가 나온다(approval-signature INV-S9)
    expect((await haru.rpc("ack_early_send", { p_order_no: own.orderNo })).error).toBeNull();

    const incoming = await haru.rpc("my_incoming_gifts");
    const haruBoxesOfByeol = await haru.rpc("my_gift_boxes", { p_order_no: g.orderNo });
    const haruOwnBoxes = await haru.rpc("my_gift_boxes", { p_order_no: own.orderNo });
    const list = await op.rpc("admin_office_parcels");
    const detail = await op.rpc("office_parcel_by_qr", { p_qr: qr });
    const held = await op.rpc("admin_unmatched_parcels");
    for (const r of [incoming, haruBoxesOfByeol, haruOwnBoxes, list, detail, held]) {
      expect(r.error).toBeNull();
      expect(JSON.stringify(r.data)).not.toContain(code);
    }
    // 각 읽기가 실제로 이 주문(상자)을 돌려준다 — 빈 응답이라 안 보인 것이 아니다
    expect(JSON.stringify(incoming.data)).toContain(g.orderNo);
    expect(JSON.stringify(list.data)).toContain(g.orderNo);
    expect(JSON.stringify(detail.data)).toContain(qr);
    const heldRows = held.data as { waybill_no: string | null; qr: string | null }[];
    expect(heldRows.some((x) => x.waybill_no === second)).toBe(true);
    expect(heldRows.some((x) => x.qr === qr)).toBe(true);
    // 하루의 상자 읽기: 받는 크리에이터로서는 0줄(주인 전용), 보낸 사람으로서는 자기 상자 1줄 — 자기 6자리만
    expect(haruBoxesOfByeol.data).toEqual([]);
    const ownRows = haruOwnBoxes.data as { address_code: string | null }[];
    expect(ownRows).toHaveLength(1);
    expect(ownRows[0].address_code).not.toBeNull();
    expect(ownRows[0].address_code).not.toBe(code);
  });

  it("INV-C2: 6자리 표는 화면 쪽 키로 직접 읽을 수 없다", async () => {
    await paidGift();
    const r = await (await signedInClient("byeolbit_fan")).from("inbound_codes").select("code");
    expect(r.error).not.toBeNull();
    const a = await anonClient().from("inbound_codes").select("code");
    expect(a.error).not.toBeNull();
  });

  it("INV-C2 (S2): 역조공 상자의 6자리는 보낸 크리에이터(하루)에게만 — 받는 팬(별빛)의 읽기에는 없다", async () => {
    const s = await paidShare();
    const code = codeOf({ shareId: s.shareId })!;
    const haru = await signedInClient("haru_creator");
    const mine = await haru.rpc("my_share_boxes");
    const row = (mine.data as { share_id: string; address_code: string | null }[]).find((x) => x.share_id === s.shareId);
    expect(row?.address_code).toBe(code);
    const fan = await signedInClient("byeolbit_fan");
    const received = await fan.rpc("my_received_revgifts");
    expect(received.error).toBeNull();
    expect(JSON.stringify(received.data)).toContain(s.orderNo);
    expect(JSON.stringify(received.data)).not.toContain(code);
    const fanBoxes = await fan.rpc("my_share_boxes");
    expect(JSON.stringify(fanBoxes.data ?? [])).not.toContain(code);
  });

  it("INV-C2 (S2b) · INV-N14: 상자 도착·승인 요청 알림 줄과 꺼내기 결과에 6자리가 없다", async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    await receiveWithCode(await staff(), g.boxIds[0]);
    const rows = psql(`select coalesce(json_agg(row_to_json(n))::text, '[]') from public.notification_outbox n where n.order_id = '${g.orderId}'`);
    expect(rows).toContain("box_arrived");
    expect(rows).toContain("approval_request");
    expect(rows).not.toContain(code);
    // 꺼내기가 돌려주는 칸에 6자리·주소 칸이 없다
    const claimCols = psql(`select pg_get_function_result('public.notification_claim(integer)'::regprocedure)`);
    expect(claimCols).not.toMatch(/code|address/);
  });
});

describe("INV-C3 거절·반려·취소 때 그 주문의 6자리 전부 무효", () => {
  it("INV-C3 (S3): 결제 완료·승인 전에 보이던 6자리가 크리에이터 거절과 같은 처리에서 전부 무효, 주소 칸이 사라진다", async () => {
    const g = await paidGift(2);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("ack_early_send", { p_order_no: g.orderNo })).error).toBeNull();
    const before = (await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data as { address_code: string | null }[];
    expect(before.every((b) => b.address_code !== null)).toBe(true);

    const haru = await signedInClient("haru_creator");
    const d = await haru.rpc("decline_gift", { p_request_id: g.requestId, p_block: false });
    expect(d.error).toBeNull();
    for (const id of g.boxIds) expect(codeState(id)).toBe("void");
    const after = (await fan.rpc("my_gift_boxes", { p_order_no: g.orderNo })).data as { address_code: string | null }[];
    expect(after).toHaveLength(2);
    expect(after.every((b) => b.address_code === null)).toBe(true);
  });

  it("INV-C3 (S3b): 7일 자동 반려도 같다", async () => {
    const g = await paidGift();
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    expect((await (await staff()).rpc("office_run_expiry", { p_order_no: g.orderNo })).error).toBeNull();
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("expired");
    expect(codeState(g.boxIds[0])).toBe("void");
  });

  // 팬 선물 주문을 취소하는 함수(주문 상태를 canceled 로 바꾸는 길)는 아직 없다 — 그 길이 생기면 그 함수로 바꾼다.
  // 지금은 무효 처리가 상태 전이 자체(트리거)에 붙어 있음을 직접 갱신으로 본다. 역조공 몫 취소는 실제 취소 함수로 아래에서 본다.
  it("INV-C3 (S3b): 주문 취소도 같다 — 이미 입고에 쓰인 6자리는 사용됨 그대로", async () => {
    const g = await paidGift(2);
    await receiveWithCode(await staff(), g.boxIds[0]);
    psql(`update public.orders set status = 'canceled' where id = '${g.orderId}'`);
    expect(codeState(g.boxIds[0])).toBe("used");
    expect(codeState(g.boxIds[1])).toBe("void");
  });

  it("INV-C3 (S3b): 역조공 몫을 실제 취소 함수(close_revgift_share 'cancelled', 앱 서버 키)로 취소하면 그 몫의 6자리가 무효, 주소 칸이 사라진다", async () => {
    const s = await paidShare();
    const haru = await signedInClient("haru_creator");
    const before = ((await haru.rpc("my_share_boxes")).data as { share_id: string; address_code: string | null }[]).find((x) => x.share_id === s.shareId);
    expect(before?.address_code).not.toBeNull();
    const r = await adminClient().rpc("close_revgift_share", { p_order_no: s.orderNo, p_outcome: "cancelled" });
    expect(r.error).toBeNull();
    expect(psql(`select state from public.inbound_codes where share_id = '${s.shareId}'`)).toBe("void");
    const after = ((await haru.rpc("my_share_boxes")).data as { share_id: string; address_code: string | null }[]).find((x) => x.share_id === s.shareId);
    expect(after).toBeDefined();
    expect(after?.address_code).toBeNull();
  });

  it("INV-C3: 역조공 몫을 팬이 받지 않으면 그 몫의 6자리가 무효", async () => {
    const s = await paidShare();
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("decline_revgift", { p_order_no: s.orderNo })).error).toBeNull();
    expect(psql(`select state from public.inbound_codes where share_id = '${s.shareId}'`)).toBe("void");
  });

  it("INV-C3: 무효가 된 6자리로 온 상자는 입고되지 않고 보류", async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false });
    const barcode = waybill();
    const r = await scanInbound(await staff(), barcode, { code, ...HOLD_DETAILS });
    expect((r.data as ScanOut).result).toBe("hold");
    expect(holdRow(barcode)?.reason).toBe("void_code");
    expect(parcelOf(g.boxIds[0]).state).toBe("awaiting");
  });
});

describe("INV-C5 입고 — 바코드 + 6자리", () => {
  it("INV-C5 (S5): 유효한 6자리 → 입고 완료, 6자리 사용됨, 라벨 1장, 바코드가 그 상자에 묶인다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    const op = await staff();
    const r = await scanInbound(op, barcode, { code: codeOf({ boxId: g.boxIds[0] }) });
    expect(r.error).toBeNull();
    const out = r.data as ScanOut;
    expect(out.result).toBe("received");
    expect(out.order_no).toBe(g.orderNo);
    expect(codeState(g.boxIds[0])).toBe("used");
    expect(parcelOf(g.boxIds[0])).toMatchObject({ state: "received", barcode, qr: out.qr });
    expect(psql(`select count(*) from public.office_label_pending where parcel_id = '${parcelOf(g.boxIds[0]).id}'`)).toBe("1");
  });

  it("INV-C5 (S1b): 소문자로 넣어도 대문자로 받아 입고된다", async () => {
    const g = await paidGift();
    const r = await scanInbound(await staff(), waybill(), { code: ` ${codeOf({ boxId: g.boxIds[0] })!.toLowerCase()} ` });
    expect((r.data as ScanOut).result).toBe("received");
  });

  it("INV-C5 (S5b): 확인 문자가 틀리면 그 자리에서 거부(P0046) — 상태 그대로, 보류 줄도 없다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    const r = await scanInbound(await staff(), barcode, { code: typo(codeOf({ boxId: g.boxIds[0] })!), ...HOLD_DETAILS });
    expect(r.error?.code).toBe("P0046");
    expect(codeState(g.boxIds[0])).toBe("valid");
    expect(parcelOf(g.boxIds[0]).state).toBe("awaiting");
    expect(holdRow(barcode)).toBeNull();
  });

  it("INV-C1 · INV-C5 (S1b): 20자 밖 글자(G·6·Q·0)가 있으면 확인 문자를 보기 전에 꼴 오류(22023)", async () => {
    const op = await staff();
    for (const bad of ["K7M3QG", "K7M36A", "QAAAAA", "K7M30A"]) {
      const r = await scanInbound(op, waybill(), { code: bad, ...HOLD_DETAILS });
      expect(r.error?.code).toBe("22023");
    }
  });

  it("INV-C5 (S5b): 6자리 없음·발급되지 않은 값 → 보류. 대조용 값이 없으면 아무것도 바꾸지 않고 다시 묻는다", async () => {
    const op = await staff();
    const noCode = waybill();
    const asked = await scanInbound(op, noCode, { code: null });
    expect(asked.data).toMatchObject({ result: "need_details", reason: "no_code" });
    expect(holdRow(noCode)).toBeNull();
    expect((await scanInbound(op, noCode, { code: null, ...HOLD_DETAILS })).data).toMatchObject({ result: "hold", reason: "no_code" });
    expect(holdRow(noCode)?.reason).toBe("no_code");
    // 같은 바코드를 또 찍으면 이미 기록됨
    expect((await scanInbound(op, noCode, { code: null, ...HOLD_DETAILS })).data).toMatchObject({ result: "hold_recorded" });

    const unknown = waybill();
    expect((await scanInbound(op, unknown, { code: unissuedCode(), ...HOLD_DETAILS })).data).toMatchObject({ result: "hold", reason: "unknown_code" });
  });

  it("INV-C5 (S5b): 이미 다른 상자에 묶인 바코드 + 다른 상자의 6자리 → 보류, 그 6자리는 유효 그대로", async () => {
    const a = await paidGift();
    const b = await paidGift();
    const barcode = waybill();
    await receiveWithCode(await staff(), a.boxIds[0], barcode);
    const r = await scanInbound(await signedInClient("fankkuk_admin"), barcode, { code: codeOf({ boxId: b.boxIds[0] }), ...HOLD_DETAILS });
    expect(r.data).toMatchObject({ result: "hold", reason: "barcode_bound" });
    expect(codeState(b.boxIds[0])).toBe("valid");
    expect(parcelOf(b.boxIds[0]).state).toBe("awaiting");
  });

  it("INV-C5 (S5c): 출고 전 상자의 6자리로 둘째 상자 → 두 상자 모두 같은 6자리 분쟁 보류, 첫 상자는 출고 목록에서 빠진다", async () => {
    const g = await paidGift();
    const op = await staff();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const qr = await receiveWithCode(op, g.boxIds[0]);
    const second = waybill();
    const r = await scanInbound(op, second, { code, ...HOLD_DETAILS });
    expect(r.data).toMatchObject({ result: "hold", reason: "code_dispute" });
    expect(holdRow(second)?.reason).toBe("code_dispute");
    expect(parcelOf(g.boxIds[0]).hold).toBe("code_dispute");

    // 검수·승인을 다 해도 출고 차례가 오지 않고 송장 출력이 거부된다
    await inspect(op, qr, FAN_PASS);
    await approve(g);
    const list = (await op.rpc("admin_office_parcels")).data as { qr: string | null; next_step: string }[];
    expect(list.find((x) => x.qr === qr)?.next_step).toBe("on_hold");
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("P0041");
  });

  it("INV-C5 (S5d): 같은 6자리의 첫 상자가 출고 확정이면 둘째만 보류 + 도용 의심, 첫 상자는 그대로", async () => {
    const g = await paidGift();
    const op = await staff();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const qr = await receiveWithCode(op, g.boxIds[0]);
    await shipAll(op, g, qr);
    const second = waybill();
    const r = await scanInbound(op, second, { code, ...HOLD_DETAILS });
    expect(r.data).toMatchObject({ result: "hold", reason: "used_code" });
    expect(holdRow(second)).toMatchObject({ reason: "used_code", theft: "true" });
    expect(parcelOf(g.boxIds[0])).toMatchObject({ state: "shipped", hold: "" });
  });

  it("INV-C5 (S5e, 동시): 같은 6자리를 쓴 상자 둘을 두 직원이 동시에 입고 → 둘 다 분쟁 보류, 어느 쪽도 그 주문으로 입고 완료되지 않는다", async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const [s1, s2] = [await staff(), await signedInClient("fankkuk_admin")];
    const [b1, b2] = [waybill(), waybill()];
    // 6자리 줄을 다른 연결이 쥐고 있는 동안 두 입고를 보내 확실히 겹치게 한다
    const lock = await holdRowLock(`select 1 from public.inbound_codes where code = '${code}' for update`, 1.5);
    const [r1, r2] = await Promise.all([
      scanInbound(s1, b1, { code, ...HOLD_DETAILS }),
      scanInbound(s2, b2, { code, ...HOLD_DETAILS }),
    ]);
    await lock.released;
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    // 응답은 한쪽이 received 여도 된다(먼저 잠금을 얻은 쪽) — 같은 6자리로 순서대로 온 S5c 와 최종 상태가 같으면 된다
    const results = [(r1.data as ScanOut).result, (r2.data as ScanOut).result].sort();
    expect(results).toEqual(["hold", "received"]);
    // 최종 상태: 두 상자 모두 보류(출고 불가)
    const p = parcelOf(g.boxIds[0]);
    expect(p.hold).toBe("code_dispute");
    expect(psql(`select public.office_parcel_shippable(p) from public.office_parcels p where p.id = '${p.id}'`)).toBe("f");
    const heldBarcode = p.barcode === b1 ? b2 : b1;
    expect(holdRow(heldBarcode)).toMatchObject({ reason: "code_dispute", matched: "false", expired: "false" });
    expect(psql(`select count(*) from public.office_parcels where inbound_waybill_no = '${heldBarcode}'`)).toBe("0");
    expect(psql(`select count(*) from public.inbound_codes where code = '${code}'`)).toBe("1");
    expect(codeState(g.boxIds[0])).toBe("used");
  });
});

// 잠금 순서: 입고는 6자리 줄을 잠그기 전에 그 상자의 주문(역조공이면 몫) 줄을 먼저 잠근다 — 거절·7일 반려·무효 트리거가
// 주문 줄 → 6자리 줄 순서로 잠그므로 반대 순서면 서로를 기다리다 교착(40P01)이 난다.
// 주문 줄을 다른 연결이 쥐고 있는 동안 두 처리를 보내 확실히 겹치게 한다. FK_REPEAT 로 반복 횟수를 늘릴 수 있다(기본 1번).
const REPEAT = { repeats: Number(process.env.FK_REPEAT ?? 0) };

describe("INV-C3 · INV-C5 잠금 순서 — 입고와 거절·7일 반려가 같은 주문에 동시에 와도 교착 없이 한쪽씩", () => {
  /** 입고와 무효 처리가 어느 순서로 끝났든 결과가 그 순서 하나와 같아야 한다 */
  function expectOneOrder(boxId: string, out: ScanOut): void {
    if (out.result === "received") {
      // 입고가 먼저: 6자리는 사용됨으로 남고(무효는 유효한 것만 바꾼다), 상자는 입고된 채 주문이 끝난다
      expect(codeState(boxId)).toBe("used");
      expect(parcelOf(boxId).state).toBe("received");
    } else {
      // 무효가 먼저: 입고는 무효가 된 6자리를 보고 보류로 넣는다 — 그 주문으로 입고되지 않는다
      expect(out).toMatchObject({ result: "hold", reason: "void_code" });
      expect(codeState(boxId)).toBe("void");
      expect(parcelOf(boxId).state).toBe("awaiting");
    }
  }

  it("INV-C3 · INV-C5 (동시): 입고와 크리에이터 거절이 같은 주문에 동시에 와도 둘 다 오류 없이 끝나고, 결과는 어느 한 순서와 같다", REPEAT, async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const [op, haru] = [await staff(), await signedInClient("haru_creator")];
    const lock = await holdRowLock(`select 1 from public.orders where id = '${g.orderId}' for update`, 1.5);
    const [scan, declined] = await Promise.all([
      scanInbound(op, waybill(), { code, ...HOLD_DETAILS }),
      haru.rpc("decline_gift", { p_request_id: g.requestId, p_block: false }),
    ]);
    await lock.released;
    expect(scan.error).toBeNull();
    expect(declined.error).toBeNull();
    expect((declined.data as { result: string }).result).toBe("declined");
    expect(orderStatus(g.orderId)).toBe("rejected");
    expectOneOrder(g.boxIds[0], scan.data as ScanOut);
  });

  it("INV-C3 · INV-C5 (동시): 입고와 7일 자동 반려가 같은 주문에 동시에 와도 둘 다 오류 없이 끝나고, 결과는 어느 한 순서와 같다", REPEAT, async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    const [op, owner] = [await staff(), await signedInClient("fankkuk_admin")];
    const lock = await holdRowLock(`select 1 from public.orders where id = '${g.orderId}' for update`, 1.5);
    const [scan, expired] = await Promise.all([
      scanInbound(op, waybill(), { code, ...HOLD_DETAILS }),
      owner.rpc("office_run_expiry", { p_order_no: g.orderNo }),
    ]);
    await lock.released;
    expect(scan.error).toBeNull();
    expect(expired.error).toBeNull();
    expect(orderStatus(g.orderId)).toBe("expired");
    expectOneOrder(g.boxIds[0], scan.data as ScanOut);
  });
});

describe("INV-C4 매칭은 유효한 6자리 또는 주인의 송장번호·택배사·이름 앞 1글자 일치로만", () => {
  it("INV-C4 (S4): 6자리 없이 온 별빛 상자를 별빛이 송장번호·택배사·이름 앞 1글자로 찾으면 별빛 상자로 입고된다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdWithoutCode(barcode);
    const r = await find("byeolbit_fan", { boxId: g.boxIds[0] }, barcode);
    expect(r.error).toBeNull();
    expect(r.data).toBe("matched");
    expect(parcelOf(g.boxIds[0])).toMatchObject({ state: "received", barcode });
    expect(holdRow(barcode)?.matched).toBe("true");
    expect(codeState(g.boxIds[0])).toBe("used");
    // 찾기로 이어진 상자는 바코드를 다시 찍으면 라벨이 나온다
    expect((await scanInbound(await staff(), barcode, { code: null })).data).toMatchObject({ result: "reprinted" });
  });

  it("INV-C4 (S4): 셋 중 하나라도 다르면 이어지지 않는다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdWithoutCode(barcode);
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, barcode, "hanjin", "별")).data).toBe("not_found");
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, barcode, "cj", "달")).data).toBe("not_found");
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, waybill(), "cj", "별")).data).toBe("not_found");
    expect(parcelOf(g.boxIds[0]).state).toBe("awaiting");
    expect(holdRow(barcode)?.matched).toBe("false");
  });

  it("INV-C4 (S4): 결제 완료 주문이 없는 사람(남의 상자를 고름)은 이어지지 않는다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdWithoutCode(barcode);
    expect((await find("daltokki_fan", { boxId: g.boxIds[0] }, barcode)).data).toBe("not_found");
    expect(holdRow(barcode)?.matched).toBe("false");
  });

  it("INV-C4 (S4b) · INV-C7: 달토끼가 별빛 송장번호를 미리 등록해도 별빛 6자리를 단 상자는 달토끼 쪽으로 가지 않고 분쟁 보류, 달토끼는 찾지 못한다", async () => {
    const byeol = await paidGift();
    const dal = await registerTestOrder(1, { senderId: SEED.otherFanId });
    const { payTestOrder } = await import("./helpers");
    await payTestOrder(dal);
    const dalBox = psql(`select id from public.boxes where order_id = '${dal.orderId}'`);
    const barcode = waybill();
    await fanSetsWaybill(dalBox, barcode, "daltokki_fan");
    const r = await scanInbound(await staff(), barcode, { code: codeOf({ boxId: byeol.boxIds[0] }), ...HOLD_DETAILS });
    expect(r.data).toMatchObject({ result: "hold", reason: "waybill_dispute" });
    expect(parcelOf(byeol.boxIds[0]).state).toBe("awaiting");
    expect(parcelOf(dalBox).state).toBe("awaiting");
    expect(codeState(byeol.boxIds[0])).toBe("valid");
    // 남의 6자리가 붙은 보류 상자는 셋이 다 맞아도 그 6자리 주인만 찾는다
    expect((await find("daltokki_fan", { boxId: dalBox }, barcode)).data).toBe("not_found");
    expect((await find("byeolbit_fan", { boxId: byeol.boxIds[0] }, barcode)).data).toBe("matched");
    expect(parcelOf(byeol.boxIds[0]).state).toBe("received");
  });

  it("INV-C4 · INV-C5: 같은 6자리 분쟁 — 주인이 둘째 상자의 송장번호로 찾으면 둘째가 주인의 상자가 되고 먼저 온 상자는 떼어 내 도용 의심으로 남는다", async () => {
    const g = await paidGift();
    const op = await staff();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const firstQr = await receiveWithCode(op, g.boxIds[0]);
    const real = waybill();
    await scanInbound(op, real, { code, ...HOLD_DETAILS });
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, real)).data).toBe("matched");
    expect(parcelOf(g.boxIds[0])).toMatchObject({ state: "received", barcode: real, hold: "" });
    expect(psql(`select coalesce(box_id::text, 'none') || '|' || hold_reason from public.office_parcels where qr_code = '${firstQr}'`)).toBe("none|detached");
  });

  it("INV-C4 · INV-C5: 같은 6자리 분쟁 — 주인의 송장번호가 먼저 온 상자의 바코드와 같으면 그 상자의 멈춤이 풀린다", async () => {
    const g = await paidGift();
    const op = await staff();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const first = waybill();
    await receiveWithCode(op, g.boxIds[0], first);
    await scanInbound(op, waybill(), { code, ...HOLD_DETAILS });
    expect(parcelOf(g.boxIds[0]).hold).toBe("code_dispute");
    expect((await find("daltokki_fan", { boxId: g.boxIds[0] }, first)).data).toBe("not_found");
    expect(parcelOf(g.boxIds[0]).hold).toBe("code_dispute");
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, first)).data).toBe("matched");
    expect(parcelOf(g.boxIds[0]).hold).toBe("");
  });

  it("INV-C4: 입고·찾기 함수의 인자에 주문번호가 없다", () => {
    expect(psql(`select pg_get_function_identity_arguments('public.office_scan_inbound'::regproc)`)).not.toMatch(/order/);
    expect(psql(`select pg_get_function_identity_arguments('public.find_held_parcel'::regproc)`)).not.toMatch(/order/);
  });
});

describe("INV-C6 무효 6자리로 온 보류 상자는 7일 뒤 반송", () => {
  it("INV-C6 (S6): 도착 + 167시간이면 그대로, + 168시간 자동 처리에서 반송 대기(기한 지남)", async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    await (await signedInClient("haru_creator")).rpc("decline_gift", { p_request_id: g.requestId, p_block: false });
    const barcode = waybill();
    await scanInbound(await staff(), barcode, { code, ...HOLD_DETAILS });
    const op = await staff();
    psql(`update public.office_unmatched set arrived_at = now() - interval '167 hours' where waybill_no = '${barcode}'`);
    await op.rpc("office_run_expiry");
    expect(holdRow(barcode)?.expired).toBe("false");
    psql(`update public.office_unmatched set arrived_at = now() - interval '168 hours 1 minute' where waybill_no = '${barcode}'`);
    expect((await op.rpc("office_run_expiry")).error).toBeNull();
    expect(holdRow(barcode)?.expired).toBe("true");
    const list = (await op.rpc("admin_unmatched_parcels")).data as { waybill_no: string; state: string }[];
    expect(list.find((x) => x.waybill_no === barcode)?.state).toBe("expired");
  });
});

describe("INV-C7 송장번호 등록은 선택 — 같은 번호는 분쟁 표시, 응답은 같다", () => {
  it("INV-C7 (S7): 별빛이 등록한 번호를 달토끼가 또 등록해도 「등록됐어요」(오류 없음), 두 상자 모두 분쟁 표시, 그 번호로 온 상자는 보류", async () => {
    const byeol = await paidGift();
    const dal = await registerTestOrder(1, { senderId: SEED.otherFanId });
    const { payTestOrder } = await import("./helpers");
    await payTestOrder(dal);
    const dalBox = psql(`select id from public.boxes where order_id = '${dal.orderId}'`);
    const no = waybill();
    await fanSetsWaybill(byeol.boxIds[0], no);
    const second = await (await signedInClient("daltokki_fan")).rpc("set_box_waybill", { p_box_id: dalBox, p_waybill: no });
    expect(second.error).toBeNull();
    expect(second.data).toBe("saved"); // 처음 등록과 같은 응답
    expect(psql(`select string_agg(tracking_dispute::text, ',') from public.office_parcels where tracking_no = '${no}'`)).toBe("true,true");
    const r = await scanInbound(await staff(), no, { code: codeOf({ boxId: byeol.boxIds[0] }), ...HOLD_DETAILS });
    expect(r.data).toMatchObject({ result: "hold", reason: "waybill_dispute" });
    expect(parcelOf(byeol.boxIds[0]).state).toBe("awaiting");
  });

  it("INV-C7: 분쟁이 없는 자기 번호면 송장번호를 등록해 둔 상자도 6자리로 정상 입고된다", async () => {
    const g = await paidGift();
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0], no);
    expect((await scanInbound(await staff(), no)).data).toMatchObject({ result: "received" });
  });

  it("INV-C7: 이미 입고된 상자의 바코드를 다른 사람이 송장번호로 등록하면 그 상자가 출고 전이면 보류된다", async () => {
    const byeol = await paidGift();
    const barcode = waybill();
    await receiveWithCode(await staff(), byeol.boxIds[0], barcode);
    const dal = await registerTestOrder(1, { senderId: SEED.otherFanId });
    const { payTestOrder } = await import("./helpers");
    await payTestOrder(dal);
    const dalBox = psql(`select id from public.boxes where order_id = '${dal.orderId}'`);
    await fanSetsWaybill(dalBox, barcode, "daltokki_fan");
    expect(parcelOf(byeol.boxIds[0]).hold).toBe("waybill_dispute");
  });

  it("INV-C7: 분쟁이 정리된 뒤 같은 번호를 그 상자에 다시 넣어도 상대 상자를 다시 보류하지 않는다", async () => {
    const byeol = await paidGift();
    const barcode = waybill();
    await receiveWithCode(await staff(), byeol.boxIds[0], barcode);
    const dal = await registerTestOrder(1, { senderId: SEED.otherFanId });
    const { payTestOrder } = await import("./helpers");
    await payTestOrder(dal);
    const dalBox = psql(`select id from public.boxes where order_id = '${dal.orderId}'`);
    await fanSetsWaybill(dalBox, barcode, "daltokki_fan");
    expect(parcelOf(byeol.boxIds[0]).hold).toBe("waybill_dispute");
    // 주인(별빛)이 자기 송장번호로 확인해 멈춤이 풀린다
    expect((await find("byeolbit_fan", { boxId: byeol.boxIds[0] }, barcode)).data).toBe("matched");
    expect(parcelOf(byeol.boxIds[0]).hold).toBe("");
    // 달토끼가 같은 번호를 또 넣어도 응답은 같고, 별빛 상자는 다시 멈추지 않는다
    const again = await (await signedInClient("daltokki_fan")).rpc("set_box_waybill", { p_box_id: dalBox, p_waybill: barcode });
    expect(again.error).toBeNull();
    expect(again.data).toBe("saved");
    expect(parcelOf(byeol.boxIds[0]).hold).toBe("");
  });

  it("INV-C7 (동시): 같은 번호의 송장번호 등록과 입고가 동시에 와도 교착 없이 한쪽씩 — 번호 잠금을 처리 시작에서 먼저 건다", REPEAT, async () => {
    const g = await paidGift();
    const no = waybill();
    sentWithAddress(no, { boxId: g.boxIds[0] });
    clearWaybillAttempts();
    const [fan, op] = [await signedInClient("byeolbit_fan"), await staff()];
    const lock = await holdRowLock(`select 1 from public.boxes where id = '${g.boxIds[0]}' for update`, 1.5);
    const [set, scan] = await Promise.all([fan.rpc("set_box_waybill", { p_box_id: g.boxIds[0], p_waybill: no }), scanInbound(op, no)]);
    await lock.released;
    expect(set.error).toBeNull();
    expect(scan.error).toBeNull();
    expect(["saved", "already_received"]).toContain(set.data);
    expect((scan.data as ScanOut).result).toBe("received");
    expect(parcelOf(g.boxIds[0])).toMatchObject({ state: "received", barcode: no, hold: "" });
  });
});

describe("INV-C10 송장번호 등록도 계정마다 하루 10번 (리뷰 반영 — 남의 번호를 바꿔 넣어 상자를 멈추는 길을 좁힌다)", () => {
  function attempts(profileId: string): string {
    return psql(`select count(*) from public.office_waybill_attempts where profile_id = '${profileId}' and at > now() - interval '24 hours'`);
  }

  it("INV-C10 (실패경로): 11번째 등록은 거부(P0045)되고 번호가 바뀌지 않는다 — 성공·「없는 상자」 모두 센다, 다른 계정은 따로 센다", async () => {
    clearWaybillAttempts();
    const g = await paidGift();
    const fan = await signedInClient("byeolbit_fan");
    for (let i = 0; i < 9; i++) expect((await fan.rpc("set_box_waybill", { p_box_id: g.boxIds[0], p_waybill: waybill() })).data).toBe("saved");
    // 없는 상자(남의 상자와 같은 답)도 한 번으로 센다
    expect((await fan.rpc("set_box_waybill", { p_box_id: crypto.randomUUID(), p_waybill: waybill() })).data).toBe("not_found");
    expect(attempts(SEED.fanId)).toBe("10");
    const kept = psql(`select tracking_no from public.office_parcels where box_id = '${g.boxIds[0]}'`);
    const eleventh = await fan.rpc("set_box_waybill", { p_box_id: g.boxIds[0], p_waybill: waybill() });
    expect(eleventh.error?.code).toBe("P0045");
    expect(psql(`select tracking_no from public.office_parcels where box_id = '${g.boxIds[0]}'`)).toBe(kept);
    expect(attempts(SEED.fanId)).toBe("10");
    // 다른 계정(달토끼)은 따로 센다
    const dal = await registerTestOrder(1, { senderId: SEED.otherFanId });
    const { payTestOrder } = await import("./helpers");
    await payTestOrder(dal);
    const dalBox = psql(`select id from public.boxes where order_id = '${dal.orderId}'`);
    expect((await (await signedInClient("daltokki_fan")).rpc("set_box_waybill", { p_box_id: dalBox, p_waybill: waybill() })).data).toBe("saved");
    expect(attempts(SEED.otherFanId)).toBe("1");
  });

  it("INV-C10: 24시간이 지난 등록 시도는 세지 않는다 — 역조공 몫(크리에이터)도 같은 한도", async () => {
    clearWaybillAttempts();
    psql(`insert into public.office_waybill_attempts (profile_id, at) select '${SEED.creatorProfileId}', now() - interval '24 hours 1 minute' from generate_series(1, 10)`);
    const s = await paidShare();
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("set_share_waybill", { p_share_id: s.shareId, p_waybill: waybill() })).data).toBe("saved");
    psql(`insert into public.office_waybill_attempts (profile_id) select '${SEED.creatorProfileId}' from generate_series(1, 9)`);
    expect((await haru.rpc("set_share_waybill", { p_share_id: s.shareId, p_waybill: waybill() })).error?.code).toBe("P0045");
  });
});

describe("INV-C8 상자 도착 알림 · 「제가 보낸 게 아니에요」", () => {
  it("INV-C8 (S8) · INV-N14 (S14): 상자 둘 주문의 상자가 하나씩 입고될 때마다 주인(별빛)에게 상자 도착 줄 정확히 하나씩, 크리에이터에게는 0", async () => {
    const g = await paidGift(2);
    const op = await staff();
    // 상자마다 메일 줄 정확히 한 줄(같은 상자에 두 줄 생기면 실패하도록 count(*) 로 센다)
    const rows = (account: string, boxId?: string) =>
      psql(
        `select count(*) from public.notification_outbox n where n.kind = 'box_arrived' and n.channel = 'email' and n.order_id = '${g.orderId}' and n.account_id = '${account}'` +
          (boxId ? ` and n.parcel_id = (select id from public.office_parcels where box_id = '${boxId}')` : ""),
      );
    await receiveWithCode(op, g.boxIds[0]);
    expect(rows(SEED.fanId, g.boxIds[0])).toBe("1");
    expect(rows(SEED.fanId)).toBe("1");
    await receiveWithCode(op, g.boxIds[1]);
    expect(rows(SEED.fanId, g.boxIds[1])).toBe("1");
    expect(rows(SEED.fanId)).toBe("2");
    expect(rows(SEED.creatorProfileId)).toBe("0");
  });

  it("INV-C8 · INV-N14: 찾기로 이어진 상자를 다시 스캔해 라벨을 다시 내도(reprinted) 상자 도착 줄은 한 줄 그대로", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdWithoutCode(barcode);
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, barcode)).data).toBe("matched");
    const rows = () =>
      psql(`select count(*) from public.notification_outbox n where n.kind = 'box_arrived' and n.channel = 'email' and n.parcel_id = (select id from public.office_parcels where box_id = '${g.boxIds[0]}')`);
    expect(rows()).toBe("1");
    expect((await scanInbound(await staff(), barcode, { code: null })).data).toMatchObject({ result: "reprinted" });
    expect(rows()).toBe("1");
  });

  it("INV-N14: 역조공 상자 도착은 보낸 크리에이터(하루)에게", async () => {
    const s = await paidShare();
    const barcode = waybill();
    sentWithAddress(barcode, { shareId: s.shareId });
    const r = await scanInbound(await staff(), barcode);
    expect((r.data as ScanOut).result).toBe("received");
    const parcel = psql(`select id from public.office_parcels where share_id = '${s.shareId}'`);
    expect(psql(`select string_agg(distinct account_id::text, ',') from public.notification_outbox where kind = 'box_arrived' and parcel_id = '${parcel}'`)).toBe(SEED.creatorProfileId);
  });

  it("INV-C8 (S8): 주인이 「제가 보낸 게 아니에요」를 누르면 보류, 출고 목록에서 빠지고 운영자 목록에 도용 의심, 기록은 지울 수 없다", async () => {
    const g = await paidGift();
    const op = await staff();
    const qr = await receiveWithCode(op, g.boxIds[0]);
    await inspect(op, qr, FAN_PASS);
    await approve(g);
    const fan = await signedInClient("byeolbit_fan");
    const r = await fan.rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null });
    expect(r.error).toBeNull();
    expect(parcelOf(g.boxIds[0]).hold).toBe("not_mine");
    const list = (await op.rpc("admin_office_parcels")).data as { qr: string | null; next_step: string }[];
    expect(list.find((x) => x.qr === qr)?.next_step).toBe("on_hold");
    expect((await (await signedInClient("fankkuk_admin")).rpc("office_print_label", { p_qr: qr, p_waybill: waybill() })).error?.code).toBe("P0041");
    const held = (await op.rpc("admin_unmatched_parcels")).data as { qr: string | null; reason: string; suspected_theft: boolean }[];
    expect(held.find((x) => x.qr === qr)).toMatchObject({ reason: "not_mine", suspected_theft: true });
    const parcel = parcelOf(g.boxIds[0]).id;
    expect(psqlError(`delete from public.office_not_mine_reports where parcel_id = '${parcel}'`)).not.toBeNull();
    expect(psqlError(`update public.office_not_mine_reports set at = now() where parcel_id = '${parcel}'`)).not.toBeNull();
  });

  it("INV-C8 (S8): 송장 출력 뒤 누르면 출고 확정이 거부된다", async () => {
    const g = await paidGift();
    const op = await staff();
    const qr = await receiveWithCode(op, g.boxIds[0]);
    await inspect(op, qr, FAN_PASS);
    await approve(g);
    const out = waybill();
    expect((await (await signedInClient("fankkuk_admin")).rpc("office_print_label", { p_qr: qr, p_waybill: out })).error).toBeNull();
    await (await signedInClient("byeolbit_fan")).rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null });
    expect((await op.rpc("office_confirm_shipment", { p_qr: qr, p_waybill: out })).error?.code).toBe("P0041");
    expect(parcelOf(g.boxIds[0]).state).toBe("label_printed");
  });

  it("INV-C8 (S8, 실패경로): 다른 계정이 누르면 「없다」, 입고 전이면 「없다」, 출고 확정 뒤면 거부", async () => {
    const g = await paidGift();
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null })).error?.code).toBe("P0002");
    const op = await staff();
    const qr = await receiveWithCode(op, g.boxIds[0]);
    expect((await (await signedInClient("daltokki_fan")).rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null })).error?.code).toBe("P0002");
    expect(parcelOf(g.boxIds[0]).hold).toBe("");
    await shipAll(op, g, qr);
    expect((await fan.rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null })).error?.code).toBe("55000");
    expect(parcelOf(g.boxIds[0]).hold).toBe("");
  });

  it("INV-C8: 「제가 보낸 게 아니에요」를 누른 분쟁 상자는 주인의 찾기로도 멈춤이 풀리지 않는다", async () => {
    const g = await paidGift();
    const op = await staff();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const first = waybill();
    await receiveWithCode(op, g.boxIds[0], first);
    await scanInbound(op, waybill(), { code, ...HOLD_DETAILS });
    await (await signedInClient("byeolbit_fan")).rpc("report_not_mine", { p_box_id: g.boxIds[0], p_share_id: null });
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, first)).data).toBe("not_found");
    expect(parcelOf(g.boxIds[0]).hold).toBe("code_dispute");
  });
});

describe("INV-C9 운영자 확인 목록 — 보이는 값과 손으로 잇는 길 없음", () => {
  it("INV-C9 (S9): 보류 목록에는 도착 시각·바코드·택배사·보류 사유·발신인 앞 한 글자만 — 실명·주소·전화·주문번호·6자리 없음", async () => {
    const g = await paidGift();
    const code = codeOf({ boxId: g.boxIds[0] })!;
    const op = await staff();
    await receiveWithCode(op, g.boxIds[0]);
    const barcode = waybill();
    await scanInbound(op, barcode, { code, ...HOLD_DETAILS });
    const r = await op.rpc("admin_unmatched_parcels");
    expect(r.error).toBeNull();
    const rows = r.data as Record<string, unknown>[];
    const row = rows.find((x) => x.waybill_no === barcode)!;
    expect(Object.keys(row).sort()).toEqual(
      ["arrived_at", "carrier", "deadline_at", "id", "qr", "reason", "sender_initial", "shelf", "source", "state", "suspected_theft", "waybill_no"].sort(),
    );
    expect(row).toMatchObject({ carrier: "cj", sender_initial: "별", reason: "code_dispute" });
    // 바코드·id·QR 은 무작위 숫자라 그 안에 「010…」 같은 전화번호 꼴이 우연히 생길 수 있다 — 그 칸을 뺀 나머지에서 찾는다
    const text = JSON.stringify(rows.map(({ waybill_no: _w, id: _i, qr: _q, ...rest }) => rest));
    expect(text).toContain("code_dispute");
    expect(text).not.toContain(code);
    expect(text).not.toContain(g.orderNo);
    expect(text).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(text).not.toMatch(/(서울|경기|부산)[^"]*(로|길)\s?\d/);
  });

  it("INV-C9: 운영자가 주문번호로 상자를 잇는 함수는 없다 — 옛 매칭 함수도 없다", () => {
    expect(psql(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('match_unmatched', 'office_record_unmatched')`)).toBe("0");
    const withOrderArg = psql(
      `select count(*) from pg_proc where pronamespace = 'public'::regnamespace and (proname like '%unmatched%' or proname like '%held%' or proname like '%hold%') and pg_get_function_identity_arguments(oid) like '%order%'`,
    );
    expect(withOrderArg).toBe("0");
  });

  it("INV-C9 · INV-C10: 팬·크리에이터·로그인 안 함은 보류 목록을 0줄로 받는다", async () => {
    await holdWithoutCode(waybill());
    for (const login of ["byeolbit_fan", "haru_creator"]) {
      const r = await (await signedInClient(login)).rpc("admin_unmatched_parcels");
      expect(r.data ?? []).toHaveLength(0);
    }
    expect((await anonClient().rpc("admin_unmatched_parcels")).data ?? []).toHaveLength(0);
  });
});

describe("INV-C10 찾기는 하루 5번 — 실패가 반복되면 운영자 확인", () => {
  it("INV-C10 (S10): 하루에 6번째 찾기는 거부(P0045), 성공도 횟수에 든다", async () => {
    const g = await paidGift();
    const barcode = waybill();
    await holdWithoutCode(barcode);
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, barcode)).data).toBe("matched");
    for (let i = 0; i < 4; i++) expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, waybill())).data).toBe("not_found");
    const sixth = await find("byeolbit_fan", { boxId: g.boxIds[0] }, waybill());
    expect(sixth.error?.code).toBe("P0045");
    expect(psql(`select count(*) from public.office_match_attempts where profile_id = '${SEED.fanId}'`)).toBe("5");
  });

  it("INV-C10 (S10): 다른 계정의 시도는 섞이지 않고, 24시간이 지난 시도는 세지 않는다", async () => {
    const g = await paidGift();
    // 달토끼가 5번 시도해 자기 한도를 다 써도 별빛의 찾기는 막히지 않는다
    for (let i = 0; i < 5; i++) expect((await find("daltokki_fan", { boxId: g.boxIds[0] }, waybill())).data).toBe("not_found");
    expect((await find("daltokki_fan", { boxId: g.boxIds[0] }, waybill())).error?.code).toBe("P0045");
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, waybill())).data).toBe("not_found");
    // 별빛의 24시간 지난 시도 5줄은 세지 않는다 — 오늘 시도 1번 + 4번 더 가능, 그다음 거부
    psql(`insert into public.office_match_attempts (profile_id, matched, at) select '${SEED.fanId}', false, now() - interval '24 hours 1 minute' from generate_series(1, 5)`);
    for (let i = 0; i < 4; i++) expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, waybill())).data).toBe("not_found");
    expect((await find("byeolbit_fan", { boxId: g.boxIds[0] }, waybill())).error?.code).toBe("P0045");
    // 운영자 확인 표시의 실패 횟수도 24시간 안의 것만
    const flags = (await (await staff()).rpc("admin_find_flags")).data as { nickname: string; failures_24h: number }[];
    expect(flags.find((x) => x.nickname === "별빛")?.failures_24h).toBe(5);
  });

  it("INV-C10 (S10): 실패가 3번 쌓이면 운영자 확인 대상 목록에 닉네임으로 뜬다, 운영자 밖에는 0줄", async () => {
    const g = await paidGift();
    for (let i = 0; i < 2; i++) await find("byeolbit_fan", { boxId: g.boxIds[0] }, waybill());
    const op = await staff();
    expect(((await op.rpc("admin_find_flags")).data as { nickname: string }[]).some((x) => x.nickname === "별빛")).toBe(false);
    await find("byeolbit_fan", { boxId: g.boxIds[0] }, waybill());
    const flags = (await op.rpc("admin_find_flags")).data as { nickname: string; failures_24h: number }[];
    expect(flags.find((x) => x.nickname === "별빛")?.failures_24h).toBe(3);
    expect((await (await signedInClient("byeolbit_fan")).rpc("admin_find_flags")).data ?? []).toHaveLength(0);
  });
});

describe("앱 서버 키도 6자리를 고르거나 바꿀 수 없다", () => {
  it("INV-C1: 발급 함수는 앱·화면 키로 부를 수 없다", async () => {
    const r = await adminClient().rpc("inbound_issue_code", { p_box_id: null, p_share_id: null, p_candidates: null });
    expect(r.error).not.toBeNull();
  });
});
