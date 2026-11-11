import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient, deleteTestSignups, psql, psqlError, signedInClient, signedTestPhone, TEST_SIGNUP_PHONE_PREFIX, testPhoneBundle } from "./helpers";

// 채널 만들기 (signup INV-U21 · INV-U13 · creator-display-name INV-CN1, 2026-11-11 — 마이그레이션 20261111000040).
// 크리에이터 계정은 닉네임 없이 만들어지고(채널 없음), 채널 만들기에서 닉네임·팬덤 이름·태그를 한 번에 정한다.
// 채널 없는 크리에이터는 서비스 키(DB 소유자)로 profiles·creators 줄을 직접 넣어 만든다 — 제약이 허용하는 상태다.
// 아이디는 it_cc 로 시작하고 끝나면 지운다(로그인 정보 → 프로필·크리에이터 줄이 따라 지워진다).
// S21(가입 함수로 만든 크리에이터)은 가입 함수가 닉네임 없이 계정을 만드는 고침(manual/0039)이 적용돼야 통과한다 — 사람이 적용한다.

const PASSWORD = "long-enough-pw-cc";
const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

type Creator = { userId: string; creatorId: string; loginId: string; client: SupabaseClient };

async function signIn(loginId: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email: `${loginId}@login.fankkuk.invalid`, password: PASSWORD });
  if (error) throw new Error(`로그인 실패: ${loginId}`);
  return c;
}

/** 채널 없는 크리에이터 — 닉네임·크리에이터 이름이 비어 있다 */
async function channelless(tag: string): Promise<Creator> {
  const loginId = `it_cc_${tag}_${rand(4)}`;
  const r = await adminClient().auth.admin.createUser({ email: `${loginId}@login.fankkuk.invalid`, password: PASSWORD, email_confirm: true });
  if (r.error || !r.data.user) throw new Error(r.error?.code ?? "no user");
  const userId = r.data.user.id;
  const creatorId = psql(
    `insert into public.profiles (id, login_id, nickname, role) values ('${userId}', '${loginId}', null, 'creator'); ` +
      `insert into public.creators (profile_id, slug, name, channel, channel_title) values ('${userId}', 'c-it${rand(8)}', null, '', '') returning id;`,
  )
    .split("\n")
    .find((line) => /^[0-9a-f-]{36}$/.test(line))!;
  return { userId, creatorId, loginId, client: await signIn(loginId) };
}

const nicknameOf = (c: Creator) => psql(`select coalesce(nickname, '<null>') from public.profiles where id = '${c.userId}'`);
const channelRow = (c: Creator) =>
  psql(`select coalesce(name, '<null>') || '|' || coalesce(fan_name, '<null>') from public.creators where id = '${c.creatorId}'`);
const tagCount = (c: Creator) =>
  psql(`select (select count(*) from public.creator_tags where creator_id = '${c.creatorId}') + (select count(*) from public.creator_custom_tags where creator_id = '${c.creatorId}')`);
const boxCount = (c: Creator) => psql(`select count(*) from public.revgift_boxes where creator_id = '${c.creatorId}'`);
const handleCount = (c: Creator) => psql(`select count(*) from public.creator_handles where creator_id = '${c.creatorId}'`);
const twoTags = () => psql("select id from public.creator_tag_options where not hidden order by position limit 2").split("\n");
const bannedWord = () => psql("select word from public.creator_tag_banned_words order by word limit 1");

const box = { p_name: "채널 시험 선물함", p_capacity: 3, p_is_public: true, p_description: null };

function cleanup(): void {
  const mine = "select c.id from public.creators c join public.profiles p on p.id = c.profile_id where p.login_id like 'it\\_cc\\_%'";
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `delete from public.revgift_boxes where creator_id in (${mine});`,
      `delete from public.creator_handles where creator_id in (${mine});`,
      "delete from public.creator_verification_applications where account_id in (select id from public.profiles where login_id like 'it\_cc\_%');",
      `delete from public.creator_name_changes where creator_id in (${mine});`,
      `delete from public.creators where id in (${mine});`,
      "commit;",
    ].join(" "),
  );
  psql(`delete from auth.users where email like 'it\\_cc\\_%@login.fankkuk.invalid'`);
}

beforeEach(cleanup);
afterAll(() => {
  cleanup();
  deleteTestSignups();
});

describe("INV-U21 (S21b): 채널 없는 크리에이터는 채널에 붙는 것을 만들 수 없다", () => {
  it("INV-U21 (S21b, 실패경로): 선물함 만들기 거부(FKN01) — 줄이 생기지 않는다", async () => {
    const c = await channelless("box");
    const r = await c.client.rpc("create_revgift_box", box);
    expect(r.error?.code).toBe("FKN01");
    expect(boxCount(c)).toBe("0");
  });

  it("INV-U21 (S21b, 실패경로): 팬꾹 링크 만들기 거부(FKN01) — 줄이 생기지 않는다", async () => {
    const c = await channelless("link");
    const r = await c.client.rpc("update_my_creator_handle", { p_handle: `itcc${rand(6)}` });
    expect(r.error?.code).toBe("FKN01");
    expect(handleCount(c)).toBe("0");
  });

  it("INV-U21 (S21b, 실패경로): 채널 확인 요청 거부(FKN01) — 팬꾹 링크가 있어도(검사를 끄고 넣음) 요청 줄이 생기지 않는다", async () => {
    const c = await channelless("verify");
    psql(
      `begin; set local session_replication_role = replica; insert into public.creator_handles (handle, creator_id) values ('itcc${rand(6)}', '${c.creatorId}'); commit;`,
    );
    const r = await c.client.rpc("request_creator_verification", { p_channel_url: `https://www.youtube.com/@itcc${rand(6)}` });
    expect(r.error?.code).toBe("FKN01");
    expect(psql(`select count(*) from public.creator_verification_applications where account_id = '${c.userId}'`)).toBe("0");
  });
});

describe("INV-U21 (S21c): 채널 만들기", () => {
  it("INV-U21 INV-CN1 (S21c): 닉네임·팬덤 이름·태그 둘을 한 번에 저장 — 크리에이터 이름도 닉네임, 처음 정한 이름은 바꾼 기록에 남지 않는다. 이제 선물함·팬꾹 링크를 만든다", async () => {
    const c = await channelless("make");
    const nick = `꿀단지${rand(3)}`;
    const r = await c.client.rpc("create_my_channel", { p_nickname: ` ${nick} `, p_fan_name: "꿀벌단", p_tag_ids: twoTags(), p_custom_tag: null });
    expect(r.error).toBeNull();
    expect(nicknameOf(c)).toBe(nick);
    expect(channelRow(c)).toBe(`${nick}|꿀벌단`);
    expect(tagCount(c)).toBe("2");
    expect(psql(`select count(*) from public.creator_name_changes where creator_id = '${c.creatorId}'`)).toBe("0");
    expect((await c.client.rpc("create_revgift_box", box)).error).toBeNull();
    expect(boxCount(c)).toBe("1");
    expect((await c.client.rpc("update_my_creator_handle", { p_handle: `itcc${rand(6)}` })).error).toBeNull();
    expect(handleCount(c)).toBe("1");
  });
});

describe("INV-U21 (S21d): 하나라도 틀리면 아무것도 저장하지 않는다", () => {
  it("INV-U21 INV-U13 (S21d, 실패경로): 이미 쓰는 닉네임이면 FKU04 — 닉네임·이름·팬덤 이름·태그 모두 비어 있다", async () => {
    const c = await channelless("taken");
    const taken = psql("select nickname from public.profiles where login_id = 'haru_creator'");
    const r = await c.client.rpc("create_my_channel", { p_nickname: taken, p_fan_name: "꿀벌단", p_tag_ids: twoTags(), p_custom_tag: null });
    expect(r.error?.code).toBe("FKU04");
    expect([nicknameOf(c), channelRow(c), tagCount(c)]).toEqual(["<null>", "<null>|<null>", "0"]);
  });

  it("INV-U21 (S21d, 실패경로): 금칙어 팬덤 이름이면 P0084 — 닉네임·이름·팬덤 이름·태그 모두 비어 있다", async () => {
    const c = await channelless("banned");
    const r = await c.client.rpc("create_my_channel", { p_nickname: `꿀단지${rand(3)}`, p_fan_name: bannedWord(), p_tag_ids: twoTags(), p_custom_tag: null });
    expect(r.error?.code).toBe("P0084");
    expect([nicknameOf(c), channelRow(c), tagCount(c)]).toEqual(["<null>", "<null>|<null>", "0"]);
  });
});

describe("INV-U21 (S21e): 채널 만들기는 한 번, 닉네임은 다시 비우지 못한다", () => {
  it("INV-U21 (S21e, 실패경로): 두 번째 채널 만들기는 FKN02 — 닉네임 그대로", async () => {
    const c = await channelless("twice");
    const nick = `꿀단지${rand(3)}`;
    expect((await c.client.rpc("create_my_channel", { p_nickname: nick, p_tag_ids: twoTags() })).error).toBeNull();
    const again = await c.client.rpc("create_my_channel", { p_nickname: `다른${rand(3)}`, p_tag_ids: twoTags() });
    expect(again.error?.code).toBe("FKN02");
    expect(nicknameOf(c)).toBe(nick);
  });

  it("INV-U21 (S21e, 실패경로): 만든 닉네임을 비우려 하면 거부(표를 직접 고쳐도) — 닉네임 그대로", async () => {
    const c = await channelless("clear");
    const nick = `꿀단지${rand(3)}`;
    expect((await c.client.rpc("create_my_channel", { p_nickname: nick, p_tag_ids: twoTags() })).error).toBeNull();
    expect(psqlError(`update public.profiles set nickname = null where id = '${c.userId}'`)).toMatch(/닉네임은 비울 수 없다/);
    expect(nicknameOf(c)).toBe(nick);
  });

  it("INV-U21 (S21e, 실패경로): 채널 없는 크리에이터가 프로필 수정으로 닉네임을 채우려 하면 FKN01 — 채널 만들기를 건너뛰지 못한다", async () => {
    const c = await channelless("bypass");
    const r = await c.client.rpc("update_my_creator_profile", { p_nickname: `꿀단지${rand(3)}` });
    expect(r.error?.code).toBe("FKN01");
    expect([nicknameOf(c), channelRow(c)]).toEqual(["<null>", "<null>|<null>"]);
    // 표를 직접 고쳐도 같다(서비스 키·DB 소유자) — 표시 없이 빈 닉네임을 채우는 길은 없다
    expect(psqlError(`update public.profiles set nickname = '우회${rand(3)}' where id = '${c.userId}'`)).toMatch(/채널을 먼저 만들어야 한다/);
    expect(nicknameOf(c)).toBe("<null>");
  });
});

describe("INV-U21: 채널 없는 크리에이터의 계정 삭제", () => {
  it("INV-U21 INV-CN1: 채널 없는 크리에이터의 로그인 계정을 지워도 실패하지 않는다 — 끊긴 크리에이터 줄은 「탈퇴한 크리에이터」 이름을 갖는다(가입 실패 정리 길)", async () => {
    const c = await channelless("drop");
    psql(`delete from auth.users where id = '${c.userId}'`);
    expect(psql(`select count(*) from public.profiles where id = '${c.userId}'`)).toBe("0");
    expect(psql(`select coalesce(profile_id::text, '<null>') || '|' || name from public.creators where id = '${c.creatorId}'`)).toBe("<null>|탈퇴한 크리에이터");
    psql(`delete from public.creators where id = '${c.creatorId}'`);
  });
});

describe("INV-U21 (S21f): 팬", () => {
  it("INV-U21 (S21f, 실패경로): 팬이 채널 만들기를 부르면 42501 — 팬 닉네임 그대로", async () => {
    const fan = await signedInClient("haneul_fan");
    const before = psql("select nickname from public.profiles where login_id = 'haneul_fan'");
    const r = await fan.rpc("create_my_channel", { p_nickname: `팬채널${rand(3)}`, p_tag_ids: twoTags() });
    expect(r.error?.code).toBe("42501");
    expect(psql("select nickname from public.profiles where login_id = 'haneul_fan'")).toBe(before);
  });

  it("INV-U21 (S21f, 실패경로): 닉네임 없는 팬 줄은 넣을 수 없다(검사 제약)", async () => {
    const r = await adminClient().auth.admin.createUser({ email: `it_cc_fan_${rand(4)}@login.fankkuk.invalid`, password: PASSWORD, email_confirm: true });
    const id = r.data.user!.id;
    expect(psqlError(`insert into public.profiles (id, login_id, nickname, role) values ('${id}', 'it_cc_fan_${rand(4)}', null, 'fan')`)).toMatch(/profiles_nickname_role_check/);
    expect(psql(`select count(*) from public.profiles where id = '${id}'`)).toBe("0");
  });

  it("INV-U21 (S21f, 실패경로): 로그인하지 않으면 채널 만들기를 부를 수 없다", async () => {
    const r = await anonClient().rpc("create_my_channel", { p_nickname: `손님${rand(3)}`, p_tag_ids: twoTags() });
    expect(r.error).not.toBeNull();
  });
});

describe("INV-U21 (S21): 가입 함수로 만든 크리에이터 (manual/0039 뒤)", () => {
  it("INV-U21 (S21) (manual/0039 뒤): 카카오 서명 가입이 끝나면 계정·크리에이터 줄·연결 기록이 생기고 닉네임과 크리에이터 이름은 비어 있다. 찾기에 나오지 않는다", async () => {
    const phone = `${TEST_SIGNUP_PHONE_PREFIX}${String(8800 + Math.floor(Math.random() * 100)).padStart(4, "0")}`;
    const { ticket } = await signedTestPhone(phone);
    const loginId = `it_cc_signup_${rand(4)}`;
    const u = await adminClient().auth.admin.createUser({ email: `${loginId}@login.fankkuk.invalid`, password: PASSWORD, email_confirm: true });
    const userId = u.data.user!.id;
    const r = await adminClient().rpc("create_creator_account", {
      p_user_id: userId,
      p_login_id: loginId,
      p_email: `${loginId.replace(/_/g, ".")}@example.com`,
      p_phone: testPhoneBundle(userId, phone),
      p_verification_id: ticket,
      p_terms: [
        { key: "age14", version: "2026-10-29" },
        { key: "service", version: "2026-10-01" },
        { key: "privacy", version: "2026-10-01" },
      ],
    });
    // manual/0039 전에는 가입 함수 안의 계정 만들기가 닉네임을 요구해 거부한다(그 이유인지 메시지로 보인다)
    expect(r.error, r.error?.message).toBeNull();
    expect(psql(`select role || '|' || coalesce(nickname, '<null>') from public.profiles where id = '${userId}'`)).toBe("creator|<null>");
    const creator = psql(`select id || '|' || coalesce(name, '<null>') || '|' || slug from public.creators where profile_id = '${userId}'`).split("|");
    expect(creator[1]).toBe("<null>");
    expect(psql(`select count(*) from pii.signature_links where creator_id = '${creator[0]}'`)).toBe("1");
    const found = (await anonClient().rpc("list_creators")).data as { slug: string }[];
    expect(found.map((x) => x.slug)).not.toContain(creator[2]);
  });
});
