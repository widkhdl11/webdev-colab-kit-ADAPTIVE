import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { sealedAddressPlaintext } from "@/entities/revgift/model/sealed-address";
import { createInvoiceDecryptor, type InvoiceDecryptor } from "@/features/invoice-print/api/invoice-decryptor";
import { sealEnvelope } from "@/shared/lib/envelope/envelope";
import { anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { decryptFileText, LABEL, OWNER_ID, testKeyPair, type TestKeys } from "./invoice-helpers";
import { creatorSetsWaybill, deleteTestUnmatched, inspect, paidShare, receiveAndLabel, SHARE_PASS, waybill } from "./office-helpers";
import { deleteTestRevgifts, followHaru, payTestRevgift, PROFILE, registerTestRevgift, unfollowHaru } from "./revgift-helpers";

// 팬이 자기 몫 주소의 열람 기록을 본다 (reverse-gift INV-R16).
// 읽기 함수(my_revgift_access_log)는 사람 ID 를 받지 않고, 로그인 토큰의 계정이 받는 팬인 몫의 기록만 돌려준다.
// 연 줄·거부 줄은 몫 전용 열람 기록, 지운 줄은 몫 주소 지운 기록에서 온다. 주소·운송장·요청자 계정 칸은 없다.
// 시드 주문·계정은 바꾸지 않는다 — 시험마다 새 보내기(RG-T…)를 만들고 끝나면 지운다.

let keys: TestKeys;
let decryptor: InvoiceDecryptor;

const env = () => ({ NODE_ENV: "development", SUPABASE_URL: process.env.FK_TEST_API_URL, SUPABASE_ANON_KEY: process.env.FK_TEST_ANON_KEY });

beforeAll(async () => {
  keys = await testKeyPair();
  deleteTestRevgifts();
  deleteTestOrders();
  decryptor = createInvoiceDecryptor(env(), () => decryptFileText(keys), waybill);
});

afterEach(() => {
  deleteTestRevgifts();
  deleteTestOrders();
  deleteTestUnmatched();
});

afterAll(() => {
  deleteTestRevgifts();
  deleteTestOrders();
  unfollowHaru([PROFILE.gureumppang]);
});

async function tokenOf(loginId: string): Promise<string> {
  const client = await signedInClient(loginId);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}

async function print(qr: string, loginId: string) {
  return decryptor({ qr, accessToken: await tokenOf(loginId) });
}

/** 하루 → 별빛 몫 하나: 결제 → 별빛이 받기(봉인 주소) → 원 송장번호 → 입고·부착 → 검수 완료. */
async function inspectedShare(): Promise<{ orderNo: string; shareId: string; qr: string }> {
  const s = await paidShare();
  const fan = await signedInClient("byeolbit_fan");
  const sealed = await sealEnvelope(sealedAddressPlaintext({ orderNo: s.orderNo, ...LABEL }), keys.publicKey);
  const accepted = await fan.rpc("accept_revgift", { p_order_no: s.orderNo, p_envelope: sealed });
  if (accepted.error) throw new Error(`accept_revgift 실패: ${accepted.error.message}`);
  const no = waybill();
  await creatorSetsWaybill(s.shareId, no);
  const staff = await signedInClient("fankkuk_staff");
  const qr = await receiveAndLabel(staff, no);
  expect(await inspect(staff, qr, SHARE_PASS)).toBe("inspected");
  return { orderNo: s.orderNo, shareId: s.shareId, qr };
}

/** S16 의 Given: 대표가 한 번 열고, 직원 시도가 한 번 거부된 뒤, 출고 확정. */
async function openedDeniedShipped(): Promise<{ orderNo: string; shareId: string; outbound: string }> {
  const s = await inspectedShare();
  const first = await print(s.qr, "fankkuk_admin");
  expect(first.kind).toBe("printed");
  if (first.kind !== "printed") throw new Error("첫 출력 실패");
  expect(await print(s.qr, "fankkuk_staff")).toEqual({ kind: "denied", reason: "not_owner" });
  const staff = await signedInClient("fankkuk_staff");
  const shipped = await staff.rpc("office_confirm_shipment", { p_qr: s.qr, p_waybill: first.waybill });
  if (shipped.error) throw new Error(`office_confirm_shipment 실패: ${shipped.error.code} ${shipped.error.message}`);
  return { orderNo: s.orderNo, shareId: s.shareId, outbound: first.waybill };
}

/** 복호화 전용 역할로 SQL 한 문장을 돌리고 마지막 줄(결과)을 돌려준다 — psql 은 「SET」 줄을 먼저 찍는다. */
function asDecryptor(sql: string): string {
  return psql(`set role address_decryptor; ${sql}`).split(/\r?\n/).pop() ?? "";
}

async function readAs(loginId: string, orderNo: string) {
  const client = await signedInClient(loginId);
  return client.rpc("my_revgift_access_log", { p_order_no: orderNo });
}

describe("INV-R16: 팬은 자기 몫 주소의 열람 기록을 본다", () => {
  it("INV-R16 S16: 연 줄(1번째, 대표) · 거부 줄(대표 아님) · 지운 줄(출고)이 시각 역순으로, 주소·운송장·요청자 계정 없이 온다", async () => {
    const s = await openedDeniedShipped();
    const { data, error } = await readAs("byeolbit_fan", s.orderNo);
    expect(error).toBeNull();
    const rows = data as Record<string, unknown>[];
    expect(rows.map((r) => ({ ...r, at: undefined }))).toEqual([
      { at: undefined, kind: "deleted", print_no: null, deny_reason: null, outcome: "shipped", requester: null, released: false },
      { at: undefined, kind: "denied", print_no: null, deny_reason: "not_owner", outcome: null, requester: "other", released: false },
      { at: undefined, kind: "opened", print_no: 1, deny_reason: null, outcome: null, requester: "owner", released: false },
    ]);
    const times = rows.map((r) => Date.parse(String(r.at)));
    expect(times.every((t) => Number.isFinite(t))).toBe(true);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // 칸은 정해진 일곱 개뿐 — 주소·운송장·요청자 계정 id 가 섞여 오지 않는다(INV-R7·R8)
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["at", "deny_reason", "kind", "outcome", "print_no", "released", "requester"]);
    const text = JSON.stringify(rows);
    expect(text).not.toContain(OWNER_ID);
    for (const v of Object.values(LABEL)) expect(text).not.toContain(v);
    expect(text).not.toContain(s.outbound);
  });

  it("INV-R16: 주소가 열린 적 없는 내 몫은 빈 목록이다", async () => {
    const s = await paidShare();
    const { data, error } = await readAs("byeolbit_fan", s.orderNo);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("INV-R16 S16b (실패경로): 다른 팬·보낸 크리에이터·직원·대표 운영자는 0줄, 익명은 거부", async () => {
    const s = await openedDeniedShipped();
    followHaru([PROFILE.gureumppang]);
    for (const login of ["gureumppang_fan", "daltokki_fan", "haru_creator", "fankkuk_staff", "fankkuk_admin"]) {
      const { data, error } = await readAs(login, s.orderNo);
      expect(error, login).toBeNull();
      expect(data, login).toEqual([]);
    }
    const anon = await anonClient().rpc("my_revgift_access_log", { p_order_no: s.orderNo });
    expect(anon.error?.code).toBe("42501");
    expect(anon.data).toBeNull();
  });

  it("INV-R16 S16b (실패경로): 별빛이 남의 몫 번호·없는 번호를 넣으면 0줄", async () => {
    followHaru([PROFILE.gureumppang]);
    const send = await registerTestRevgift([{ fanId: PROFILE.gureumppang, tier: "small" }]);
    await payTestRevgift(send);
    const otherOrderNo = send.orderNos[0];
    const shareId = psql(`select id from public.revgift_shares where order_no = '${otherOrderNo}'`);
    psql(
      `set role address_decryptor; insert into public.revgift_decrypt_log (share_id, requester_id, result, deny_reason) values ('${shareId}', '${OWNER_ID}', 'denied', 'no_valid_approval');`,
    );
    // 그 몫의 주인은 자기 기록을 본다 — 줄이 실제로 있다는 확인. 대표가 받기 전에 시도한 거부(no_valid_approval)는 요청자가 대표다
    const own = await readAs("gureumppang_fan", otherOrderNo);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([
      expect.objectContaining({ kind: "denied", deny_reason: "no_valid_approval", requester: "owner", released: false }),
    ]);

    for (const no of [otherOrderNo, "RG-TNOPE000", "FC-P4X7N"]) {
      const { data, error } = await readAs("byeolbit_fan", no);
      expect(error, no).toBeNull();
      expect(data, no).toEqual([]);
    }
  });

  it("INV-R16 (INV-R13): 송장이 안 나와 돌려준 연 줄만 released 로 오고, 다시 연 줄은 아니다", async () => {
    const s = await inspectedShare();
    asDecryptor(`select public.revgift_claim_print('${s.qr}', '${OWNER_ID}')::text;`);
    const firstId = psql(`select max(id) from public.revgift_decrypt_log where share_id = '${s.shareId}' and result = 'opened'`);
    expect(JSON.parse(asDecryptor(`select public.revgift_release_print(${firstId}, '${OWNER_ID}')::text;`))).toEqual({ result: "released" });
    asDecryptor(`select public.revgift_claim_print('${s.qr}', '${OWNER_ID}')::text;`);
    const { data, error } = await readAs("byeolbit_fan", s.orderNo);
    expect(error).toBeNull();
    const rows = data as { kind: string; released: boolean }[];
    expect(rows.map((r) => [r.kind, r.released])).toEqual([
      ["opened", false],
      ["opened", true],
    ]);
  });

  it("INV-R16: 같은 시각이면 지운 줄이 위, 기록 줄끼리는 나중에 남은 줄이 위", async () => {
    const s = await paidShare();
    const t = "2026-10-09 12:00:00+00";
    asDecryptor(
      `insert into public.revgift_decrypt_log (at, share_id, requester_id, result, deny_reason) values ('${t}', '${s.shareId}', '${OWNER_ID}', 'denied', 'no_valid_approval'), ('${t}', '${s.shareId}', '${OWNER_ID}', 'denied', 'order_not_printable');`,
    );
    psql(`insert into public.revgift_address_events (share_id, event, outcome, at) values ('${s.shareId}', 'deleted', 'cancelled', '${t}')`);
    const { data, error } = await readAs("byeolbit_fan", s.orderNo);
    expect(error).toBeNull();
    const rows = data as { at: string; kind: string; deny_reason: string | null }[];
    expect(new Set(rows.map((r) => Date.parse(r.at))).size).toBe(1);
    expect(rows.map((r) => r.deny_reason ?? r.kind)).toEqual(["deleted", "order_not_printable", "no_valid_approval"]);
  });
});
