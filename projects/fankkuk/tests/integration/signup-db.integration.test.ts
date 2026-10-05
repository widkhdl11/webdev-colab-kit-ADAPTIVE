import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { signIn } from "@/features/auth/model/sign-in";
import { checkPhoneVerification, startPhoneVerification } from "@/features/signup/model/phone-verification";
import { signUp } from "@/features/signup/model/sign-up";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { adminClient, anonClient, deleteTestSignups, psql, psqlError, signedInClient, TEST_SIGNUP_PHONE_PREFIX } from "./helpers";

// 가입을 실제 DB·실제 Supabase Auth 로. 카카오만 가짜 창구(로컬)다.
// 시험 계정은 it_ 로 시작하는 아이디, 0109000 으로 시작하는 번호만 쓴다 — 끝나면 지운다.

const dev = { NODE_ENV: "development" };
const TERMS = [
  { key: "service", version: "2026-10-01" },
  { key: "privacy", version: "2026-10-01" },
];

let seq = 0;
function phone(): string {
  seq += 1;
  return `${TEST_SIGNUP_PHONE_PREFIX}${String(seq).padStart(4, "0")}`;
}

/** 확인까지 끝난 번호표. */
async function verified(p: string): Promise<string> {
  const deps = { admin: adminClient(), verifier: choosePhoneVerifier(dev) };
  const started = await startPhoneVerification(deps, { phone: p });
  if (!started.ok) throw new Error(JSON.stringify(started));
  const checked = await checkPhoneVerification(deps, { verificationId: started.verificationId });
  if (!checked.ok || checked.status !== "verified") throw new Error(JSON.stringify(checked));
  return started.verificationId;
}

/** Auth 사용자를 만들고 create_account 를 부른다 — DB 함수만 볼 때. */
async function authUser(loginId: string): Promise<string> {
  const r = await adminClient().auth.admin.createUser({
    email: `${loginId}@login.fankkuk.invalid`,
    password: "long-enough-pw",
    email_confirm: true,
  });
  if (r.error || !r.data.user) throw new Error(r.error?.code ?? "no user");
  return r.data.user.id;
}

function createAccount(userId: string, loginId: string, p: string, verificationId: string, extra: Record<string, unknown> = {}) {
  return adminClient().rpc("create_account", {
    p_user_id: userId,
    p_login_id: loginId,
    p_role: "fan",
    p_email: `${loginId.replace("_", ".")}@example.com`,
    p_phone: p,
    p_verification_id: verificationId,
    p_terms: TERMS,
    ...extra,
  });
}

function signupBody(loginId: string, p: string, verificationId: string, extra: Record<string, unknown> = {}) {
  return {
    role: "fan",
    loginId,
    email: `${loginId.replace("_", ".")}@example.com`,
    password: "long-enough-pw",
    phone: p,
    terms: { service: true, privacy: true, news: false },
    verificationId,
    ...extra,
  };
}

function signUpDeps() {
  return {
    env: dev,
    admin: adminClient(),
    auth: anonClient().auth,
    getMailer: () => ({ send: async () => {}, appOrigin: "http://127.0.0.1:3311" }),
  };
}

const profileCount = (loginId: string) => psql(`select count(*) from public.profiles where login_id = '${loginId}';`);
const authCount = (loginId: string) => psql(`select count(*) from auth.users where email = '${loginId}@login.fankkuk.invalid';`);
const usedAt = (vid: string) => psql(`select coalesce(used_at::text, '') from pii.phone_verifications where id = '${vid}';`);

// 크리에이터 가입이 만든 공개 정보 행을 먼저 지운다(계정을 지우기 전에)
function cleanup(): void {
  psql(`delete from public.creators where profile_id in (select id from public.profiles where login_id = 'it_lima')`);
  deleteTestSignups();
}
beforeEach(cleanup);
afterAll(cleanup);

describe("INV-U1: 서버가 확인한 번호로만 계정이 생긴다", () => {
  it("INV-U1 (S1): 가입 한 바퀴 — 계정·연락처 번호·약관 동의가 생기고, 그 아이디로 로그인된다", async () => {
    const p = phone();
    const vid = await verified(p);
    const r = await signUp(signUpDeps(), signupBody("it_alpha", p, vid, { terms: { service: true, privacy: true, news: true } }));
    expect(r).toEqual({ ok: true, loggedIn: true, mailSent: true });
    expect(psql(`select role || '|' || nickname from public.profiles where login_id = 'it_alpha';`)).toBe("fan|it_alpha");
    expect(psql(`select c.phone from pii.account_contacts c join public.profiles p on p.id = c.account_id where p.login_id = 'it_alpha';`)).toBe(p);
    expect(
      psql(`select string_agg(term_key || ':' || version, ',' order by term_key) from public.terms_consents t join public.profiles p on p.id = t.account_id where p.login_id = 'it_alpha';`),
    ).toBe("news:2026-10-01,privacy:2026-10-01,service:2026-10-01");
    expect(await signIn({ auth: anonClient().auth, env: dev }, { loginId: "it_alpha", password: "long-enough-pw" })).toEqual({ ok: true });
  });

  it("INV-U1 (실패경로): 카카오가 확인한 번호가 요청한 번호와 다르면 확인으로 치지 않는다", async () => {
    const p = phone();
    const id = (await adminClient().rpc("request_phone_verification", { p_phone: p })).data as string;
    await adminClient().rpc("attach_phone_verification_tx", { p_id: id, p_tx: `fake:${p}:x` });
    const r = await adminClient().rpc("complete_phone_verification", { p_id: id, p_verified_phone: "01090009999" });
    expect(r.data).toBe(false);
    expect((await adminClient().rpc("usable_phone_verification", { p_id: id })).data).toBeNull();
  });

  it("INV-U1 (S1b, 실패경로): 확인된 번호와 다른 번호로 계정을 만들려 하면 DB 가 거부한다", async () => {
    const p = phone();
    const vid = await verified(p);
    const uid = await authUser("it_bravo");
    const r = await createAccount(uid, "it_bravo", phone(), vid);
    expect(r.error?.code).toBe("FKU01");
    expect(profileCount("it_bravo")).toBe("0");
  });

  it("INV-U1 (S1c, 실패경로): 확인 안 한 번호표·없는 번호표는 거부 — 가입 처리는 로그인 정보도 안 만든다", async () => {
    const p = phone();
    const id = (await adminClient().rpc("request_phone_verification", { p_phone: p })).data as string;
    const uid = await authUser("it_charlie");
    expect((await createAccount(uid, "it_charlie", p, id)).error?.code).toBe("FKU01");
    expect((await createAccount(uid, "it_charlie", p, "00000000-0000-4000-8000-000000000000")).error?.code).toBe("FKU01");

    const r = await signUp(signUpDeps(), signupBody("it_charlie2", p, id));
    expect(r).toMatchObject({ ok: false, field: "verification" });
    expect(authCount("it_charlie2")).toBe("0");
  });

  it("INV-U1: 화면 쪽 키(익명·로그인)로는 가입 함수를 하나도 부를 수 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const client of [anonClient(), fan]) {
      expect((await client.rpc("request_phone_verification", { p_phone: phone() })).error?.code).toBe("42501");
      expect((await client.rpc("attach_phone_verification_tx", { p_id: "00000000-0000-4000-8000-000000000000", p_tx: "x" })).error?.code).toBe("42501");
      expect((await client.rpc("phone_verification_tx", { p_id: "00000000-0000-4000-8000-000000000000" })).error?.code).toBe("42501");
      expect((await client.rpc("complete_phone_verification", { p_id: "00000000-0000-4000-8000-000000000000", p_verified_phone: "01090000000" })).error?.code).toBe("42501");
      expect((await client.rpc("usable_phone_verification", { p_id: "00000000-0000-4000-8000-000000000000" })).error?.code).toBe("42501");
      expect((await client.rpc("create_account", { p_user_id: null, p_login_id: "x", p_role: "fan", p_email: "", p_phone: "", p_verification_id: null, p_terms: [] })).error?.code).toBe("42501");
      expect((await client.from("terms_consents").select("*").limit(1)).error?.code).toBe("42501");
    }
  });
});

describe("INV-U2: 본인 확인 한 건은 한 번, 10분 안에만", () => {
  it("INV-U2 (S2, 실패경로): 같은 번호표로 두 번째 가입은 거부", async () => {
    const p = phone();
    const vid = await verified(p);
    expect((await signUp(signUpDeps(), signupBody("it_delta", p, vid))).ok).toBe(true);
    expect(usedAt(vid)).not.toBe("");
    const again = await signUp(signUpDeps(), signupBody("it_delta2", p, vid));
    expect(again).toMatchObject({ ok: false, field: "verification" });
    expect(authCount("it_delta2")).toBe("0");
  });

  it("INV-U2 (S2b, 실패경로): 확인된 지 10분이 지나면 거부", async () => {
    const p = phone();
    const vid = await verified(p);
    psql(`update pii.phone_verifications set verified_at = now() - interval '10 minutes 1 second' where id = '${vid}';`);
    const uid = await authUser("it_echo");
    expect((await createAccount(uid, "it_echo", p, vid)).error?.code).toBe("FKU01");
    psql(`update pii.phone_verifications set verified_at = now() - interval '9 minutes' where id = '${vid}';`);
    expect((await createAccount(uid, "it_echo", p, vid)).error).toBeNull();
  });

  it("INV-U2 (S2c, 동시): 같은 번호표로 계정 만들기 둘을 동시에 — 하나만 성공", async () => {
    const p = phone();
    const vid = await verified(p);
    const [u1, u2] = [await authUser("it_fox1"), await authUser("it_fox2")];
    const results = await Promise.all([createAccount(u1, "it_fox1", p, vid), createAccount(u2, "it_fox2", p, vid)]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.code).toBe("FKU01");
    expect(psql(`select count(*) from pii.account_contacts where phone = '${p}';`)).toBe("1");
  });

  it("INV-U2 (실패경로): 이미 확인된 번호표를 다시 확인하지 않는다 — 10분 창이 늘어나지 않게", async () => {
    const p = phone();
    const vid = await verified(p);
    const before = psql(`select verified_at from pii.phone_verifications where id = '${vid}';`);
    expect((await adminClient().rpc("complete_phone_verification", { p_id: vid, p_verified_phone: p })).data).toBe(false);
    expect(psql(`select verified_at from pii.phone_verifications where id = '${vid}';`)).toBe(before);
  });

  it("INV-U1 (실패경로): 거래 값은 한 번만 단다 — 두 번째는 FKU01", async () => {
    const p = phone();
    const id = (await adminClient().rpc("request_phone_verification", { p_phone: p })).data as string;
    expect((await adminClient().rpc("attach_phone_verification_tx", { p_id: id, p_tx: `fake:${p}:a` })).error).toBeNull();
    expect((await adminClient().rpc("attach_phone_verification_tx", { p_id: id, p_tx: `fake:${p}:b` })).error?.code).toBe("FKU01");
    expect(psql(`select provider_tx from pii.phone_verifications where id = '${id}';`)).toBe(`fake:${p}:a`);
  });

  it("INV-U2: 요청한 지 10분이 지난 확인은 결과를 적지 않는다", async () => {
    const p = phone();
    const id = (await adminClient().rpc("request_phone_verification", { p_phone: p })).data as string;
    await adminClient().rpc("attach_phone_verification_tx", { p_id: id, p_tx: `fake:${p}:x` });
    psql(`update pii.phone_verifications set requested_at = now() - interval '11 minutes' where id = '${id}';`);
    expect((await adminClient().rpc("complete_phone_verification", { p_id: id, p_verified_phone: p })).data).toBe(false);
  });
});

describe("INV-U3: 번호 하나에 계정 하나, 아이디도 하나", () => {
  it("INV-U3 (S3, 실패경로): 그 번호로 계정이 있으면 새로 확인받아도 「이미 가입된 번호」, 로그인 정보는 남지 않는다", async () => {
    const p = phone();
    expect((await signUp(signUpDeps(), signupBody("it_golf", p, await verified(p)))).ok).toBe(true);
    const r = await signUp(signUpDeps(), signupBody("it_golf2", p, await verified(p)));
    expect(r).toMatchObject({ ok: false, status: 409, field: "phone" });
    expect(authCount("it_golf2")).toBe("0");
    expect(psql(`select count(*) from pii.account_contacts where phone = '${p}';`)).toBe("1");
  });

  it("INV-U3 (동시): 같은 번호를 서로 다른 번호표로 동시에 — 하나만 성공", async () => {
    const p = phone();
    const [v1, v2] = [await verified(p), await verified(p)];
    const [u1, u2] = [await authUser("it_hotel1"), await authUser("it_hotel2")];
    const results = await Promise.all([createAccount(u1, "it_hotel1", p, v1), createAccount(u2, "it_hotel2", p, v2)]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.code).toBe("FKU02");
  });

  it("INV-U3 (실패경로): 이미 있는 아이디로 프로필을 만들려 하면 DB 가 FKU03 — 번호표는 쓰지 않은 채", async () => {
    const p = phone();
    const vid = await verified(p);
    const uid = await authUser("it_quebec");
    expect((await createAccount(uid, "byeolbit_fan", p, vid)).error?.code).toBe("FKU03");
    expect(usedAt(vid)).toBe("");
  });

  it("INV-U3 (S3b, 동시): 같은 아이디로 가입 둘을 동시에 — 하나만 성공", async () => {
    const [p1, p2] = [phone(), phone()];
    const [v1, v2] = [await verified(p1), await verified(p2)];
    const results = await Promise.all([
      signUp(signUpDeps(), signupBody("it_india", p1, v1)),
      signUp(signUpDeps(), signupBody("it_india", p2, v2)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ field: "loginId" });
    expect(profileCount("it_india")).toBe("1");
  });
});

describe("INV-U4: 한 번에 만들어진다", () => {
  it("INV-U4 (S4, 실패경로): 마지막 단계(약관 동의)에서 실패하면 프로필·연락처가 남지 않고 번호표도 쓰지 않은 채다", async () => {
    const p = phone();
    const vid = await verified(p);
    const uid = await authUser("it_juliet");
    psql(`
      create function public.it_fail_terms() returns trigger language plpgsql as $$ begin raise exception 'it_fail'; end; $$;
      create trigger it_fail_terms before insert on public.terms_consents for each row execute function public.it_fail_terms();
    `);
    try {
      const r = await createAccount(uid, "it_juliet", p, vid);
      expect(r.error).not.toBeNull();
    } finally {
      psql(`drop trigger it_fail_terms on public.terms_consents; drop function public.it_fail_terms();`);
    }
    expect(profileCount("it_juliet")).toBe("0");
    expect(psql(`select count(*) from pii.account_contacts where account_id = '${uid}';`)).toBe("0");
    expect(psql(`select count(*) from pii.email_verifications where account_id = '${uid}';`)).toBe("0");
    expect(usedAt(vid)).toBe("");
  });
});

describe("INV-U5·U6: 역할과 입력 경계는 DB 도 다시 본다", () => {
  it("INV-U5 (S5, 실패경로): 역할 operator·admin 은 DB 가 거부", async () => {
    const p = phone();
    const vid = await verified(p);
    const uid = await authUser("it_kilo");
    for (const role of ["operator", "admin"]) {
      expect((await createAccount(uid, "it_kilo", p, vid, { p_role: role })).error?.code).toBe("22023");
    }
    expect(usedAt(vid)).toBe("");
  });

  it("INV-U5 (S5b)·creator-verification INV-V1: 크리에이터로 가입하면 확인 안 된 공개 정보 행이 생기고, 크리에이터 찾기에는 나오지 않는다", async () => {
    const p = phone();
    const creator = { name: "리마시험", channelTitle: "리마 채널", category: "시험" };
    expect((await signUp(signUpDeps(), signupBody("it_lima", p, await verified(p), { role: "creator", creator }))).ok).toBe(true);
    expect(psql(`select role from public.profiles where login_id = 'it_lima';`)).toBe("creator");
    const listed = (await anonClient().rpc("list_creators")).data as { name?: string; slug?: string }[] | null;
    expect(JSON.stringify(listed ?? [])).not.toContain("it_lima");
    expect(JSON.stringify(listed ?? [])).not.toContain("리마시험");
    expect(
      psql(
        `select c.name || '|' || c.channel_title || '|' || c.category || '|' || c.identity_verified || '|' || coalesce(c.channel_url, '-') from public.creators c join public.profiles p on p.id = c.profile_id where p.login_id = 'it_lima';`,
      ),
    ).toBe("리마시험|리마 채널|시험|false|-");
  });

  it("INV-U6 (S6, 실패경로): 필수 약관이 빠지거나 아이디 꼴이 틀리면 DB 가 거부", async () => {
    const p = phone();
    const vid = await verified(p);
    const uid = await authUser("it_mike");
    expect((await createAccount(uid, "it_mike", p, vid, { p_terms: [{ key: "service", version: "2026-10-01" }] })).error?.code).toBe("22023");
    expect((await createAccount(uid, "it_mike", p, vid, { p_terms: [{ key: "privacy", version: "2026-10-01" }] })).error?.code).toBe("22023");
    expect((await createAccount(uid, "it_mike", p, vid, { p_email: "a,b@example.com" })).error?.code).toBe("22023");
    expect((await createAccount(uid, "IT_MIKE", p, vid)).error?.code).toBe("22023");
    expect((await createAccount(uid, "it_mike", p, vid, { p_terms: [...TERMS, { key: "marketing", version: "1" }] })).error?.code).toBe("22023");
    expect(usedAt(vid)).toBe("");
  });
});

describe("INV-U7: 가입 이메일은 확인 대기로만", () => {
  it("INV-U7 (S7): 확인된 이메일은 비어 있고, 확인 대기에 적은 주소, 보낸 기록 한 줄에 링크가 달린다", async () => {
    const p = phone();
    const sent: string[] = [];
    const deps = { ...signUpDeps(), getMailer: () => ({ send: async (m: { to: string }) => void sent.push(m.to), appOrigin: "http://127.0.0.1:3311" }) };
    expect((await signUp(deps, signupBody("it_november", p, await verified(p)))).ok).toBe(true);
    const row = psql(
      `select coalesce(c.email, '') || '|' || c.pending_email from pii.account_contacts c join public.profiles p on p.id = c.account_id where p.login_id = 'it_november';`,
    );
    expect(row).toBe("|it.november@example.com");
    expect(sent).toEqual(["it.november@example.com"]);
    expect(
      psql(`select count(*) from pii.email_verifications v join public.profiles p on p.id = v.account_id where p.login_id = 'it_november';`),
    ).toBe("1");
    const notify = await adminClient().rpc("notification_email", {
      p_account_id: psql(`select id from public.profiles where login_id = 'it_november';`),
    });
    expect(notify.data).toBeNull();
  });
});

describe("INV-U10: 본인 확인 요청은 번호당 한 시간 다섯 번", () => {
  it("INV-U10 (S10, 실패경로): 여섯 번째는 거부되고 카카오를 부르지 않는다", async () => {
    const p = phone();
    const asked: string[] = [];
    const verifier = choosePhoneVerifier(dev)!;
    const deps = { admin: adminClient(), verifier: { ...verifier, request: async (x: string) => (asked.push(x), verifier.request(x)) } };
    for (let i = 0; i < 5; i += 1) expect((await startPhoneVerification(deps, { phone: p })).ok).toBe(true);
    expect(await startPhoneVerification(deps, { phone: p })).toMatchObject({ ok: false, status: 429 });
    expect(asked).toHaveLength(5);
  });

  it("INV-U10: 한 시간이 지난 요청은 세지 않는다 — 61분 전 다섯 번 뒤에도 새 요청은 된다", async () => {
    const p = phone();
    for (let i = 0; i < 5; i += 1) expect((await adminClient().rpc("request_phone_verification", { p_phone: p })).error).toBeNull();
    expect((await adminClient().rpc("request_phone_verification", { p_phone: p })).error?.code).toBe("FK429");
    psql(`update pii.phone_verifications set requested_at = now() - interval '61 minutes' where phone = '${p}';`);
    expect((await adminClient().rpc("request_phone_verification", { p_phone: p })).error).toBeNull();
  });

  it("INV-U10 (동시): 같은 번호로 여덟 번을 동시에 요청해도 기록은 다섯 줄", async () => {
    const p = phone();
    const results = await Promise.all(Array.from({ length: 8 }, () => adminClient().rpc("request_phone_verification", { p_phone: p })));
    expect(results.filter((r) => r.error === null)).toHaveLength(5);
    expect(results.filter((r) => r.error?.code === "FK429")).toHaveLength(3);
    expect(psql(`select count(*) from pii.phone_verifications where phone = '${p}';`)).toBe("5");
  });
});

describe("INV-U8: 가입 계정의 로그인 주소", () => {
  it("INV-U8: 로그인 정보의 주소는 아이디로 만든 예약 도메인 주소이고, 적은 이메일이 아니다", async () => {
    const p = phone();
    expect((await signUp(signUpDeps(), signupBody("it_oscar", p, await verified(p)))).ok).toBe(true);
    expect(psql(`select email from auth.users u join public.profiles p on p.id = u.id where p.login_id = 'it_oscar';`)).toBe(
      "it_oscar@login.fankkuk.invalid",
    );
  });
});

describe("DB 직접 쓰기 막힘", () => {
  it("INV-U1: 화면 쪽 역할은 본인 확인 기록 표를 직접 읽거나 쓸 수 없다", () => {
    expect(psqlError(`set role authenticated; select * from pii.phone_verifications limit 1;`)).toMatch(/permission denied/);
    expect(psqlError(`set role anon; insert into public.terms_consents (account_id, term_key, version) values (gen_random_uuid(), 'service', '1');`)).toMatch(
      /permission denied/,
    );
  });
});
