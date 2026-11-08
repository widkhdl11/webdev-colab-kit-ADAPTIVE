import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, payTestOrder, psql, registerTestOrder, SEED, signedInClient } from "./helpers";
import {
  codeOf,
  deleteTestUnmatched,
  dropAddressCopies,
  FAN_PASS,
  fanSetsWaybill,
  inspect,
  orderReturnCopies,
  paidGift,
  paidShare,
  putOrderReturnCopy,
  receiveAndLabel,
  scanInbound,
  waybill,
} from "./office-helpers";
import { clearFanAddresses, deleteTestRevgifts, sampleEnvelope } from "./revgift-helpers";

// 팬 선물의 반송 주소 사본 — 결제 화면에서 받아 주문에 두고(payment INV-M25), 반송 주소 확인이 상자로 복사하고(office-workflow INV-W15),
// 주문이 끝나면 예약 작업이 지운다(INV-M25 ④). 상자 복사본의 열기·지우기는 address-protection INV-P18.
// supabase/manual/0032_fan_address_removal.sql 이 표·저장 함수·세 인자 확인을 만든다 — 적용 전에는 이 파일 전체가 빨간불이 맞다.
// 시드: 별빛(byeolbit_fan) = 보낸 팬, 달토끼(daltokki_fan) = 다른 팬, 하루(haru_creator) = 받는 크리에이터·역조공을 보내는 크리에이터.

const BYEOLBIT = SEED.fanId;
const DALTOKKI = SEED.otherFanId;
const RETURN_FAIL = { ...FAN_PASS, outcome: "return" } as const;

afterEach(() => {
  clearFanAddresses([BYEOLBIT, DALTOKKI]);
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

const staff = (): Promise<SupabaseClient> => signedInClient("fankkuk_staff");
const save = async (orderNo: string, envelope: unknown = sampleEnvelope(), region: unknown = "none", client?: SupabaseClient) =>
  (client ?? (await signedInClient("byeolbit_fan"))).rpc("save_my_order_return_address", { p_order_no: orderNo, p_envelope: envelope, p_region: region });
const copyOfOrder = (orderId: string) =>
  psql(`select coalesce((select envelope::text || '|' || surcharge_region || '|' || account_id from pii.order_return_addresses where order_id = '${orderId}'), '')`);
const orderEvents = (orderId: string) =>
  psql(`select coalesce(string_agg(event || coalesce(':' || reason, ''), ',' order by at, id), '') from pii.order_return_address_events where order_id = '${orderId}'`);
const confirm = async (orderNo: string, seq: number | null, login = "byeolbit_fan", envelope: unknown = null) =>
  (await signedInClient(login)).rpc("confirm_return_address", { p_order_no: orderNo, p_box_seq: seq, p_envelope: envelope });
const boxCopyOf = (qr: string) =>
  psql(`select coalesce((select a.envelope::text from pii.return_addresses a join public.office_parcels p on p.id = a.parcel_id where p.qr_code = '${qr}'), 'none')`);
const replica = (sql: string) => psql(`begin; set local session_replication_role = replica; ${sql}; commit;`);

/** 결제된 주문의 상자 하나를 반송 대기로 — 별빛이 송장번호를 넣고 사무실이 입고·라벨·검수(반송) */
async function toReturnWaiting(boxId: string): Promise<string> {
  const op = await staff();
  const no = waybill();
  await fanSetsWaybill(boxId, no);
  const qr = await receiveAndLabel(op, no);
  expect(await inspect(op, qr, RETURN_FAIL)).toBe("return_waiting");
  return qr;
}

describe("INV-M25: 반송 주소 사본은 로그인한 보낸 사람 본인의 결제 대기 주문에만 (manual/0032 뒤)", () => {
  it("INV-M25 S25: 별빛이 결제 대기인 자기 주문에 봉인·구분 「제주」로 저장 → saved, 사본 하나(넣은 계정 = 별빛)·기록 saved 한 줄", async () => {
    const o = await registerTestOrder(1);
    const sealed = sampleEnvelope();
    const r = await save(o.orderNo, sealed, "jeju");
    expect(r.error).toBeNull();
    expect(r.data).toBe("saved");
    const [envelope, region, account] = copyOfOrder(o.orderId).split("|");
    expect(JSON.parse(envelope!)).toEqual(sealed);
    expect([region, account]).toEqual(["jeju", BYEOLBIT]);
    expect(orderEvents(o.orderId)).toBe("saved");
  });

  it("INV-M25 ②: 결제 대기 중 다시 넣으면 덮어쓴다 — 사본은 하나, 기록은 저장마다 한 줄", async () => {
    const o = await registerTestOrder(1);
    expect((await save(o.orderNo, sampleEnvelope(), "none")).data).toBe("saved");
    const second = sampleEnvelope();
    expect((await save(o.orderNo, second, "island")).data).toBe("saved");
    expect(orderReturnCopies(o.orderId)).toBe("1");
    const [envelope, region] = copyOfOrder(o.orderId).split("|");
    expect(JSON.parse(envelope!)).toEqual(second);
    expect(region).toBe("island");
    expect(orderEvents(o.orderId)).toBe("saved,saved");
  });

  it("INV-M25 S25b (실패경로): 달토끼가 별빛 주문에 · 없는 주문번호에 저장 → 같은 not_found, 아무것도 저장되지 않는다", async () => {
    const o = await registerTestOrder(1);
    const daltokki = await signedInClient("daltokki_fan");
    expect((await save(o.orderNo, sampleEnvelope(), "none", daltokki)).data).toBe("not_found");
    expect((await save("FC-TNOSUCH", sampleEnvelope(), "none")).data).toBe("not_found");
    expect(orderReturnCopies(o.orderId)).toBe("0");
    expect(orderEvents(o.orderId)).toBe("");
  });

  it("INV-M25 S25b (실패경로): 로그인 안 함·앱 서버 키·받는 크리에이터는 남의 주문에 사본을 넣지 못한다", async () => {
    const o = await registerTestOrder(1);
    for (const c of [anonClient(), adminClient()]) {
      expect((await save(o.orderNo, sampleEnvelope(), "none", c)).error).not.toBeNull();
    }
    expect((await save(o.orderNo, sampleEnvelope(), "none", await signedInClient("haru_creator"))).data).toBe("not_found");
    expect(orderReturnCopies(o.orderId)).toBe("0");
  });

  it("INV-M25 S25b (실패경로): 결제 완료된 주문 → closed, 사본·기록 없음. 첫 결제가 승인 중인 결제 대기 주문도 closed", async () => {
    const paid = await paidGift(1);
    expect((await save(paid.orderNo)).data).toBe("closed");
    expect(orderReturnCopies(paid.orderId)).toBe("0");
    expect(orderEvents(paid.orderId)).toBe("");

    const confirming = await registerTestOrder(1);
    replica(`update public.payments set status = 'confirming' where order_id = '${confirming.orderId}' and kind = 'initial'`);
    expect(psql(`select status from public.orders where id = '${confirming.orderId}'`)).toBe("pending_payment");
    expect((await save(confirming.orderNo)).data).toBe("closed");
    expect(orderReturnCopies(confirming.orderId)).toBe("0");
  });

  it("INV-M25 ① · INV-P1 S25b (실패경로): 평문 주소·모자란 봉인·봉인 없음·목록 밖 구분(우편번호 포함)·구분 없음 → 22023, 아무것도 저장되지 않는다", async () => {
    const o = await registerTestOrder(1);
    for (const [envelope, region] of [
      ["서울시 마포구 어울마당로 1", "none"],
      [{ address: "서울시 마포구", phone: "01012345678" }, "none"],
      [{ ...sampleEnvelope(), iv: "AAAA" }, "none"],
      [null, "none"],
      [sampleEnvelope(), "63309"],
      [sampleEnvelope(), "JEJU"],
      [sampleEnvelope(), null],
    ] as const) {
      expect((await save(o.orderNo, envelope, region)).error?.code).toBe("22023");
    }
    expect(orderReturnCopies(o.orderId)).toBe("0");
    expect(orderEvents(o.orderId)).toBe("");
  });

  it("INV-M25 · P9 (실패경로): 화면 쪽 키로 사본 표·기록 표를 직접 읽거나 쓸 수 없다 — 기록 표에 주소 칸이 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const c of [fan, anonClient()]) {
      expect((await c.schema("pii").from("order_return_addresses").select("*")).data ?? []).toEqual([]);
      expect((await c.schema("pii").from("order_return_address_events").select("*")).data ?? []).toEqual([]);
    }
    expect(psql("select relrowsecurity::text from pg_class where oid = 'pii.order_return_addresses'::regclass")).toBe("true");
    expect(psql("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'pii' and table_name = 'order_return_address_events'")).toBe(
      "at,event,id,order_id,reason",
    );
  });
});

describe("INV-W15 · P18: 반송 주소 확인은 주문 사본 또는 새 봉인을 상자에 복사한다 (manual/0032 뒤)", () => {
  it("INV-M25 ③ · W15 S15: 결제 대기 때 저장한 사본 → 결제 → 반송 대기 → 「확인」 하면 그 암호문이 상자에 복사, 그 뒤 주문 사본이 지워져도 상자는 그대로", async () => {
    const o = await registerTestOrder(1);
    const sealed = sampleEnvelope();
    expect((await save(o.orderNo, sealed, "none")).data).toBe("saved");
    await payTestOrder(o);
    const boxId = psql(`select id from public.boxes where order_id = '${o.orderId}'`);
    const qr = await toReturnWaiting(boxId);
    expect((await confirm(o.orderNo, 1)).data).toBe("confirmed");
    expect(JSON.parse(boxCopyOf(qr))).toEqual(sealed);
    psql(`delete from pii.order_return_addresses where order_id = '${o.orderId}'`);
    expect(JSON.parse(boxCopyOf(qr))).toEqual(sealed);
  });

  it("INV-W15: 「다른 주소 입력」 봉인이 주문 사본보다 앞선다 — 상자에는 새 봉인, 주문 사본은 바뀌지 않는다", async () => {
    const g = await paidGift(1);
    const qr = await toReturnWaiting(g.boxIds[0]!);
    const copy = putOrderReturnCopy(g.orderId);
    const other = sampleEnvelope();
    expect((await confirm(g.orderNo, 1, "byeolbit_fan", other)).data).toBe("confirmed");
    expect(JSON.parse(boxCopyOf(qr))).toEqual(other);
    expect(JSON.parse(copyOfOrder(g.orderId).split("|")[0]!)).toEqual(copy);
  });

  it("INV-W15 (S15f 앞부분): 팬 주문에 사본도 봉인도 없으면 no_address — 상자 복사본·확인 시각 없음", async () => {
    const g = await paidGift(1);
    const qr = await toReturnWaiting(g.boxIds[0]!);
    expect((await confirm(g.orderNo, 1)).data).toBe("no_address");
    expect(boxCopyOf(qr)).toBe("none");
    expect(psql(`select return_confirmed_at is null from public.office_parcels where qr_code = '${qr}'`)).toBe("t");
  });

  it("INV-W15 S15f (실패경로): 「다른 주소 입력」에 평문·모자란 봉인 → 22023, 복사 없음(주문 사본이 있어도 그것으로 대신하지 않는다)", async () => {
    const g = await paidGift(1);
    const qr = await toReturnWaiting(g.boxIds[0]!);
    putOrderReturnCopy(g.orderId);
    for (const bad of ["서울시 마포구 어울마당로 1", { address: "서울시" }, { ...sampleEnvelope(), extra: 1 }]) {
      expect((await confirm(g.orderNo, 1, "byeolbit_fan", bad)).error?.code).toBe("22023");
    }
    expect(boxCopyOf(qr)).toBe("none");
  });

  it("INV-W15 S15f (실패경로): 역조공 몫 상자에 보낸 크리에이터가 봉인을 직접 넣어 확인 → 22023, 복사 없음(크리에이터는 등록 주소로만)", async () => {
    const s = await paidShare();
    const op = await staff();
    const scanned = await scanInbound(op, waybill(), { code: codeOf({ shareId: s.shareId }) });
    const qr = (scanned.data as { qr: string }).qr;
    await op.rpc("office_confirm_label", { p_qr: qr });
    expect(await inspect(op, qr, { surface: "found", prohibited: "clear", outcome: "return" })).toBe("return_waiting");
    expect((await confirm(s.orderNo, null, "haru_creator", sampleEnvelope())).error?.code).toBe("22023");
    expect(boxCopyOf(qr)).toBe("none");
  });

  it("INV-W15 · P17 (실패경로): 옛 두 인자 확인(등록 주소를 복사하던 길)은 없다", () => {
    expect(psql("select to_regprocedure('public.confirm_return_address(text, integer)') is null")).toBe("t");
    expect(psql("select to_regprocedure('public.confirm_return_address(text, integer, jsonb)') is not null")).toBe("t");
  });
});

describe("INV-M25 ④: 끝난 주문의 반송 주소 사본은 예약 작업이 지운다 (manual/0032 뒤)", () => {
  it("INV-M25 S25c: 취소된 주문·결제하지 않고 24시간이 지난 결제 대기의 사본은 지우고 주문마다 지운 줄 하나, 결제 대기(24시간 전)·진행 중 주문의 사본은 남는다", async () => {
    const pending = await registerTestOrder(1);
    expect((await save(pending.orderNo)).data).toBe("saved");
    const stale = await registerTestOrder(1);
    expect((await save(stale.orderNo)).data).toBe("saved");
    const canceled = await registerTestOrder(1);
    expect((await save(canceled.orderNo)).data).toBe("saved");
    const inProgress = await paidGift(1);
    putOrderReturnCopy(inProgress.orderId);

    // 결제하지 않고 떠난 결제 대기: 첫 결제 줄이 닫혔고(실패) 만든 지 24시간이 지났다 — 주문 줄은 결제 대기 그대로
    replica(`update public.payments set status = 'failed', created_at = now() - interval '25 hours' where order_id = '${stale.orderId}' and kind = 'initial'`);
    // 취소된 주문은 등록(결제)된 뒤에만 있다 — 결제 대기·거절 말고는 등록 시각이 있어야 한다(orders_registered_unless_unpaid)
    replica(`update public.orders set status = 'canceled', registered_at = now() where id = '${canceled.orderId}'`);
    expect(psql(`select public.order_is_finished('${stale.orderId}') || '|' || public.order_is_finished('${canceled.orderId}') || '|' || public.order_is_finished('${pending.orderId}') || '|' || public.order_is_finished('${inProgress.orderId}')`)).toBe(
      "true|true|false|false",
    );

    const dropped = dropAddressCopies();
    expect(dropped.order_return).toBeGreaterThanOrEqual(2);
    for (const gone of [stale.orderId, canceled.orderId]) {
      expect(orderReturnCopies(gone)).toBe("0");
      expect(orderEvents(gone)).toBe("saved,deleted:order_finished");
    }
    for (const kept of [pending.orderId, inProgress.orderId]) expect(orderReturnCopies(kept)).toBe("1");
    expect(orderEvents(pending.orderId)).toBe("saved");

    // 다시 돌려도 더 지울 것이 없다 — 지운 줄이 늘지 않는다
    dropAddressCopies();
    expect(orderEvents(stale.orderId)).toBe("saved,deleted:order_finished");
    expect(orderReturnCopies(pending.orderId)).toBe("1");
  });

  it("INV-M25 ④ (실패경로): 사본 지우기는 예약 작업 실행자만 — 화면 키·앱 서버 키로는 부를 수 없다", async () => {
    for (const c of [await signedInClient("fankkuk_staff"), await signedInClient("byeolbit_fan"), adminClient()]) {
      expect((await c.rpc("office_drop_address_copies")).error).not.toBeNull();
    }
  });
});
