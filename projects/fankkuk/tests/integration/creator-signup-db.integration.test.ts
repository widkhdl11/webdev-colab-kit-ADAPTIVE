import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestSignups, psql, signedInClient, TEST_SIGNUP_PHONE_PREFIX, verifiedTestPhone } from "./helpers";

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

/** 인증번호를 맞혀 확인까지 끝낸 번호표(INV-U1·U15). */
const verifiedPhone = (p: string): Promise<string> => verifiedTestPhone(p);

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
      p_phone: p,
      p_verification_id: verificationId,
      p_terms: TERMS,
      p_name: "꿀단지",
      p_channel_title: "꿀단지의 부엌",
      p_tag_ids: [optionId("유튜브")],
      p_custom_tag: "요리",
      p_nickname: loginId.slice(0, 12), // 가입 닉네임(signup INV-U13) — 계정마다 다르게
      ...extra,
    },
  };
}

function cleanup(): void {
  psql(`delete from public.creators where profile_id in (select id from public.profiles where login_id like 'it\\_cv%')`);
  deleteTestSignups();
}

beforeEach(cleanup);
afterAll(cleanup);

describe("크리에이터 가입 때 공개 정보 (INV-V1 · signup INV-U5)", () => {
  it("INV-V1 INV-T3: 크리에이터로 가입하면 이름·채널 이름·태그가 든 공개 정보 행이 확인 안 됨으로 생기고, slug 는 서버가 정한다", async () => {
    const { userId, body } = await args("it_cv_ggul");
    const r = await adminClient().rpc("create_creator_account", body);
    expect(r.error).toBeNull();
    expect(psql(`select role from public.profiles where id = '${userId}'`)).toBe("creator");
    // 닉네임은 가입 때 적은 값이다(signup INV-U13, 2026-10-15) — 공개 이름(꿀단지)으로 덮지 않는다
    expect(psql(`select nickname from public.profiles where id = '${userId}'`)).toBe("it_cv_ggul");
    const row = psql(
      `select name || '|' || channel_title || '|' || identity_verified || '|' || coalesce(channel_url, '-') || '|' || intro || '|' || slug from public.creators where profile_id = '${userId}'`,
    );
    const [name, title, verified, url, intro, slug] = row.split("|");
    expect([name, title, verified, url, intro]).toEqual(["꿀단지", "꿀단지의 부엌", "false", "-", ""]);
    // 태그 — 선택지 유튜브 + 직접 입력 「요리」. 분야 칸은 더는 쓰지 않는다(처음 값 그대로)
    const creatorId = psql(`select id from public.creators where profile_id = '${userId}'`);
    expect(psql(`select string_agg(o.name, '|') from public.creator_tags t join public.creator_tag_options o on o.id = t.option_id where t.creator_id = '${creatorId}'`)).toBe("유튜브");
    expect(psql(`select tag from public.creator_custom_tags where creator_id = '${creatorId}'`)).toBe("요리");
    expect(psql(`select category from public.creators where id = '${creatorId}'`)).toBe("");
    expect(slug).toMatch(/^c-[0-9a-f]{10}$/);
    // 찾기에 나오지 않는다(INV-U5)
    const found = (await anonClient().rpc("list_creators")).data as { slug: string }[];
    expect(found.map((c) => c.slug)).not.toContain(slug);
  });

  it("INV-V1: 가입한 크리에이터는 바로 채널 확인을 신청할 수 있다", async () => {
    const { body } = await args("it_cv_apply");
    expect((await adminClient().rpc("create_creator_account", body)).error).toBeNull();
    const pw = await adminClient().auth.admin.updateUserById(body.p_user_id, { password: "long-enough-pw" });
    expect(pw.error).toBeNull();
    const c = anonClient();
    expect((await c.auth.signInWithPassword({ email: "it_cv_apply@login.fankkuk.invalid", password: "long-enough-pw" })).error).toBeNull();
    const r = await c.rpc("request_creator_verification", { p_channel_url: "https://www.youtube.com/@itcvapply" });
    expect(r.error).toBeNull();
    psql(
      `begin; set local session_replication_role = replica; delete from public.creator_channel_claims where account_id = '${body.p_user_id}'; delete from public.creator_verification_applications where account_id = '${body.p_user_id}'; commit;`,
    );
  });

  it("INV-V1 INV-T3 (실패경로): 이름·채널 이름이 비었거나 길거나, 태그가 0개·6개·직접 입력 21자·숨긴 선택지면 거부하고 아무것도 남지 않는다", async () => {
    psql(`update public.creator_tag_options set hidden = true where name = '틱톡'`);
    try {
      const five = ["SOOP", "치지직", "유튜브", "알플레이", "X"].map(optionId);
      const cases: Record<string, unknown>[] = [
        { p_name: "" },
        { p_name: "가".repeat(21) },
        { p_channel_title: "  " },
        { p_channel_title: "가".repeat(41) },
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
        const { userId, body } = await args(`it_cv_bad${i}`, extra);
        const r = await adminClient().rpc("create_creator_account", body);
        expect([extra, r.error?.code]).toEqual([extra, "22023"]);
        expect(psql(`select count(*) from public.profiles where id = '${userId}'`)).toBe("0");
        expect(psql(`select count(*) from public.creators where profile_id = '${userId}'`)).toBe("0");
      }
    } finally {
      psql(`update public.creator_tag_options set hidden = false where name = '틱톡'`);
    }
  });

  it("INV-V1 (실패경로): slug·확인됨 값을 붙여 보내면 거부된다(인자가 없다)", async () => {
    const { userId, body } = await args("it_cv_slug", { p_slug: "haru" });
    expect((await adminClient().rpc("create_creator_account", body)).error).not.toBeNull();
    const { body: b2 } = await args("it_cv_ver", { p_identity_verified: true });
    expect((await adminClient().rpc("create_creator_account", b2)).error).not.toBeNull();
    // 예전 분야 칸은 이제 받지 않는다
    const { body: b3 } = await args("it_cv_cat", { p_category: "게임" });
    expect((await adminClient().rpc("create_creator_account", b3)).error).not.toBeNull();
    expect(psql(`select count(*) from public.profiles where id = '${userId}'`)).toBe("0");
  });

  it("INV-V1 (실패경로): 로그인한 사용자·로그인 안 한 사람은 크리에이터 가입 함수를 부를 수 없다", async () => {
    const { userId, body } = await args("it_cv_direct");
    for (const c of [await signedInClient("byeolbit_fan"), anonClient()]) {
      expect((await c.rpc("create_creator_account", body)).error).not.toBeNull();
    }
    expect(psql(`select count(*) from public.profiles where id = '${userId}'`)).toBe("0");
  });

  it("INV-V1: 같은 이름의 크리에이터가 있어도 slug 는 겹치지 않는다", async () => {
    const a = await args("it_cv_same1");
    const b = await args("it_cv_same2");
    expect((await adminClient().rpc("create_creator_account", a.body)).error).toBeNull();
    expect((await adminClient().rpc("create_creator_account", b.body)).error).toBeNull();
    expect(psql(`select count(distinct slug) from public.creators where profile_id in ('${a.userId}', '${b.userId}')`)).toBe("2");
  });
});
