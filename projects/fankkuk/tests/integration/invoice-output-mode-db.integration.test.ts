import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fanAddressPlaintext } from "@/entities/address/model/fan-address-plaintext";
import { createInvoiceDecryptor, type InvoiceDecryptor } from "@/features/invoice-print/api/invoice-decryptor";
import { scanOutbound } from "@/features/office-outbound/model/scan-outbound";
import { sealEnvelope } from "@/shared/lib/envelope/envelope";
import { deleteTestOrders, psql, psqlError, signedInClient } from "./helpers";
import { ADDRESS_CREATOR_ID, decryptFileText, LABEL, logRows, OWNER_ID, putTestEnvelope, sealTestAddress, STAFF_ID, testKeyPair, type TestKeys } from "./invoice-helpers";
import {
  approve,
  creatorSetsWaybill,
  deleteTestUnmatched,
  FAN_PASS,
  fanSetsWaybill,
  inspect,
  paidGift,
  paidShare,
  parcelState,
  receiveAndLabel,
  SHARE_PASS,
  waybill,
} from "./office-helpers";
import { acceptWithAddress, deleteTestRevgifts, PROFILE } from "./revgift-helpers";
import { createTestCreator, removeTestCreator } from "./test-creator";

// 송장 출력 방식 「수동 입력」 (address-protection INV-P21 ③, S21d).
// 주소를 열 때는 운송장 번호가 없고(대표가 택배 접수 화면에 옮긴 뒤 받은 번호를 넣는다), 번호를 넣어야 출고 확정 스캔이 된다.
// 주소 열기는 지금 송장 출력과 같은 함수·같은 규칙(INV-P4·P5·P7·P8)을 지난다 — 수동 입력은 운송장 번호를 만들지 않을 뿐이다.

let keys: TestKeys;
let manual: InvoiceDecryptor;

const env = () => ({ NODE_ENV: "development", SUPABASE_URL: process.env.FK_TEST_API_URL, SUPABASE_PUBLISHABLE_KEY: process.env.FK_TEST_ANON_KEY });

beforeAll(async () => {
  keys = await testKeyPair();
  deleteTestOrders();
  deleteTestRevgifts();
  removeTestCreator();
  createTestCreator();
  putTestEnvelope(await sealTestAddress(keys, ADDRESS_CREATOR_ID));
  // 수동 입력 — 첫 출력에 운송장 번호를 만들지 않는다
  manual = createInvoiceDecryptor(env(), () => decryptFileText(keys), () => null);
});

afterEach(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  deleteTestUnmatched();
});

afterAll(() => {
  deleteTestOrders();
  deleteTestRevgifts();
  removeTestCreator();
});

async function tokenOf(loginId: string): Promise<string> {
  const client = await signedInClient(loginId);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}

async function inspectedGift(): Promise<{ orderId: string; qr: string }> {
  const g = await paidGift(1, ADDRESS_CREATOR_ID);
  await approve(g);
  const no = waybill();
  await fanSetsWaybill(g.boxIds[0]!, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, FAN_PASS)).toBe("inspected");
  return { orderId: g.orderId, qr };
}

async function inspectedShare(): Promise<{ shareId: string; qr: string }> {
  const s = await paidShare();
  const fan = await signedInClient("byeolbit_fan");
  const sealed = await sealEnvelope(fanAddressPlaintext({ accountId: PROFILE.byeolbit, ...LABEL }), keys.publicKey);
  const accepted = await acceptWithAddress(fan, s.orderNo, sealed);
  if (accepted.error) throw new Error(`accept_revgift 실패: ${accepted.error.message}`);
  const no = waybill();
  await creatorSetsWaybill(s.shareId, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, SHARE_PASS)).toBe("inspected");
  return { shareId: s.shareId, qr };
}

const openManual = async (qr: string, login = "fankkuk_admin") => manual({ qr, accessToken: await tokenOf(login) });
const outboundNo = (qr: string) => psql(`select coalesce(outbound_waybill_no, '-') from public.office_parcels where qr_code = '${qr}'`);
const nextStep = (qr: string) => psql(`select public.office_next_step(p, case when p.box_id is not null then 'gift' else 'revgift' end) from public.office_parcels p where qr_code = '${qr}'`);

async function outbound(login: string, body: unknown) {
  const client = await signedInClient(login);
  return scanOutbound(
    { client, newWaybill: waybill, printLabel: async () => ({ kind: "failed" }), printReturnLabel: async () => ({ kind: "not_linked" }) },
    body,
  );
}

describe("INV-P21 ③ 수동 입력: 주소를 열 때는 운송장 번호가 없다", () => {
  it("INV-P21 ③: 대표가 주소를 열면 라벨 칸이 오고 열람 기록 1줄, 상자는 송장 출력 단계 · 운송장 번호 없음 · 다음 일은 운송장 번호 입력", async () => {
    const g = await inspectedGift();
    expect(await openManual(g.qr)).toEqual({ kind: "printed", waybill: null, reprint: false, label: LABEL });
    expect(parcelState(g.qr)).toBe("label_printed");
    expect(outboundNo(g.qr)).toBe("-");
    expect(nextStep(g.qr)).toBe("enter_waybill");
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`]);
  });

  it("INV-P21 ③·INV-P5: 번호를 넣기 전에 주소를 다시 열면 재출력 — 횟수 2, 운송장 번호는 여전히 없음", async () => {
    const g = await inspectedGift();
    await openManual(g.qr);
    expect(await openManual(g.qr)).toEqual({ kind: "printed", waybill: null, reprint: true, label: LABEL });
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`, `opened:2:${OWNER_ID}`]);
  });

  it("INV-P21 ③·INV-P8 (실패경로): 수동 입력이어도 직원은 주소를 열지 못한다 — 「대표 아님」 거부 줄, 상자 그대로", async () => {
    const g = await inspectedGift();
    expect(await openManual(g.qr, "fankkuk_staff")).toEqual({ kind: "denied", reason: "not_owner" });
    expect(logRows(g.orderId)).toEqual([`denied:not_owner:${STAFF_ID}`]);
    expect(parcelState(g.qr)).toBe("inspected");
  });

  it("INV-P21 ③ (실패경로): 승인·검수 조건은 그대로 — 검수 완료 전(입고) 상자에 운송장 번호 없이 출력 단계로 넘기는 길은 없다", async () => {
    const g = await paidGift(1, ADDRESS_CREATOR_ID);
    await approve(g);
    const no = waybill();
    await fanSetsWaybill(g.boxIds[0]!, no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    const err = psqlError(`set role address_decryptor; select public.invoice_finish_print('${qr}', null);`);
    expect(err).toMatch(/55000|지금 단계/);
    expect(outboundNo(qr)).toBe("-");
  });
});

describe("INV-P21 운송장 번호 저장 — 대표만, 상자마다 하나", () => {
  it("INV-P21: 대표가 번호를 넣으면 저장되고 다음 일은 출고 확정 스캔 — 그 번호로 출고 확정된다", async () => {
    const g = await inspectedGift();
    await openManual(g.qr);
    const no = waybill();
    expect(await outbound("fankkuk_admin", { kind: "set_waybill", qr: g.qr, waybill: no })).toEqual({ status: 200, body: { ok: true } });
    expect(outboundNo(g.qr)).toBe(no);
    expect(nextStep(g.qr)).toBe("confirm_shipment");
    expect(await outbound("fankkuk_admin", { kind: "confirm_shipment", qr: g.qr, waybill: no })).toEqual({ status: 200, body: { ok: true } });
    expect(parcelState(g.qr)).toBe("shipped");
  });

  it("INV-P21 (S21d, 실패경로): 운송장 번호가 없는 상자의 출고 확정 스캔은 거부 — 상자 그대로", async () => {
    const g = await inspectedGift();
    await openManual(g.qr);
    const staff = await signedInClient("fankkuk_staff");
    const { error } = await staff.rpc("office_confirm_shipment", { p_qr: g.qr, p_waybill: waybill() });
    expect(error?.code).toBe("55000");
    expect(parcelState(g.qr)).toBe("label_printed");
  });

  it("INV-P21 (S21d, 실패경로): 직원이 넣으면 거부 — 운영자 내부 기록에 「대표 아님」 줄, 번호는 저장되지 않는다", async () => {
    const g = await inspectedGift();
    await openManual(g.qr);
    expect(await outbound("fankkuk_staff", { kind: "set_waybill", qr: g.qr, waybill: waybill() })).toEqual({
      status: 403,
      body: { message: "운송장 번호는 대표만 넣을 수 있어요." },
    });
    expect(outboundNo(g.qr)).toBe("-");
    expect(logRows(g.orderId)).toEqual([`opened:1:${OWNER_ID}`, `denied:not_owner:${STAFF_ID}`]);
  });

  it("INV-P21 (실패경로): 상자마다 하나 — 이미 넣은 상자에 다시 넣으면 거부, 처음 번호 그대로", async () => {
    const g = await inspectedGift();
    await openManual(g.qr);
    const first = waybill();
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_set_outbound_waybill", { p_qr: g.qr, p_waybill: first })).data).toBe("saved");
    expect((await owner.rpc("office_set_outbound_waybill", { p_qr: g.qr, p_waybill: waybill() })).error?.code).toBe("55000");
    expect(outboundNo(g.qr)).toBe(first);
  });

  it("INV-P21 (실패경로): 주소를 열기 전(검수 완료) 상자에는 넣을 수 없다 · 번호 꼴이 아니면 22023", async () => {
    const g = await inspectedGift();
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("office_set_outbound_waybill", { p_qr: g.qr, p_waybill: waybill() })).error?.code).toBe("55000");
    expect(parcelState(g.qr)).toBe("inspected");
    await openManual(g.qr);
    expect((await owner.rpc("office_set_outbound_waybill", { p_qr: g.qr, p_waybill: "12" })).error?.code).toBe("22023");
    expect(outboundNo(g.qr)).toBe("-");
  });

  it("INV-P21 (실패경로): 로그인 안 한 사람·팬은 부를 수 없다", async () => {
    const g = await inspectedGift();
    await openManual(g.qr);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("office_set_outbound_waybill", { p_qr: g.qr, p_waybill: waybill() })).error).not.toBeNull();
    expect(outboundNo(g.qr)).toBe("-");
  });
});

describe("INV-P21 역조공 상자도 같은 방식", () => {
  it("INV-P21 ③: 역조공 상자도 운송장 번호 없이 주소를 열고, 대표가 번호를 넣은 뒤 출고 확정된다", async () => {
    const s = await inspectedShare();
    expect(await openManual(s.qr)).toEqual({ kind: "printed", waybill: null, reprint: false, label: LABEL });
    expect(nextStep(s.qr)).toBe("enter_waybill");
    const no = waybill();
    expect(await outbound("fankkuk_admin", { kind: "set_waybill", qr: s.qr, waybill: no })).toEqual({ status: 200, body: { ok: true } });
    expect(await outbound("fankkuk_admin", { kind: "confirm_shipment", qr: s.qr, waybill: no })).toEqual({ status: 200, body: { ok: true } });
    expect(parcelState(s.qr)).toBe("shipped");
  });

  it("INV-P21 (S21d, 실패경로): 직원이 역조공 상자에 번호를 넣으면 거부 — 역조공 내부 기록에 「대표 아님」 줄", async () => {
    const s = await inspectedShare();
    await openManual(s.qr);
    expect((await outbound("fankkuk_staff", { kind: "set_waybill", qr: s.qr, waybill: waybill() })).status).toBe(403);
    expect(outboundNo(s.qr)).toBe("-");
    expect(psql(`select count(*) from public.revgift_decrypt_log where share_id = '${s.shareId}' and result = 'denied' and deny_reason = 'not_owner' and requester_id = '${STAFF_ID}'`)).toBe("1");
  });
});
