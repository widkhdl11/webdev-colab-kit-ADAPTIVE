import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkPhoneVerification, startPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { adminClient, anonClient, deleteTestSignups, psql, signedInClient, TEST_SIGNUP_PHONE_PREFIX } from "./helpers";

// 크리에이터 가입 때 공개 정보 행을 만든다(creator-verification INV-V1 「기본 공개 정보는 가입 때 받아 둔 것을 쓴다」,
// 「지금 코드와 다른 점」, signup INV-U5 「크리에이터로 가입해도 채널 인증 전에는 찾기에 없음」).
// 시험 계정은 it_cv 로 시작하는 아이디, 0109000 의 9000번대 번호만 쓴다 — 끝나면 지운다.

const dev = { NODE_ENV: "development" };
const TERMS = [
  { key: "service", version: "2026-10-01" },
  { key: "privacy", version: "2026-10-01" },
];

let seq = 9000;
function phone(): string {
  seq += 1;
  return `${TEST_SIGNUP_PHONE_PREFIX}${String(seq).padStart(4, "0")}`;
}

async function verifiedPhone(p: string): Promise<string> {
  const deps = { admin: adminClient(), verifier: choosePhoneVerifier(dev) };
  const started = await startPhoneVerification(deps, { phone: p });
  if (!started.ok) throw new Error(JSON.stringify(started));
  const checked = await checkPhoneVerification(deps, { verificationId: started.verificationId });
  if (!checked.ok || checked.status !== "verified") throw new Error(JSON.stringify(checked));
  return started.verificationId;
}

async function authUser(loginId: string): Promise<string> {
  const r = await adminClient().auth.admin.createUser({ email: `${loginId}@login.fankkuk.invalid`, password: "long-enough-pw", email_confirm: true });
  if (r.error || !r.data.user) throw new Error(r.error?.code ?? "no user");
  return r.data.user.id;
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
      p_category: "요리",
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
  it("INV-V1: 크리에이터로 가입하면 이름·채널 이름·분야가 든 공개 정보 행이 확인 안 됨으로 생기고, slug 는 서버가 정한다", async () => {
    const { userId, body } = await args("it_cv_ggul");
    const r = await adminClient().rpc("create_creator_account", body);
    expect(r.error).toBeNull();
    expect(psql(`select role from public.profiles where id = '${userId}'`)).toBe("creator");
    const row = psql(
      `select name || '|' || channel_title || '|' || category || '|' || identity_verified || '|' || coalesce(channel_url, '-') || '|' || intro || '|' || slug from public.creators where profile_id = '${userId}'`,
    );
    const [name, title, category, verified, url, intro, slug] = row.split("|");
    expect([name, title, category, verified, url, intro]).toEqual(["꿀단지", "꿀단지의 부엌", "요리", "false", "-", ""]);
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

  it("INV-V1 (실패경로): 이름·채널 이름·분야가 비었거나 길면 거부하고 아무것도 남지 않는다", async () => {
    const cases: Record<string, unknown>[] = [
      { p_name: "" },
      { p_name: "가".repeat(21) },
      { p_channel_title: "  " },
      { p_channel_title: "가".repeat(41) },
      { p_category: "" },
      { p_category: "가".repeat(21) },
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
  });

  it("INV-V1 (실패경로): slug·확인됨 값을 붙여 보내면 거부된다(인자가 없다)", async () => {
    const { userId, body } = await args("it_cv_slug", { p_slug: "haru" });
    expect((await adminClient().rpc("create_creator_account", body)).error).not.toBeNull();
    const { body: b2 } = await args("it_cv_ver", { p_identity_verified: true });
    expect((await adminClient().rpc("create_creator_account", b2)).error).not.toBeNull();
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
