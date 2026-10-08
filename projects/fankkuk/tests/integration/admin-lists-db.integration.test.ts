import { afterEach, describe, expect, it } from "vitest";
import { orderArgs, SMALL_FIRST } from "./admin-pricing-helpers";
import { adminClient, anonClient, deleteTestOrders, followForTest, psql, psqlError, SEED, signedInClient } from "./helpers";

// 관리자 3단계 — 보낼 수 없는 물품(INV-K9) · 크리에이터 본인 확인(INV-K10) · 공지·1:1 문의(INV-K11) · 문의 제한(INV-K12).
// 시드: fankkuk_admin = 대표 운영자, fankkuk_staff = 직원 운영자, byeolbit_fan = 별빛, daltokki_fan = 달토끼.

type Item = { id: string; name: string; description: string };

// 시험이 만드는 것은 이름 앞머리로 가려 지운다. 기록 표는 추가만이라 트리거를 끄고 지운다.
const TEST_PREFIX = "시험-";
const TEST_CREATOR_ID = "00000000-0000-4000-b000-0000000000f1";

function insertTestCreator(verified: boolean): void {
  // 확인된 크리에이터는 승인 함수로만 생긴다(creator-verification INV-V6) — 시드처럼 그 표시를 켜고 넣는다
  psql(
    `select set_config('fankkuk.verifying', 'on', false); insert into public.creators (id, slug, name, channel, identity_verified) values ('${TEST_CREATOR_ID}', 'test-verify', '${TEST_PREFIX}확인', '유튜브', ${verified}) on conflict (id) do update set identity_verified = excluded.identity_verified`,
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
      `delete from public.inquiry_restriction_events where reason like '${TEST_PREFIX}%';`,
      `delete from public.inquiry_restrictions where reason like '${TEST_PREFIX}%';`,
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

describe("보낼 수 없는 물품 — 처음 목록 (INV-K9, DECISIONS 2026-10-08 정책 ④)", () => {
  it("INV-K9: 택배 표준약관 수탁 거절 품목과 상하는 음식이 공개 목록에 있다", async () => {
    const r = await anonClient().rpc("list_prohibited_items");
    expect(r.error).toBeNull();
    const names = (r.data as Item[]).map((x) => x.name);
    for (const n of ["음식과 신선식품", "살아 있는 동물·동물 사체와 식물", "폭발·인화성 물질 등 위험물", "현금·카드·상품권·유가증권", "위법한 물건", "다시 만들 수 없는 서류", "가액이 300만 원을 넘는 물건"]) {
      expect(names).toContain(n);
    }
  });
});

describe("크리에이터 본인 확인 승인·취소 (INV-K10)", () => {
  // 승인은 신청을 거쳐서만 된다(creator-verification INV-V6) — 승인 쪽 시험은 creator-verification-db 에 있다.
  // 여기서는 취소(INV-K10 + INV-V9 사유)와 옛 승인 함수가 신청 없는 승인을 거부하는지를 본다.
  const revokeArgs = (memo = "", code = "channel_gone") => ({ p_creator_id: TEST_CREATOR_ID, p_reason_code: code, p_memo: memo });

  it("INV-K10 (S10): 승인을 취소하면 팬의 찾기에서 사라지고 새 선물 등록·팔로우가 막힌다", async () => {
    insertTestCreator(true);
    const staff = await signedInClient("fankkuk_staff");
    const r = await staff.rpc("admin_revoke_creator", revokeArgs("채널이 삭제됨"));
    expect(r.error).toBeNull();

    const fan = await signedInClient("byeolbit_fan");
    const found = (await fan.rpc("list_creators")).data as { id: string }[];
    expect(found.map((c) => c.id)).not.toContain(TEST_CREATOR_ID);
    expect((await fan.rpc("set_follow", { p_creator_id: TEST_CREATOR_ID, p_following: true })).error).not.toBeNull();
    expect(psql(`select count(*) from public.follows where creator_id = '${TEST_CREATOR_ID}'`)).toBe("0");

    followForTest(SEED.fanId, TEST_CREATOR_ID);
    const reg = await adminClient().rpc("register_order", { ...orderArgs(["small"], SMALL_FIRST), p_creator_id: TEST_CREATOR_ID });
    expect(reg.error).not.toBeNull();
    expect(psql(`select count(*) from public.orders where creator_id = '${TEST_CREATOR_ID}'`)).toBe("0");
  });

  it("INV-K10 (실패경로): 옛 승인 함수로 신청 없이 승인할 수 없다 — 취소는 「그 밖」 사유로 된다", async () => {
    insertTestCreator(false);
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: true, p_reason: "" })).error?.code).toBe("FKV11");
    expect(psql(`select identity_verified from public.creators where id = '${TEST_CREATOR_ID}'`)).toBe("f");
    psql(`delete from public.creators where id = '${TEST_CREATOR_ID}'`);
    insertTestCreator(true);
    expect((await owner.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: false, p_reason: "옛 화면" })).error).toBeNull();
    expect(psql(`select identity_verified from public.creators where id = '${TEST_CREATOR_ID}'`)).toBe("f");
    expect(psql(`select action || '|' || reason_code || '|' || reason from public.creator_verification_events where creator_id = '${TEST_CREATOR_ID}'`)).toBe("revoke|other|옛 화면");
  });

  it("INV-K10: 이미 등록된 주문은 취소 뒤에도 그대로 간다", async () => {
    insertTestCreator(true);
    followForTest(SEED.fanId, TEST_CREATOR_ID);
    const reg = await adminClient().rpc("register_order", { ...orderArgs(["small"], SMALL_FIRST), p_creator_id: TEST_CREATOR_ID });
    expect(reg.error).toBeNull();
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_revoke_creator", revokeArgs())).error).toBeNull();
    expect(psql(`select status from public.orders where id = '${reg.data as string}'`)).toBe("pending_payment");
  });

  it("INV-K10 (실패경로): 크리에이터·팬은 취소할 수 없고 기록도 남지 않는다", async () => {
    insertTestCreator(true);
    // 운영자 기록이 하나 있어야 「빈 결과」가 필터 덕인지 볼 수 있다
    psql(`insert into public.creator_verification_events (creator_id, acted_by, action) values ('${TEST_CREATOR_ID}', '00000000-0000-4000-a000-000000000022', 'revoke')`);
    for (const who of ["haru_creator", "byeolbit_fan"]) {
      const c = await signedInClient(who);
      expect((await c.rpc("admin_revoke_creator", revokeArgs())).error?.code).toBe("42501");
      expect((await c.rpc("admin_set_creator_verified", { p_creator_id: TEST_CREATOR_ID, p_verified: false, p_reason: "" })).error?.code).toBe("42501");
      expect((await c.rpc("admin_creators")).data).toEqual([]);
      expect((await c.rpc("admin_creator_verification_events")).data).toEqual([]);
    }
    expect((await anonClient().rpc("admin_revoke_creator", revokeArgs())).error).not.toBeNull();
    expect(psql(`select identity_verified from public.creators where id = '${TEST_CREATOR_ID}'`)).toBe("t");
    expect(psql(`select count(*) from public.creator_verification_events where creator_id = '${TEST_CREATOR_ID}'`)).toBe("1");
  });

  it("INV-K10: 누가 언제 무엇을 했는지 남는다 — 운영자 목록에는 마지막 처리한 사람이 보인다", async () => {
    insertTestCreator(true);
    const owner = await signedInClient("fankkuk_admin");
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_revoke_creator", revokeArgs("채널이 삭제됨"))).error).toBeNull();
    const events = ((await staff.rpc("admin_creator_verification_events")).data as {
      actor_nickname: string;
      creator_id: string;
      action: string;
      reason: string;
      reason_code: string;
      at: string;
    }[]).filter((e) => e.creator_id === TEST_CREATOR_ID);
    expect(events.map((e) => [e.action, e.actor_nickname, e.reason_code, e.reason])).toEqual([["revoke", "팬꾹 직원", "channel_gone", "채널이 삭제됨"]]);
    expect(events.every((e) => !Number.isNaN(Date.parse(e.at)))).toBe(true);
    const row = ((await owner.rpc("admin_creators")).data as { id: string; verified: boolean; last_actor_nickname: string | null }[]).find(
      (c) => c.id === TEST_CREATOR_ID,
    );
    expect(row).toMatchObject({ verified: false, last_actor_nickname: "팬꾹 직원" });
  });

  it("INV-K10 (실패경로·동시): 같은 취소를 두 번 동시에 눌러도 기록은 하나, 이미 그 상태면 거부", async () => {
    insertTestCreator(true);
    const a = await signedInClient("fankkuk_admin");
    const b = await signedInClient("fankkuk_staff");
    const results = await Promise.all([a.rpc("admin_revoke_creator", revokeArgs()), b.rpc("admin_revoke_creator", revokeArgs())]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.code).toBe("55000");
    expect(psql(`select count(*) from public.creator_verification_events where creator_id = '${TEST_CREATOR_ID}'`)).toBe("1");
  });

  it("INV-K10 (실패경로): 없는 크리에이터는 오류, 메모 201자는 거부", async () => {
    insertTestCreator(true);
    const staff = await signedInClient("fankkuk_staff");
    const ghost = "00000000-0000-4000-9000-000000000000";
    expect((await staff.rpc("admin_revoke_creator", { ...revokeArgs(), p_creator_id: ghost })).error?.code).toBe("P0002");
    const long = await staff.rpc("admin_revoke_creator", revokeArgs("가".repeat(201)));
    expect(long.error?.code).toBe("22023");
    expect(psql(`select identity_verified from public.creators where id = '${TEST_CREATOR_ID}'`)).toBe("t");
  });

  it("INV-K10 (실패경로): 처리 기록은 고치거나 지울 수 없다", async () => {
    insertTestCreator(true);
    const staff = await signedInClient("fankkuk_staff");
    await staff.rpc("admin_revoke_creator", revokeArgs());
    let err = "";
    try {
      psql(`update public.creator_verification_events set action = 'approve' where creator_id = '${TEST_CREATOR_ID}'`);
    } catch (e) {
      err = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(err).toMatch(/고치거나 지울 수 없다/);
  });
});

type Inquiry = { id: string; title: string; body: string; status: string; answer: string | null; kind: string; order_no: string | null };

/** create_inquiry 인자. 분류는 여섯 코드 중 하나, 주문번호는 없으면 null. */
function inquiryArgs(title: string, body: string, kind = "shipping", orderNo: string | null = null) {
  return { p_kind: kind, p_title: title, p_body: body, p_order_no: orderNo };
}

async function writeInquiry(loginId: string, title = `${TEST_PREFIX}문의`, orderNo: string | null = null): Promise<string> {
  const c = await signedInClient(loginId);
  const r = await c.rpc("create_inquiry", inquiryArgs(title, "선물이 아직 안 갔어요.", "shipping", orderNo));
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
    expect((await me.rpc("create_inquiry", inquiryArgs(title, body))).error?.code).toBe("22023");
  });

  it("INV-K11 (실패경로): 로그인하지 않으면 문의를 남길 수 없다", async () => {
    expect((await anonClient().rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}손님`, "x"))).error).not.toBeNull();
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

describe("1:1 문의 분류·주문번호 (결정 d25)", () => {
  it("분류와 주문번호가 저장되고 my_inquiries·admin_inquiries 에 보인다", async () => {
    const id = await writeInquiry("byeolbit_fan", `${TEST_PREFIX}분류`, "FC-7K3M9");
    const me = await signedInClient("byeolbit_fan");
    const mine = ((await me.rpc("my_inquiries")).data as Inquiry[]).find((q) => q.id === id);
    expect(mine).toMatchObject({ kind: "shipping", order_no: "FC-7K3M9" });
    const staff = await signedInClient("fankkuk_staff");
    const row = ((await staff.rpc("admin_inquiries")).data as Inquiry[]).find((q) => q.id === id);
    expect(row).toMatchObject({ kind: "shipping", order_no: "FC-7K3M9" });
  });

  it.each(["gift", "fee", "shipping", "creator", "account", "etc"])("분류 %s 는 받는다", async (kind) => {
    const me = await signedInClient("byeolbit_fan");
    const r = await me.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}${kind}`, "본문", kind));
    expect(r.error).toBeNull();
    expect(psql(`select kind from public.inquiries where id = '${r.data as string}'`)).toBe(kind);
  });

  it("주문번호 없음(null·빈칸·공백만)은 받고 비어 있는 칸으로 저장한다", async () => {
    const me = await signedInClient("byeolbit_fan");
    for (const [i, orderNo] of [null, "", "   "].entries()) {
      const r = await me.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}번호없음${i}`, "본문", "etc", orderNo));
      expect(r.error).toBeNull();
      expect(psql(`select coalesce(order_no, '(null)') from public.inquiries where id = '${r.data as string}'`)).toBe("(null)");
    }
  });

  it("주문번호는 앞뒤 공백을 지우고 대문자로 바꿔 저장한다", async () => {
    const me = await signedInClient("byeolbit_fan");
    const r = await me.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}소문자`, "본문", "gift", "  fc-7k3m9-2 "));
    expect(r.error).toBeNull();
    expect(psql(`select order_no from public.inquiries where id = '${r.data as string}'`)).toBe("FC-7K3M9-2");
  });

  it.each([
    ["여섯 밖 분류", "refund", null],
    ["화면 라벨을 그대로 보낸 분류", "배송", null],
    ["빈 분류", "", null],
    ["대문자 분류", "GIFT", null],
    ["접두어가 다른 주문번호", "etc", "AB-7K3M9"],
    ["너무 짧은 주문번호", "etc", "FC-7K"],
    ["너무 긴 주문번호", "etc", "FC-12345678901"],
    ["뒷번호가 세 자리인 주문번호", "etc", "FC-7K3M9-123"],
    ["가운데 공백이 낀 주문번호", "etc", "FC-7K 3M9"],
    ["다른 문자가 섞인 주문번호", "etc", "FC-7K3M9;--"],
  ])("(실패경로): %s → 거부, 아무것도 저장 안 함", async (_label, kind, orderNo) => {
    const me = await signedInClient("byeolbit_fan");
    expect((await me.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}거부`, "본문", kind, orderNo))).error?.code).toBe("22023");
    expect(psql(`select count(*) from public.inquiries where title like '${TEST_PREFIX}%'`)).toBe("0");
  });

  it("(실패경로): 분류 없이 부르던 옛 모양(제목·본문만)은 더 없다", async () => {
    const me = await signedInClient("byeolbit_fan");
    expect((await me.rpc("create_inquiry", { p_title: `${TEST_PREFIX}옛 모양`, p_body: "본문" })).error).not.toBeNull();
    expect(psql(`select count(*) from public.inquiries where title like '${TEST_PREFIX}%'`)).toBe("0");
  });

  const directInsert = (kind: string, orderNo: string) =>
    `insert into public.inquiries (author_id, kind, title, body, order_no) values ('${SEED.fanId}', ${kind}, '${TEST_PREFIX}직접', '본문', ${orderNo})`;

  it("(실패경로): 표에 직접 넣어도 여섯 밖 분류는 막힌다", () => {
    expect(psqlError(directInsert("'refund'", "NULL"))).toMatch(/inquiries_kind_check/);
    expect(psql(`select count(*) from public.inquiries where title like '${TEST_PREFIX}%'`)).toBe("0");
  });

  it.each(["fc-7k3m9", "FC-", "FC-AB", "XX-12345", "FC-ABCDEFGHIJK", "FC-7K3M9-123", " FC-7K3M9", "FC-7K3M9 ", ""])(
    "(실패경로): 표에 직접 넣어도 꼴 틀린 주문번호 '%s' 는 막힌다",
    (orderNo) => {
      expect(psqlError(directInsert("'etc'", `'${orderNo}'`))).toMatch(/inquiries_order_no_check/);
      expect(psql(`select count(*) from public.inquiries where title like '${TEST_PREFIX}%'`)).toBe("0");
    },
  );

  it("표에 직접 넣을 때 꼴 맞는 주문번호는 들어간다(위 거부가 다른 이유로 난 게 아님을 확인)", () => {
    expect(psqlError(directInsert("'etc'", "'FC-7K3M9-2'"))).toBeNull();
    expect(psql(`select count(*) from public.inquiries where title like '${TEST_PREFIX}%'`)).toBe("1");
  });

  it("(실패경로): 분류 칸 없이 표에 직접 넣으면 막힌다 — 분류에 기본값이 없다", () => {
    const err = psqlError(
      `insert into public.inquiries (author_id, title, body) values ('${SEED.fanId}', '${TEST_PREFIX}분류없음', '본문')`,
    );
    expect(err).toMatch(/null value in column "kind"/);
    expect(psql(`select count(*) from public.inquiries where title like '${TEST_PREFIX}%'`)).toBe("0");
  });

  it("주문과 잇지 않음: 달토끼가 별빛의 실제 주문번호로 낸 문의와 없는 번호로 낸 문의가 똑같이 성공한다", async () => {
    // 시험 준비 확인: FC-7K3M9 는 별빛의 주문이고 FC-ZZZZ9 는 없는 주문이다
    expect(psql(`select p.login_id from public.orders o join public.profiles p on p.id = o.fan_id where o.order_no = 'FC-7K3M9'`)).toBe("byeolbit_fan");
    expect(psql(`select count(*) from public.orders where order_no = 'FC-ZZZZ9'`)).toBe("0");

    const dal = await signedInClient("daltokki_fan");
    const real = await dal.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}남의번호`, "본문", "shipping", "FC-7K3M9"));
    const none = await dal.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}없는번호`, "본문", "shipping", "FC-ZZZZ9"));
    expect(real.error).toBeNull();
    expect(none.error).toBeNull();
    // 돌려받는 것은 둘 다 새 문의 id 하나뿐 — 있는 번호인지 알 수 있는 다른 차이가 없다
    expect([typeof real.data, typeof none.data]).toEqual(["string", "string"]);
    expect([real.status, real.statusText]).toEqual([none.status, none.statusText]);

    const mine = (await dal.rpc("my_inquiries")).data as Inquiry[];
    const rows = [real.data, none.data].map((id) => mine.find((q) => q.id === id));
    expect(rows.map((q) => q?.order_no)).toEqual(["FC-7K3M9", "FC-ZZZZ9"]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(Object.keys(rows[1] ?? {}).sort());
    expect(rows.map((q) => q?.status)).toEqual(["open", "open"]);
  });

  it.each([
    ["분류", "kind = 'etc'"],
    ["주문번호", "order_no = 'FC-ZZZ99'"],
    ["주문번호 지우기", "order_no = null"],
  ])("(실패경로): 답이 달린 문의의 %s를 DB 에서 직접 바꾸면 거부", async (_label, set) => {
    const id = await writeInquiry("byeolbit_fan", `${TEST_PREFIX}고정`, "FC-7K3M9");
    const staff = await signedInClient("fankkuk_staff");
    expect((await staff.rpc("admin_answer_inquiry", { p_id: id, p_answer: "답" })).error).toBeNull();
    expect(psqlError(`update public.inquiries set ${set} where id = '${id}'`)).toMatch(/답이 달린 문의/);
    expect(psql(`select kind || '/' || order_no from public.inquiries where id = '${id}'`)).toBe("shipping/FC-7K3M9");
  });

  it("(실패경로): 로그인하지 않은 키로는 분류·주문번호를 갖춰도 남길 수 없다", async () => {
    const r = await anonClient().rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}손님`, "본문", "gift", "FC-7K3M9"));
    expect(r.error).not.toBeNull();
    expect(psql(`select count(*) from public.inquiries where title like '${TEST_PREFIX}%'`)).toBe("0");
  });
});

// 시드 별빛 = SEED.fanId. 문의 작성자가 로그인한 사람으로 정해지는지(입력으로 받지 않는지) 본다.
describe("문의 작성자는 로그인한 사람 (INV-K11)", () => {
  it("INV-K11: 작성자 칸은 로그인한 사람 ID 다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    expect(psql(`select author_id from public.inquiries where id = '${id}'`)).toBe(SEED.fanId);
  });
});

type RestrictedRow = Inquiry & { author_restricted: boolean; author_restriction_reason: string | null };

function restrictionArgs(inquiryId: string, restricted: boolean, reason = `${TEST_PREFIX}같은 문의 반복`) {
  return { p_inquiry_id: inquiryId, p_restricted: restricted, p_reason: reason };
}

function restrictionEvents(): string {
  return psql(`select count(*) from public.inquiry_restriction_events where reason like '${TEST_PREFIX}%'`);
}

function fanRestricted(): string {
  return psql(`select count(*) from public.inquiry_restrictions where account_id = '${SEED.fanId}'`);
}

describe("1:1 문의 제한 (INV-K12)", () => {
  it("INV-K12 (S12): 대표가 제한하면 새 문의는 거부, 지난 문의는 읽히고 고칠 수 있다 — 풀면 다시 남긴다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true))).error).toBeNull();

    const me = await signedInClient("byeolbit_fan");
    expect((await me.rpc("my_inquiry_restricted")).data).toBe(true);
    expect((await me.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}제한 중`, "본문"))).error?.code).toBe("P0051");
    expect(psql(`select count(*) from public.inquiries where title = '${TEST_PREFIX}제한 중'`)).toBe("0");
    expect(((await me.rpc("my_inquiries")).data as Inquiry[]).map((q) => q.id)).toContain(id);
    expect((await me.rpc("edit_my_inquiry", { p_id: id, p_title: `${TEST_PREFIX}고침`, p_body: "고쳤어요" })).error).toBeNull();

    // 다른 사람은 그대로
    const dal = await signedInClient("daltokki_fan");
    expect((await dal.rpc("my_inquiry_restricted")).data).toBe(false);
    expect((await dal.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}달토끼`, "본문"))).error).toBeNull();

    const staff = await signedInClient("fankkuk_staff");
    const row = ((await staff.rpc("admin_inquiries")).data as RestrictedRow[]).find((q) => q.id === id);
    expect(row).toMatchObject({ author_restricted: true, author_restriction_reason: `${TEST_PREFIX}같은 문의 반복` });
    expect(restrictionEvents()).toBe("1");
    expect(psql(`select restricted::text || '/' || (acted_by = (select owner_user_id from public.owner_setting))::text from public.inquiry_restriction_events where reason like '${TEST_PREFIX}%'`)).toBe(
      "true/true",
    );

    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, false, `${TEST_PREFIX}풀어 줌`))).error).toBeNull();
    expect((await me.rpc("my_inquiry_restricted")).data).toBe(false);
    expect((await me.rpc("create_inquiry", inquiryArgs(`${TEST_PREFIX}다시`, "본문"))).error).toBeNull();
    expect(restrictionEvents()).toBe("2");
    // 두 줄 모두 막힌 사람(별빛)·한 사람(대표)이 맞고, 순서대로 제한 → 풀기다
    expect(
      psql(
        `select string_agg(restricted::text || '/' || (account_id = '${SEED.fanId}')::text || '/' || (acted_by = (select owner_user_id from public.owner_setting))::text, ',' order by id) from public.inquiry_restriction_events where reason like '${TEST_PREFIX}%'`,
      ),
    ).toBe("true/true/true,false/true/true");
    const after = ((await staff.rpc("admin_inquiries")).data as RestrictedRow[]).find((q) => q.id === id);
    expect(after).toMatchObject({ author_restricted: false, author_restriction_reason: null });
  });

  it("INV-K12 (S12b, 실패경로): 직원 운영자·팬·크리에이터·손님은 제한할 수 없고 기록도 남지 않는다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    for (const who of ["fankkuk_staff", "daltokki_fan", "byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(who);
      expect((await c.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true))).error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("admin_set_inquiry_restriction", restrictionArgs(id, true))).error).not.toBeNull();
    expect(fanRestricted()).toBe("0");
    expect(restrictionEvents()).toBe("0");
  });

  it.each([
    ["빈칸", ""],
    ["공백만", "   "],
    ["201자", `${TEST_PREFIX}${"가".repeat(201 - TEST_PREFIX.length)}`],
  ])("INV-K12 (S12b, 실패경로): 사유 %s → 거부", async (_label, reason) => {
    const id = await writeInquiry("byeolbit_fan");
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true, reason))).error?.code).toBe("22023");
    expect(fanRestricted()).toBe("0");
  });

  it("INV-K12: 사유 200자는 받는다", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const owner = await signedInClient("fankkuk_admin");
    const reason = `${TEST_PREFIX}${"가".repeat(200 - TEST_PREFIX.length)}`;
    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true, reason))).error).toBeNull();
    expect(fanRestricted()).toBe("1");
  });

  it("INV-K12 (S12b, 실패경로): 운영자가 쓴 문의로는 제한할 수 없다", async () => {
    const id = await writeInquiry("fankkuk_staff");
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true))).error?.code).toBe("P0052");
    expect(restrictionEvents()).toBe("0");
  });

  it("INV-K12 (S12b, 실패경로): 이미 그 상태면 거부하고 기록은 그대로 — 없는 문의는 P0002", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, false))).error?.code).toBe("55000");
    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true))).error).toBeNull();
    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true, `${TEST_PREFIX}또`))).error?.code).toBe("55000");
    expect(restrictionEvents()).toBe("1");
    expect(psql(`select reason from public.inquiry_restrictions where account_id = '${SEED.fanId}'`)).toBe(`${TEST_PREFIX}같은 문의 반복`);
    const missing = "00000000-0000-4000-8000-0000000000ff";
    expect((await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(missing, true))).error?.code).toBe("P0002");
  });

  it("INV-K12 (동시): 같은 제한을 두 번 동시에 눌러도 하나만 받고 기록도 하나", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const [a, b] = await Promise.all([signedInClient("fankkuk_admin"), signedInClient("fankkuk_admin")]);
    const results = await Promise.all([
      a.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true)),
      b.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true)),
    ]);
    expect(results.map((r) => r.error?.code ?? "ok").sort()).toEqual(["55000", "ok"]);
    expect(restrictionEvents()).toBe("1");
  });

  it("INV-K12 (S12c, 실패경로): 제한 기록은 고치거나 지울 수 없다 — DB 소유자도", async () => {
    const id = await writeInquiry("byeolbit_fan");
    const owner = await signedInClient("fankkuk_admin");
    await owner.rpc("admin_set_inquiry_restriction", restrictionArgs(id, true));
    for (const sql of [
      `update public.inquiry_restriction_events set reason = '${TEST_PREFIX}바꿈' where reason like '${TEST_PREFIX}%'`,
      `delete from public.inquiry_restriction_events where reason like '${TEST_PREFIX}%'`,
    ]) {
      expect(() => psql(sql)).toThrow();
    }
    expect(restrictionEvents()).toBe("1");
  });

  it("INV-K12 (실패경로): 제한 표·기록 표는 로그인한 사람도 직접 읽거나 쓸 수 없다", async () => {
    const me = await signedInClient("byeolbit_fan");
    const insert = await me.from("inquiry_restrictions").insert({ account_id: SEED.fanId, restricted_by: SEED.fanId, reason: "x" });
    expect(insert.error).not.toBeNull();
    expect((await me.from("inquiry_restriction_events").select("id")).error).not.toBeNull();
    expect((await anonClient().rpc("my_inquiry_restricted")).error).not.toBeNull();
    expect(fanRestricted()).toBe("0");
  });
});
