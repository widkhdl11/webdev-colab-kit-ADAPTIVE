import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fanAddressPlaintext } from "@/entities/address/model/fan-address-plaintext";
import { createInvoiceDecryptor, type InvoiceDecryptor } from "@/features/invoice-print/api/invoice-decryptor";
import { sealEnvelope } from "@/shared/lib/envelope/envelope";
import { adminClient, deleteTestFollows, holdRowLock, psql, psqlError, signedInClient } from "./helpers";
import { decryptFileText, LABEL, OWNER_ID, STAFF_ID, testKeyPair, type TestKeys } from "./invoice-helpers";
import { createTestAccount, removeTestAccounts } from "./account-fixtures";
import { PROFILE, sampleEnvelope } from "./revgift-helpers";

// 선물함(팬에게 보내기) 4부 — 명세서 결제 · 72/168시간 · 미결제 착불 반송 · 송장 출력·출고 · 줄 환불 · 300원 건수 돌려주기 · 탈퇴
// (revgift-box INV-GB1 paid~done·returning · GB15 Q15 · GB18 · GB19 · GB20 · GB21 · Q17, S1b·S18~S21b).
// 시험 데이터는 DB 에 바로 넣는다 — 실측된 신청과 주소 사본(pii, manual/0031 표)을 넣고 명세서는 1부의 명세서 쓰기 함수로 만든다
// (3부 명세서 생성은 manual/0033 의 할증 구분 읽기를 거쳐야 해서 여기서는 쓰지 않는다).
// 송장 출력은 봉인 사본을 내주는 함수(manual/0034)를 거친다. 미결제 반송·출고 + 72시간 사본 삭제는 manual/0034 의 사본 삭제 까닭을 쓴다 —
// 그 시험은 이름에 「(manual/0034 뒤)」를 달았다. 규칙 값(기한·상한)은 revgift_box_rules() 에서 읽는다.

const HARU_CREATOR = "00000000-0000-4000-b000-000000000001";
const SHARED_FAN = "ffffffff-0000-4000-8000-000000000001";

type Rules = { pay_due_hours: number; unpaid_return_hours: number; pending_payment_hours: number; copy_after_ship_hours: number; print_max: number };
let rules: Rules;
let haru: SupabaseClient;
let momo: SupabaseClient;
let staff: SupabaseClient;
let owner: SupabaseClient;
let keys: TestKeys;
let print: InvoiceDecryptor;
const admin = adminClient();

const manual0034 = () => psql("select to_regprocedure('public.revgift_box_claim_print(text, uuid)') is not null") === "t";

function deleteBoxes(): void {
  psql(`delete from public.refunds where box_line_id in (select l.id from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id join public.revgift_boxes b on b.id = i.box_id where b.creator_id = '${HARU_CREATOR}')`);
  psql(`alter table public.revgift_box_decrypt_releases disable trigger revgift_box_decrypt_releases_no_update;
        alter table public.revgift_box_decrypt_log disable trigger revgift_box_decrypt_log_no_update;
        delete from public.revgift_box_decrypt_releases where application_id in (select a.id from public.revgift_box_applications a join public.revgift_boxes b on b.id = a.box_id where b.creator_id = '${HARU_CREATOR}');
        delete from public.revgift_box_decrypt_log where application_id in (select a.id from public.revgift_box_applications a join public.revgift_boxes b on b.id = a.box_id where b.creator_id = '${HARU_CREATOR}');
        alter table public.revgift_box_decrypt_releases enable trigger revgift_box_decrypt_releases_no_update;
        alter table public.revgift_box_decrypt_log enable trigger revgift_box_decrypt_log_no_update;`);
  psql(`delete from public.revgift_boxes where creator_id = '${HARU_CREATOR}'`);
  psql(`delete from public.early_creator_monthly_usage where creator_id = '${HARU_CREATOR}'`);
  psql("delete from public.profiles where login_id like 'withdrawn\_it%'");
}

let seq = 0;
function waybill(): string {
  seq += 1;
  return `7710${String(Date.now() % 1_000_000).padStart(6, "0")}${String(seq).padStart(2, "0")}`;
}

/**
 * 하루의 결제 요청(invoiced) 선물함 — 신청 fanIds 마다 실측된 소형, 사본(할증 구분 region)과 함께. 명세서 발행 시각을 hoursAgo 시간 전으로.
 * envelopes 를 주면 그 봉인을 사본으로 넣는다(송장 출력 시험).
 */
function invoicedBox(fanIds: string[], o: { hoursAgo?: number; regions?: string[]; envelopes?: unknown[]; early?: boolean } = {}): { boxId: string; apps: string[]; invoiceId: string; amount: number } {
  const boxId = psql(
    `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status, inbound_code, carton_count, box_requested_at, first_received_at)
     values ('${PROFILE.haru}', '${HARU_CREATOR}', '시험 선물함', 10, true, 'arrived', null, 1, now(), now()) returning id`,
  ).split("\n")[0]!;
  const apps = fanIds.map((f, i) => {
    const id = psql(
      `insert into public.revgift_box_applications (box_id, fan_id, status, chosen_tier, measured_tier, measured_size_cm, measured_weight_kg, measured_at)
       values ('${boxId}', '${f}', 'measured', 'small', 'small', 90, 3, now()) returning id`,
    ).split("\n")[0]!;
    const env = o.envelopes?.[i] ?? sampleEnvelope();
    psql(`insert into pii.revgift_box_addresses (application_id, envelope, surcharge_region) values ('${id}', '${JSON.stringify(env)}'::jsonb, '${o.regions?.[i] ?? "none"}')`);
    return id;
  });
  if (o.early === false) {
    // 초기 크리에이터 혜택을 다 쓴 달 — 300원 줄이 생기지 않는다
    psql(`insert into public.early_creator_monthly_usage (creator_id, month, used) values ('${HARU_CREATOR}', date_trunc('month', now() at time zone 'Asia/Seoul')::date, 30) on conflict (creator_id, month) do update set used = 30`);
  }
  const lines = JSON.stringify(apps.map((a, i) => ({ application_id: a, tier: "small", region: o.regions?.[i] ?? "none" })));
  const invoiceId = psql(`select public.revgift_box_write_invoice('${boxId}', '${lines}'::jsonb, now())`);
  const at = `now() - interval '1 hour' * ${o.hoursAgo ?? 0}`;
  psql(`update public.revgift_boxes set status = 'invoiced', invoiced_at = ${at} where id = '${boxId}'`);
  psql(`update public.revgift_box_invoices set created_at = ${at} where id = '${invoiceId}'`);
  const amount = Number(psql(`select amount_krw from public.revgift_box_invoices where id = '${invoiceId}'`));
  return { boxId, apps, invoiceId, amount };
}

const boxStatus = (boxId: string) => psql(`select status from public.revgift_boxes where id = '${boxId}'`);
const appStatus = (appId: string) => psql(`select status from public.revgift_box_applications where id = '${appId}'`);
const hasCopy = (appId: string) => psql(`select count(*) from pii.revgift_box_addresses where application_id = '${appId}'`) === "1";
const payStatuses = (boxId: string) => psql(`select coalesce(string_agg(status::text, ',' order by created_at, id), '') from public.revgift_box_payments where box_id = '${boxId}'`);
const usage = () => Number(psql(`select coalesce((select used from public.early_creator_monthly_usage where creator_id = '${HARU_CREATOR}' and month = date_trunc('month', now() at time zone 'Asia/Seoul')::date), 0)`));
const lineOf = (appId: string) => psql(`select id from public.revgift_box_invoice_lines where application_id = '${appId}'`);
const labelOf = (appId: string) => psql(`select public.revgift_box_label_text(label_no) from public.revgift_box_applications where id = '${appId}'`);
function tick(): Record<string, number> {
  return JSON.parse(psql("select public.revgift_box_tick()::text")) as Record<string, number>;
}

/** 탈퇴 처리된 가명 계정 하나(로그인 계정 없이 만들 수 있는 프로필) — 다른 진행 중 일이 없는 계정으로 판정을 본다 */
function ghostProfile(role: "fan" | "creator" = "fan"): string {
  return psql(
    `insert into public.profiles (id, login_id, nickname, role, withdrawn_at) values (gen_random_uuid(), 'withdrawn_it' || substr(md5(random()::text), 1, 10), '탈퇴한 회원', '${role}', now()) returning id`,
  ).split("\n")[0]!;
}

async function startPay(boxId: string, client: SupabaseClient = haru) {
  return client.rpc("revgift_box_start_payment", { p_box_id: boxId });
}
async function startedOrder(boxId: string): Promise<string> {
  const r = await startPay(boxId);
  if (r.error) throw new Error(`start_payment: ${r.error.message}`);
  return (r.data as { toss_order_id: string }).toss_order_id;
}
const claim = async (order: string) => admin.rpc("claim_revgift_box_payment", { p_toss_order_id: order });
const settle = async (order: string, status: "done" | "failed" = "done") =>
  admin.rpc("settle_revgift_box_payment", { p_toss_order_id: order, p_status: status, p_payment_key: status === "done" ? `pk_${order}` : null });
async function paidBox(fanIds: string[], o: { envelopes?: unknown[]; regions?: string[] } = {}) {
  const b = invoicedBox(fanIds, o);
  const order = await startedOrder(b.boxId);
  expect((await claim(order)).data).toBe(true);
  expect((await settle(order)).data).toBe(true);
  return { ...b, order };
}

async function tokenOf(loginId: string): Promise<string> {
  const client = await signedInClient(loginId);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("토큰 없음");
  return token;
}
const sealFor = (accountId: string, zipCode: string = LABEL.zipCode) => sealEnvelope(fanAddressPlaintext({ accountId, ...LABEL, zipCode }), keys.publicKey);
const env = () => ({ NODE_ENV: "development", SUPABASE_URL: process.env.FK_TEST_API_URL, SUPABASE_PUBLISHABLE_KEY: process.env.FK_TEST_ANON_KEY });
const logRows = (appId: string) =>
  psql(`select coalesce(string_agg(result || ':' || coalesce(deny_reason, print_no::text), ',' order by id), '') from public.revgift_box_decrypt_log where application_id = '${appId}'`);

beforeAll(async () => {
  rules = JSON.parse(psql("select public.revgift_box_rules()::text")) as Rules;
  [haru, momo, staff, owner] = await Promise.all(["haru_creator", "momo_creator", "fankkuk_staff", "fankkuk_admin"].map((l) => signedInClient(l)));
  keys = await testKeyPair();
  print = createInvoiceDecryptor(env(), () => decryptFileText(keys), () => null);
  deleteBoxes();
});
beforeEach(() => deleteBoxes());
afterAll(() => {
  deleteBoxes();
  deleteTestFollows();
  removeTestAccounts();
});

describe("INV-GB18: 명세서 결제 — 주인만, 결제 요청·결제 기한 지남일 때만, 금액은 저장된 명세서 금액, 완료는 하나", () => {
  it("INV-GB18 S1b (실패경로): 명세서 전(상자 보내 주세요)에는 결제를 시작할 수 없다 — 미리 결제하는 길이 없다", async () => {
    const boxId = psql(
      `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${PROFILE.haru}', '${HARU_CREATOR}', '시험 선물함', 10, true, 'awaiting_box') returning id`,
    ).split("\n")[0]!;
    expect((await startPay(boxId)).error?.code).toBe("P0022");
    expect(payStatuses(boxId)).toBe("");
  });

  it("INV-GB18 S18c (실패경로): 모모가 하루의 명세서 결제를 시작 — 「없음」, 결제 대기가 생기지 않는다", async () => {
    const b = invoicedBox([PROFILE.byeolbit]);
    expect((await startPay(b.boxId, momo)).error?.code).toBe("P0002");
    expect(payStatuses(b.boxId)).toBe("");
  });

  it("INV-GB18 S13c: 결제 대기 금액은 명세서 금액 — 브라우저가 보낼 금액 칸이 없다", async () => {
    const b = invoicedBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    const r = await startPay(b.boxId);
    expect(r.error).toBeNull();
    expect((r.data as { amount_krw: number }).amount_krw).toBe(b.amount);
    expect(psql(`select amount_krw from public.revgift_box_payments where box_id = '${b.boxId}'`)).toBe(String(b.amount));
  });

  it("INV-GB18: 결제 완료 → 선물함 발송 중, 명세서의 신청은 결제됨, 같은 명세서의 다른 결제 대기는 닫힌다", async () => {
    const b = invoicedBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    const first = await startedOrder(b.boxId);
    const second = await startedOrder(b.boxId);
    expect((await claim(second)).data).toBe(true);
    expect((await settle(second)).data).toBe(true);
    expect(boxStatus(b.boxId)).toBe("paid");
    expect(b.apps.map(appStatus)).toEqual(["paid", "paid"]);
    expect(payStatuses(b.boxId)).toBe("failed,done");
    // 닫힌 결제 대기는 확정을 시작할 수 없다
    expect((await claim(first)).data).toBe(false);
  });

  it("INV-GB18 S18 (동시): 같은 명세서의 결제 확정 시작 둘이 동시에 — 승인 중은 하나, 완료도 하나", async () => {
    const b = invoicedBox([PROFILE.byeolbit]);
    const a = await startedOrder(b.boxId);
    const c = await startedOrder(b.boxId);
    const held = await holdRowLock(`select 1 from public.revgift_boxes where id = '${b.boxId}' for update`, 1);
    const [ra, rc] = await Promise.all([claim(a), claim(c)]);
    await held.released;
    expect([ra.data, rc.data].filter((x) => x === true)).toHaveLength(1);
    const won = ra.data === true ? a : c;
    const [s1, s2] = await Promise.all([settle(won), settle(won)]);
    expect([s1.data, s2.data].filter((x) => x === true)).toHaveLength(1);
    expect(psql(`select count(*) from public.revgift_box_payments where box_id = '${b.boxId}' and status = 'done'`)).toBe("1");
  });

  it("INV-GB18 (실패경로): 결제 완료가 이미 있는 명세서에 결제 대기를 하나 더 확정 — 승인 중이 되지 않는다", async () => {
    const b = await paidBox([PROFILE.byeolbit]);
    psql(`update public.revgift_boxes set status = 'invoiced' where id = '${b.boxId}'`); // 상태 확인을 지나도 완료가 막는지 본다
    const extra = await startedOrder(b.boxId);
    expect((await claim(extra)).data).toBe(false);
  });

  it("INV-GB18 S18b: 명세서 발행 + 100시간(결제 기한 지남) — 결제된다. 결제 대기 25시간이 지나 닫혀도 명세서는 남아 다시 결제한다", async () => {
    const b = invoicedBox([PROFILE.byeolbit], { hoursAgo: rules.pay_due_hours + 28 });
    expect(tick().overdue).toBeGreaterThanOrEqual(1);
    expect(boxStatus(b.boxId)).toBe("overdue");
    const old = await startedOrder(b.boxId);
    psql(`update public.revgift_box_payments set created_at = now() - make_interval(hours => ${rules.pending_payment_hours + 1}) where toss_order_id = '${old}'`);
    tick();
    expect(payStatuses(b.boxId)).toBe("failed");
    const again = await startedOrder(b.boxId);
    expect((await claim(again)).data).toBe(true);
    expect((await settle(again)).data).toBe(true);
    expect(boxStatus(b.boxId)).toBe("paid");
  });

  it("INV-GB18 (실패경로): 명세서 발행 + 72시간 1분 전에는 결제 요청 그대로, 지나면 결제 기한 지남", () => {
    const b = invoicedBox([PROFILE.byeolbit], { hoursAgo: rules.pay_due_hours - 0.02 });
    tick();
    expect(boxStatus(b.boxId)).toBe("invoiced");
    psql(`update public.revgift_boxes set invoiced_at = invoiced_at - interval '2 minutes' where id = '${b.boxId}'`);
    tick();
    expect(boxStatus(b.boxId)).toBe("overdue");
  });
});

describe("INV-GB19: 명세서 발행 + 168시간 미결제 → 착불 반송, 결제 확정 시작과는 선물함 줄을 잠근 쪽 하나만", () => {
  it("INV-GB19 S19 (manual/0034 뒤): 168시간 결제 없음 → 착불 반송, 신청은 끝나고 사본 전부 삭제·지운 기록, 결제 대기는 닫힌다", async () => {
    const b = invoicedBox([PROFILE.byeolbit, PROFILE.gureumppang], { hoursAgo: rules.unpaid_return_hours + 0.05 });
    await startedOrder(b.boxId).catch(() => null); // 168시간이 지나 결제 대기도 만들지 못한다
    expect(payStatuses(b.boxId)).toBe("");
    const t = tick();
    expect(t.returning).toBe(1);
    expect(boxStatus(b.boxId)).toBe("returning");
    expect(b.apps.map(appStatus)).toEqual(["ended", "ended"]);
    expect(b.apps.map(hasCopy)).toEqual([false, false]);
    expect(psql(`select count(*) from public.revgift_box_address_events where application_id in ('${b.apps.join("','")}') and reason = 'unpaid_return'`)).toBe("2");
  });

  it("INV-GB19 (실패경로): 167시간 57분이면 그대로 결제 기한 지남, 결제도 시작된다", async () => {
    const b = invoicedBox([PROFILE.byeolbit], { hoursAgo: rules.unpaid_return_hours - 0.05 });
    tick();
    expect(boxStatus(b.boxId)).toBe("overdue");
    expect((await startPay(b.boxId)).error).toBeNull();
  });

  it("INV-GB19 (실패경로): 168시간이 지난 뒤 예약 작업 전에는 결제 대기도 만들지 못한다", async () => {
    const b = invoicedBox([PROFILE.byeolbit], { hoursAgo: rules.unpaid_return_hours + 0.05 });
    expect((await startPay(b.boxId)).error?.code).toBe("P0022");
    expect(payStatuses(b.boxId)).toBe("");
  });

  it("INV-GB19 (실패경로): 168시간이 지난 뒤 예약 작업 전에 온 결제 확정 시작 — 거부(결제 대기만 남고 승인 중이 되지 않는다)", async () => {
    const b = invoicedBox([PROFILE.byeolbit], { hoursAgo: rules.unpaid_return_hours - 1 });
    const order = await startedOrder(b.boxId);
    psql(`update public.revgift_boxes set invoiced_at = invoiced_at - interval '61 minutes' where id = '${b.boxId}'`);
    expect((await claim(order)).data).toBe(false);
    expect(payStatuses(b.boxId)).toBe("pending");
  });

  it("INV-GB19 S19c: 168시간이 지났지만 결제 「승인 중」 — 그대로 둔다(결과가 정해진 뒤 다시 본다)", async () => {
    const b = invoicedBox([PROFILE.byeolbit], { hoursAgo: rules.unpaid_return_hours - 1 });
    const order = await startedOrder(b.boxId);
    expect((await claim(order)).data).toBe(true);
    psql(`update public.revgift_boxes set invoiced_at = invoiced_at - interval '2 hours' where id = '${b.boxId}'`);
    tick();
    expect(boxStatus(b.boxId)).toBe("overdue");
    expect(hasCopy(b.apps[0]!)).toBe(true);
    // 승인이 끝나면 결제 완료로 반영된다 — 결제 시작이 먼저였으므로 반송하지 않는다
    expect((await settle(order)).data).toBe(true);
    expect(boxStatus(b.boxId)).toBe("paid");
  });

  it("INV-GB19 S19b (동시, manual/0034 뒤): 반송 전환이 선물함 줄을 먼저 잠그면 그 뒤의 결제 확정 시작은 거부된다", async () => {
    const b = invoicedBox([PROFILE.byeolbit], { hoursAgo: rules.unpaid_return_hours - 1 });
    const order = await startedOrder(b.boxId);
    psql(`update public.revgift_boxes set invoiced_at = invoiced_at - interval '61 minutes' where id = '${b.boxId}'`);
    // 예약 작업이 잠근 채로 있는 동안 결제 확정 시작이 들어와 잠금을 기다린다
    const held = await holdRowLock(`select public.revgift_box_tick()`, 1);
    const claimed = claim(order);
    await held.released;
    expect((await claimed).data).toBe(false);
    expect(boxStatus(b.boxId)).toBe("returning");
    expect(payStatuses(b.boxId)).toBe("failed");
  });

  it("INV-GB19 S19b (동시): 결제 확정 시작이 선물함 줄을 먼저 잠그면 반송하지 않는다", async () => {
    const b = invoicedBox([PROFILE.byeolbit], { hoursAgo: rules.unpaid_return_hours - 1 });
    const order = await startedOrder(b.boxId);
    expect((await claim(order)).data).toBe(true);
    psql(`update public.revgift_boxes set invoiced_at = invoiced_at - interval '61 minutes' where id = '${b.boxId}'`);
    tick();
    expect(boxStatus(b.boxId)).toBe("overdue");
  });

  it("INV-GB19 Q16: 사무실 반송 목록에 큰 상자 원 송장번호가 나오고, 반송 송장번호를 넣으면 반송됨(끝)", async () => {
    const b = invoicedBox([PROFILE.byeolbit]);
    const orig = waybill();
    psql(`insert into public.revgift_box_cartons (box_id, cod_fee_krw, waybill_no) values ('${b.boxId}', 0, '${orig}')`);
    psql(`update public.revgift_boxes set status = 'returning', returning_at = now() where id = '${b.boxId}'`);
    const list = await staff.rpc("office_gift_box_returns");
    const row = (list.data as { id: string; carton_waybills: string[] }[]).find((x) => x.id === b.boxId);
    expect(row?.carton_waybills).toEqual([orig]);
    expect((await haru.rpc("office_gift_box_returns")).error?.code).toBe("42501");
    expect((await staff.rpc("office_gift_box_confirm_return", { p_box_id: b.boxId, p_waybill: "12" })).error?.code).toBe("22023");
    const ret = waybill();
    expect((await staff.rpc("office_gift_box_confirm_return", { p_box_id: b.boxId, p_waybill: ret })).error).toBeNull();
    expect(boxStatus(b.boxId)).toBe("returned");
    expect(psql(`select ended_at is not null from public.revgift_boxes where id = '${b.boxId}'`)).toBe("t");
    expect((await staff.rpc("office_gift_box_confirm_return", { p_box_id: b.boxId, p_waybill: ret })).error?.code).toBe("P0022");
  });
});

describe("INV-GB15 Q15: 300원 줄 건수 — 결제 없이 반송된 명세서·환불된 줄은 그 달 안이면 돌려준다", () => {
  const isEarly = () => psql(`select public.early_creator_active('${HARU_CREATOR}', now())`) === "t";

  it("INV-GB15 (manual/0034 뒤): 미결제 반송 — 그 명세서의 300원 줄 수만큼 그 달 사용이 줄어든다", () => {
    if (!isEarly()) throw new Error("하루가 지금 초기 크리에이터가 아니다 — 시드를 확인한다");
    const before = usage();
    const b = invoicedBox([PROFILE.byeolbit, PROFILE.gureumppang], { hoursAgo: rules.unpaid_return_hours + 0.05 });
    expect(usage()).toBe(before + 2);
    tick();
    expect(boxStatus(b.boxId)).toBe("returning");
    expect(usage()).toBe(before);
    // 두 번 돌려도 한 번만 돌려준다
    psql(`select public.revgift_box_give_back_early(array(select id from public.revgift_box_invoice_lines where invoice_id = '${b.invoiceId}'))`);
    expect(usage()).toBe(before);
  });

  it("INV-GB15 (실패경로): 지난달에 센 줄은 이번 달에 반송돼도 돌려주지 않는다", () => {
    const b = invoicedBox([PROFILE.byeolbit]);
    const before = usage();
    psql(`update public.revgift_box_invoices set created_at = now() - interval '40 days' where id = '${b.invoiceId}'`);
    expect(psql(`select public.revgift_box_give_back_early(array(select id from public.revgift_box_invoice_lines where invoice_id = '${b.invoiceId}'))`)).toBe("0");
    expect(usage()).toBe(before);
  });

  it("INV-GB15 (실패경로): 700원 줄(초기 크리에이터 요금이 아닌 줄)은 돌려줄 건수가 없다", () => {
    const b = invoicedBox([PROFILE.byeolbit], { early: false });
    expect(psql(`select early_rate from public.revgift_box_invoice_lines where invoice_id = '${b.invoiceId}'`)).toBe("f");
    expect(psql(`select public.revgift_box_give_back_early(array(select id from public.revgift_box_invoice_lines where invoice_id = '${b.invoiceId}'))`)).toBe("0");
  });
});

describe("INV-GB20: 출고 — 결제된 신청에서만, 대표만, 송장 한 장마다 주소를 연다", () => {
  async function sealedPaidBox() {
    return paidBox([PROFILE.byeolbit, PROFILE.gureumppang], { envelopes: [await sealFor(PROFILE.byeolbit), await sealFor(PROFILE.gureumppang)] });
  }

  it("INV-GB20 S20 (manual/0034 뒤): 대표가 출고 스캔 — 라벨 다섯 칸이 나오고 주소 문자열은 응답 밖에 없다, 열람 기록에 「연 줄」, 송장 출력함", async () => {
    const b = await sealedPaidBox();
    const label = labelOf(b.apps[0]!);
    const r = await print({ qr: label, accessToken: await tokenOf("fankkuk_admin") });
    expect(r).toEqual({ kind: "printed", waybill: null, reprint: false, label: { ...LABEL } });
    expect(logRows(b.apps[0]!)).toBe("opened:1");
    expect(psql(`select printed_at is not null from public.revgift_box_applications where id = '${b.apps[0]}'`)).toBe("t");
  });

  it("INV-GB20 S20b (실패경로): 직원 계정이 출력 — 「대표 아님」 거부 줄, 송장 출력 전 그대로", async () => {
    const b = await sealedPaidBox();
    const r = await print({ qr: labelOf(b.apps[0]!), accessToken: await tokenOf("fankkuk_staff") });
    expect(r).toEqual({ kind: "denied", reason: "not_owner" });
    expect(logRows(b.apps[0]!)).toBe("denied:not_owner");
    expect(psql(`select printed_at is null from public.revgift_box_applications where id = '${b.apps[0]}'`)).toBe("t");
  });

  it("INV-GB20 S20b (실패경로, manual/0034 뒤): 결제 요청(invoiced) 선물함 — 출력 거부, 거부 줄", async () => {
    const b = invoicedBox([PROFILE.byeolbit], { envelopes: [await sealFor(PROFILE.byeolbit)] });
    const r = await print({ qr: labelOf(b.apps[0]!), accessToken: await tokenOf("fankkuk_admin") });
    expect(r).toEqual({ kind: "denied", reason: "order_not_printable" });
    expect(logRows(b.apps[0]!)).toBe("denied:order_not_printable");
  });

  it("INV-GB20 S20b (실패경로, manual/0034 뒤): 별빛 사본을 구름빵 신청에 옮겨 둠 — 봉인 속 계정이 달라 거부, 연 줄은 돌려받는다", async () => {
    const b = await paidBox([PROFILE.byeolbit, PROFILE.gureumppang], { envelopes: [await sealFor(PROFILE.byeolbit), await sealFor(PROFILE.byeolbit)] });
    const r = await print({ qr: labelOf(b.apps[1]!), accessToken: await tokenOf("fankkuk_admin") });
    expect(r).toEqual({ kind: "denied", reason: "order_mismatch" });
    expect(logRows(b.apps[1]!)).toBe("opened:1,denied:order_mismatch");
    expect(psql(`select count(*) from public.revgift_box_decrypt_releases where application_id = '${b.apps[1]}'`)).toBe("1");
  });

  it("INV-GB20 (manual/0034 뒤): 한 신청에 3회까지 — 다시 출력은 처음 번호, 넷째는 횟수 다 씀", async () => {
    const b = await sealedPaidBox();
    const label = labelOf(b.apps[0]!);
    const token = await tokenOf("fankkuk_admin");
    for (let i = 1; i <= rules.print_max; i++) {
      const r = await print({ qr: label, accessToken: token });
      expect(r.kind).toBe("printed");
      if (r.kind === "printed") expect(r.reprint).toBe(i > 1);
    }
    expect(await print({ qr: label, accessToken: token })).toEqual({ kind: "denied", reason: "decrypt_limit_reached" });
  });

  it("INV-GB20 · INV-GB17 (manual/0034 뒤): 연 우편번호가 제주인데 명세서 줄은 「할증 없음」 — 출력은 되고 「할증 지역 불일치」만 남는다", async () => {
    const b = await paidBox([PROFILE.byeolbit], { envelopes: [await sealFor(PROFILE.byeolbit, "63100")] });
    const r = await print({ qr: labelOf(b.apps[0]!), accessToken: await tokenOf("fankkuk_admin") });
    expect(r.kind).toBe("printed");
    expect(psql(`select region_mismatch from public.revgift_box_applications where id = '${b.apps[0]}'`)).toBe("t");
  });

  it("INV-GB20 (실패경로): 송장 출력 전에는 번호가 있어도 출고 확정되지 않는다(주소를 연 송장만 나간다)", async () => {
    const b = await paidBox([PROFILE.byeolbit]);
    const no = waybill();
    psql(`update public.revgift_box_applications set outbound_waybill_no = '${no}' where id = '${b.apps[0]}'`);
    expect((await staff.rpc("office_gift_box_confirm_shipment", { p_label: labelOf(b.apps[0]!), p_waybill: no })).error?.code).toBe("55000");
    expect(appStatus(b.apps[0]!)).toBe("paid");
  });

  it("INV-GB20 · INV-P21 ③: 운송장 번호는 대표만 넣고(직원은 거부 줄), 넣어야 출고 확정 — 다른 번호는 거부, 마지막 줄이면 선물함 끝", async () => {
    const b = await paidBox([PROFILE.byeolbit]);
    const label = labelOf(b.apps[0]!);
    const no = waybill();
    expect((await staff.rpc("office_gift_box_confirm_shipment", { p_label: label, p_waybill: no })).error?.code).toBe("55000"); // 송장 출력 전
    psql(`update public.revgift_box_applications set printed_at = now() where id = '${b.apps[0]}'`);
    expect((await staff.rpc("office_gift_box_set_waybill", { p_label: label, p_waybill: no })).data).toBe("denied");
    expect(logRows(b.apps[0]!)).toBe("denied:not_owner");
    expect((await staff.rpc("office_gift_box_confirm_shipment", { p_label: label, p_waybill: no })).error?.code).toBe("55000"); // 번호 없음
    expect((await owner.rpc("office_gift_box_set_waybill", { p_label: label, p_waybill: no })).data).toBe("saved");
    expect((await owner.rpc("office_gift_box_set_waybill", { p_label: label, p_waybill: waybill() })).error?.code).toBe("55000"); // 한 번만
    expect((await staff.rpc("office_gift_box_confirm_shipment", { p_label: label, p_waybill: waybill() })).error?.code).toBe("P0043");
    expect((await staff.rpc("office_gift_box_confirm_shipment", { p_label: label, p_waybill: no })).error).toBeNull();
    expect(appStatus(b.apps[0]!)).toBe("shipped");
    expect(boxStatus(b.boxId)).toBe("done");
    expect((await haru.rpc("office_gift_box_confirm_shipment", { p_label: label, p_waybill: no })).error?.code).toBe("42501");
  });

  it("INV-GB20 S20c (manual/0034 뒤): 출고 확정 + 72시간 — 사본 삭제·지운 기록 한 줄, 이후 출력 거부. 71시간 59분이면 그대로", async () => {
    const b = await paidBox([PROFILE.byeolbit], { envelopes: [await sealFor(PROFILE.byeolbit)] });
    const label = labelOf(b.apps[0]!);
    expect((await print({ qr: label, accessToken: await tokenOf("fankkuk_admin") })).kind).toBe("printed");
    const no = waybill();
    expect((await owner.rpc("office_gift_box_set_waybill", { p_label: label, p_waybill: no })).data).toBe("saved");
    expect((await staff.rpc("office_gift_box_confirm_shipment", { p_label: label, p_waybill: no })).error).toBeNull();
    psql(`update public.revgift_box_applications set shipped_at = now() - make_interval(hours => ${rules.copy_after_ship_hours}) + interval '1 minute' where id = '${b.apps[0]}'`);
    tick();
    expect(hasCopy(b.apps[0]!)).toBe(true);
    // 출고 뒤 재출력은 72시간 안에만(이미 한 번 연 신청)
    expect((await print({ qr: label, accessToken: await tokenOf("fankkuk_admin") })).kind).toBe("printed");
    psql(`update public.revgift_box_applications set shipped_at = shipped_at - interval '2 minutes' where id = '${b.apps[0]}'`);
    tick();
    expect(hasCopy(b.apps[0]!)).toBe(false);
    expect(psql(`select count(*) from public.revgift_box_address_events where application_id = '${b.apps[0]}' and reason = 'shipped'`)).toBe("1");
    tick();
    expect(psql(`select count(*) from public.revgift_box_address_events where application_id = '${b.apps[0]}' and reason = 'shipped'`)).toBe("1");
    expect(await print({ qr: label, accessToken: await tokenOf("fankkuk_admin") })).toEqual({ kind: "denied", reason: "no_valid_approval" });
  });

  it("INV-GB9: 사무실 출고 불러오기 — 닉네임·상태·출력 여부만, 주소·실명·전화 칸이 없다. 크리에이터는 부르지 못한다", async () => {
    const b = await paidBox([PROFILE.byeolbit]);
    const r = await staff.rpc("office_gift_box_outbound_lookup", { p_label: labelOf(b.apps[0]!) });
    expect(Object.keys(r.data as object).sort()).toEqual(["box_name", "box_status", "label", "nickname", "printed", "region_mismatch", "shipped", "status", "tier", "waybill"]);
    expect((await haru.rpc("office_gift_box_outbound_lookup", { p_label: labelOf(b.apps[0]!) })).error?.code).toBe("42501");
  });
});

describe("INV-GB21: 줄 환불 — 금액은 서버가 줄 상태로, 결제 뒤 출고 전에 끝난 줄만, 한 번만, 합계는 결제 금액 이하", () => {
  it("INV-GB21 S21 (동시): 결제 뒤 출고 전 팬 탈퇴로 끝난 별빛 줄 — 환불 잡기 둘이 동시에 와도 하나만, 금액은 그 줄의 택배비·서비스료·할증 합", async () => {
    const b = await paidBox([PROFILE.byeolbit, PROFILE.gureumppang], { regions: ["jeju", "none"] });
    psql(`select public.revgift_box_end_for_withdrawal('${PROFILE.byeolbit}')`);
    expect(appStatus(b.apps[0]!)).toBe("ended");
    const line = lineOf(b.apps[0]!);
    const lineAmount = Number(psql(`select shipping_fee_krw + surcharge_krw + service_fee_krw from public.revgift_box_invoice_lines where id = '${line}'`));
    const held = await holdRowLock(`select 1 from public.revgift_box_payments where box_id = '${b.boxId}' and status = 'done' for update`, 1);
    const [r1, r2] = await Promise.all([owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: line }), owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: line })]);
    await held.released;
    const ok = [r1, r2].filter((r) => !r.error);
    expect(ok).toHaveLength(1);
    expect([r1, r2].find((r) => r.error)?.error?.code).toBe("P0024");
    expect((ok[0]!.data as { amount_krw: number }[])[0]!.amount_krw).toBe(lineAmount);
    expect(psql(`select count(*) from public.refunds where box_line_id = '${line}'`)).toBe("1");
  });

  it("INV-GB21 · INV-GB1: 환불이 끝나면 300원 건수를 돌려주고, 남은 줄이 출고됐으면 선물함이 끝난다", async () => {
    const b = await paidBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    psql(`select public.revgift_box_end_for_withdrawal('${PROFILE.byeolbit}')`);
    const line = lineOf(b.apps[0]!);
    psql(`update public.revgift_box_applications set status = 'shipped', printed_at = now(), outbound_waybill_no = '${waybill()}', shipped_at = now() where id = '${b.apps[1]}'`);
    psql(`select public.revgift_box_try_done('${b.boxId}')`);
    expect(boxStatus(b.boxId)).toBe("paid"); // 환불이 아직
    const before = usage();
    const claimed = await owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: line });
    const refundId = (claimed.data as { refund_id: string }[])[0]!.refund_id;
    expect((await admin.rpc("settle_refund", { p_refund_id: refundId, p_ok: true, p_error: null })).data).toBe(true);
    expect(boxStatus(b.boxId)).toBe("done");
    expect(usage()).toBe(before - (psql(`select early_rate from public.revgift_box_invoice_lines where id = '${line}'`) === "t" ? 1 : 0));
  });

  it("INV-GB21 S21b (실패경로): 출고된 줄 — 환불 거부. 결제 전 줄 — 거부. 직원 — 거부", async () => {
    const b = await paidBox([PROFILE.byeolbit]);
    psql(`update public.revgift_box_applications set status = 'shipped', printed_at = now(), outbound_waybill_no = '${waybill()}', shipped_at = now() where id = '${b.apps[0]}'`);
    expect((await owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: lineOf(b.apps[0]!) })).error?.code).toBe("P0022");
    const unpaid = invoicedBox([PROFILE.gureumppang]);
    psql(`update public.revgift_box_applications set status = 'ended' where id = '${unpaid.apps[0]}'`);
    expect((await owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: lineOf(unpaid.apps[0]!) })).error?.code).toBe("P0022");
    expect((await staff.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: lineOf(b.apps[0]!) })).error?.code).toBe("42501");
  });

  it("INV-GB21 S21b (실패경로): 결제 금액보다 많은 환불 기록은 표가 거부한다(줄 금액 초과·합계 초과)", async () => {
    const b = await paidBox([PROFILE.byeolbit]);
    const line = lineOf(b.apps[0]!);
    const amount = Number(psql(`select amount_krw from public.revgift_box_invoice_lines where id = '${line}'`));
    expect(psqlError(`insert into public.refunds (box_line_id, amount_krw, requested_by) values ('${line}', ${amount + 1}, '${OWNER_ID}')`)).toMatch(/줄 금액보다/);
    expect(psqlError(`insert into public.refunds (box_line_id, amount_krw, requested_by) values ('${line}', ${amount}, '${OWNER_ID}')`)).toBeNull();
    expect(psqlError(`insert into public.refunds (box_line_id, amount_krw, requested_by) values ('${line}', 1, '${OWNER_ID}')`)).toMatch(/환불 합계|duplicate|unique/i);
  });

  it("INV-GB21 ② (실패경로): 결제됨인 줄(끝나지 않음)은 환불 대상이 아니다 · 결제 전에 끝난 줄은 환불 금액이 없다", async () => {
    const b = await paidBox([PROFILE.byeolbit]);
    expect(psql(`select public.revgift_box_line_refund_due('${lineOf(b.apps[0]!)}') is null`)).toBe("t");
    expect((await owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: lineOf(b.apps[0]!) })).error?.code).toBe("P0022");
    const unpaid = invoicedBox([PROFILE.gureumppang]);
    psql(`update public.revgift_box_applications set status = 'ended' where id = '${unpaid.apps[0]}'`);
    expect(psql(`select public.revgift_box_line_refund_due('${lineOf(unpaid.apps[0]!)}') is null`)).toBe("t");
  });

  it("INV-GB21 (동시): 같은 명세서의 다른 두 줄 환불이 동시에 — 결제사에 부분 취소 둘을 동시에 보내지 않는다(하나는 처리 중으로 거부)", async () => {
    const b = await paidBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    psql(`update public.revgift_box_applications set status = 'ended' where box_id = '${b.boxId}'`);
    const [l1, l2] = [lineOf(b.apps[0]!), lineOf(b.apps[1]!)];
    const held = await holdRowLock(`select 1 from public.revgift_box_payments where box_id = '${b.boxId}' and status = 'done' for update`, 1);
    const [r1, r2] = await Promise.all([owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: l1 }), owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: l2 })]);
    await held.released;
    expect([r1.error?.code ?? "ok", r2.error?.code ?? "ok"].sort()).toEqual(["P0024", "ok"]);
  });

  it("INV-GB21: 관리자 결제·환불 내역에 줄마다 한 줄 — 환불 대상이면 「환불할 금액」이 줄 금액, 아니면 대상 아님", async () => {
    const b = await paidBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    psql(`select public.revgift_box_end_for_withdrawal('${PROFILE.byeolbit}')`);
    const rows = (await owner.rpc("admin_payment_rows")).data as { unit_kind: string; unit_id: string; refund_status: string; refund_krw: number | null; amount_krw: number }[];
    const mine = rows.filter((r) => r.unit_kind === "revgift_box" && [lineOf(b.apps[0]!), lineOf(b.apps[1]!)].includes(r.unit_id));
    expect(mine).toHaveLength(2);
    const ended = mine.find((r) => r.unit_id === lineOf(b.apps[0]!))!;
    expect([ended.refund_status, ended.refund_krw]).toEqual(["due", ended.amount_krw]);
    expect(mine.find((r) => r.unit_id === lineOf(b.apps[1]!))!.refund_status).toBe("none");
  });
});

describe("탈퇴 (my-account INV-A15 · revgift-box Q17) — 크리에이터는 끝나지 않은 선물함이 있으면 막히고, 팬은 신청이 같은 처리에서 끝난다", () => {
  // 판정은 다른 진행 중 일이 없는 계정으로 본다 — 시드 계정(하루·별빛)은 시드 주문이 있어 늘 「진행 중」이다
  it("INV-A15 (실패경로): 끝나지 않은 선물함(결제 요청)을 가진 크리에이터 — 진행 중으로 본다. 끝나면(반송됨) 막지 않는다", () => {
    const ownerId = ghostProfile("creator");
    const b = invoicedBox([PROFILE.byeolbit]);
    psql(`update public.revgift_boxes set owner_id = '${ownerId}' where id = '${b.boxId}'`);
    const open = () => psql(`select public.account_has_open_work('${ownerId}', null)`);
    expect(open()).toBe("t");
    psql(`update public.revgift_boxes set status = 'returning' where id = '${b.boxId}'`);
    psql(`update public.revgift_boxes set status = 'returned', return_waybill_no = '${waybill()}' where id = '${b.boxId}'`);
    expect(open()).toBe("f");
  });

  it("INV-A15 S15d (실패경로): 끝난 선물함이어도 환불이 끝나지 않은 줄이 있으면 진행 중, 환불이 끝나면 막지 않는다", async () => {
    const ownerId = ghostProfile("creator");
    const fan = ghostProfile();
    const b = await paidBox([fan]);
    psql(`update public.revgift_boxes set owner_id = '${ownerId}' where id = '${b.boxId}'`);
    psql(`select public.revgift_box_end_for_withdrawal('${fan}')`);
    psql(`update public.revgift_boxes set status = 'done' where id = '${b.boxId}'`); // 끝 상태로 두고 환불 판정만 본다
    const open = () => psql(`select public.account_has_open_work('${ownerId}', null)`);
    expect(open()).toBe("t");
    const claimed = await owner.rpc("admin_claim_refund", { p_kind: "revgift_box", p_unit_id: lineOf(b.apps[0]!) });
    const refundId = (claimed.data as { refund_id: string }[])[0]!.refund_id;
    await admin.rpc("settle_refund", { p_refund_id: refundId, p_ok: true, p_error: null });
    expect(open()).toBe("f");
  });

  it("Q17: 팬 신청은 탈퇴를 막지 않는다 — 신청 받는 중이면 신청 취소와 같고(자리가 빈다), 결제된 줄은 끝나 환불 대상이 된다", async () => {
    const fan = ghostProfile();
    const openBox = psql(
      `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${PROFILE.haru}', '${HARU_CREATOR}', '시험 선물함', 1, true, 'open') returning id`,
    ).split("\n")[0]!;
    const applied = psql(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${openBox}', '${fan}', 'applied') returning id`).split("\n")[0]!;
    const b = await paidBox([fan, PROFILE.gureumppang]);
    expect(psql(`select public.account_has_open_work('${fan}', null)`)).toBe("f");
    expect(psql(`select public.revgift_box_end_for_withdrawal('${fan}')`)).toBe("2");
    expect(appStatus(applied)).toBe("withdrawn");
    expect(appStatus(b.apps[0]!)).toBe("ended");
    expect(appStatus(b.apps[1]!)).toBe("paid");
    expect(psql(`select public.revgift_box_line_refund_due('${lineOf(b.apps[0]!)}') is not null`)).toBe("t");
  });

  it("Q17: 탈퇴 처리(withdraw_account)가 같은 처리에서 그 팬의 신청을 끝낸다 — 결제된 줄은 끝나고, 신청 칸은 가명으로 바뀐다", async () => {
    const acc = await createTestAccount({ tag: "gbw", phone: null });
    const b = await paidBox([acc.userId, PROFILE.gureumppang]);
    const r = await owner.rpc("withdraw_account", { p_login_id: acc.loginId });
    expect(r.error).toBeNull();
    const pseudonym = (r.data as { pseudonym: string }).pseudonym;
    expect(appStatus(b.apps[0]!)).toBe("ended");
    expect(psql(`select fan_id from public.revgift_box_applications where id = '${b.apps[0]}'`)).toBe(pseudonym);
    expect(hasCopy(b.apps[0]!)).toBe(false);
    expect(appStatus(b.apps[1]!)).toBe("paid");
  });

  it("my-account INV-A16: 끝난 지 5년 넘은 선물함 — 팬만 탈퇴했으면 남기고 그 팬들을 같이 쓰는 표시 하나로(여럿이어도), 크리에이터·팬 모두 탈퇴면 지운다", () => {
    const mk = (owner: string) =>
      psql(
        `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${owner}', '${HARU_CREATOR}', '시험 선물함', 3, true, 'cancelled') returning id`,
      ).split("\n")[0]!;
    // 가명 계정 둘(탈퇴한 팬)과 탈퇴한 크리에이터 계정 하나
    const ghosts = [0, 1, 2].map(() =>
      psql(`insert into public.profiles (id, login_id, nickname, role, withdrawn_at) values (gen_random_uuid(), 'withdrawn_it' || substr(md5(random()::text), 1, 10), '탈퇴한 회원', 'fan', now()) returning id`).split("\n")[0]!,
    );
    const keep = mk(PROFILE.haru);
    psql(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${keep}', '${ghosts[0]}', 'ended'), ('${keep}', '${ghosts[1]}', 'ended'), ('${keep}', '${PROFILE.byeolbit}', 'ended')`);
    const gone = mk(ghosts[2]!);
    psql(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${gone}', '${ghosts[0]}', 'ended')`);
    psql(`update public.revgift_boxes set ended_at = now() - interval '5 years 1 day' where id in ('${keep}', '${gone}')`);
    psql("select public.retention_purge()");
    expect(psql(`select string_agg(fan_id::text, ',' order by fan_id) from public.revgift_box_applications where box_id = '${keep}'`)).toBe(
      [PROFILE.byeolbit, SHARED_FAN, SHARED_FAN].sort().join(","),
    );
    expect(psql(`select count(*) from public.revgift_boxes where id = '${gone}'`)).toBe("0");
  });

  it("my-account INV-A16 (실패경로): 5년이 안 된 선물함은 탈퇴한 팬이 있어도 그대로", () => {
    const ghost = psql(`insert into public.profiles (id, login_id, nickname, role, withdrawn_at) values (gen_random_uuid(), 'withdrawn_it' || substr(md5(random()::text), 1, 10), '탈퇴한 회원', 'fan', now()) returning id`).split("\n")[0]!;
    const box = psql(
      `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${PROFILE.haru}', '${HARU_CREATOR}', '시험 선물함', 3, true, 'cancelled') returning id`,
    ).split("\n")[0]!;
    psql(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${box}', '${ghost}', 'ended')`);
    psql(`update public.revgift_boxes set ended_at = now() - interval '5 years' + interval '1 day' where id = '${box}'`);
    psql("select public.retention_purge()");
    expect(psql(`select fan_id from public.revgift_box_applications where box_id = '${box}'`)).toBe(ghost);
  });
});

describe("INV-GB1: 상태를 직접 고르는 길은 없다", () => {
  it("INV-GB1 S1b (실패경로): 크리에이터·직원 키로 선물함·결제 표를 직접 고칠 수 없다, 결제 확정 시작·결과 기록 함수도 부르지 못한다", async () => {
    const b = invoicedBox([PROFILE.byeolbit]);
    const upd = await haru.from("revgift_boxes").update({ status: "paid" }).eq("id", b.boxId).select();
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    expect(boxStatus(b.boxId)).toBe("invoiced");
    const order = await startedOrder(b.boxId);
    expect((await haru.rpc("claim_revgift_box_payment", { p_toss_order_id: order })).error).not.toBeNull();
    expect((await haru.rpc("settle_revgift_box_payment", { p_toss_order_id: order, p_status: "done", p_payment_key: "x" })).error).not.toBeNull();
    expect((await staff.rpc("settle_revgift_box_payment", { p_toss_order_id: order, p_status: "done", p_payment_key: "x" })).error).not.toBeNull();
    expect(boxStatus(b.boxId)).toBe("invoiced");
    void STAFF_ID;
    void manual0034;
  });
});
