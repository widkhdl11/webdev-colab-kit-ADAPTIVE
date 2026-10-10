import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { SenderRefusedError } from "@/entities/payment/api/payment-store";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { computeCharge } from "@/entities/payment/model/charge";
import { adminClient, anonClient, followForTest, holdRowLock, payTestOrder, psql, SEED, signedInClient } from "./helpers";
import { approveRpc } from "./helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";

// 크리에이터 받는 양 조절 (docs/specs/creator-receiving.md INV-B1~B9, S1~S9c) 중 DB 가 지키는 것.
// D-day 계산(INV-B8 S8·S8b)은 화면 쪽 계산 함수라 src 단위 시험(entities/creator/model/receiving.test.ts)에 있다.
// 시드 크리에이터의 설정을 바꾸지 않으려고 본인 확인 시험 계정(cvt_*)을 받는 크리에이터로 쓴다 — 시험 동안만 확인된 상태로 둔다.
// 보내는 팬은 시드 팬 별빛·달토끼. 시험 주문은 「시험 선물」 이름이라 resetCv → deleteTestOrders 가 지운다.

const A = CV.haru; // 크리에이터 A
const B = CV.summer; // 크리에이터 B
const FAN_X = { id: SEED.fanId, login: "byeolbit_fan" }; // 별빛
const FAN_Y = { id: SEED.otherFanId, login: "daltokki_fan" }; // 달토끼
const IDS = [A, B].map((c) => `'${c.creatorId}'`).join(", ");

function verify(creatorId: string, slug: string): void {
  psql(
    `begin; set local session_replication_role = replica; update public.creators set identity_verified = true, searchable = true, channel = 'https://www.youtube.com/@${slug}' where id = '${creatorId}'; commit;`,
  );
}

/** 받는 양 칸을 처음(받는 중·한도 꺼짐·생일 없음·기념일 없음)으로 — 칸·표가 아직 없을 때(구현 전 빨간불)도 멈추지 않게. */
function resetReceiving(): void {
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      "do $$ begin",
      `if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'resume_on') then
         execute $q$update public.creators set resume_on = null, monthly_fan_limit = null, birthday_month = null, birthday_day = null where id in (${IDS})$q$;
       end if;`,
      `if to_regclass('public.creator_anniversaries') is not null then execute $q$delete from public.creator_anniversaries where creator_id in (${IDS})$q$; end if;`,
      "end $$;",
      "commit;",
    ].join(" "),
  );
}

/** 한국 시간 오늘에서 offset 일 뒤의 날짜(YYYY-MM-DD). */
function kstDate(offset: number): string {
  return psql(`select to_char((now() at time zone 'Asia/Seoul')::date + ${offset}, 'YYYY-MM-DD')`);
}

/** 한국 시간 오늘에서 offset 일 뒤의 월·일. */
function kstMonthDay(offset: number): { month: number; day: number } {
  const [m, d] = psql(`select to_char((now() at time zone 'Asia/Seoul')::date + ${offset}, 'FMMM|FMDD')`).split("|");
  return { month: Number(m), day: Number(d) };
}

/** 크리에이터 줄의 받는 양 칸: 다시 받는 날|한도|생일 월|생일 일. 빈 칸은 빈 문자열. */
function receivingOf(creatorId: string): string {
  return psql(
    `select coalesce(resume_on::text, '') || '|' || coalesce(monthly_fan_limit::text, '') || '|' || coalesce(birthday_month::text, '') || '|' || coalesce(birthday_day::text, '') from public.creators where id = '${creatorId}'`,
  );
}

function anniversariesOf(creatorId: string): string {
  return psql(
    `select coalesce(string_agg(name || ':' || month || '/' || day, ',' order by position), '') from public.creator_anniversaries where creator_id = '${creatorId}'`,
  );
}

const clients = new Map<string, SupabaseClient>();
async function client(login: string): Promise<SupabaseClient> {
  const hit = clients.get(login);
  if (hit) return hit;
  const c = await signedInClient(login);
  clients.set(login, c);
  return c;
}

async function saveReceiving(login: string, args: Record<string, unknown>) {
  return (await client(login)).rpc("update_my_creator_receiving", args);
}

async function saveDays(login: string, args: Record<string, unknown>) {
  return (await client(login)).rpc("update_my_creator_days", args);
}

const restingArgs = (resumeOn: string | null) => ({ p_resting: true, p_resume_on: resumeOn, p_monthly_limit: null });

let seq = 0;
function uniq(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36).toUpperCase().slice(-5)}${seq}`;
}

/** 소형 상자 하나로 등록 — registerTestOrder 와 같은 인자에 기념일 표시(p_anniversary_name)를 더할 수 있다. */
async function register(fanId: string, creatorId: string, extra: Record<string, unknown> = {}) {
  followForTest(fanId, creatorId);
  const orderNo = `FC-R${uniq("").slice(0, 8)}`.slice(0, 13);
  const tossOrderId = `pay_rcv_${uniq("").toLowerCase()}`;
  const r = await adminClient().rpc("register_order", {
    p_fan_id: fanId,
    p_creator_id: creatorId,
    p_order_no: orderNo,
    p_item_kind: "시험 선물",
    p_has_electronics_or_metal: false,
    p_tiers: ["small"],
    p_toss_order_id: tossOrderId,
    p_goods_krw: 0,
    p_service_fee_krw: 1400,
    p_inspection_fee_krw: 1500,
    p_shipping_fee_krw: 4000,
    p_amount_krw: 6900,
    ...extra,
  });
  return { ...r, orderNo, tossOrderId };
}

async function registerOk(fanId: string, creatorId: string, extra: Record<string, unknown> = {}) {
  const r = await register(fanId, creatorId, extra);
  if (r.error) throw new Error(`register_order 실패: ${r.error.code} ${r.error.message}`);
  return { orderId: r.data as string, orderNo: r.orderNo, tossOrderId: r.tossOrderId };
}

function ordersOf(fanId: string, creatorId: string): number {
  return Number(psql(`select count(*) from public.orders where fan_id = '${fanId}' and creator_id = '${creatorId}' and item_kind = '시험 선물'`));
}

/** 크리에이터 본인 계정(시험 계정은 profile_id 가 계정)으로 승인 요청을 거절한다. */
async function decline(login: string, requestId: string): Promise<string> {
  const r = await (await client(login)).rpc("decline_gift", { p_request_id: requestId, p_block: false });
  if (r.error) throw new Error(`decline_gift 실패: ${r.error.code} ${r.error.message}`);
  return (r.data as { result: string }).result;
}

function setColumn(creatorId: string, set: string): void {
  psql(`begin; set local session_replication_role = replica; update public.creators set ${set} where id = '${creatorId}'; commit;`);
}

beforeAll(() => {
  createCvAccounts();
  resetCv();
  resetReceiving();
});
beforeEach(() => {
  resetCv();
  resetReceiving();
  verify(A.creatorId, "cvt-recv-a");
  verify(B.creatorId, "cvt-recv-b");
});
afterAll(() => {
  resetReceiving();
  dropCvAccounts();
});

describe("INV-B1: 받는 상태·한도·생일·기념일은 그 크리에이터 본인만 바꾼다", () => {
  it("INV-B1 S1: A 로그인으로 쉬는 중을 저장하면 A 만 쉬는 중이다", async () => {
    const tomorrow = kstDate(1);
    expect((await saveReceiving(A.login, restingArgs(tomorrow))).error).toBeNull();
    expect(receivingOf(A.creatorId)).toBe(`${tomorrow}|||`);
    expect(receivingOf(B.creatorId)).toBe("|||");
  });

  it("INV-B1 S1: 저장 함수에는 크리에이터 ID 칸이 없다 — B 의 ID·계정 ID 를 실어 보내면 거부되고 아무도 안 바뀐다", async () => {
    for (const fn of ["update_my_creator_receiving", "update_my_creator_days"]) {
      const args = psql(`select pg_get_function_identity_arguments('public.${fn}'::regproc)`);
      expect([fn, /creator|account|profile|uuid/i.test(args)]).toEqual([fn, false]);
    }
    for (const extra of [{ p_creator_id: B.creatorId }, { p_account_id: B.id }]) {
      expect((await saveReceiving(A.login, { ...restingArgs(kstDate(1)), ...extra })).error).not.toBeNull();
      expect((await saveDays(A.login, { p_birthday_month: 3, p_birthday_day: 10, p_anniversaries: [], ...extra })).error).not.toBeNull();
    }
    expect(receivingOf(A.creatorId)).toBe("|||");
    expect(receivingOf(B.creatorId)).toBe("|||");
  });

  it("INV-B1 S1b (실패경로): 팬·운영자가 부르면 42501, 로그인 안 하면 부를 수 없고, 아무것도 바뀌지 않는다", async () => {
    for (const login of [FAN_X.login, "fankkuk_staff"]) {
      expect([login, (await saveReceiving(login, restingArgs(kstDate(1)))).error?.code]).toEqual([login, "42501"]);
      expect([login, (await saveDays(login, { p_birthday_month: 3, p_birthday_day: 10, p_anniversaries: [] })).error?.code]).toEqual([login, "42501"]);
    }
    expect((await anonClient().rpc("update_my_creator_receiving", restingArgs(kstDate(1)))).error).not.toBeNull();
    expect((await anonClient().rpc("update_my_creator_days", { p_birthday_month: 3, p_birthday_day: 10, p_anniversaries: [] })).error).not.toBeNull();
    expect(receivingOf(A.creatorId)).toBe("|||");
    expect(receivingOf(B.creatorId)).toBe("|||");
  });

  it("INV-B1 S1b (실패경로): 로그인한 크리에이터는 크리에이터 표·기념일 표를 직접 고치지 못한다", async () => {
    const me = await client(A.login);
    await me.from("creators").update({ monthly_fan_limit: 1, resume_on: kstDate(3) }).eq("id", B.creatorId);
    await me.from("creators").update({ monthly_fan_limit: 1 }).eq("id", A.creatorId);
    await me.from("creator_anniversaries").insert({ creator_id: B.creatorId, position: 1, name: "광고", month: 1, day: 1 });
    expect(receivingOf(A.creatorId)).toBe("|||");
    expect(receivingOf(B.creatorId)).toBe("|||");
    expect(anniversariesOf(B.creatorId)).toBe("");
    const r = await anonClient().from("creator_anniversaries").select("*");
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
  });

  it("INV-B1: 본인은 자기 설정을 다시 읽는다(my_creator_receiving) — 다른 크리에이터 것은 오지 않는다", async () => {
    expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: 2 })).error).toBeNull();
    expect((await saveDays(A.login, { p_birthday_month: 3, p_birthday_day: 10, p_anniversaries: [{ name: "데뷔일", month: 5, day: 1 }] })).error).toBeNull();
    const mine = await (await client(A.login)).rpc("my_creator_receiving");
    expect(mine.error).toBeNull();
    expect(mine.data).toEqual([
      { resume_on: null, monthly_limit: 2, birthday_month: 3, birthday_day: 10, anniversaries: [{ name: "데뷔일", month: 5, day: 1 }] },
    ]);
    const other = await (await client(B.login)).rpc("my_creator_receiving");
    expect((other.data as { monthly_limit: number | null }[])[0]?.monthly_limit ?? null).toBeNull();
    expect(((await (await client(FAN_X.login)).rpc("my_creator_receiving")).data ?? []) as unknown[]).toEqual([]);
  });
});

describe("INV-B2: 쉬는 중인 크리에이터에게는 새 주문을 만들지 않는다", () => {
  it("INV-B2 S2 (실패경로): 다시 받는 날이 내일이면 팔로우한 팬의 등록이 「쉬는 중」(FKR01)으로 거부되고 주문이 생기지 않는다", async () => {
    expect((await saveReceiving(A.login, restingArgs(kstDate(1)))).error).toBeNull();
    const r = await register(FAN_X.id, A.creatorId);
    expect(r.error?.code).toBe("FKR01");
    expect(ordersOf(FAN_X.id, A.creatorId)).toBe(0);
  });

  it("INV-B2 S2b: 승인 대기 주문이 있는 크리에이터가 쉬는 중으로 바꿔도 승인·거절은 그대로 처리된다", async () => {
    const o1 = await registerOk(FAN_X.id, A.creatorId);
    const o2 = await registerOk(FAN_Y.id, A.creatorId);
    const req1 = await payTestOrder(o1);
    const req2 = await payTestOrder(o2);
    expect((await saveReceiving(A.login, restingArgs(kstDate(7)))).error).toBeNull();
    const ap = await approveRpc(req1);
    expect(ap.error).toBeNull();
    expect(ap.data).toBe("approved");
    expect(await decline(A.login, req2)).toBe("declined");
    expect(psql(`select status from public.orders where id = '${o2.orderId}'`)).toBe("rejected");
    expect(psql(`select approved_at is not null from public.orders where id = '${o1.orderId}'`)).toBe("t");
  });

  it("INV-B2 S2c: 다시 받는 날이 오늘이면(한국 시간 그날 0시부터) 따로 바꾸지 않아도 등록된다", async () => {
    setColumn(A.creatorId, `resume_on = '${kstDate(0)}'`);
    const r = await register(FAN_X.id, A.creatorId);
    expect(r.error).toBeNull();
    expect(ordersOf(FAN_X.id, A.creatorId)).toBe(1);
  });

  it("INV-B2: 공개 읽기(creator_receiving)는 쉬는 중일 때만 다시 받는 날을 준다 — 날짜가 지났거나 오늘이면 비어 있다", async () => {
    expect((await saveReceiving(A.login, restingArgs(kstDate(4)))).error).toBeNull();
    setColumn(B.creatorId, `resume_on = '${kstDate(0)}'`);
    const r = await anonClient().rpc("creator_receiving", { p_ids: [A.creatorId, B.creatorId] });
    expect(r.error).toBeNull();
    const rows = r.data as { id: string; resume_on: string | null }[];
    expect(rows.find((x) => x.id === A.creatorId)?.resume_on).toBe(kstDate(4));
    expect(rows.find((x) => x.id === B.creatorId)?.resume_on).toBeNull();
  });
});

describe("INV-B3: 다시 받는 날은 꼭 정하고, 내일부터 365일 안", () => {
  it("INV-B3 S3 (실패경로): 날짜 없음·오늘·어제·366일 뒤는 각각 22023 으로 거부되고 받는 중 그대로다", async () => {
    for (const d of [null, kstDate(0), kstDate(-1), kstDate(366)]) {
      expect([d, (await saveReceiving(A.login, restingArgs(d))).error?.code]).toEqual([d, "22023"]);
    }
    expect(receivingOf(A.creatorId)).toBe("|||");
  });

  it("INV-B3 S3: 내일·365일 뒤는 저장된다", async () => {
    for (const d of [kstDate(1), kstDate(365)]) {
      expect((await saveReceiving(A.login, restingArgs(d))).error).toBeNull();
      expect(receivingOf(A.creatorId)).toBe(`${d}|||`);
    }
  });

  it("INV-B3 S3b: 쉬는 중에서 받는 중으로 바꾸면 다시 받는 날이 지워진다(날짜를 실어 보내도)", async () => {
    expect((await saveReceiving(A.login, restingArgs(kstDate(3)))).error).toBeNull();
    expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: kstDate(9), p_monthly_limit: null })).error).toBeNull();
    expect(receivingOf(A.creatorId)).toBe("|||");
    expect((await register(FAN_X.id, A.creatorId)).error).toBeNull();
  });
});

describe("INV-B4: 한도에 닿은 팬은 이번 달 새 주문을 만들 수 없다", () => {
  async function setLimit(n: number | null) {
    const r = await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: n });
    if (r.error) throw new Error(`한도 저장 실패: ${r.error.code} ${r.error.message}`);
  }

  it("INV-B4 S4 (실패경로): 한도 2, 이번 달 결제 완료 1·결제 대기 1 이면 세 번째 등록이 「이번 달 한도」(FKR02)로 거부된다", async () => {
    await setLimit(2);
    const paid = await registerOk(FAN_X.id, A.creatorId);
    await payTestOrder(paid);
    await registerOk(FAN_X.id, A.creatorId); // 결제 대기
    const r = await register(FAN_X.id, A.creatorId);
    expect(r.error?.code).toBe("FKR02");
    expect(ordersOf(FAN_X.id, A.creatorId)).toBe(2);
  });

  it("INV-B4 S4b: 이번 달 주문 2개 중 1개가 거절이면 등록된다", async () => {
    await setLimit(2);
    await registerOk(FAN_X.id, A.creatorId);
    const declined = await registerOk(FAN_X.id, A.creatorId);
    expect(await decline(A.login, await payTestOrder(declined))).toBe("declined");
    expect((await register(FAN_X.id, A.creatorId)).error).toBeNull();
    expect(ordersOf(FAN_X.id, A.creatorId)).toBe(3);
  });

  it("INV-B4 S4b: 결제가 실패로 닫힌 주문과 지난달 주문은 세지 않는다", async () => {
    await setLimit(1);
    const failed = await registerOk(FAN_X.id, A.creatorId);
    const s = await adminClient().rpc("settle_payment", {
      p_toss_order_id: failed.tossOrderId,
      p_status: "failed",
      p_payment_key: null,
      p_request_id: null,
      p_payload: null,
      p_requested_at: null,
    });
    expect(s.error).toBeNull();
    const old = await registerOk(FAN_X.id, A.creatorId);
    psql(
      `begin; set local session_replication_role = replica; update public.orders set created_at = (date_trunc('month', now() at time zone 'Asia/Seoul') - interval '12 hours') at time zone 'Asia/Seoul' where id = '${old.orderId}'; commit;`,
    );
    expect((await register(FAN_X.id, A.creatorId)).error).toBeNull();
    // 이번 달에 센 것이 하나가 됐으니 다음은 막힌다 — 위 두 줄을 안 센 것이지 한도가 꺼진 것이 아니다
    expect((await register(FAN_X.id, A.creatorId)).error?.code).toBe("FKR02");
  });

  /** 그 주문의 상태·만든 시각을 시험이 정한다(트리거 없이). */
  function setOrder(orderId: string, set: string): void {
    psql(`begin; set local session_replication_role = replica; update public.orders set ${set} where id = '${orderId}'; commit;`);
  }

  it("INV-B4 S4b: 반려(7일 자동, expired)로 끝난 주문은 세지 않는다", async () => {
    await setLimit(1);
    const o = await registerOk(FAN_X.id, A.creatorId);
    setOrder(o.orderId, "status = 'expired', registered_at = now()");
    expect((await register(FAN_X.id, A.creatorId)).error).toBeNull();
    expect((await register(FAN_X.id, A.creatorId)).error?.code).toBe("FKR02");
  });

  it("INV-B4 S4b: 취소(canceled)로 끝난 주문은 세지 않는다", async () => {
    await setLimit(1);
    const o = await registerOk(FAN_X.id, A.creatorId);
    setOrder(o.orderId, "status = 'canceled', registered_at = now()");
    expect((await register(FAN_X.id, A.creatorId)).error).toBeNull();
    expect((await register(FAN_X.id, A.creatorId)).error?.code).toBe("FKR02");
  });

  const kstMonthStart = "(date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')";

  it("INV-B4: 이번 달은 한국 시간 1일 0시부터 — 그 1분 뒤 주문은 센다", async () => {
    await setLimit(1);
    const o = await registerOk(FAN_X.id, A.creatorId);
    setOrder(o.orderId, `created_at = ${kstMonthStart} + interval '1 minute'`);
    expect((await register(FAN_X.id, A.creatorId)).error?.code).toBe("FKR02");
  });

  it("INV-B4 (실패경로): 한국 시간 1일 0시 1분 전 주문은 지난달이라 세지 않는다", async () => {
    await setLimit(1);
    const o = await registerOk(FAN_X.id, A.creatorId);
    setOrder(o.orderId, `created_at = ${kstMonthStart} - interval '1 minute'`);
    expect((await register(FAN_X.id, A.creatorId)).error).toBeNull();
  });

  it("INV-B4 S4c (동시): 한도 1, 이번 달 주문 0 에서 같은 팬이 동시에 두 번 등록하면 하나만 만들어진다", async () => {
    await setLimit(1);
    followForTest(FAN_X.id, A.creatorId);
    // 크리에이터 줄을 잠가 두 등록을 그 뒤에 줄 세운다 — 풀리는 순간 둘이 확실히 겹친다
    const hold = await holdRowLock(`select 1 from public.creators where id = '${A.creatorId}' for update`, 2);
    const results = await Promise.all([register(FAN_X.id, A.creatorId), register(FAN_X.id, A.creatorId)]);
    await hold.released;
    expect(results.map((r) => r.error?.code ?? "ok").sort()).toEqual(["FKR02", "ok"]);
    expect(ordersOf(FAN_X.id, A.creatorId)).toBe(1);
  });

  it("INV-B4 S4d: 한도 1 에 팬 X 가 1개 보냈어도 다른 팬 Y 는 등록된다(한도는 팬마다)", async () => {
    await setLimit(1);
    await registerOk(FAN_X.id, A.creatorId);
    expect((await register(FAN_Y.id, A.creatorId)).error).toBeNull();
    expect((await register(FAN_X.id, A.creatorId)).error?.code).toBe("FKR02");
  });

  it("INV-B4: 한도는 크리에이터마다 — A 에 닿은 팬도 B 에게는 보낸다", async () => {
    await setLimit(1);
    await registerOk(FAN_X.id, A.creatorId);
    expect((await register(FAN_X.id, B.creatorId)).error).toBeNull();
  });
});

describe("INV-B5: 한도는 꺼짐 또는 1~10, 바꾸면 다음 등록부터", () => {
  it("INV-B5 S5 (실패경로): 0·11·-1 은 22023 으로 거부되고 한도 그대로", async () => {
    for (const n of [0, 11, -1]) {
      expect([n, (await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: n })).error?.code]).toEqual([n, "22023"]);
    }
    expect(receivingOf(A.creatorId)).toBe("|||");
  });

  it("INV-B5 S5: 1·10·꺼짐은 저장된다", async () => {
    for (const [n, want] of [[1, "1"], [10, "10"], [null, ""]] as const) {
      expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: n })).error).toBeNull();
      expect(receivingOf(A.creatorId)).toBe(`|${want}||`);
    }
  });

  it("INV-B5 S5b: 한도 3 에 이번 달 주문 3개, 한도를 1로 바꾸면 3개는 그대로 있고 다음 등록이 거부된다", async () => {
    expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: 3 })).error).toBeNull();
    const orders = [await registerOk(FAN_X.id, A.creatorId), await registerOk(FAN_X.id, A.creatorId), await registerOk(FAN_X.id, A.creatorId)];
    await payTestOrder(orders[0]);
    expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: 1 })).error).toBeNull();
    const statuses = psql(`select string_agg(status::text, ',' order by created_at) from public.orders where id in (${orders.map((o) => `'${o.orderId}'`).join(", ")})`);
    expect(statuses).toBe("registered,pending_payment,pending_payment");
    expect((await register(FAN_X.id, A.creatorId)).error?.code).toBe("FKR02");
  });
});

describe("INV-B6: 한도는 그 팬 본인에게만 보인다", () => {
  it("INV-B6 S6: 한도 켜진 크리에이터의 공개 응답(크리에이터 페이지·찾기·목록·받는 상태)에 한도 칸이 없다 — 로그인 안 한 사람·다른 팬 모두", async () => {
    expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: 2 })).error).toBeNull();
    const viewers: SupabaseClient[] = [anonClient(), await client(FAN_Y.login)];
    for (const v of viewers) {
      const calls: [string, Record<string, unknown>][] = [
        ["creator_by_id", { p_id: A.creatorId }],
        ["find_creators", {}],
        ["list_creators", {}],
        ["creator_receiving", { p_ids: [A.creatorId] }],
      ];
      for (const [fn, args] of calls) {
        const r = await v.rpc(fn, args);
        expect([fn, r.error]).toEqual([fn, null]);
        const row = (r.data as Record<string, unknown>[]).find((x) => x.id === A.creatorId);
        expect([fn, row !== undefined]).toEqual([fn, true]);
        expect([fn, Object.keys(row ?? {}).filter((k) => /limit|quota|remain|count/i.test(k))]).toEqual([fn, []]);
        expect([fn, JSON.stringify(row).includes('":2')]).toEqual([fn, false]);
      }
    }
  });

  it("INV-B6 S6b: 한도 판정 함수는 로그인한 팬 본인의 것만 — 닿은 팬 X 는 그 크리에이터가 오고, 다른 팬 Y 는 오지 않는다", async () => {
    expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: 1 })).error).toBeNull();
    await registerOk(FAN_X.id, A.creatorId);
    const x = await (await client(FAN_X.login)).rpc("my_gift_limit_reached", { p_creator_ids: [A.creatorId, B.creatorId] });
    expect(x.error).toBeNull();
    expect(x.data).toEqual([A.creatorId]);
    const y = await (await client(FAN_Y.login)).rpc("my_gift_limit_reached", { p_creator_ids: [A.creatorId, B.creatorId] });
    expect(y.error).toBeNull();
    expect(y.data).toEqual([]);
  });

  it("INV-B6 (실패경로): 한도 판정 함수에 다른 팬 ID 를 넣을 칸이 없고, 로그인 안 하면 부를 수 없다", async () => {
    expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: 1 })).error).toBeNull();
    await registerOk(FAN_X.id, A.creatorId);
    const args = psql(`select pg_get_function_identity_arguments('public.my_gift_limit_reached'::regproc)`);
    expect(args).toBe("p_creator_ids uuid[]");
    const forged = await (await client(FAN_Y.login)).rpc("my_gift_limit_reached", { p_creator_ids: [A.creatorId], p_fan_id: FAN_X.id });
    expect(forged.error).not.toBeNull();
    const anon = await anonClient().rpc("my_gift_limit_reached", { p_creator_ids: [A.creatorId] });
    expect(anon.error !== null || (anon.data as unknown[]).length === 0).toBe(true);
  });
});

describe("INV-B7: 생일은 월·일만, 기념일은 3개까지 이름 1~12자 + 월·일, 이름은 업계 기본 필터", () => {
  it("INV-B7 S7: 생일 월·일과 기념일 셋이 저장되고, 다시 저장하면 통째로 바뀐다", async () => {
    const r = await saveDays(A.login, {
      p_birthday_month: 2,
      p_birthday_day: 29,
      p_anniversaries: [
        { name: " 데뷔일 ", month: 10, day: 15 },
        { name: "열두글자이름열두글자이름", month: 1, day: 1 },
        { name: "팬카페 개설", month: 12, day: 31 },
      ],
    });
    expect(r.error).toBeNull();
    expect(receivingOf(A.creatorId)).toBe("||2|29");
    expect(anniversariesOf(A.creatorId)).toBe("데뷔일:10/15,열두글자이름열두글자이름:1/1,팬카페 개설:12/31");
    expect((await saveDays(A.login, { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [{ name: "데뷔일", month: 3, day: 3 }] })).error).toBeNull();
    expect(receivingOf(A.creatorId)).toBe("|||");
    expect(anniversariesOf(A.creatorId)).toBe("데뷔일:3/3");
  });

  it("INV-B7 S7 (실패경로): 기념일 4개·이름 13자·빈 이름·2월 30일·13월·「010-1234-5678」(13자)은 22023, 전화번호 꼴 「01012345678」은 P0082 — 각각 거부되고 그대로", async () => {
    const four = [1, 2, 3, 4].map((i) => ({ name: `기념${i}`, month: i, day: 1 }));
    const cases: [string, Record<string, unknown>, string][] = [
      ["4개", { p_birthday_month: null, p_birthday_day: null, p_anniversaries: four }, "22023"],
      ["13자", { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [{ name: "열세글자이름열세글자이름열", month: 1, day: 1 }] }, "22023"],
      ["빈 이름", { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [{ name: "  ", month: 1, day: 1 }] }, "22023"],
      // 「010-1234-5678」은 13자라 길이에서 먼저 거부된다 — 필터 자체는 12자 이하 전화번호 꼴로 따로 본다
      ["010-1234-5678", { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [{ name: "010-1234-5678", month: 1, day: 1 }] }, "22023"],
      ["전화번호", { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [{ name: "01012345678", month: 1, day: 1 }] }, "P0082"],
      ["기념일 2월 30일", { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [{ name: "데뷔일", month: 2, day: 30 }] }, "22023"],
      ["생일 2월 30일", { p_birthday_month: 2, p_birthday_day: 30, p_anniversaries: [] }, "22023"],
      ["생일 13월", { p_birthday_month: 13, p_birthday_day: 1, p_anniversaries: [] }, "22023"],
      ["생일 반쪽", { p_birthday_month: 3, p_birthday_day: null, p_anniversaries: [] }, "22023"],
    ];
    for (const [label, args, code] of cases) {
      expect([label, (await saveDays(A.login, args)).error?.code]).toEqual([label, code]);
    }
    expect(receivingOf(A.creatorId)).toBe("|||");
    expect(anniversariesOf(A.creatorId)).toBe("");
  });

  it("INV-B7 (실패경로): 이메일·인터넷 주소 꼴·기호만인 이름도 태그와 같은 필터로 거부된다", async () => {
    for (const [name, code] of [["a@b.com", "P0082"], ["www.x.kr", "P0082"], ["!!!", "P0083"]] as const) {
      expect([name, (await saveDays(A.login, { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [{ name, month: 1, day: 1 }] })).error?.code]).toEqual([name, code]);
    }
    expect(anniversariesOf(A.creatorId)).toBe("");
  });

  it("INV-B7: 저장 함수에 연도 칸이 없고, 공개 읽기에 연도가 없다", async () => {
    const args = psql(`select pg_get_function_identity_arguments('public.update_my_creator_days'::regproc)`);
    expect(args).not.toMatch(/year/i);
    expect((await saveDays(A.login, { p_birthday_month: 3, p_birthday_day: 10, p_anniversaries: [{ name: "데뷔일", month: 5, day: 1 }] })).error).toBeNull();
    const r = await anonClient().rpc("creator_receiving", { p_ids: [A.creatorId] });
    expect(r.error).toBeNull();
    const row = (r.data as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ birthday_month: 3, birthday_day: 10, anniversaries: [{ name: "데뷔일", month: 5, day: 1 }] });
    expect(JSON.stringify(row)).not.toMatch(/year/i);
  });
});

describe("INV-B9: 기념일 7일 안이면 「{기념일} 선물」 표시, 서버가 그날 다시 계산", () => {
  async function anniversaryIn(days: number, name = "데뷔일") {
    const md = kstMonthDay(days);
    const r = await saveDays(A.login, { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [{ name, ...md }] });
    if (r.error) throw new Error(`기념일 저장 실패: ${r.error.code} ${r.error.message}`);
  }
  const markOf = (orderId: string) => psql(`select coalesce(anniversary_name, '(없음)') from public.orders where id = '${orderId}'`);

  it("INV-B9 S9: 데뷔일이 5일 뒤일 때 「데뷔일 선물」을 골라 등록하면 주문에 「데뷔일」이 저장된다", async () => {
    await anniversaryIn(5);
    const o = await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: "데뷔일" });
    expect(markOf(o.orderId)).toBe("데뷔일");
  });

  it("INV-B9: D-7·D-day 는 표시가 붙는다", async () => {
    await anniversaryIn(7);
    expect(markOf((await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: "데뷔일" })).orderId)).toBe("데뷔일");
    await anniversaryIn(0);
    expect(markOf((await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: "데뷔일" })).orderId)).toBe("데뷔일");
  });

  it("INV-B9 S9b (실패경로): 데뷔일이 8일 뒤(또는 어제)면 표시를 붙여 등록해도 표시 없이 저장된다", async () => {
    await anniversaryIn(8);
    const o = await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: "데뷔일" });
    expect(markOf(o.orderId)).toBe("(없음)");
    await anniversaryIn(-1);
    expect(markOf((await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: "데뷔일" })).orderId)).toBe("(없음)");
  });

  it("INV-B9 (실패경로): 그 크리에이터에게 없는 기념일 이름·다른 크리에이터의 기념일은 표시 없이 저장된다", async () => {
    await anniversaryIn(3);
    expect(markOf((await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: "아무날" })).orderId)).toBe("(없음)");
    expect(markOf((await registerOk(FAN_X.id, B.creatorId, { p_anniversary_name: "데뷔일" })).orderId)).toBe("(없음)");
  });

  it("INV-B9: 표시를 고르지 않으면 7일 안이어도 표시 없이 저장된다", async () => {
    await anniversaryIn(2);
    expect(markOf((await registerOk(FAN_X.id, A.creatorId)).orderId)).toBe("(없음)");
  });

  it("INV-B9 (실패경로): 저장한 뒤 금칙어가 더해진 기념일 이름은 7일 안이어도 표시 없이 저장된다(공개 읽기와 같은 필터)", async () => {
    const word = "렌틸콩시험";
    await anniversaryIn(3, word);
    psql(`insert into public.creator_tag_banned_words (word) values ('${word}')`);
    try {
      expect(markOf((await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: word })).orderId)).toBe("(없음)");
    } finally {
      psql(`delete from public.creator_tag_banned_words where word = '${word}'`);
    }
    // 금칙어가 없으면 같은 이름이 붙는다 — 위 「없음」이 필터 때문임을 확인
    expect(markOf((await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: word })).orderId)).toBe(word);
  });

  it("INV-B9 S9c: 표시가 붙은 주문은 크리에이터가 그 기념일을 지워도 표시가 남는다", async () => {
    await anniversaryIn(4);
    const o = await registerOk(FAN_X.id, A.creatorId, { p_anniversary_name: "데뷔일" });
    expect((await saveDays(A.login, { p_birthday_month: null, p_birthday_day: null, p_anniversaries: [] })).error).toBeNull();
    expect(anniversariesOf(A.creatorId)).toBe("");
    expect(markOf(o.orderId)).toBe("데뷔일");
  });
});

describe("서버의 「오늘」은 한국 날짜 (INV-B2·B3·B9)", () => {
  const todayAt = (ts: string) => psql(`select public.receiving_today_at('${ts}'::timestamptz)::text`);

  it("INV-B2·B3·B9: UTC 15:30 은 한국 다음 날 0:30 — 날짜가 넘어간다, UTC 14:59 는 아직 그날", () => {
    expect(todayAt("2026-10-10T15:30:00Z")).toBe("2026-10-11");
    expect(todayAt("2026-10-10T14:59:00Z")).toBe("2026-10-10");
    expect(todayAt("2026-12-31T15:00:00Z")).toBe("2027-01-01");
    expect(todayAt("2026-02-28T15:00:00Z")).toBe("2026-03-01");
  });

  it("INV-B2·B3·B9: 저장·등록이 쓰는 오늘(receiving_today)은 세션 시간대와 상관없이 지금 시각의 한국 날짜", () => {
    // UTC-12 와 UTC+14 두 시간대면 하루 중 어느 때든 둘 중 하나는 세션 날짜가 한국 날짜와 다르다
    for (const tz of ["Etc/GMT+12", "Etc/GMT-14"]) {
      // psql 은 SET 의 결과 줄(「SET」)도 찍는다 — 마지막 줄이 비교 결과다
      const r = psql(
        `set timezone = '${tz}'; select (public.receiving_today() = public.receiving_today_at(now()) and public.receiving_today() = (now() at time zone 'Asia/Seoul')::date)::text`,
      )
        .split("\n")
        .pop();
      expect([tz, r]).toEqual([tz, "true"]);
    }
  });

  it("INV-B2: 기준 시각을 받는 내부 함수는 로그인한 사람·로그인 안 한 사람이 부를 수 없다", () => {
    for (const role of ["anon", "authenticated"]) {
      expect([role, psql(`select has_function_privilege('${role}', 'public.receiving_today_at(timestamptz)', 'execute')::text`)]).toEqual([role, "false"]);
    }
  });
});

describe("서버의 2월 29일 처리 (INV-B8·B9)", () => {
  const next = (m: number, d: number, today: string) => psql(`select public.receiving_next_date(${m}, ${d}, '${today}')::text`);

  it("INV-B8·B9: 2월 29일은 평년에 2월 28일, 윤년에 2월 29일", () => {
    expect(next(2, 29, "2027-02-28")).toBe("2027-02-28");
    expect(next(2, 29, "2027-01-10")).toBe("2027-02-28");
    expect(next(2, 29, "2027-03-01")).toBe("2028-02-29");
    expect(next(2, 29, "2028-02-28")).toBe("2028-02-29");
    expect(next(2, 29, "2100-01-01")).toBe("2100-02-28");
  });

  it("INV-B8·B9: 다른 날은 그대로 — 지났으면 다음 해", () => {
    expect(next(10, 15, "2026-10-15")).toBe("2026-10-15");
    expect(next(10, 15, "2026-10-16")).toBe("2027-10-15");
  });
});

describe("DB 거부를 앱 오류 종류로 — 실제 저장소로 등록 (INV-B2·B6)", () => {
  async function storeCreate(creatorId: string) {
    followForTest(FAN_X.id, creatorId);
    return createSupabasePaymentStore(adminClient()).create({
      orderId: `pay_rcv_store_${uniq("").toLowerCase()}`,
      orderNo: `FC-S${uniq("").slice(0, 8)}`.slice(0, 13),
      charge: computeCharge(await readTierPrices(adminClient()), { boxes: ["small"] }),
      registration: { fanId: FAN_X.id, creatorId, itemKind: "시험 선물", hasElectronicsOrMetal: false, boxes: ["small"], anniversaryName: null },
    });
  }

  it("INV-B2 (실패경로): 쉬는 중이면 SenderRefusedError(resting)", async () => {
    expect((await saveReceiving(A.login, restingArgs(kstDate(2)))).error).toBeNull();
    await expect(storeCreate(A.creatorId)).rejects.toSatisfy((e) => e instanceof SenderRefusedError && e.reason === "resting");
  });

  it("INV-B6 (실패경로): 한도에 닿았으면 SenderRefusedError(limit)", async () => {
    expect((await saveReceiving(A.login, { p_resting: false, p_resume_on: null, p_monthly_limit: 1 })).error).toBeNull();
    await registerOk(FAN_X.id, A.creatorId);
    await expect(storeCreate(A.creatorId)).rejects.toSatisfy((e) => e instanceof SenderRefusedError && e.reason === "limit");
  });
});
