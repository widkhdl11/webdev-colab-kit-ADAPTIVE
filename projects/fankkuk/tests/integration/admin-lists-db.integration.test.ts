import { afterEach, describe, expect, it } from "vitest";
import { orderArgs, SMALL_FIRST } from "./admin-pricing-helpers";
import { adminClient, anonClient, deleteTestOrders, psql, SEED, signedInClient } from "./helpers";

// 관리자 3단계 — 보낼 수 없는 물품(INV-K9) · 크리에이터 본인 확인(INV-K10) · 공지·1:1 문의(INV-K11).
// 시드: fankkuk_admin = 대표 운영자, fankkuk_staff = 직원 운영자, byeolbit_fan = 별빛, daltokki_fan = 달토끼.

type Item = { id: string; name: string; description: string };

// 시험이 만드는 것은 이름 앞머리로 가려 지운다. 기록 표는 추가만이라 트리거를 끄고 지운다.
const TEST_PREFIX = "시험-";
const TEST_CREATOR_ID = "00000000-0000-4000-b000-0000000000f1";

function insertTestCreator(verified: boolean): void {
  psql(
    `insert into public.creators (id, slug, name, channel, identity_verified) values ('${TEST_CREATOR_ID}', 'test-verify', '${TEST_PREFIX}확인', '유튜브', ${verified}) on conflict (id) do update set identity_verified = excluded.identity_verified`,
  );
}

function cleanup(): void {
  deleteTestOrders();
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `delete from public.prohibited_item_changes where coalesce(name_after, name_before) like '${TEST_PREFIX}%';`,
      `delete from public.prohibited_items where name like '${TEST_PREFIX}%';`,
      `delete from public.creator_verification_events where creator_id = '${TEST_CREATOR_ID}';`,
      `delete from public.follows where creator_id = '${TEST_CREATOR_ID}';`,
      `delete from public.creators where id = '${TEST_CREATOR_ID}';`,
      `delete from public.notices where title like '${TEST_PREFIX}%';`,
      `delete from public.inquiries where title like '${TEST_PREFIX}%';`,
      "commit;",
    ].join(" "),
  );
}

afterEach(cleanup);

describe("보낼 수 없는 물품 목록 (INV-K9)", () => {
  it("INV-K9 (S9): 운영자가 하나 추가하면 로그인하지 않은 사람의 공개 목록에 보인다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const add = await staff.rpc("admin_add_prohibited_item", { p_name: `${TEST_PREFIX}전동 킥보드`, p_description: "배터리가 들어 있어요." });
    expect(add.error).toBeNull();
    const pub = await anonClient().rpc("list_prohibited_items");
    expect(pub.error).toBeNull();
    expect((pub.data as Item[]).map((r) => r.name)).toContain(`${TEST_PREFIX}전동 킥보드`);
  });

  it("INV-K9 (S9b, 실패경로): 크리에이터·팬이 추가·고치기·지우기 → 거부, 목록 그대로", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const id = (await owner.rpc("admin_add_prohibited_item", { p_name: `${TEST_PREFIX}원본`, p_description: "" })).data as string;
    for (const who of ["haru_creator", "byeolbit_fan"]) {
      const c = await signedInClient(who);
      expect((await c.rpc("admin_add_prohibited_item", { p_name: `${TEST_PREFIX}몰래`, p_description: "" })).error?.code).toBe("42501");
      expect((await c.rpc("admin_edit_prohibited_item", { p_id: id, p_name: `${TEST_PREFIX}바꿈`, p_description: "" })).error?.code).toBe("42501");
      expect((await c.rpc("admin_delete_prohibited_item", { p_id: id })).error?.code).toBe("42501");
      expect((await c.rpc("admin_prohibited_items")).data).toEqual([]);
      expect((await c.rpc("admin_prohibited_changes")).data).toEqual([]);
    }
    expect(psql(`select string_agg(name, ',') from public.prohibited_items where name like '${TEST_PREFIX}%'`)).toBe(`${TEST_PREFIX}원본`);
    expect(psql(`select count(*) from public.prohibited_item_changes where coalesce(name_after, name_before) like '${TEST_PREFIX}%'`)).toBe("1");
  });

  it("INV-K9 (실패경로): 로그인하지 않은 키로는 추가할 수 없다", async () => {
    expect((await anonClient().rpc("admin_add_prohibited_item", { p_name: `${TEST_PREFIX}손님`, p_description: "" })).error).not.toBeNull();
    expect(psql(`select count(*) from public.prohibited_items where name like '${TEST_PREFIX}%'`)).toBe("0");
  });

  it.each([
    ["이름 빈칸", "", ""],
    ["이름 공백만", "   ", ""],
    ["이름 41자", `${TEST_PREFIX}${"가".repeat(41 - TEST_PREFIX.length)}`, ""],
    ["설명 121자", `${TEST_PREFIX}길다`, "나".repeat(121)],
  ])("INV-K9 (실패경로): %s → 거부", async (_label, name, description) => {
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_add_prohibited_item", { p_name: name, p_description: description })).error?.code).toBe("22023");
    expect(psql("select count(*) from public.prohibited_items where name like '시험-%' or btrim(name) = ''")).toBe("0");
  });

  it("INV-K9: 경계값 — 이름 40자·설명 120자는 저장된다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const name = `${TEST_PREFIX}${"가".repeat(40 - TEST_PREFIX.length)}`;
    expect((await staff.rpc("admin_add_prohibited_item", { p_name: name, p_description: "나".repeat(120) })).error).toBeNull();
  });

  it("INV-K9: 추가·고치기·지우기가 각각 한 줄씩 남는다 — 누가·무엇을(전·후)", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const id = (await staff.rpc("admin_add_prohibited_item", { p_name: `${TEST_PREFIX}가`, p_description: "처음" })).data as string;
    expect((await staff.rpc("admin_edit_prohibited_item", { p_id: id, p_name: `${TEST_PREFIX}나`, p_description: "고침" })).error).toBeNull();
    expect((await staff.rpc("admin_delete_prohibited_item", { p_id: id })).error).toBeNull();
    const log = (await staff.rpc("admin_prohibited_changes")).data as {
      changed_by_nickname: string;
      action: string;
      name_before: string | null;
      name_after: string | null;
      description_after: string | null;
    }[];
    const mine = log.filter((r) => (r.name_after ?? r.name_before ?? "").startsWith(TEST_PREFIX));
    expect(mine.map((r) => [r.action, r.name_before, r.name_after, r.changed_by_nickname])).toEqual([
      ["delete", `${TEST_PREFIX}나`, null, "팬꾹 직원"],
      ["edit", `${TEST_PREFIX}가`, `${TEST_PREFIX}나`, "팬꾹 직원"],
      ["add", null, `${TEST_PREFIX}가`, "팬꾹 직원"],
    ]);
    expect(mine[1].description_after).toBe("고침");
    expect(psql(`select count(*) from public.prohibited_items where id = '${id}'`)).toBe("0");
  });

  it("INV-K9 (실패경로): 바뀐 기록은 고치거나 지울 수 없다 — DB 소유자도", async () => {
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("admin_add_prohibited_item", { p_name: `${TEST_PREFIX}기록`, p_description: "" });
    const upd = (() => {
      try {
        psql(`update public.prohibited_item_changes set name_after = '${TEST_PREFIX}바꿈' where name_after = '${TEST_PREFIX}기록'`);
        return null;
      } catch (e) {
        return String((e as { stderr?: string }).stderr ?? e);
      }
    })();
    expect(upd).toMatch(/고치거나 지울 수 없다/);
    const del = (() => {
      try {
        psql(`delete from public.prohibited_item_changes where name_after = '${TEST_PREFIX}기록'`);
        return null;
      } catch (e) {
        return String((e as { stderr?: string }).stderr ?? e);
      }
    })();
    expect(del).toMatch(/고치거나 지울 수 없다/);
  });

  it("INV-K9 (실패경로): 없는 항목을 고치거나 지우면 오류이고 기록도 남지 않는다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const ghost = "00000000-0000-4000-9000-000000000000";
    expect((await staff.rpc("admin_edit_prohibited_item", { p_id: ghost, p_name: `${TEST_PREFIX}유령`, p_description: "" })).error?.code).toBe("P0002");
    expect((await staff.rpc("admin_delete_prohibited_item", { p_id: ghost })).error?.code).toBe("P0002");
    expect(psql(`select count(*) from public.prohibited_item_changes where coalesce(name_after, name_before) like '${TEST_PREFIX}%'`)).toBe("0");
  });

  it("INV-K9 (실패경로): 표를 직접 고칠 수 없다 — 운영자도 함수로만", async () => {
    const owner = await signedInClient("fankkuk_admin");
    await owner.from("prohibited_items").insert({ name: `${TEST_PREFIX}직접`, description: "" });
    expect(psql(`select count(*) from public.prohibited_items where name like '${TEST_PREFIX}%'`)).toBe("0");
  });
});

describe("크리에이터 본인 확인 승인·취소 (INV-K10)", () => {
  it("INV-K10 (S10): 승인을 취소하면 팬의 찾기에서 사라지고 새 선물 등록·팔로우가 막힌다", async () => {
    insertTestCreator(true);
    const staff = await signedInClient("fankkuk_staff");
    const r = await staff.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: false, p_reason: "코드가 사라짐" });
    expect(r.error).toBeNull();

    const fan = await signedInClient("byeolbit_fan");
    const found = (await fan.rpc("list_creators")).data as { id: string }[];
    expect(found.map((c) => c.id)).not.toContain(TEST_CREATOR_ID);
    expect((await fan.rpc("set_follow", { p_creator_id: TEST_CREATOR_ID, p_following: true })).error).not.toBeNull();
    expect(psql(`select count(*) from public.follows where creator_id = '${TEST_CREATOR_ID}'`)).toBe("0");

    const reg = await adminClient().rpc("register_order", { ...orderArgs(["small"], SMALL_FIRST), p_creator_id: TEST_CREATOR_ID });
    expect(reg.error).not.toBeNull();
    expect(psql(`select count(*) from public.orders where creator_id = '${TEST_CREATOR_ID}'`)).toBe("0");
  });

  it("INV-K10: 승인하면 찾기에 나오고 선물 등록이 된다", async () => {
    insertTestCreator(false);
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: true, p_reason: "" })).error).toBeNull();
    const found = (await anonClient().rpc("list_creators")).data as { id: string }[];
    expect(found.map((c) => c.id)).toContain(TEST_CREATOR_ID);
    const reg = await adminClient().rpc("register_order", { ...orderArgs(["small"], SMALL_FIRST), p_creator_id: TEST_CREATOR_ID });
    expect(reg.error).toBeNull();
  });

  it("INV-K10: 이미 등록된 주문은 취소 뒤에도 그대로 간다", async () => {
    insertTestCreator(true);
    const reg = await adminClient().rpc("register_order", { ...orderArgs(["small"], SMALL_FIRST), p_creator_id: TEST_CREATOR_ID });
    expect(reg.error).toBeNull();
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: false, p_reason: "" })).error).toBeNull();
    expect(psql(`select status from public.orders where id = '${reg.data as string}'`)).toBe("pending_payment");
  });

  it("INV-K10 (실패경로): 크리에이터·팬은 승인·취소할 수 없고 기록도 남지 않는다", async () => {
    insertTestCreator(false);
    // 운영자 기록이 하나 있어야 「빈 결과」가 필터 덕인지 볼 수 있다
    psql(`insert into public.creator_verification_events (creator_id, acted_by, action) values ('${TEST_CREATOR_ID}', '00000000-0000-4000-a000-000000000022', 'revoke')`);
    for (const who of ["haru_creator", "byeolbit_fan"]) {
      const c = await signedInClient(who);
      expect((await c.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: true, p_reason: "" })).error?.code).toBe("42501");
      expect((await c.rpc("admin_creators")).data).toEqual([]);
      expect((await c.rpc("admin_creator_verification_events")).data).toEqual([]);
    }
    expect((await anonClient().rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: true, p_reason: "" })).error).not.toBeNull();
    expect(psql(`select identity_verified from public.creators where id = '${TEST_CREATOR_ID}'`)).toBe("f");
    expect(psql(`select count(*) from public.creator_verification_events where creator_id = '${TEST_CREATOR_ID}'`)).toBe("1");
  });

  it("INV-K10: 누가 언제 무엇을 했는지 남는다 — 운영자 목록에는 마지막 처리한 사람이 보인다", async () => {
    insertTestCreator(false);
    const owner = await signedInClient("fankkuk_admin");
    const staff = await signedInClient("fankkuk_staff");
    await owner.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: true, p_reason: "" });
    await staff.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: false, p_reason: "코드가 사라짐" });
    const events = ((await staff.rpc("admin_creator_verification_events")).data as {
      actor_nickname: string;
      creator_id: string;
      action: string;
      reason: string;
      at: string;
    }[]).filter((e) => e.creator_id === TEST_CREATOR_ID);
    expect(events.map((e) => [e.action, e.actor_nickname, e.reason])).toEqual([
      ["revoke", "팬꾹 직원", "코드가 사라짐"],
      ["approve", "팬꾹 운영", ""],
    ]);
    expect(events.every((e) => !Number.isNaN(Date.parse(e.at)))).toBe(true);
    const row = ((await owner.rpc("admin_creators")).data as { id: string; verified: boolean; last_actor_nickname: string | null }[]).find(
      (c) => c.id === TEST_CREATOR_ID,
    );
    expect(row).toMatchObject({ verified: false, last_actor_nickname: "팬꾹 직원" });
  });

  it("INV-K10 (실패경로·동시): 같은 승인을 두 번 동시에 눌러도 기록은 하나, 이미 그 상태면 거부", async () => {
    insertTestCreator(false);
    const a = await signedInClient("fankkuk_admin");
    const b = await signedInClient("fankkuk_staff");
    const results = await Promise.all([
      a.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: true, p_reason: "" }),
      b.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: true, p_reason: "" }),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.code).toBe("55000");
    expect(psql(`select count(*) from public.creator_verification_events where creator_id = '${TEST_CREATOR_ID}'`)).toBe("1");
  });

  it("INV-K10 (실패경로): 없는 크리에이터는 오류, 사유 201자는 거부", async () => {
    insertTestCreator(true);
    const staff = await signedInClient("fankkuk_staff");
    const ghost = "00000000-0000-4000-9000-000000000000";
    expect((await staff.rpc("admin_set_creator_verified", { p_creator_id: ghost, p_verified: true, p_reason: "" })).error?.code).toBe("P0002");
    const long = await staff.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: false, p_reason: "가".repeat(201) });
    expect(long.error?.code).toBe("22023");
    expect(psql(`select identity_verified from public.creators where id = '${TEST_CREATOR_ID}'`)).toBe("t");
  });

  it("INV-K10 (실패경로): 처리 기록은 고치거나 지울 수 없다", async () => {
    insertTestCreator(false);
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: true, p_reason: "" });
    let err = "";
    try {
      psql(`update public.creator_verification_events set action = 'revoke' where creator_id = '${TEST_CREATOR_ID}'`);
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(err).toMatch(/고치거나 지울 수 없다/);
  });
});

type Inquiry = { id: string; title: string; body: string; status: string; answer: string | null };

async function writeInquiry(loginId: string, title = `${TEST_PREFIX}문의`): Promise<string> {
  const c = await signedInClient(loginId);
  const r = await c.rpc("create_inquiry", { p_title: title, p_body: "선물이 아직 안 갔어요." });
  if (r.error) throw new Error(`create_inquiry 실패: ${r.error.message}`);
  return r.data as string;
}

describe("공지 (INV-K11)", () => {
  it("INV-K11: 운영자가 쓴 공지가 공개 목록에 보이고, 본문은 빈 줄로 나눈 문단이 된다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const r = await staff.rpc("admin_save_notice", { p_slug: null, p_title: `${TEST_PREFIX}공지`, p_body: "첫 문단\n\n둘째 문단", p_pinned: false });
    expect(r.error).toBeNull();
    const list = (await anonClient().rpc("list_notices")).data as { slug: string; title: string; body: unknown }[];
    const mine = list.find((n) => n.title === `${TEST_PREFIX}공지`);
    expect(mine?.body).toEqual([
      { type: "text", parts: ["첫 문단"] },
      { type: "text", parts: ["둘째 문단"] },
    ]);
    expect(mine?.slug).toBe(r.data);
  });

  it("INV-K11: 고치면 같은 공지가 바뀌고 고정이 맨 위로 간다 — 쓴 사람은 운영자 목록에 닉네임으로", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const slug = (await owner.rpc("admin_save_notice", { p_slug: null, p_title: `${TEST_PREFIX}처음`, p_body: "본문", p_pinned: false })).data as string;
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_save_notice", { p_slug: slug, p_title: `${TEST_PREFIX}고침`, p_body: "새 본문", p_pinned: true })).error).toBeNull();
    const list = (await anonClient().rpc("list_notices")).data as { slug: string; title: string }[];
    expect(list[0]).toMatchObject({ slug, title: `${TEST_PREFIX}고침` });
    const admin = (await owner.rpc("admin_notices")).data as { slug: string; author_nickname: string | null }[];
    expect(admin.find((n) => n.slug === slug)?.author_nickname).toBe("팬꾹 운영");
  });

  it("INV-K11 (실패경로): 팬·크리에이터·손님은 공지를 쓰거나 고칠 수 없다", async () => {
    for (const who of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(who);
      expect((await c.rpc("admin_save_notice", { p_slug: null, p_title: `${TEST_PREFIX}몰래`, p_body: "x", p_pinned: true })).error?.code).toBe("42501");
      expect((await c.rpc("admin_save_notice", { p_slug: "n-open", p_title: `${TEST_PREFIX}몰래`, p_body: "x", p_pinned: true })).error?.code).toBe("42501");
      expect((await c.rpc("admin_notices")).data).toEqual([]);
    }
    expect((await anonClient().rpc("admin_save_notice", { p_slug: null, p_title: `${TEST_PREFIX}몰래`, p_body: "x", p_pinned: true })).error).not.toBeNull();
    expect(psql(`select count(*) from public.notices where title like '${TEST_PREFIX}%'`)).toBe("0");
    expect(psql("select title from public.notices where slug = 'n-open'")).toBe("팬꾹 서비스 시작 안내");
  });

  it.each([
    ["제목 빈칸", "", "본문"],
    ["제목 101자", `${TEST_PREFIX}${"가".repeat(101 - TEST_PREFIX.length)}`, "본문"],
    ["본문 빈칸", `${TEST_PREFIX}빈 본문`, "  \n\n  "],
    ["본문 5001자", `${TEST_PREFIX}긴 본문`, "나".repeat(5001)],
  ])("INV-K11 (실패경로): 공지 %s → 거부", async (_label, title, body) => {
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_save_notice", { p_slug: null, p_title: title, p_body: body, p_pinned: false })).error?.code).toBe("22023");
  });

  it("INV-K11 (실패경로): 없는 공지를 고치면 오류", async () => {
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_save_notice", { p_slug: "n-no-such", p_title: `${TEST_PREFIX}x`, p_body: "x", p_pinned: false })).error?.code).toBe("P0002");
  });
});

describe("1:1 문의 (INV-K11)", () => {
  it("INV-K11 (S11): 별빛의 문의를 달토끼가 읽으면 빈 결과, 별빛 본인과 운영자는 읽는다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const dal = await signedInClient("daltokki_fan");
    expect(((await dal.rpc("my_inquiries")).data as Inquiry[]).map((q) => q.id)).not.toContain(id);
    expect((await dal.from("inquiries").select("id").eq("id", id)).data ?? []).toEqual([]);
    const creator = await signedInClient("haru_creator");
    expect((await creator.rpc("admin_inquiries")).data).toEqual([]);

    const me = await signedInClient("byeolbit_fan");
    expect(((await me.rpc("my_inquiries")).data as Inquiry[]).map((q) => q.id)).toContain(id);
    const staff = await signedInClient("fankkuk_staff");
    const row = ((await staff.rpc("admin_inquiries")).data as (Inquiry & { author_nickname: string })[]).find((q) => q.id === id);
    expect(row).toMatchObject({ author_nickname: "별빛", status: "open" });
  });

  it("INV-K11: 답은 운영자가 달고, 쓴 사람은 답을 읽는다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_answer_inquiry", { p_id: id, p_answer: "오늘 출고돼요." })).error).toBeNull();
    const me = await signedInClient("byeolbit_fan");
    const mine = ((await me.rpc("my_inquiries")).data as Inquiry[]).find((q) => q.id === id);
    expect(mine).toMatchObject({ status: "answered", answer: "오늘 출고돼요." });
  });

  it("INV-K11 (실패경로): 운영자가 아닌 사람은 답을 달 수 없다 — 쓴 사람 본인도", async () => {
    const id = await writeInquiry("byeolbit_fan");
    for (const who of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(who);
      expect((await c.rpc("admin_answer_inquiry", { p_id: id, p_answer: "셀프 답" })).error?.code).toBe("42501");
    }
    expect(psql(`select status from public.inquiries where id = '${id}'`)).toBe("open");
  });

  it("INV-K11: 답이 달리기 전에는 쓴 사람이 고칠 수 있다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const me = await signedInClient("byeolbit_fan");
    expect((await me.rpc("edit_my_inquiry", { p_id: id, p_title: `${TEST_PREFIX}고친 문의`, p_body: "고쳤어요" })).error).toBeNull();
    expect(psql(`select title || '/' || body from public.inquiries where id = '${id}'`)).toBe(`${TEST_PREFIX}고친 문의/고쳤어요`);
  });

  it("INV-K11 (S11b, 실패경로): 답이 달린 문의를 쓴 사람이 고치려 하면 거부", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("admin_answer_inquiry", { p_id: id, p_answer: "답" });
    const me = await signedInClient("byeolbit_fan");
    expect((await me.rpc("edit_my_inquiry", { p_id: id, p_title: `${TEST_PREFIX}바꿈`, p_body: "바꿈" })).error?.code).toBe("55000");
    expect(psql(`select title from public.inquiries where id = '${id}'`)).toBe(`${TEST_PREFIX}문의`);
  });

  it("INV-K11 (실패경로): 남의 문의는 고칠 수 없다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const dal = await signedInClient("daltokki_fan");
    expect((await dal.rpc("edit_my_inquiry", { p_id: id, p_title: `${TEST_PREFIX}남의 것`, p_body: "x" })).error?.code).toBe("P0002");
    expect(psql(`select title from public.inquiries where id = '${id}'`)).toBe(`${TEST_PREFIX}문의`);
  });

  it("INV-K11 (실패경로): 답이 달린 문의는 DB 소유자가 직접 고쳐도 제목·본문이 안 바뀐다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("admin_answer_inquiry", { p_id: id, p_answer: "답" });
    let err = "";
    try {
      psql(`update public.inquiries set body = '바꿈' where id = '${id}'`);
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(err).toMatch(/답이 달린 문의/);
  });

  it.each([
    ["답한 사람", "answered_by = '00000000-0000-4000-a000-000000000021'"],
    ["답한 시각", "answered_at = now() - interval '1 day'"],
    ["답", "answer = '바꾼 답'"],
  ])("INV-K11 (실패경로): 답이 달린 문의의 %s도 직접 바꿀 수 없다", async (_label, set) => {
    const id = await writeInquiry("byeolbit_fan");
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("admin_answer_inquiry", { p_id: id, p_answer: "답" });
    let err = "";
    try {
      psql(`update public.inquiries set ${set} where id = '${id}'`);
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(err).toMatch(/답이 달린 문의/);
  });

  it("INV-K11 (동시): 고치기와 답 달기가 겹쳐도 답이 달린 뒤에 본문이 바뀌는 일은 없다", async () => {
    for (let i = 0; i < 6; i++) {
      const id = await writeInquiry("byeolbit_fan", `${TEST_PREFIX}동시${i}`);
      const me = await signedInClient("byeolbit_fan");
      const staff = await signedInClient("fankkuk_staff");
      const [edit, answer] = await Promise.all([
        me.rpc("edit_my_inquiry", { p_id: id, p_title: `${TEST_PREFIX}동시${i}`, p_body: "고친 본문" }),
        staff.rpc("admin_answer_inquiry", { p_id: id, p_answer: "답" }),
      ]);
      expect(answer.error).toBeNull();
      // 고치기가 성공했으면 답보다 먼저 들어간 것이고, 실패했으면 답 뒤라 거부된 것이다 — 어느 쪽이든 본문과 답이 어긋나지 않는다
      const body = psql(`select body from public.inquiries where id = '${id}'`);
      expect(body).toBe(edit.error === null ? "고친 본문" : "선물이 아직 안 갔어요.");
      if (edit.error) expect(edit.error.code).toBe("55000");
    }
  });

  it("INV-K11 (실패경로): 이미 답한 문의에 다시 답하면 거부, 처음 답 그대로", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("admin_answer_inquiry", { p_id: id, p_answer: "처음 답" });
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_answer_inquiry", { p_id: id, p_answer: "두 번째" })).error?.code).toBe("55000");
    expect(psql(`select answer from public.inquiries where id = '${id}'`)).toBe("처음 답");
  });

  it.each([
    ["제목 빈칸", "", "본문"],
    ["본문 4001자", `${TEST_PREFIX}길다`, "나".repeat(4001)],
  ])("INV-K11 (실패경로): 문의 %s → 거부", async (_label, title, body) => {
    const me = await signedInClient("byeolbit_fan");
    expect((await me.rpc("create_inquiry", { p_title: title, p_body: body })).error?.code).toBe("22023");
  });

  it("INV-K11 (실패경로): 로그인하지 않으면 문의를 남길 수 없다", async () => {
    expect((await anonClient().rpc("create_inquiry", { p_title: `${TEST_PREFIX}손님`, p_body: "x" })).error).not.toBeNull();
    expect(psql(`select count(*) from public.inquiries where title like '${TEST_PREFIX}%'`)).toBe("0");
  });

  it("INV-K8: 관리자 문의 목록은 아이디·닉네임만 — 실명·전화·주소 칸이 없다", async () => {
    await writeInquiry("byeolbit_fan");
    const staff = await signedInClient("fankkuk_staff");
    const rows = (await staff.rpc("admin_inquiries")).data as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const k of Object.keys(rows[0])) expect(k).not.toMatch(/^(name|real_?name|full_?name)$|phone|address|email|zip/);
    expect(rows[0]).toHaveProperty("author_login_id");
  });
});

// 시드 별빛 = SEED.fanId. 문의 작성자가 로그인한 사람으로 정해지는지(입력으로 받지 않는지) 본다.
describe("문의 작성자는 로그인한 사람 (INV-K11)", () => {
  it("INV-K11: 작성자 칸은 로그인한 사람 ID 다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    expect(psql(`select author_id from public.inquiries where id = '${id}'`)).toBe(SEED.fanId);
  });
});
