import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestSignups, psql, signedInClient, signedTestPhone, TEST_SIGNUP_PHONE_PREFIX, testPhoneBundle } from "./helpers";

// 크리에이터 가입 때 공개 정보 행을 만든다(creator-verification INV-V1 「기본 공개 정보는 가입 때 받아 둔 것을 쓴다」,
// 「지금 코드와 다른 점」, signup INV-U5 「크리에이터로 가입해도 채널 인증 전에는 찾기에 없음」).
// 시험 계정은 it_cv 로 시작하는 아이디, 0109000 의 9000번대 번호만 쓴다 — 끝나면 지운다.

const TERMS = [
  { key: "age14", version: "2026-10-29" },
  { key: "service", version: "2026-10-01" },
  { key: "privacy", version: "2026-10-01" },
];

let seq = 9000;
function phone(): string {
  seq += 1;
  return `${TEST_SIGNUP_PHONE_PREFIX}${String(seq).padStart(4, "0")}`;
}

/** 카카오 서명으로 확인까지 끝낸 번호표(signup INV-U19 — 2026-11-10 부터 크리에이터 가입은 서명 번호표로 만든다, manual/0037). */
const verifiedPhone = async (p: string): Promise<string> => (await signedTestPhone(p)).ticket;

async function authUser(loginId: string): Promise<string> {
  const r = await adminClient().auth.admin.createUser({ email: `${loginId}@login.fankkuk.invalid`, password: "long-enough-pw", email_confirm: true });
  if (r.error || !r.data.user) throw new Error(r.error?.code ?? "no user");
  return r.data.user.id;
}

/** 선택지 id(이름으로). 가입 때 태그는 선택지 id 목록 + 직접 입력으로 받는다(creator-tags INV-T3). */
function optionId(name: string): string {
  const id = psql(`select id from public.creator_tag_options where name = '${name}'`);
  if (!id) throw new Error(`선택지 없음: ${name}`);
  return id;
}

async function args(loginId: string, extra: Record<string, unknown> = {}) {
  const p = phone();
  const verificationId = await verifiedPhone(p);
  const userId = await authUser(loginId);
  return {
    userId,
    body: {
      p_user_id: userId,
      p_login_id: loginId,
      p_email: `${loginId.replace("_", ".")}@example.com`,
      p_phone: testPhoneBundle(userId, p),
      p_verification_id: verificationId,
      p_terms: TERMS,
      // 닉네임·팬덤 이름·태그는 가입 때 받지 않는다 — 가입 뒤 채널 만들기(create_my_channel)에서 받는다(signup INV-U21)
      ...extra,
    },
  };
}

/** 가입한 계정으로 로그인한 화면 쪽 클라이언트 */
async function signIn(loginId: string) {
  const c = anonClient();
  const r = await c.auth.signInWithPassword({ email: `${loginId}@login.fankkuk.invalid`, password: "long-enough-pw" });
  if (r.error) throw new Error(`로그인 실패: ${loginId}`);
  return c;
}

/** 채널 없는 크리에이터(닉네임·크리에이터 이름이 비어 있다)를 표에 직접 넣는다 — 채널 만들기만 볼 때, 가입 함수를 거치지 않는다 */
async function channelless(loginId: string): Promise<{ userId: string; creatorId: string }> {
  const userId = await authUser(loginId);
  const creatorId = psql(
    `insert into public.profiles (id, login_id, nickname, role) values ('${userId}', '${loginId}', null, 'creator'); ` +
      `insert into public.creators (profile_id, slug, name, channel, channel_title) values ('${userId}', 'c-${loginId.replace(/_/g, "")}', null, '', '') returning id;`,
  )
    .split("\n")
    .find((line) => /^[0-9a-f-]{36}$/.test(line));
  if (!creatorId) throw new Error(`크리에이터 줄 없음: ${loginId}`);
  return { userId, creatorId };
}

/** 선택지 태그 + 직접 입력 태그 수 */
const tagCount = (creatorId: string) =>
  psql(`select (select count(*) from public.creator_tags where creator_id = '${creatorId}') + (select count(*) from public.creator_custom_tags where creator_id = '${creatorId}')`);

function cleanup(): void {
  psql(`delete from public.creators where profile_id in (select id from public.profiles where login_id like 'it\\_cv%')`);
  deleteTestSignups();
}

beforeEach(cleanup);
afterAll(cleanup);

describe("크리에이터 가입 때 공개 정보 (INV-V1 · signup INV-U5)", () => {
  it("INV-V1 INV-T3 · INV-CN1 · INV-CN4 (S2b) · INV-U21 (manual/0039 뒤): 크리에이터로 가입하면 닉네임·이름이 빈(채널 없음) 공개 정보 행이 확인 안 됨으로 생기고, slug 는 서버가 정한다. 채널 만들기에서 정한 닉네임이 이름이 되고 태그가 붙는다", async () => {
    const { userId, body } = await args("it_cv_ggul");
    const r = await adminClient().rpc("create_creator_account", body);
    expect(r.error, r.error?.message).toBeNull();
    expect(psql(`select role from public.profiles where id = '${userId}'`)).toBe("creator");
    // 가입 직후는 채널 없음 — 닉네임·크리에이터 이름이 비어 있다(INV-U21). 공개 이름·채널 이름은 받지 않는다(creator-display-name INV-CN1·CN4)
    expect(psql(`select coalesce(nickname, '<null>') from public.profiles where id = '${userId}'`)).toBe("<null>");
    const row = psql(
      `select coalesce(name, '<null>') || '|' || channel_title || '|' || identity_verified || '|' || coalesce(channel_url, '-') || '|' || intro || '|' || slug from public.creators where profile_id = '${userId}'`,
    );
    const [name, title, verified, url, intro, slug] = row.split("|");
    expect([name, title, verified, url, intro]).toEqual(["<null>", "", "false", "-", ""]);
    expect(slug).toMatch(/^c-[0-9a-f]{10}$/);
    const creatorId = psql(`select id from public.creators where profile_id = '${userId}'`);
    // 가입 때는 태그가 없다
    expect(tagCount(creatorId)).toBe("0");
    // 찾기에 나오지 않는다(INV-U5)
    const found = (await anonClient().rpc("list_creators")).data as { slug: string }[];
    expect(found.map((c) => c.slug)).not.toContain(slug);

    // 채널 만들기 — 이름 = 닉네임(INV-CN1), 태그 = 선택지 유튜브 + 직접 입력 「요리」. 분야 칸은 더는 쓰지 않는다(처음 값 그대로)
    const c = await signIn("it_cv_ggul");
    const made = await c.rpc("create_my_channel", { p_nickname: "it_cv_ggul", p_tag_ids: [optionId("유튜브")], p_custom_tag: "요리" });
    expect(made.error, made.error?.message).toBeNull();
    expect(psql(`select name from public.creators where id = '${creatorId}'`)).toBe("it_cv_ggul");
    expect(psql(`select string_agg(o.name, '|') from public.creator_tags t join public.creator_tag_options o on o.id = t.option_id where t.creator_id = '${creatorId}'`)).toBe("유튜브");
    expect(psql(`select tag from public.creator_custom_tags where creator_id = '${creatorId}'`)).toBe("요리");
    expect(psql(`select category from public.creators where id = '${creatorId}'`)).toBe("");
  });

  it("INV-V1·INV-V17 · INV-U21 (manual/0039 뒤): 가입한 크리에이터는 채널을 만들고 팬꾹 링크를 만든 뒤 바로 채널 확인을 요청할 수 있다 — 링크 전에는 거부", async () => {
    const { body } = await args("it_cv_apply");
    const r0 = await adminClient().rpc("create_creator_account", body);
    expect(r0.error, r0.error?.message).toBeNull();
    const c = await signIn("it_cv_apply");
    // 채널 만들기 전에는 링크·확인 요청이 막힌다(INV-U21) — 먼저 채널을 만든다
    const made = await c.rpc("create_my_channel", { p_nickname: "it_cv_apply", p_tag_ids: [optionId("유튜브")] });
    expect(made.error, made.error?.message).toBeNull();
    expect((await c.rpc("request_creator_verification", { p_channel_url: "https://www.youtube.com/@itcvapply" })).error?.code).toBe("FKV17");
    // 링크 만들기는 설정 화면이 쓰는 저장 함수 그대로(새 저장 길 없음)
    expect((await c.rpc("update_my_creator_handle", { p_handle: "itcvapplylink" })).error).toBeNull();
    const r = await c.rpc("request_creator_verification", { p_channel_url: "https://www.youtube.com/@itcvapply" });
    expect(r.error).toBeNull();
    psql(
      `begin; set local session_replication_role = replica; delete from public.creator_channel_claims where account_id = '${body.p_user_id}'; delete from public.creator_verification_applications where account_id = '${body.p_user_id}'; commit;`,
    );
  });

  it("INV-CN2 INV-CN4 · INV-U21 (실패경로): 가입 함수는 공개 이름·채널 이름·닉네임·팬덤 이름·태그 인자를 받지 않는다 — 하나씩 넘겨도 함수가 없다고(PGRST202) 거부", async () => {
    for (const [loginId, extra] of [
      ["it_cv_named", { p_name: "가짜이름" }],
      ["it_cv_titled", { p_channel_title: "가짜채널" }],
      ["it_cv_nick", { p_nickname: "가입닉" }],
      ["it_cv_fan", { p_fan_name: "팬덤" }],
      ["it_cv_tags", { p_tag_ids: [optionId("유튜브")], p_custom_tag: "요리" }],
    ] as const) {
      const { body } = await args(loginId, extra);
      expect((await adminClient().rpc("create_creator_account", body)).error?.code, loginId).toBe("PGRST202");
      expect(psql(`select count(*) from public.profiles where login_id = '${loginId}'`)).toBe("0");
    }
  });

  it("INV-V1 INV-T3 · INV-U21 (실패경로): 채널 만들기에서 태그가 0개·6개·직접 입력 21자·숨긴 선택지·같은 선택지 둘이면 거부하고 닉네임·이름·태그 아무것도 남지 않는다", async () => {
    psql(`update public.creator_tag_options set hidden = true where name = '틱톡'`);
    try {
      const five = ["SOOP", "치지직", "유튜브", "알플레이", "X"].map(optionId);
      const cases: Record<string, unknown>[] = [
        { p_tag_ids: [], p_custom_tag: null },
        { p_tag_ids: [], p_custom_tag: "  " },
        { p_custom_tag: "가".repeat(21) },
        { p_tag_ids: five, p_custom_tag: "요리" },
        { p_tag_ids: [...five, optionId("버추얼")], p_custom_tag: null }, // 선택지 6개 — 검사 전에 개수로 바로 거부
        { p_tag_ids: [optionId("틱톡")], p_custom_tag: null },
        { p_tag_ids: [optionId("유튜브"), optionId("유튜브")], p_custom_tag: null },
      ];
      let i = 0;
      for (const extra of cases) {
        i += 1;
        const loginId = `it_cv_bad${i}`;
        const { userId, creatorId } = await channelless(loginId);
        const c = await signIn(loginId);
        const r = await c.rpc("create_my_channel", { p_nickname: loginId, ...extra });
        expect([extra, r.error?.code]).toEqual([extra, "22023"]);
        expect(psql(`select coalesce(nickname, '<null>') from public.profiles where id = '${userId}'`)).toBe("<null>");
        expect(psql(`select coalesce(name, '<null>') from public.creators where id = '${creatorId}'`)).toBe("<null>");
        expect(tagCount(creatorId)).toBe("0");
      }
    } finally {
      psql(`update public.creator_tag_options set hidden = false where name = '틱톡'`);
    }
  });

  it("INV-V1 (실패경로): slug·확인됨 값을 붙여 보내면 거부된다(인자가 없다)", async () => {
    const { userId, body } = await args("it_cv_slug", { p_slug: "haru" });
    expect((await adminClient().rpc("create_creator_account", body)).error?.code).toBe("PGRST202");
    const { body: b2 } = await args("it_cv_ver", { p_identity_verified: true });
    expect((await adminClient().rpc("create_creator_account", b2)).error?.code).toBe("PGRST202");
    // 예전 분야 칸은 이제 받지 않는다
    const { body: b3 } = await args("it_cv_cat", { p_category: "게임" });
    expect((await adminClient().rpc("create_creator_account", b3)).error?.code).toBe("PGRST202");
    expect(psql(`select count(*) from public.profiles where id = '${userId}'`)).toBe("0");
  });

  it("INV-V1 (실패경로): 로그인한 사용자·로그인 안 한 사람은 크리에이터 가입 함수를 부를 수 없다", async () => {
    const { userId, body } = await args("it_cv_direct");
    for (const c of [await signedInClient("byeolbit_fan"), anonClient()]) {
      expect((await c.rpc("create_creator_account", body)).error).not.toBeNull();
    }
    expect(psql(`select count(*) from public.profiles where id = '${userId}'`)).toBe("0");
  });

  it("INV-V1 · INV-U21 (manual/0039 뒤): 크리에이터 둘을 가입시켜도 slug 는 겹치지 않는다", async () => {
    const a = await args("it_cv_same1");
    const b = await args("it_cv_same2");
    const ra = await adminClient().rpc("create_creator_account", a.body);
    expect(ra.error, ra.error?.message).toBeNull();
    const rb = await adminClient().rpc("create_creator_account", b.body);
    expect(rb.error, rb.error?.message).toBeNull();
    expect(psql(`select count(distinct slug) from public.creators where profile_id in ('${a.userId}', '${b.userId}')`)).toBe("2");
  });
});
