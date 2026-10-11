import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestAccount, removeTestAccounts, type TestAccount } from "./account-fixtures";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { adminClient, anonClient, deleteTestOrders, followForTest, psql, psqlError, SEED, signedInClient, TEST_ITEM_KINDS } from "./helpers";

// 측정 (docs/specs/metrics.md INV-Q1~Q5, S1~S5) 중 DB 가 지키는 것.
// 집계는 DB 전체를 센다 — 시드·다른 시험이 남긴 주문이 섞여 있어도 숫자가 맞는지 보려고, 시험마다 같은 기준 시각으로
// 넣기 전 값(기준선)을 읽고 넣은 뒤 값과의 차이를 본다. 첫 선물을 다루는 시험은 이 파일이 만든 새 팬(it_ 계정)만 쓴다 —
// 시드 팬은 이미 선물을 보낸 적이 있어 「첫 선물」이 이 시험의 주문이 아니다.
// 기준 시각을 받는 내부 함수(metrics_rows_at)는 화면 쪽 키로 부를 수 없어 DB 소유자(psql)로 부른다.

const KINDS = TEST_ITEM_KINDS[0];
const HARU = SEED.haruCreatorId;
const A = CV.haru; // 받기 어려운 품목을 두는 크리에이터(본인 확인 시험 계정)

type Row = { metric: string; period: string; bucket: string; numerator: number; denominator: number; rate: number | null };

/** 기준 시각 now 로 센 집계 줄 전부. */
function rowsAt(now: string): Row[] {
  return JSON.parse(psql(`select coalesce(json_agg(r), '[]') from public.metrics_rows_at('${now}'::timestamptz) r`)) as Row[];
}

function cell(rows: Row[], metric: string, period = "all", bucket = ""): { n: number; d: number } {
  const r = rows.find((x) => x.metric === metric && x.period === period && x.bucket === bucket);
  return { n: r?.numerator ?? 0, d: r?.denominator ?? 0 };
}

/** 넣은 뒤 - 넣기 전. */
function delta(before: Row[], after: Row[], metric: string, period = "all", bucket = ""): { n: number; d: number } {
  const b = cell(before, metric, period, bucket);
  const a = cell(after, metric, period, bucket);
  return { n: a.n - b.n, d: a.d - b.d };
}

let seq = 0;
function orderNo(): string {
  seq += 1;
  return `FC-Q${Date.now().toString(36).toUpperCase().slice(-4)}${seq}`.slice(0, 13);
}

type OrderOpt = { status?: string; registeredAt: string | null; approvedAt?: string | null; category?: string; notice?: string | null };

/** 주문 하나를 바로 넣는다(시각은 SQL 식). 물품 이름 「시험 선물」 — deleteTestOrders 가 상자·답장까지 같이 지운다. */
function order(fanId: string, o: OrderOpt): { no: string; id: string } {
  const no = orderNo();
  const noticeCol = o.notice === undefined ? "" : ", hard_notice_category";
  const noticeVal = o.notice === undefined ? "" : `, ${o.notice === null ? "null" : `'${o.notice}'`}`;
  psql(
    `begin; set local session_replication_role = replica;
     insert into public.orders (order_no, fan_id, creator_id, item_kind, item_category, has_electronics_or_metal, status, registered_at, approved_at${noticeCol})
     values ('${no}', '${fanId}', '${HARU}', '${KINDS}', ${o.category ? `'${o.category}'` : "null"}, false, '${o.status ?? "registered"}', ${o.registeredAt ?? "null"}, ${o.approvedAt ?? "null"}${noticeVal});
     commit;`,
  );
  return { no, id: psql(`select id from public.orders where order_no = '${no}'`) };
}

/** 그 주문에 상자 하나와 받았어요 줄 하나. reply: 답장 남음 / 지운 답장 / 받았어요만. */
function received(orderId: string, reply: "replied" | "deleted" | "none", seqNo = 1): void {
  const boxId = psql(
    `begin; set local session_replication_role = replica;
     insert into public.boxes (order_id, seq, declared_tier, price_krw, shipping_fee_krw, inspection_fee_krw) values ('${orderId}', ${seqNo}, 'small', 6900, 4000, 2900) returning id; commit;`,
  )
    .split("\n")
    .find((l) => /^[0-9a-f-]{36}$/.test(l));
  const cols =
    reply === "replied"
      ? `'thanks', now() - interval '1 day', null`
      : reply === "deleted"
        ? `null, now() - interval '1 day', now() - interval '12 hours'`
        : `null, null, null`;
  psql(
    `begin; set local session_replication_role = replica;
     insert into public.gift_replies (box_id, order_id, received_at, phrase, replied_at, deleted_at) values ('${boxId}', '${orderId}', now() - interval '2 days', ${cols});
     commit;`,
  );
}

let NOW = "";
/** 기준 시각에서 days 일 전(SQL 식). */
const ago = (days: number, extra = "0 minutes") => `('${NOW}'::timestamptz - interval '${days} days' + interval '${extra}')`;

const fans: TestAccount[] = [];
async function newFan(): Promise<string> {
  const f = await createTestAccount({ tag: `mq${fans.length}` });
  fans.push(f);
  return f.userId;
}

const clients = new Map<string, SupabaseClient>();
async function client(login: string): Promise<SupabaseClient> {
  const hit = clients.get(login);
  if (hit) return hit;
  const c = await signedInClient(login);
  clients.set(login, c);
  return c;
}

function clearSignupSources(): void {
  psql(
    `do $$ begin if to_regclass('public.signup_sources') is not null then
       delete from public.signup_sources where account_id in (select id from auth.users where email like 'it\\_%@login.fankkuk.invalid');
     end if; end $$;`,
  );
}

beforeAll(() => {
  NOW = psql("select now()::text");
  createCvAccounts();
});
afterEach(() => {
  // 목록 종류로 등록한 주문은 물품 이름이 종류 이름이라 정리 기준 이름으로 바꾼 뒤 지운다
  psql(`update public.orders set item_kind = '${KINDS}' where creator_id = '${A.creatorId}'`);
  psql(`do $$ begin if to_regclass('public.creator_hard_items') is not null then delete from public.creator_hard_items where creator_id = '${A.creatorId}'; end if; end $$;`);
  deleteTestOrders();
  clearSignupSources();
});
afterAll(() => {
  deleteTestOrders();
  clearSignupSources();
  removeTestAccounts();
  resetCv();
  dropCvAccounts();
});

describe("INV-Q1 — 집계는 운영자만", () => {
  it("INV-Q1 (S1, 실패경로): 로그인 안 함은 집계 함수를 부를 수 없다", async () => {
    const r = await anonClient().rpc("admin_metrics");
    expect(r.error).not.toBeNull();
    expect(r.data).toBeNull();
  });

  it("INV-Q1 (S1, 실패경로): 팬은 거부된다(42501)", async () => {
    const r = await (await client("byeolbit_fan")).rpc("admin_metrics");
    expect(r.error?.code).toBe("42501");
    expect(r.data).toBeNull();
  });

  it("INV-Q1 (S1, 실패경로): 크리에이터는 거부된다(42501)", async () => {
    const r = await (await client("haru_creator")).rpc("admin_metrics");
    expect(r.error?.code).toBe("42501");
    expect(r.data).toBeNull();
  });

  it("INV-Q1: 대표·직원은 읽는다", async () => {
    for (const login of ["fankkuk_admin", "fankkuk_staff"]) {
      const r = await (await client(login)).rpc("admin_metrics");
      expect(r.error).toBeNull();
      expect(Array.isArray(r.data) && r.data.length > 0).toBe(true);
    }
  });

  it("INV-Q1 (실패경로): 기준 시각을 받는 내부 함수는 화면 쪽 키·앱 서버 키 누구도 부를 수 없다", async () => {
    const args = { p_now: new Date().toISOString() };
    expect((await anonClient().rpc("metrics_rows_at", args)).error).not.toBeNull();
    expect((await (await client("fankkuk_admin")).rpc("metrics_rows_at", args)).error).not.toBeNull();
    expect((await adminClient().rpc("metrics_rows_at", args)).error).not.toBeNull();
  });
});

describe("INV-Q2 — 비율과 건수뿐", () => {
  it("INV-Q2 (S2): 집계 결과 칸은 지표·기간·묶음·분자·분모·비율뿐이다", async () => {
    const r = await (await client("fankkuk_staff")).rpc("admin_metrics");
    const rows = r.data as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["bucket", "denominator", "metric", "numerator", "period", "rate"]);
    // 반환 꼴 자체 — 칸이 늘면(팬 ID 목록 등) 여기서 걸린다
    const shape = psql(
      `select string_agg(a.name || ':' || format_type(a.typ, null), ',' order by a.ord)
       from pg_proc p, unnest(p.proallargtypes, p.proargnames, p.proargmodes) with ordinality as a(typ, name, mode, ord)
       where p.proname = 'admin_metrics' and p.pronamespace = 'public'::regnamespace and a.mode = 't'`,
    );
    expect(shape).toBe("metric:text,period:text,bucket:text,numerator:integer,denominator:integer,rate:numeric");
  });

  it("INV-Q2 (S2): 팬을 새로 넣어도 결과에 그 팬의 ID·아이디가 나오지 않는다", async () => {
    const fan = await newFan();
    order(fan, { registeredAt: ago(70) });
    order(fan, { registeredAt: ago(50) });
    const r = await (await client("fankkuk_admin")).rpc("admin_metrics");
    const text = JSON.stringify(r.data);
    expect(text).not.toContain(fan);
    expect(text).not.toContain(fans[fans.length - 1]!.loginId);
    expect(text).not.toMatch(/FC-Q/);
  });

  it("INV-Q2: 분모가 0 이면 비율은 비어 있다", () => {
    const rows = rowsAt(NOW);
    for (const r of rows) {
      if (r.denominator === 0) expect(r.rate).toBeNull();
      else expect(r.rate).toBeCloseTo(r.numerator / r.denominator, 4);
    }
  });
});

describe("INV-Q3 — 재발송률·답장 여부별·감사 답장률", () => {
  it("INV-Q3 (S3): A 70일 전·50일 전 두 번 · B 70일 전 한 번 · C 10일 전 한 번 → 1/2 (C 는 분모 밖)", async () => {
    const [fa, fb, fc] = [await newFan(), await newFan(), await newFan()];
    const before = rowsAt(NOW);
    order(fa, { registeredAt: ago(70) });
    order(fa, { registeredAt: ago(50) });
    order(fb, { registeredAt: ago(70) });
    order(fc, { registeredAt: ago(10) });
    expect(delta(before, rowsAt(NOW), "resend")).toEqual({ n: 1, d: 2 });
  });

  it("INV-Q3 (S3b): A 의 첫 선물에 답장 있음·B 없음 → 답장 받은 쪽 1/1, 못 받은 쪽 0/1", async () => {
    const [fa, fb] = [await newFan(), await newFan()];
    const before = rowsAt(NOW);
    const a1 = order(fa, { status: "shipped", registeredAt: ago(70) });
    order(fa, { registeredAt: ago(50) });
    const b1 = order(fb, { status: "shipped", registeredAt: ago(70) });
    received(a1.id, "replied");
    received(b1.id, "none");
    const after = rowsAt(NOW);
    expect(delta(before, after, "resend_replied")).toEqual({ n: 1, d: 1 });
    expect(delta(before, after, "resend_not_replied")).toEqual({ n: 0, d: 1 });
  });

  it("INV-Q3 (S3b, 실패경로): 지운 답장만 남은 첫 선물은 「답장 못 받은 팬」이다", async () => {
    const fa = await newFan();
    const before = rowsAt(NOW);
    const a1 = order(fa, { status: "shipped", registeredAt: ago(70) });
    order(fa, { registeredAt: ago(40) });
    received(a1.id, "deleted");
    const after = rowsAt(NOW);
    expect(delta(before, after, "resend_replied")).toEqual({ n: 0, d: 0 });
    expect(delta(before, after, "resend_not_replied")).toEqual({ n: 1, d: 1 });
  });

  it("INV-Q3 (실패경로): 두 번째 선물이 아닌 상자의 답장은 「첫 선물의 답장」이 아니다", async () => {
    const fa = await newFan();
    const before = rowsAt(NOW);
    order(fa, { registeredAt: ago(70) });
    const a2 = order(fa, { status: "shipped", registeredAt: ago(50) });
    received(a2.id, "replied");
    const after = rowsAt(NOW);
    expect(delta(before, after, "resend_replied")).toEqual({ n: 0, d: 0 });
    expect(delta(before, after, "resend_not_replied")).toEqual({ n: 1, d: 1 });
  });

  it("INV-Q3 (경계): 첫 선물 59일 전은 분모 밖, 60일·61일 전은 분모 안", async () => {
    const [f59, f60, f61] = [await newFan(), await newFan(), await newFan()];
    const before = rowsAt(NOW);
    order(f59, { registeredAt: ago(59) });
    order(f59, { registeredAt: ago(58) });
    order(f60, { registeredAt: ago(60) });
    order(f61, { registeredAt: ago(61) });
    order(f61, { registeredAt: ago(30) });
    expect(delta(before, rowsAt(NOW), "resend")).toEqual({ n: 1, d: 2 });
  });

  it("INV-Q3 (경계): 두 번째 선물이 첫 선물 뒤 60일째면 재발송, 61일째면 아니다", async () => {
    const [fin, fout] = [await newFan(), await newFan()];
    const before = rowsAt(NOW);
    order(fin, { registeredAt: ago(90) });
    order(fin, { registeredAt: ago(30) }); // 정확히 60일 뒤
    order(fout, { registeredAt: ago(90) });
    order(fout, { registeredAt: ago(29) }); // 61일 뒤
    expect(delta(before, rowsAt(NOW), "resend")).toEqual({ n: 1, d: 2 });
  });

  it("INV-Q3 (실패경로): 결제 전·취소·결제 실패 주문은 보낸 선물이 아니다 — 거절·반려는 보낸 선물이다", async () => {
    const [fx, fy] = [await newFan(), await newFan()];
    const before = rowsAt(NOW);
    // fx: 첫 결제는 취소, 다음은 결제 전 — 보낸 선물이 없다
    order(fx, { status: "canceled", registeredAt: ago(80) });
    order(fx, { status: "pending_payment", registeredAt: null });
    // fy: 첫 선물은 거절(보낸 것은 맞다), 두 번째는 7일 자동 반려
    order(fy, { status: "rejected", registeredAt: ago(80) });
    order(fy, { status: "expired", registeredAt: ago(40) });
    expect(delta(before, rowsAt(NOW), "resend")).toEqual({ n: 1, d: 1 });
  });

  it("INV-Q3: 감사 답장률 = 받았어요가 남은 상자 가운데 지우지 않은 답장이 남은 상자", async () => {
    const fa = await newFan();
    const before = rowsAt(NOW);
    const o = order(fa, { status: "shipped", registeredAt: ago(20) });
    received(o.id, "replied", 1);
    received(o.id, "deleted", 2);
    received(o.id, "none", 3);
    expect(delta(before, rowsAt(NOW), "reply")).toEqual({ n: 1, d: 3 });
  });

  it("INV-Q3: 재발송률 달마다는 첫 선물의 한국 시간 달로 묶는다", async () => {
    const fa = await newFan();
    const month = psql(`select to_char((('${NOW}'::timestamptz - interval '70 days') at time zone 'Asia/Seoul'), 'YYYY-MM')`);
    const before = rowsAt(NOW);
    order(fa, { registeredAt: ago(70) });
    // 최근 3개월 밖 달이면 「전체」에만 들어간다 — 그 달 줄이 있으면 그 달에도
    const after = rowsAt(NOW);
    expect(delta(before, after, "resend")).toEqual({ n: 0, d: 1 });
    if (after.some((r) => r.metric === "resend" && r.period === month)) expect(delta(before, after, "resend", month)).toEqual({ n: 0, d: 1 });
  });
});

describe("INV-Q4 — 가입 경로·utm", () => {
  async function record(accountId: string, args: Record<string, unknown>) {
    return adminClient().rpc("record_signup_source", {
      p_account_id: accountId,
      p_heard_from: null,
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
      ...args,
    });
  }
  const sourceOf = (id: string) =>
    psql(
      `select coalesce(heard_from, '-') || '|' || coalesce(utm_source, '-') || '|' || coalesce(utm_medium, '-') || '|' || coalesce(utm_campaign, '-') from public.signup_sources where account_id = '${id}'`,
    );

  it("INV-Q4 (S4): 가입 경로를 고르지 않아도 기록된다(빈 칸)", async () => {
    const fan = await newFan();
    const r = await record(fan, {});
    expect(r.error).toBeNull();
    expect(sourceOf(fan)).toBe("-|-|-|-");
  });

  it("INV-Q4 (S4, 실패경로): utm 에 <script> 가 오면 그 값은 저장하지 않는다 — 나머지 값과 가입 경로는 남는다", async () => {
    const fan = await newFan();
    const r = await record(fan, { p_heard_from: "x", p_utm_source: "<script>alert(1)</script>", p_utm_medium: "social", p_utm_campaign: "A".repeat(3) });
    expect(r.error).toBeNull();
    expect(sourceOf(fan)).toBe("x|-|social|-");
  });

  it("INV-Q4 (실패경로): 목록에 없는 가입 경로는 거부된다(22023)", async () => {
    const fan = await newFan();
    const r = await record(fan, { p_heard_from: "hacker" });
    expect(r.error?.code).toBe("22023");
    expect(sourceOf(fan)).toBe("");
  });

  it("INV-Q4 (실패경로): 표에 바로 넣어도 목록 밖 경로·꼴이 틀린 utm 은 DB 가 받지 않는다", async () => {
    const fan = await newFan();
    expect(psqlError(`insert into public.signup_sources (account_id, heard_from) values ('${fan}', 'hacker')`)).not.toBeNull();
    expect(psqlError(`insert into public.signup_sources (account_id, utm_source) values ('${fan}', '<script>')`)).not.toBeNull();
    expect(psqlError(`insert into public.signup_sources (account_id, utm_campaign) values ('${fan}', '${"a".repeat(51)}')`)).not.toBeNull();
    expect(psqlError(`insert into public.signup_sources (account_id, utm_medium) values ('${fan}', '')`)).not.toBeNull();
    expect(psqlError(`insert into public.signup_sources (account_id, utm_source, utm_medium, utm_campaign) values ('${fan}', 'x_share', 'social-1', '${"a".repeat(50)}')`)).toBeNull();
  });

  it("INV-Q4 (실패경로): 처음 기록이 있으면 덮어쓰지 않는다", async () => {
    const fan = await newFan();
    await record(fan, { p_heard_from: "friend", p_utm_source: "first" });
    const r = await record(fan, { p_heard_from: "x", p_utm_source: "second" });
    expect(r.error).toBeNull();
    expect(sourceOf(fan)).toBe("friend|first|-|-");
  });

  it("INV-Q4 (실패경로): 기록 함수는 앱 서버 키로만 부른다", async () => {
    const fan = await newFan();
    const args = { p_account_id: fan, p_heard_from: "x", p_utm_source: null, p_utm_medium: null, p_utm_campaign: null };
    expect((await anonClient().rpc("record_signup_source", args)).error).not.toBeNull();
    expect((await (await client("byeolbit_fan")).rpc("record_signup_source", args)).error).not.toBeNull();
    expect(sourceOf(fan)).toBe("");
  });

  it("INV-Q4: 가입 경로 집계 — 묶음별 건수와 전체 가입 수", async () => {
    const [f1, f2, f3] = [await newFan(), await newFan(), await newFan()];
    const before = rowsAt(new Date(Date.now() + 60_000).toISOString());
    await record(f1, { p_heard_from: "creator_stream", p_utm_source: "x_share" });
    await record(f2, { p_heard_from: "creator_stream" });
    await record(f3, {});
    const after = rowsAt(new Date(Date.now() + 60_000).toISOString());
    expect(delta(before, after, "signup_source", "all", "creator_stream")).toEqual({ n: 2, d: 3 });
    expect(delta(before, after, "signup_source", "all", "none")).toEqual({ n: 1, d: 3 });
    expect(delta(before, after, "utm_source", "all", "x_share")).toEqual({ n: 1, d: 3 });
  });
});

describe("INV-Q5 — 받기 어려운 품목 안내 뒤 바꾼 비율·거절률", () => {
  async function register(fanId: string, category: string, notice: string | null) {
    followForTest(fanId, A.creatorId);
    const no = orderNo();
    const r = await adminClient().rpc("register_order", {
      p_fan_id: fanId,
      p_creator_id: A.creatorId,
      p_order_no: no,
      p_item_kind: null,
      p_has_electronics_or_metal: false,
      p_tiers: ["small"],
      p_toss_order_id: `pay_mq_${Date.now().toString(36)}${seq}`,
      p_goods_krw: 0,
      p_service_fee_krw: 1400,
      p_inspection_fee_krw: 1500,
      p_shipping_fee_krw: 4000,
      p_amount_krw: 6900,
      p_item_category: category,
      p_hard_notice_category: notice,
    });
    return { ...r, no };
  }
  const noticeOf = (no: string) => psql(`select coalesce(hard_notice_category, '-') || '|' || item_category from public.orders where order_no = '${no}'`);
  /** 결제가 끝난 것처럼 — 등록 시각을 넣는다. */
  const pay = (no: string) =>
    psql(`begin; set local session_replication_role = replica; update public.orders set status = 'registered', registered_at = now() where order_no = '${no}'; commit;`);
  function hardItems(categories: string[], action: "notice" | "block"): void {
    psql(
      `insert into public.creator_hard_items (creator_id, categories, reason, period, ends_on, action)
       values ('${A.creatorId}', array[${categories.map((c) => `'${c}'`).join(",")}], 'many', 'manual', null, '${action}')
       on conflict (creator_id) do update set categories = excluded.categories, action = excluded.action, ends_on = null, period = 'manual'`,
    );
  }

  beforeAll(() => {
    psql(
      `begin; set local session_replication_role = replica; update public.creators set identity_verified = true, searchable = true, channel = 'https://www.youtube.com/@cvt-metrics' where id = '${A.creatorId}'; commit;`,
    );
  });

  it("INV-Q5 (S5): 꽃이 받기 어려운 품목일 때 꽃에서 안내를 보고 인형으로 바꿔 등록하면 안내 품목 꽃·마지막 인형이 남는다", async () => {
    hardItems(["flower"], "notice");
    const r = await register(SEED.fanId, "doll", "flower");
    expect(r.error).toBeNull();
    expect(noticeOf(r.no)).toBe("flower|doll");
  });

  it("INV-Q5 (S5, 실패경로): 받기 어려운 품목이 없는데 화면이 안내 값을 보내면 버린다", async () => {
    const r = await register(SEED.fanId, "doll", "flower");
    expect(r.error).toBeNull();
    expect(noticeOf(r.no)).toBe("-|doll");
  });

  it("INV-Q5 (실패경로): 받기 어려운 품목에 없는 품목을 안내 값으로 보내면 버린다", async () => {
    hardItems(["flower"], "notice");
    const r = await register(SEED.fanId, "doll", "beauty");
    expect(r.error).toBeNull();
    expect(noticeOf(r.no)).toBe("-|doll");
  });

  it("INV-Q5 (실패경로): 끝난 설정의 품목을 안내 값으로 보내면 버린다", async () => {
    psql(
      `insert into public.creator_hard_items (creator_id, categories, reason, period, ends_on, action)
       values ('${A.creatorId}', array['flower'], 'many', 'week1', (now() at time zone 'Asia/Seoul')::date, 'notice')`,
    );
    const r = await register(SEED.fanId, "doll", "flower");
    expect(r.error).toBeNull();
    expect(noticeOf(r.no)).toBe("-|doll");
  });

  it("INV-Q5: 「등록 막기」 품목에서 안내를 보고 바꿔도 안내 품목이 남는다", async () => {
    hardItems(["flower"], "block");
    const r = await register(SEED.fanId, "clothing", "flower");
    expect(r.error).toBeNull();
    expect(noticeOf(r.no)).toBe("flower|clothing");
  });

  it("INV-Q5: 바꾼 비율 = 안내가 뜬 뒤 결제까지 간 주문 가운데 품목을 바꾼 주문 — 결제 전 주문은 세지 않는다", async () => {
    hardItems(["flower"], "notice");
    const before = rowsAt(new Date(Date.now() + 60_000).toISOString());
    const changed = await register(SEED.fanId, "doll", "flower");
    const kept = await register(SEED.fanId, "flower", "flower");
    const unpaid = await register(SEED.fanId, "clothing", "flower");
    const noNotice = await register(SEED.fanId, "doll", null);
    for (const r of [changed, kept, unpaid, noNotice]) expect(r.error).toBeNull();
    pay(changed.no);
    pay(kept.no);
    pay(noNotice.no);
    const after = rowsAt(new Date(Date.now() + 60_000).toISOString());
    expect(delta(before, after, "notice_changed")).toEqual({ n: 1, d: 2 });
  });

  it("INV-Q5: 거절률 = 결정이 난 주문 가운데 거절·반려 — 결정 전·취소는 세지 않는다", async () => {
    const fan = await newFan();
    const before = rowsAt(NOW);
    order(fan, { status: "shipped", registeredAt: ago(5), approvedAt: ago(4) });
    order(fan, { status: "rejected", registeredAt: ago(5) });
    order(fan, { status: "expired", registeredAt: ago(5) });
    order(fan, { status: "registered", registeredAt: ago(1) }); // 결정 전
    order(fan, { status: "canceled", registeredAt: ago(5), approvedAt: ago(4) }); // 취소
    order(fan, { status: "rejected", registeredAt: null }); // 결제 전 차단으로 닫힘
    expect(delta(before, rowsAt(NOW), "decline")).toEqual({ n: 2, d: 3 });
  });

  it("INV-Q5: 거절률 달마다는 한국 시간 달 — 그달 1일 0시 30분(한국)에 등록한 주문은 그달이다", async () => {
    const fan = await newFan();
    const month = psql(`select to_char('${NOW}'::timestamptz at time zone 'Asia/Seoul', 'YYYY-MM')`);
    const firstKst = `((date_trunc('month', '${NOW}'::timestamptz at time zone 'Asia/Seoul') + interval '30 minutes') at time zone 'Asia/Seoul')`;
    const before = rowsAt(NOW);
    order(fan, { status: "rejected", registeredAt: firstKst });
    const after = rowsAt(NOW);
    expect(delta(before, after, "decline", month)).toEqual({ n: 1, d: 1 });
  });
});
