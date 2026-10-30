import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient, followForTest, holdRowLock, psql, SEED, signedInClient, TEST_ITEM_KINDS } from "./helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";

// 물품 종류 고정 목록 · 받기 어려운 품목 (docs/specs/hard-items.md INV-H1~H8, S1~S8b) 중 DB 가 지키는 것.
// 공개 문구 틀(INV-H6 S6·S6b)과 등록 화면 안내(INV-H8)는 화면 쪽 계산 함수라 src 단위 시험(entities/gift-item/model/*.test.ts)에 있다.
// 받는 크리에이터는 본인 확인 시험 계정(cvt_*) — 시험 동안만 확인된 상태로 둔다(creator-receiving 시험과 같은 방식).
// 목록 종류로 만든 주문은 물품 이름이 「인형·쿠션」 같은 종류 이름이라 정리 기준(「시험 선물」)에 안 걸린다 — 정리 전에 이름을 바꿔 둔다.

const A = CV.haru; // 크리에이터 A
const B = CV.summer; // 크리에이터 B
const FAN_X = { id: SEED.fanId, login: "byeolbit_fan" }; // 별빛
const IDS = [A, B].map((c) => `'${c.creatorId}'`).join(", ");

function verify(creatorId: string, slug: string): void {
  psql(
    `begin; set local session_replication_role = replica; update public.creators set identity_verified = true, searchable = true, channel = 'https://www.youtube.com/@${slug}' where id = '${creatorId}'; commit;`,
  );
}

/** 시험 크리에이터의 설정을 지우고, 시험 주문의 물품 이름을 정리 기준 이름으로 바꾼 뒤 지운다 — 표·칸이 없을 때(구현 전 빨간불)도 멈추지 않게. */
function resetHardItems(): void {
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      "do $$ begin",
      `if to_regclass('public.creator_hard_items') is not null then execute $q$delete from public.creator_hard_items where creator_id in (${IDS})$q$; end if;`,
      "end $$;",
      `update public.orders set item_kind = '${TEST_ITEM_KINDS[0]}' where creator_id in (${IDS});`,
      "commit;",
    ].join(" "),
  );
  resetCv();
}

/** 한국 시간 오늘에서 offset 일 뒤(YYYY-MM-DD). */
function kstDate(offset: number): string {
  return psql(`select to_char((now() at time zone 'Asia/Seoul')::date + ${offset}, 'YYYY-MM-DD')`);
}

/** 설정 줄: 품목|이유|기간|끝나는 날|동작. 없으면 빈 문자열. */
function hardItemsOf(creatorId: string): string {
  return psql(
    `select coalesce((select array_to_string(categories, ',') || '|' || reason || '|' || period || '|' || coalesce(ends_on::text, '') || '|' || action
                        from public.creator_hard_items where creator_id = '${creatorId}'), '')`,
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

type Setting = { categories: string[] | null; reason?: string; period?: string; action?: string };
const args = (s: Setting) => ({ p_categories: s.categories, p_reason: s.reason ?? "many", p_period: s.period ?? "week1", p_action: s.action ?? "notice" });

async function save(login: string, s: Setting, extra: Record<string, unknown> = {}) {
  return (await client(login)).rpc("update_my_creator_hard_items", { ...args(s), ...extra });
}

async function saveOk(login: string, s: Setting) {
  const r = await save(login, s);
  if (r.error) throw new Error(`받기 어려운 품목 저장 실패: ${r.error.code} ${r.error.message}`);
}

let seq = 0;
function uniq(): string {
  seq += 1;
  return `${Date.now().toString(36).toUpperCase().slice(-5)}${seq}`;
}

/** 소형 상자 하나로 등록 — 물품 종류(p_item_category)와 기타 글(p_item_kind)을 정한다. */
async function register(fanId: string, creatorId: string, item: { category?: string | null; text?: string | null; metal?: boolean }) {
  followForTest(fanId, creatorId);
  const orderNo = `FC-H${uniq()}`.slice(0, 13);
  const r = await adminClient().rpc("register_order", {
    p_fan_id: fanId,
    p_creator_id: creatorId,
    p_order_no: orderNo,
    p_item_kind: item.text ?? null,
    p_has_electronics_or_metal: item.metal ?? false,
    p_tiers: ["small"],
    p_toss_order_id: `pay_hard_${uniq().toLowerCase()}`,
    p_goods_krw: 0,
    p_service_fee_krw: 1400,
    p_inspection_fee_krw: 1500,
    p_shipping_fee_krw: 4000,
    p_amount_krw: 6900,
    ...(item.category === undefined ? {} : { p_item_category: item.category }),
  });
  return { ...r, orderNo };
}

/** 그 주문의 종류|물품 이름|전자기기 신고. */
function orderItemOf(orderNo: string): string {
  return psql(`select coalesce(item_category, '') || '|' || item_kind || '|' || has_electronics_or_metal from public.orders where order_no = '${orderNo}'`);
}

function ordersOf(creatorId: string): number {
  return Number(psql(`select count(*) from public.orders where creator_id = '${creatorId}'`));
}

beforeAll(() => {
  createCvAccounts();
  resetHardItems();
});
beforeEach(() => {
  resetHardItems();
  verify(A.creatorId, "cvt-hard-a");
  verify(B.creatorId, "cvt-hard-b");
});
afterAll(() => {
  resetHardItems();
  dropCvAccounts();
});

describe("INV-H1: 물품 종류는 여덟 가지 중 하나, 기타만 글, 물품 이름은 서버가 정한다", () => {
  it("INV-H1 S1: 인형·쿠션(doll)으로 등록하면 종류 doll, 물품 이름 「인형·쿠션」", async () => {
    const r = await register(FAN_X.id, A.creatorId, { category: "doll" });
    expect(r.error).toBeNull();
    expect(orderItemOf(r.orderNo)).toBe("doll|인형·쿠션|false");
  });

  it("INV-H1 S1: 여덟 종류의 물품 이름", async () => {
    const want: Record<string, string> = {
      doll: "인형·쿠션",
      flower: "꽃",
      clothing: "의류",
      beauty: "향수·화장품",
      large: "대형 물품",
      stationery: "문구",
      electronics: "전자기기",
    };
    for (const [category, label] of Object.entries(want)) {
      const r = await register(FAN_X.id, A.creatorId, { category });
      expect([category, r.error?.code ?? "ok"]).toEqual([category, "ok"]);
      expect(orderItemOf(r.orderNo).split("|").slice(0, 2)).toEqual([category, label]);
    }
  });

  it("INV-H1 S1b: 기타 + 「손편지와 사진」이면 종류 other, 물품 이름은 그 글(앞뒤 빈칸은 뺀다)", async () => {
    const r = await register(FAN_X.id, A.creatorId, { category: "other", text: "  손편지와 사진 " });
    expect(r.error).toBeNull();
    expect(orderItemOf(r.orderNo)).toBe("other|손편지와 사진|false");
    const max = await register(FAN_X.id, A.creatorId, { category: "other", text: "가".repeat(30) });
    expect(max.error).toBeNull();
  });

  it("INV-H1 S1c (실패경로): 목록 밖 종류·빈 종류, 기타인데 글 없음·31자, 목록 종류인데 글을 같이 보냄은 22023 으로 거부되고 주문이 생기지 않는다", async () => {
    const cases: [string, { category: string | null; text?: string | null }][] = [
      ["food", { category: "food" }],
      ["냉장", { category: "냉장" }],
      ["빈 종류", { category: null }],
      ["대문자", { category: "DOLL" }],
      ["기타 글 없음", { category: "other", text: null }],
      ["기타 빈칸만", { category: "other", text: "   " }],
      ["기타 31자", { category: "other", text: "가".repeat(31) }],
      ["doll 에 글", { category: "doll", text: "곰인형" }],
    ];
    for (const [label, item] of cases) {
      expect([label, (await register(FAN_X.id, A.creatorId, item)).error?.code]).toEqual([label, "22023"]);
    }
    expect(ordersOf(A.creatorId)).toBe(0);
  });

  it("INV-H1 S1c (실패경로): 표에 직접 목록 밖 종류를 넣을 수 없다(표 제약)", async () => {
    const r = await register(FAN_X.id, A.creatorId, { category: "doll" });
    expect(r.error).toBeNull();
    expect(() => psql(`update public.orders set item_category = 'food' where order_no = '${r.orderNo}'`)).toThrow();
    expect(orderItemOf(r.orderNo).split("|")[0]).toBe("doll");
  });

  it("INV-H1 S1d: 이 기능 전에 만든 주문(시드)은 종류 칸이 비어 있고 물품 이름이 그대로다", async () => {
    // 시드 파일에 적힌 주문번호만 센다. 「시험 주문이 아닌 주문 전부」로 세면 화면 확인 때 손으로 만든 주문·
    // 이름을 바꿔 정리에서 빠진 시험 주문이 섞여 실패한다(2026-10-30, 9 대 22).
    const seedOrderNos = [...new Set(readFileSync(new URL("../../supabase/seed.sql", import.meta.url), "utf8").match(/'FC-[A-Z0-9]+'/g) ?? [])];
    expect(seedOrderNos.length).toBeGreaterThan(0);
    const rows = psql(
      `select count(*) || '|' || count(*) filter (where item_category is null) || '|' || count(*) filter (where char_length(item_kind) > 0) from public.orders where order_no in (${seedOrderNos.join(", ")})`,
    );
    const [total, nullCategory, named] = rows.split("|").map(Number);
    expect(total).toBeGreaterThan(0);
    expect(nullCategory).toBe(total);
    expect(named).toBe(total);
  });
});

describe("INV-H2: 전자기기를 고르면 전자기기·금속 신고가 켜진 채 저장된다", () => {
  it("INV-H2 S2: 전자기기 + 신고 「없어요」로 등록해도 신고가 켜진다", async () => {
    const r = await register(FAN_X.id, A.creatorId, { category: "electronics", metal: false });
    expect(r.error).toBeNull();
    expect(orderItemOf(r.orderNo)).toBe("electronics|전자기기|true");
  });

  it("INV-H2 S2: 다른 종류는 보낸 대로 저장된다(꺼짐·켜짐 둘 다)", async () => {
    const off = await register(FAN_X.id, A.creatorId, { category: "doll", metal: false });
    const on = await register(FAN_X.id, A.creatorId, { category: "doll", metal: true });
    expect(orderItemOf(off.orderNo)).toBe("doll|인형·쿠션|false");
    expect(orderItemOf(on.orderNo)).toBe("doll|인형·쿠션|true");
  });
});

describe("INV-H3: 받기 어려운 품목은 그 크리에이터 본인만 바꾼다", () => {
  it("INV-H3 S3: A 로그인으로 저장하면 A 에만 설정이 있다", async () => {
    await saveOk(A.login, { categories: ["flower"] });
    expect(hardItemsOf(A.creatorId)).toBe(`flower|many|week1|${kstDate(7)}|notice`);
    expect(hardItemsOf(B.creatorId)).toBe("");
  });

  it("INV-H3 S3: 저장 함수에는 크리에이터 ID 칸이 없다 — B 의 ID·계정 ID 를 실어 보내면 거부되고 아무도 안 바뀐다", async () => {
    const sig = psql(`select pg_get_function_identity_arguments('public.update_my_creator_hard_items'::regproc)`);
    expect(sig).not.toMatch(/creator|account|profile|uuid/i);
    for (const extra of [{ p_creator_id: B.creatorId }, { p_account_id: B.id }]) {
      expect((await save(A.login, { categories: ["flower"] }, extra)).error).not.toBeNull();
    }
    expect(hardItemsOf(A.creatorId)).toBe("");
    expect(hardItemsOf(B.creatorId)).toBe("");
  });

  it("INV-H3 S3b (실패경로): 팬·운영자가 부르면 42501, 로그인 안 하면 부를 수 없고, 아무것도 바뀌지 않는다", async () => {
    for (const login of [FAN_X.login, "fankkuk_staff"]) {
      expect([login, (await save(login, { categories: ["flower"] })).error?.code]).toEqual([login, "42501"]);
    }
    expect((await anonClient().rpc("update_my_creator_hard_items", args({ categories: ["flower"] }))).error).not.toBeNull();
    expect(hardItemsOf(A.creatorId)).toBe("");
    expect(hardItemsOf(B.creatorId)).toBe("");
  });

  it("INV-H3 S3b (실패경로): 로그인한 크리에이터도 설정 표를 직접 읽고 쓰지 못한다", async () => {
    await saveOk(B.login, { categories: ["doll"] });
    const me = await client(A.login);
    await me.from("creator_hard_items").insert({ creator_id: A.creatorId, categories: ["flower"], reason: "many", period: "manual", action: "block" });
    await me.from("creator_hard_items").update({ action: "block" }).eq("creator_id", B.creatorId);
    await me.from("creator_hard_items").delete().eq("creator_id", B.creatorId);
    expect(hardItemsOf(A.creatorId)).toBe("");
    expect(hardItemsOf(B.creatorId)).toBe(`doll|many|week1|${kstDate(7)}|notice`);
    const r = await anonClient().from("creator_hard_items").select("*");
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
    const mine = await me.from("creator_hard_items").select("*");
    expect(mine.error !== null || (mine.data ?? []).length === 0).toBe(true);
  });

  it("INV-H3: 본인 읽기(my_creator_hard_items)는 로그인한 크리에이터 본인 것만 — 다른 크리에이터·팬에게는 오지 않는다", async () => {
    await saveOk(A.login, { categories: ["flower", "doll"], reason: "storage", period: "week2", action: "block" });
    const mine = await (await client(A.login)).rpc("my_creator_hard_items");
    expect(mine.error).toBeNull();
    expect(mine.data).toEqual([{ categories: ["doll", "flower"], reason: "storage", period: "week2", ends_on: kstDate(14), action: "block" }]);
    expect(((await (await client(B.login)).rpc("my_creator_hard_items")).data ?? []) as unknown[]).toEqual([]);
    expect(((await (await client(FAN_X.login)).rpc("my_creator_hard_items")).data ?? []) as unknown[]).toEqual([]);
  });
});

describe("INV-H4: 설정은 고르는 값으로만, 문장 칸은 없다", () => {
  it("INV-H4 S4 (실패경로): 목록 밖 품목·같은 품목 두 번·9개, 목록 밖 이유·기간·동작(문장 포함)은 22023 으로 거부되고 설정 그대로", async () => {
    await saveOk(A.login, { categories: ["doll"] });
    const before = hardItemsOf(A.creatorId);
    const nine = ["doll", "flower", "clothing", "beauty", "large", "stationery", "electronics", "other", "doll"];
    const cases: [string, Setting][] = [
      ["food", { categories: ["food"] }],
      ["빈 품목 이름", { categories: [""] }],
      ["두 번", { categories: ["flower", "flower"] }],
      ["9개", { categories: nine }],
      ["null 품목", { categories: ["doll", null as unknown as string] }],
      ["이유 문장", { categories: ["doll"], reason: "택배가 너무 많아요" }],
      ["이유 빈 값", { categories: ["doll"], reason: "" }],
      ["기간 3주", { categories: ["doll"], period: "week3" }],
      ["동작 숨김", { categories: ["doll"], action: "hide" }],
    ];
    for (const [label, s] of cases) {
      expect([label, (await save(A.login, s)).error?.code]).toEqual([label, "22023"]);
    }
    expect(hardItemsOf(A.creatorId)).toBe(before);
  });

  it("INV-H4: 이유·기간·동작이 null 이면 거부된다", async () => {
    for (const key of ["p_reason", "p_period", "p_action"]) {
      expect([key, (await save(A.login, { categories: ["doll"] }, { [key]: null })).error?.code]).toEqual([key, "22023"]);
    }
    expect(hardItemsOf(A.creatorId)).toBe("");
  });

  it("INV-H4: 저장 함수의 인자는 품목·이유·기간·동작 넷뿐이다(문장을 받는 칸이 없다)", () => {
    expect(psql(`select pg_get_function_identity_arguments('public.update_my_creator_hard_items'::regproc)`)).toBe(
      "p_categories text[], p_reason text, p_period text, p_action text",
    );
  });

  it("INV-H4: 여덟 품목을 모두 고를 수 있고, 저장은 목록 순서로 한다", async () => {
    await saveOk(A.login, { categories: ["other", "electronics", "stationery", "large", "beauty", "clothing", "flower", "doll"], reason: "none", period: "manual", action: "block" });
    expect(hardItemsOf(A.creatorId)).toBe("doll,flower,clothing,beauty,large,stationery,electronics,other|none|manual||block");
  });

  it("INV-H4 S4b: 품목 없이(빈 목록·null) 저장하면 설정이 지워진다", async () => {
    await saveOk(A.login, { categories: ["doll"] });
    await saveOk(A.login, { categories: [] });
    expect(hardItemsOf(A.creatorId)).toBe("");
    await saveOk(A.login, { categories: ["doll"] });
    await saveOk(A.login, { categories: null });
    expect(hardItemsOf(A.creatorId)).toBe("");
  });
});

describe("INV-H5: 기간은 저장한 날(한국 시간)부터, 끝나는 날 0시부터 없는 것", () => {
  it("INV-H5 S5: 1주·2주·한 달·직접 해제의 끝나는 날은 오늘+7·오늘+14·다음 달 같은 날·없음", async () => {
    const monthLater = psql(`select to_char(((now() at time zone 'Asia/Seoul')::date + interval '1 month')::date, 'YYYY-MM-DD')`);
    const want: [string, string][] = [
      ["week1", kstDate(7)],
      ["week2", kstDate(14)],
      ["month1", monthLater],
      ["manual", ""],
    ];
    for (const [period, endsOn] of want) {
      await saveOk(A.login, { categories: ["doll"], period });
      expect([period, hardItemsOf(A.creatorId)]).toEqual([period, `doll|many|${period}|${endsOn}|notice`]);
    }
  });

  it("INV-H5 S5: 한 달은 달력의 한 달 — 1월 31일은 2월 28일(평년)·2월 29일(윤년), 10월 11일은 11월 11일", () => {
    const at = (period: string, d: string) => psql(`select coalesce(public.hard_items_ends_on('${period}', date '${d}')::text, '')`);
    expect(at("month1", "2027-01-31")).toBe("2027-02-28");
    expect(at("month1", "2028-01-31")).toBe("2028-02-29");
    expect(at("month1", "2026-10-11")).toBe("2026-11-11");
    expect(at("week1", "2026-12-28")).toBe("2027-01-04");
    expect(at("week2", "2026-10-11")).toBe("2026-10-25");
    expect(at("manual", "2026-10-11")).toBe("");
  });

  it("INV-H5: 다시 저장하면 그날부터 다시 센다", async () => {
    await saveOk(A.login, { categories: ["doll"], period: "week1" });
    psql(`update public.creator_hard_items set ends_on = '${kstDate(2)}' where creator_id = '${A.creatorId}'`);
    await saveOk(A.login, { categories: ["doll"], period: "week1" });
    expect(hardItemsOf(A.creatorId)).toBe(`doll|many|week1|${kstDate(7)}|notice`);
  });

  it("INV-H5 S5b: 끝나는 날이 오늘이면 공개 읽기·본인 읽기에 없고 「등록 막기」 품목도 등록된다", async () => {
    await saveOk(A.login, { categories: ["flower"], action: "block" });
    psql(`update public.creator_hard_items set ends_on = '${kstDate(0)}' where creator_id = '${A.creatorId}'`);
    const pub = await anonClient().rpc("creator_hard_items", { p_ids: [A.creatorId] });
    expect(pub.error).toBeNull();
    expect(pub.data).toEqual([]);
    expect(((await (await client(A.login)).rpc("my_creator_hard_items")).data ?? []) as unknown[]).toEqual([]);
    expect((await register(FAN_X.id, A.creatorId, { category: "flower" })).error).toBeNull();
  });

  it("INV-H5 S5b: 끝나는 날이 내일이면 보이고 막힌다", async () => {
    await saveOk(A.login, { categories: ["flower"], action: "block" });
    psql(`update public.creator_hard_items set ends_on = '${kstDate(1)}' where creator_id = '${A.creatorId}'`);
    const pub = await anonClient().rpc("creator_hard_items", { p_ids: [A.creatorId] });
    expect(pub.data).toEqual([{ id: A.creatorId, categories: ["flower"], reason: "many", action: "block" }]);
    expect((await register(FAN_X.id, A.creatorId, { category: "flower" })).error?.code).toBe("FKR03");
  });

  it("INV-H5: 끝나는 날의 기준은 한국 시간 0시다 — 한국 시간 날짜 함수(receiving_today_at)로 경계 시각을 넣어 본다", () => {
    // UTC 14:59:59 = 한국 23:59:59(같은 날), UTC 15:00 = 한국 다음 날 0시
    const live = (now: string, endsOn: string) => psql(`select public.hard_items_live('${endsOn}'::date, public.receiving_today_at('${now}'::timestamptz))`);
    expect(live("2026-10-17T14:59:59Z", "2026-10-18")).toBe("t");
    expect(live("2026-10-17T15:00:00Z", "2026-10-18")).toBe("f");
    expect(psql(`select public.hard_items_live(null, date '2030-01-01')`)).toBe("t");
  });
});

describe("INV-H6: 공개 읽기에는 끝나는 날·기간이 없다", () => {
  it("INV-H6 S6c: 로그인 안 한 사람의 공개 읽기에는 품목·이유·동작만 있고, 본인 읽기에는 끝나는 날이 있다", async () => {
    await saveOk(A.login, { categories: ["clothing", "stationery"], reason: "away", period: "week2", action: "notice" });
    const pub = await anonClient().rpc("creator_hard_items", { p_ids: [A.creatorId, B.creatorId] });
    expect(pub.error).toBeNull();
    expect(pub.data).toEqual([{ id: A.creatorId, categories: ["clothing", "stationery"], reason: "away", action: "notice" }]);
    expect(JSON.stringify(pub.data)).not.toMatch(/ends|period|week|20\d\d-/);
    const mine = await (await client(A.login)).rpc("my_creator_hard_items");
    expect((mine.data as { ends_on: string }[])[0]?.ends_on).toBe(kstDate(14));
  });

  it("INV-H6 (실패경로): 본인 확인을 마치지 않은 크리에이터의 설정은 공개 읽기에 나오지 않는다", async () => {
    await saveOk(B.login, { categories: ["doll"] });
    psql(`begin; set local session_replication_role = replica; update public.creators set identity_verified = false where id = '${B.creatorId}'; commit;`);
    const pub = await anonClient().rpc("creator_hard_items", { p_ids: [B.creatorId] });
    expect(pub.data).toEqual([]);
  });
});

describe("INV-H7: 「등록 막기」에 겹치는 종류는 등록 함수가 거부한다", () => {
  it("INV-H7 S7 (실패경로): 꽃 「등록 막기」면 꽃으로 등록이 FKR03 으로 거부되고 주문이 생기지 않는다", async () => {
    await saveOk(A.login, { categories: ["doll", "flower"], action: "block" });
    expect((await register(FAN_X.id, A.creatorId, { category: "flower" })).error?.code).toBe("FKR03");
    expect((await register(FAN_X.id, A.creatorId, { category: "doll" })).error?.code).toBe("FKR03");
    expect(ordersOf(A.creatorId)).toBe(0);
  });

  it("INV-H7 S7: 기타도 받기 어려운 품목으로 막을 수 있다", async () => {
    await saveOk(A.login, { categories: ["other"], action: "block" });
    expect((await register(FAN_X.id, A.creatorId, { category: "other", text: "앨범" })).error?.code).toBe("FKR03");
  });

  it("INV-H7 S7b: 「안내만」이면 등록된다", async () => {
    await saveOk(A.login, { categories: ["flower"], action: "notice" });
    expect((await register(FAN_X.id, A.creatorId, { category: "flower" })).error).toBeNull();
  });

  it("INV-H7 S7b: 「등록 막기」라도 겹치지 않는 종류·다른 크리에이터에게는 등록된다", async () => {
    await saveOk(A.login, { categories: ["flower"], action: "block" });
    expect((await register(FAN_X.id, A.creatorId, { category: "stationery" })).error).toBeNull();
    expect((await register(FAN_X.id, B.creatorId, { category: "flower" })).error).toBeNull();
  });

  it("INV-H7: 설정을 해제하면 바로 등록된다", async () => {
    await saveOk(A.login, { categories: ["flower"], action: "block" });
    await saveOk(A.login, { categories: [] });
    expect((await register(FAN_X.id, A.creatorId, { category: "flower" })).error).toBeNull();
  });

  it("INV-H7 S7c (동시): 크리에이터가 꽃 「등록 막기」를 저장하는 처리가 끝나기 전에 시작한 꽃 등록은 저장이 끝난 뒤 판정되어 FKR03", async () => {
    followForTest(FAN_X.id, A.creatorId);
    // 저장 함수를 A 의 로그인으로 부른 처리를 2초 동안 열어 둔다 — 그 사이 등록을 시작한다
    const claims = JSON.stringify({ sub: A.id, role: "authenticated" });
    const hold = await holdRowLock(
      `set local role authenticated; select set_config('request.jwt.claims', '${claims}', true); select set_config('request.jwt.claim.sub', '${A.id}', true); select public.update_my_creator_hard_items(array['flower'], 'many', 'week1', 'block')`,
      2,
    );
    const r = await register(FAN_X.id, A.creatorId, { category: "flower" });
    await hold.released;
    expect(r.error?.code).toBe("FKR03");
    expect(ordersOf(A.creatorId)).toBe(0);
    expect(hardItemsOf(A.creatorId)).toBe(`flower|many|week1|${kstDate(7)}|block`);
  });
});

describe("INV-H1·H7: 옛 호출(종류 없이 물품 이름만)은 기타로 친다", () => {
  it("종류를 주지 않으면 기타 + 그 글로 저장된다 — 시험 도우미(「시험 선물」)와 같은 호출", async () => {
    const r = await register(FAN_X.id, A.creatorId, { text: "시험 선물" });
    expect(r.error).toBeNull();
    expect(orderItemOf(r.orderNo)).toBe("other|시험 선물|false");
  });
});

describe("INV-H5: 등록·읽기·저장은 한국 시간 오늘(receiving_today)로 판정한다", () => {
  it("INV-H5: 한 처리 안에서 오늘을 2030-01-10 으로 바꿔 끼우면 — 끝나는 날 2030-01-05 설정은 공개·본인 읽기에 없고 등록을 막지 않으며, 새로 저장한 1주는 2030-01-17 에 끝난다(되돌림)", () => {
    followForTest(FAN_X.id, A.creatorId);
    const claims = JSON.stringify({ sub: A.id, role: "authenticated" });
    const out = psql(
      [
        "begin;",
        // DB 날짜(current_date 등)를 쓰면 2026 년이라 2030-01-05 설정이 살아 있는 것으로 보이고, 저장한 끝나는 날도 2026 년이 된다
        "create or replace function public.receiving_today() returns date language sql stable set search_path = '' as $f$ select date '2030-01-10' $f$;",
        `insert into public.creator_hard_items (creator_id, categories, reason, period, ends_on, action) values ('${A.creatorId}', array['flower'], 'many', 'week1', date '2030-01-05', 'block');`,
        `select 'pub=' || count(*) from public.creator_hard_items(array['${A.creatorId}']::uuid[]);`,
        `select 'cfg=' || length(set_config('request.jwt.claims', '${claims}', true)) || length(set_config('request.jwt.claim.sub', '${A.id}', true));`,
        "select 'mine=' || count(*) from public.my_creator_hard_items();",
        `select 'reg=' || (public.register_order('${FAN_X.id}', '${A.creatorId}', 'FC-HTODAY', null, false, array['small']::public.parcel_tier[], 'pay_hard_today', 0, 1400, 1500, 4000, 6900, null, 'flower') is not null);`,
        "select 'save=done' from (select public.update_my_creator_hard_items(array['doll'], 'many', 'week1', 'notice')) s;",
        `select 'ends=' || ends_on from public.creator_hard_items where creator_id = '${A.creatorId}';`,
        "rollback;",
      ].join(" "),
    );
    const got = out.split("\n").filter((l) => /^(pub|mine|reg|save|ends)=/.test(l));
    expect(got).toEqual(["pub=0", "mine=0", "reg=true", "save=done", "ends=2030-01-17"]);
    // 되돌렸으니 함수도 설정도 그대로다
    expect(psql("select public.receiving_today() = (now() at time zone 'Asia/Seoul')::date")).toBe("t");
    expect(hardItemsOf(A.creatorId)).toBe("");
  });
});
