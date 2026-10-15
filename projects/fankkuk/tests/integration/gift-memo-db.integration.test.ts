import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { createCreatorRelationReader } from "@/features/gift-register/api/creator-relation";
import { registerGift } from "@/features/gift-register/model/register-gift";
import { memoResponseProblems, runPiiExposureCheck } from "../../scripts/pii-exposure.mjs";
import { adminClient, anonClient, approveRpc, deleteTestOrders, followForTest, payTestOrder, psql, SEED, signedInClient } from "./helpers";

// 나만 보는 선물 메모(together INV-F7·F8, S7~S8b) — 실제 DB 로.
// 메모는 주문 표가 아니라 따로 된 표(gift_memos)에 있고, 그 표를 읽거나 쓰는 함수는 등록·본인 상세·본인 목록 셋뿐이다.
// 개인정보 노출 검사는 이름·전화번호·주소 꼴만 찾아서 자유 글인 메모가 새도 0건이다 — 그래서 「심은 값」을 메모로 넣고
// 크리에이터·직원·대표로 열린 표·함수를 모두 불러 그 값이 한 번도 나오지 않는지 본다. 심은 값에는 전화번호 꼴을 넣지 않는다.

const apiUrl = () => process.env.FK_TEST_API_URL ?? "";
const anonKey = () => process.env.FK_TEST_ANON_KEY ?? "";
const login = (id: string): [string, string] => [`${id}@fankkuk.test`, "fankkuk-local-1234"];

/** 알아볼 수 있는 표시 값 — 이름과 내용에 따로 심는다 */
const CANARY_TITLE = "심은메모이름QZ7";
const CANARY_BODY = "심은메모내용KX9\n둘째 줄\n셋째 줄";
const CANARY_BODY_MARK = "심은메모내용KX9";

const fan = { userId: SEED.fanId, role: "fan" } as const;
const store = () => createSupabasePaymentStore(adminClient());
const deps = () => ({ store: store(), viewer: fan, creatorRelation: createCreatorRelationReader(adminClient()), readPrices: () => readTierPrices(adminClient()) });
const form = (extra: Record<string, unknown> = {}) => ({
  creatorId: SEED.haruCreatorId,
  itemCategory: "other",
  itemOther: "시험 선물",
  smallCount: "1",
  mediumCount: "0",
  largeCount: "0",
  electronicsOrMetal: "no",
  quotedTotalKrw: 6900,
  ...extra,
});

const memoCount = () => Number(psql("select count(*) from public.gift_memos"));
const orderCount = () => Number(psql(`select count(*) from public.orders where fan_id = '${SEED.fanId}'`));

/** 별빛 → 하루, 메모를 적어 등록하고 결제까지 끝낸다(승인 요청이 하루에게 간다). */
async function paidWithMemo(memo: { memoTitle?: string; memoBody?: string }): Promise<{ orderNo: string; requestId: string }> {
  followForTest(SEED.fanId, SEED.haruCreatorId);
  const r = await registerGift(deps(), form(memo));
  if (!r.ok) throw new Error(`등록 실패: ${JSON.stringify(r)}`);
  const requestId = await payTestOrder({ orderNo: r.orderNo, tossOrderId: r.orderId });
  return { orderNo: r.orderNo, requestId };
}

afterAll(() => deleteTestOrders());

describe("together INV-F7: 나만 보는 메모 — 따로 된 표, 등록과 같은 처리", () => {
  afterEach(() => deleteTestOrders());

  it("INV-F7 S7: 등록하며 적은 선물 이름·내용(3줄)이 보낸 팬의 선물 상세·보낸 선물 목록에 나온다 — 주문의 물품 이름은 그대로다", async () => {
    const { orderNo } = await paidWithMemo({ memoTitle: "생일 편지와 인형", memoBody: "첫 줄\n둘째 줄\n셋째 줄" });
    expect(psql(`select item_kind from public.orders where order_no = '${orderNo}'`)).toBe("시험 선물");
    const me = await signedInClient("byeolbit_fan");
    const detail = await me.rpc("my_gift_memo", { p_order_no: orderNo });
    expect(detail.error).toBeNull();
    expect(detail.data).toEqual({ title: "생일 편지와 인형", body: "첫 줄\n둘째 줄\n셋째 줄" });
    const list = await me.rpc("my_gifts");
    expect(list.error).toBeNull();
    expect((list.data as { order_no: string; memo_title: string | null }[]).find((g) => g.order_no === orderNo)?.memo_title).toBe("생일 편지와 인형");
  });

  it("INV-F7: 메모를 안 적으면 메모 줄이 생기지 않고, 목록의 선물 이름은 null·상세는 null 이다", async () => {
    const before = memoCount();
    const { orderNo } = await paidWithMemo({ memoTitle: "  ", memoBody: "" });
    expect(memoCount()).toBe(before);
    const me = await signedInClient("byeolbit_fan");
    expect((await me.rpc("my_gift_memo", { p_order_no: orderNo })).data).toBeNull();
    const list = (await me.rpc("my_gifts")).data as { order_no: string; memo_title: string | null }[];
    expect(list.find((g) => g.order_no === orderNo)).toMatchObject({ memo_title: null });
  });

  it("INV-F7: 메모는 주문 표의 칸이 아니라 따로 된 표에 있고, 그 표는 행 보안이 켜져 있고 정책·화면 쪽 키 권한이 없다", () => {
    expect(psql("select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name ilike '%memo%'")).toBe("0");
    expect(psql("select relrowsecurity from pg_class where oid = 'public.gift_memos'::regclass")).toBe("t");
    expect(psql("select count(*) from pg_policies where schemaname = 'public' and tablename = 'gift_memos'")).toBe("0");
    for (const role of ["anon", "authenticated"]) {
      for (const priv of ["select", "insert", "update", "delete"]) {
        expect(psql(`select has_table_privilege('${role}', 'public.gift_memos', '${priv}')`), `${role} ${priv}`).toBe("f");
      }
    }
  });

  it("INV-F7 S7b (실패경로): 선물 이름 21자 또는 내용 201자면 400 — 주문도 메모도 생기지 않는다", async () => {
    followForTest(SEED.fanId, SEED.haruCreatorId);
    const [orders, memos] = [orderCount(), memoCount()];
    expect(await registerGift(deps(), form({ memoTitle: "가".repeat(21) }))).toMatchObject({ ok: false, status: 400 });
    expect(await registerGift(deps(), form({ memoBody: "가".repeat(201) }))).toMatchObject({ ok: false, status: 400 });
    expect([orderCount(), memoCount()]).toEqual([orders, memos]);
  });

  it("INV-F7 S7b (실패경로): 입력 경계를 건너 DB 등록 함수에 바로 넣어도 21자 이름·줄바꿈 이름·201자 내용은 거부되고 주문도 남지 않는다", async () => {
    followForTest(SEED.fanId, SEED.haruCreatorId);
    const [orders, memos] = [orderCount(), memoCount()];
    const base = {
      p_fan_id: SEED.fanId,
      p_creator_id: SEED.haruCreatorId,
      p_item_kind: "시험 선물",
      p_has_electronics_or_metal: false,
      p_tiers: ["small"],
      p_goods_krw: 0,
      p_service_fee_krw: 1400,
      p_inspection_fee_krw: 1500,
      p_shipping_fee_krw: 4000,
      p_amount_krw: 6900,
    };
    const bad = [
      { p_memo_title: "가".repeat(21), p_memo_body: null },
      { p_memo_title: "생일\n편지", p_memo_body: null },
      { p_memo_title: null, p_memo_body: "가".repeat(201) },
    ];
    for (const [i, memo] of bad.entries()) {
      const { error } = await adminClient().rpc("register_order", { ...base, ...memo, p_order_no: `FC-TM${i}X${Date.now() % 1000}`, p_toss_order_id: `pay_test_memo_${i}_${Date.now()}` });
      expect(error?.code, JSON.stringify(memo)).toBe("22023");
    }
    expect([orderCount(), memoCount()]).toEqual([orders, memos]);
    // 20자 이름·200자 내용(앞뒤 공백은 빼고 센다)은 받는다 — 위 거부가 길이와 상관없이 막는 것이 아님을 확인
    const ok = await adminClient().rpc("register_order", {
      ...base,
      p_memo_title: ` ${"가".repeat(20)} `,
      p_memo_body: `${"나".repeat(100)}\n${"다".repeat(99)} `,
      p_order_no: `FC-TMOK${Date.now() % 1000}`,
      p_toss_order_id: `pay_test_memo_ok_${Date.now()}`,
    });
    expect(ok.error).toBeNull();
    expect(psql(`select char_length(title) || '|' || char_length(body) from public.gift_memos where order_id = '${ok.data as string}'`)).toBe("20|200");
  });

  it("INV-F7 S7b (실패경로): 별빛 세션·익명으로 메모 표를 직접 읽기·쓰기 — 거부된다", async () => {
    const { orderNo } = await paidWithMemo({ memoTitle: "직접 읽기 시험" });
    const orderId = psql(`select id from public.orders where order_no = '${orderNo}'`);
    for (const client of [await signedInClient("byeolbit_fan"), anonClient()]) {
      const read = await client.from("gift_memos").select("*");
      expect(read.error?.code).toBe("42501");
      const write = await client.from("gift_memos").insert({ order_id: orderId, title: "덮어쓰기" });
      expect(write.error?.code).toBe("42501");
    }
    expect(psql(`select title from public.gift_memos where order_id = '${orderId}'`)).toBe("직접 읽기 시험");
  });
});

describe("together INV-F8: 메모는 보낸 팬 본인에게만 — 정해진 함수 셋 밖으로 나가지 않는다", () => {
  let pending: { orderNo: string; requestId: string };
  let approved: { orderNo: string; requestId: string };

  beforeAll(async () => {
    pending = await paidWithMemo({ memoTitle: CANARY_TITLE, memoBody: CANARY_BODY });
    approved = await paidWithMemo({ memoTitle: CANARY_TITLE, memoBody: CANARY_BODY });
    const { error } = await approveRpc(approved.requestId);
    expect(error).toBeNull();
  });

  afterAll(() => deleteTestOrders());

  afterEach(() => {
    psql(
      "drop function if exists public.pii_check_planted_memo cascade; drop function if exists public.pii_check_planted_memo_inner cascade; drop view if exists public.pii_check_planted_memo_view; revoke all on public.gift_memos from authenticated; alter table public.gift_memos enable row level security",
    );
    psql("notify pgrst, 'reload schema'");
  });

  it("INV-F8 (실패경로): 선물 상세 읽기는 보낸 팬 본인에게만 메모를 준다 — 받는 크리에이터·다른 팬·직원·대표·익명은 null", async () => {
    const own = await (await signedInClient("byeolbit_fan")).rpc("my_gift_memo", { p_order_no: pending.orderNo });
    expect(own.data).toEqual({ title: CANARY_TITLE, body: CANARY_BODY });
    for (const id of ["haru_creator", "daltokki_fan", "fankkuk_staff", "fankkuk_admin"]) {
      const r = await (await signedInClient(id)).rpc("my_gift_memo", { p_order_no: pending.orderNo });
      expect(r.data, id).toBeNull();
    }
    const anon = await anonClient().rpc("my_gift_memo", { p_order_no: pending.orderNo });
    expect(anon.data ?? null).toBeNull();
  });

  it("INV-F8 S8 (실패경로): 하루·직원·대표로 열린 표·함수를 모두 불러도 심은 메모 값이 0번 — 별빛으로는 상세·목록에 나온다", async () => {
    const r = await runPiiExposureCheck({
      apiUrl: apiUrl(),
      anonKey: anonKey(),
      logins: [login("byeolbit_fan"), login("haru_creator"), login("fankkuk_staff"), login("fankkuk_admin")],
      sql: psql,
      memoCanary: { values: [CANARY_TITLE, CANARY_BODY_MARK], orderNo: pending.orderNo, owner: "byeolbit_fan" },
    });
    // 메모 갈래만 본다 — 결제를 끝낸 시험 주문은 별빛의 상자 읽기에 받는 주소 6자리 칸(address_code)을 만들고, 그 칸 이름이 주소 꼴 검사에 걸린다(메모와 무관, BACKLOG)
    expect(r.problems.filter((p) => p.startsWith("메모") || p.includes("gift_memos"))).toEqual([]);
    const role = (label: string) => r.roles.find((x) => x.label === label)!;
    for (const label of ["익명", "haru_creator", "fankkuk_staff", "fankkuk_admin"]) expect(role(label).memoHits, label).toEqual([]);
    // 「0번」이 안 본 것이 아니다 — 하루는 그 주문(주문번호)을 승인 요청 목록 등에서 실제로 받았다
    expect(role("haru_creator").orderSeen.length).toBeGreaterThan(0);
    expect(role("fankkuk_admin").orderSeen.length).toBeGreaterThan(0);
    expect(role("byeolbit_fan").memoHits).toEqual(expect.arrayContaining(["함수 my_gift_memo", "함수 my_gifts"]));
  });

  it("INV-F8 S8 (실패경로): 승인 요청의 서명 원문·서명 기록·알림 줄에 메모가 없다", () => {
    const orders = `'${pending.orderNo}', '${approved.orderNo}'`;
    const texts = psql(
      [
        `select coalesce(string_agg(q.payload, ' '), '') from public.approval_requests q join public.orders o on o.id = q.order_id where o.order_no in (${orders})`,
        `union all select coalesce(string_agg(s.signed_content, ' '), '') from public.approval_signatures s join public.approval_requests q on q.request_id = s.request_id join public.orders o on o.id = q.order_id where o.order_no in (${orders})`,
        `union all select coalesce(string_agg(row_to_json(n)::text, ' '), '') from public.notification_outbox n join public.orders o on o.id = n.order_id where o.order_no in (${orders})`,
      ].join(" "),
    );
    // 원문은 실제로 있다(빈 글자와 비교한 것이 아니다)
    expect(texts).toContain(pending.orderNo);
    expect(texts).toContain(approved.orderNo);
    expect(texts).not.toContain(CANARY_TITLE);
    expect(texts).not.toContain(CANARY_BODY_MARK);
  });

  it("INV-F8 S8b (실패경로): 메모 표 이름을 본문에 쓴 함수를 심으면 — 로그인 키에 닫혀 있어도 — 허용 목록 밖이라 구조 검사가 잡는다", async () => {
    psql(
      "create function public.pii_check_planted_memo_inner() returns integer language sql stable as $$ select count(*)::int from public.gift_memos $$; revoke all on function public.pii_check_planted_memo_inner() from public, anon, authenticated",
    );
    const r = await runPiiExposureCheck({ apiUrl: apiUrl(), anonKey: anonKey(), logins: [login("haru_creator")], sql: psql });
    expect(r.problems).toContain("구조: 메모 표(gift_memos)를 참조하는 함수 pii_check_planted_memo_inner — 허용 목록(등록·본인 상세·본인 목록) 밖이다");
  });

  it("INV-F8 S8b (실패경로): 크리에이터에게 열린 함수가 메모를 돌려주면 응답 검사가 하루 권한에서 잡는다(구조 검사와 따로)", async () => {
    psql(
      "create function public.pii_check_planted_memo() returns jsonb language sql stable security definer set search_path = '' as $$ select jsonb_agg(m.title) from public.gift_memos m $$; revoke all on function public.pii_check_planted_memo() from public, anon; grant execute on function public.pii_check_planted_memo() to authenticated",
    );
    psql("notify pgrst, 'reload schema'");
    await waitForRpc("pii_check_planted_memo");
    const r = await runPiiExposureCheck({
      apiUrl: apiUrl(),
      anonKey: anonKey(),
      logins: [login("byeolbit_fan"), login("haru_creator")],
      sql: psql,
      memoCanary: { values: [CANARY_TITLE, CANARY_BODY_MARK], orderNo: pending.orderNo, owner: "byeolbit_fan" },
    });
    expect(r.problems).toContain("메모: haru_creator 함수 pii_check_planted_memo 응답에 심은 메모 값이 있다");
    expect(r.problems).toContain("구조: 메모 표(gift_memos)를 참조하는 함수 pii_check_planted_memo — 허용 목록(등록·본인 상세·본인 목록) 밖이다");
  });

  it("INV-F8 S8b (실패경로): 메모 표를 읽는 뷰·화면 쪽 키 권한·꺼진 행 보안도 구조 검사가 잡는다", async () => {
    psql("create view public.pii_check_planted_memo_view as select title from public.gift_memos");
    psql("grant select on public.gift_memos to authenticated");
    psql("alter table public.gift_memos disable row level security");
    const r = await runPiiExposureCheck({ apiUrl: apiUrl(), anonKey: anonKey(), logins: [login("haru_creator")], sql: psql });
    expect(r.problems).toEqual(
      expect.arrayContaining([
        "구조: 메모 표(gift_memos)를 읽는 뷰 pii_check_planted_memo_view — 메모는 정해진 함수 셋으로만 나간다",
        "구조: 메모 표(gift_memos)에 화면 쪽 키(authenticated) select 권한이 있다",
        "구조: 메모 표(gift_memos)의 행 보안이 꺼져 있다",
      ]),
    );
  });

  it("INV-F8 (실패경로): 허용 목록의 함수가 메모 표를 더 참조하지 않으면 목록이 낡았다고 잡는다 — 목록은 셋 그대로", async () => {
    const src = psql("select pg_get_functiondef('public.my_gift_memo(text)'::regprocedure)");
    psql("create or replace function public.my_gift_memo(p_order_no text) returns jsonb language sql stable security definer set search_path = '' as $$ select null::jsonb $$");
    try {
      const r = await runPiiExposureCheck({ apiUrl: apiUrl(), anonKey: anonKey(), logins: [login("haru_creator")], sql: psql });
      expect(r.problems).toContain("구조: 허용 목록의 my_gift_memo 는 이제 메모 표(gift_memos)를 참조하지 않는다 — 목록에서 뺀다");
    } finally {
      psql(src);
    }
  });
});

describe("together INV-F8: 심은 값 검사가 아무것도 못 보고 통과하지 않는다", () => {
  const canary = { values: ["X"], orderNo: "FC-X", owner: "byeolbit_fan" };
  it("INV-F8 (실패경로): 보낸 사람 응답에도 심은 값이 없으면(심기 실패·본인 읽기 빠짐) 실패다 — 보낸 사람으로 로그인하지 않아도 실패다", () => {
    expect(memoResponseProblems([{ label: "byeolbit_fan", memoHits: [] }], canary)).toEqual([
      "메모: 보낸 사람 byeolbit_fan 의 응답 어디에도 심은 메모 값이 없다 — 심기가 안 됐거나 본인 읽기 함수가 빠졌다",
    ]);
    expect(memoResponseProblems([{ label: "haru_creator", memoHits: [] }], canary)).toEqual([
      "메모: 보낸 사람 byeolbit_fan 로 로그인하지 않았다 — 심은 값이 본인에게 나오는지 보지 못했다",
    ]);
    // 보낸 사람에게 나온 것은 문제가 아니다
    expect(memoResponseProblems([{ label: "byeolbit_fan", memoHits: ["함수 my_gift_memo"] }], canary)).toEqual([]);
  });
});

/** 데이터 API 가 심은 함수를 다시 읽을 때까지 */
async function waitForRpc(name: string): Promise<void> {
  const key = process.env.FK_TEST_SERVICE_KEY ?? "";
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`${apiUrl()}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" } });
    if ((await r.text()).includes(`/rpc/${name}"`)) return;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error(`데이터 API 가 ${name} 를 보이지 않는다`);
}
