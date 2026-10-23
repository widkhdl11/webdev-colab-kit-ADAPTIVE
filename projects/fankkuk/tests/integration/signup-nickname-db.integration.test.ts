import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { saveAccount } from "@/features/account-edit/model/save-account";
import { checkPhoneVerification, startPhoneVerification } from "@/features/signup/model/phone-verification";
import { signUp } from "@/features/signup/model/sign-up";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { adminClient, anonClient, deleteTestSignups, psql, psqlError, SEED, signedInClient, TEST_SIGNUP_PHONE_PREFIX } from "./helpers";

// 가입 닉네임(signup INV-U13)·아이디·닉네임 미리 확인(INV-U14)을 실제 DB 로.
// 시험 계정은 it_nk 로 시작하는 아이디, 0109000 의 7000번대 번호만 쓴다 — 끝나면 지운다.
// 미리 확인의 횟수 기록은 시험마다 새로 만든 해시 값으로 센다 — 다른 시험·개발 서버의 기록과 섞이지 않게.

const dev = { NODE_ENV: "development" };
const TERMS = [
  { key: "service", version: "2026-10-01" },
  { key: "privacy", version: "2026-10-01" },
];

let seq = 7000;
function phone(): string {
  seq += 1;
  return `${TEST_SIGNUP_PHONE_PREFIX}${String(seq).padStart(4, "0")}`;
}

async function verified(p: string): Promise<string> {
  const deps = { admin: adminClient(), verifier: choosePhoneVerifier(dev) };
  const started = await startPhoneVerification(deps, { phone: p });
  if (!started.ok) throw new Error(JSON.stringify(started));
  const checked = await checkPhoneVerification(deps, { verificationId: started.verificationId });
  if (!checked.ok || checked.status !== "verified") throw new Error(JSON.stringify(checked));
  return started.verificationId;
}

async function authUser(loginId: string): Promise<string> {
  const r = await adminClient().auth.admin.createUser({ email: `${loginId}@login.fankkuk.invalid`, password: "long-enough-pw1", email_confirm: true });
  if (r.error || !r.data.user) throw new Error(r.error?.code ?? "no user");
  return r.data.user.id;
}

/** 확인된 번호·로그인 정보까지 만든 뒤 create_account 를 부른다. */
async function createAccount(loginId: string, nickname: string) {
  const p = phone();
  const vid = await verified(p);
  const uid = await authUser(loginId);
  const r = await adminClient().rpc("create_account", {
    p_user_id: uid,
    p_login_id: loginId,
    p_role: "fan",
    p_email: `${loginId.replace("_", ".")}@example.com`,
    p_phone: p,
    p_verification_id: vid,
    p_terms: TERMS,
    p_nickname: nickname,
  });
  return { ...r, uid, vid };
}

function signupBody(loginId: string, nickname: string, p: string, verificationId: string, extra: Record<string, unknown> = {}) {
  return {
    role: "fan",
    loginId,
    nickname,
    email: `${loginId.replace("_", ".")}@example.com`,
    password: "long-enough-pw1",
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

const nicknameOfLogin = (loginId: string) => psql(`select coalesce((select nickname from public.profiles where login_id = '${loginId}'), '-');`);
const nicknameOf = (id: string) => psql(`select nickname from public.profiles where id = '${id}';`);
const usedAt = (vid: string) => psql(`select coalesce(used_at::text, '') from pii.phone_verifications where id = '${vid}';`);
const authCount = (loginId: string) => psql(`select count(*) from auth.users where email = '${loginId}@login.fankkuk.invalid';`);
const ipHash = () => randomBytes(32).toString("hex");
const check = (hash: string, kind: string, value: string) => adminClient().rpc("signup_name_check", { p_ip_hash: hash, p_kind: kind, p_value: value });

function cleanup(): void {
  psql(`
    update public.profiles set nickname = '별빛' where id = '${SEED.fanId}';
    update public.profiles set nickname = '달토끼' where id = '${SEED.otherFanId}';
    delete from public.creators where profile_id in (select id from public.profiles where login_id like 'it\\_nk%');
  `);
  deleteTestSignups();
}
beforeEach(cleanup);
afterAll(cleanup);

describe("INV-U13: 가입 때 받은 닉네임으로 계정이 생긴다", () => {
  it("INV-U13: 적은 닉네임이 앞뒤 공백을 뺀 채 저장된다 — 아이디를 자른 값이 아니다", async () => {
    const r = await createAccount("it_nk_store", "  새벽별  ");
    expect(r.error).toBeNull();
    expect(nicknameOfLogin("it_nk_store")).toBe("새벽별");
  });

  it("INV-U13 (실패경로): 13자·공백뿐·보이지 않는 글자·금칙어·연락처·기호만이면 거부하고, 번호표는 쓰지 않은 채다", async () => {
    const banned = psql(`select word from public.creator_tag_banned_words order by word limit 1`);
    const cases: [string, string][] = [
      ["가".repeat(13), "22023"],
      ["   ", "22023"],
      ["보이지\u200b않음", "22023"],
      [`x${banned}x`, "FKU05"],
      ["010.1234.567", "FKU06"], // 12자 안의 전화번호 꼴
      ["!!!", "FKU07"],
    ];
    let i = 0;
    for (const [nickname, code] of cases) {
      i += 1;
      const r = await createAccount(`it_nk_bad${i}`, nickname);
      expect([nickname, r.error?.code]).toEqual([nickname, code]);
      expect(nicknameOfLogin(`it_nk_bad${i}`)).toBe("-");
      expect(usedAt(r.vid)).toBe("");
    }
  });

  it("INV-U13 (실패경로): 영문 대소문자·앞뒤 공백만 다른 닉네임은 같은 닉네임으로 거부(FKU04), 번호표는 쓰지 않은 채", async () => {
    expect((await createAccount("it_nk_first", "MoonLight")).error).toBeNull();
    for (const [i, same] of ["moonlight", " MOONLIGHT ", "Moonlight"].entries()) {
      const r = await createAccount(`it_nk_same${i}`, same);
      expect([same, r.error?.code]).toEqual([same, "FKU04"]);
      expect(usedAt(r.vid)).toBe("");
      expect(nicknameOfLogin(`it_nk_same${i}`)).toBe("-");
    }
    // 시드 계정의 닉네임(하루)도 같다
    expect((await createAccount("it_nk_haru", "하루")).error?.code).toBe("FKU04");
  });

  it("INV-U13 (동시): 같은 닉네임으로 계정 만들기 둘을 동시에 — 하나만 성공하고 진 쪽은 FKU04", async () => {
    const [p1, p2] = [phone(), phone()];
    const [v1, v2] = [await verified(p1), await verified(p2)];
    const [u1, u2] = [await authUser("it_nk_race1"), await authUser("it_nk_race2")];
    const make = (uid: string, loginId: string, p: string, vid: string, nickname: string) =>
      adminClient().rpc("create_account", {
        p_user_id: uid,
        p_login_id: loginId,
        p_role: "fan",
        p_email: `${loginId.replace("_", ".")}@example.com`,
        p_phone: p,
        p_verification_id: vid,
        p_terms: TERMS,
        p_nickname: nickname,
      });
    const results = await Promise.all([make(u1, "it_nk_race1", p1, v1, "동시닉"), make(u2, "it_nk_race2", p2, v2, " 동시닉 ")]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.code).toBe("FKU04");
    expect(psql(`select count(*) from public.profiles where lower(btrim(nickname)) = '동시닉';`)).toBe("1");
  });

  it("INV-U13: 겹침을 막는 것은 비교 값 lower(btrim(nickname)) 의 유일 인덱스다 — 대소문자·앞뒤 공백을 빼고 비교하는 그 정의 그대로, 가명 처리된 계정만 뺀다", () => {
    const def = psql(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'profiles' and indexname = 'profiles_nickname_key';`);
    expect(def).toBe("CREATE UNIQUE INDEX profiles_nickname_key ON public.profiles USING btree (lower(btrim(nickname))) WHERE (withdrawn_at IS NULL)");
  });

  it("INV-U13 (실패경로): 가명 계정이 쓰는 「탈퇴한 회원」은 회원이 닉네임으로 쓸 수 없다 — 대소문자·앞뒤 공백이 달라도", () => {
    for (const nick of ["탈퇴한 회원", " 탈퇴한 회원 "]) {
      expect(psqlError(`update public.profiles set nickname = '${nick}' where login_id = 'byeolbit_fan'`)).toContain("이미 쓰는 닉네임");
    }
    expect(psql(`select nickname from public.profiles where login_id = 'byeolbit_fan'`)).not.toContain("탈퇴한");
  });

  it("INV-U13: 가입 처리 — 이미 쓰는 닉네임이면 닉네임 칸 「이미 쓰는 닉네임」, 로그인 정보는 남지 않는다", async () => {
    const p = phone();
    const r = await signUp(signUpDeps(), signupBody("it_nk_taken", "HARU", p, await verified(p)));
    expect(r).toMatchObject({ ok: true });
    const p2 = phone();
    const again = await signUp(signUpDeps(), signupBody("it_nk_taken2", " haru ", p2, await verified(p2)));
    expect(again).toEqual({ ok: false, status: 409, field: "nickname", message: "이미 쓰는 닉네임이에요." });
    expect(authCount("it_nk_taken2")).toBe("0");
    expect(nicknameOfLogin("it_nk_taken")).toBe("HARU");
  });

  it("INV-U13 (동시): 같은 닉네임으로 가입 둘을 동시에 — 하나만 성공, 진 쪽은 닉네임 칸 오류", async () => {
    const [p1, p2] = [phone(), phone()];
    const [v1, v2] = [await verified(p1), await verified(p2)];
    const results = await Promise.all([
      signUp(signUpDeps(), signupBody("it_nk_dup1", "같이가입", p1, v1)),
      signUp(signUpDeps(), signupBody("it_nk_dup2", "같이가입", p2, v2)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ status: 409, field: "nickname" });
    expect(Number(authCount("it_nk_dup1")) + Number(authCount("it_nk_dup2"))).toBe(1);
  });

  it("INV-U13·추가 요청 3: 크리에이터 가입 — 닉네임은 적은 값(공개 이름이 아님), 팬덤 이름은 선택으로 저장", async () => {
    const p = phone();
    const creator = { name: "닉크리", channelTitle: "닉 채널", tagIds: [psql(`select id from public.creator_tag_options where name = 'SOOP'`)], customTag: "", fanName: " 별님들 " };
    const r = await signUp(signUpDeps(), signupBody("it_nk_cr", "크리닉", p, await verified(p), { role: "creator", creator }));
    expect(r).toMatchObject({ ok: true });
    expect(nicknameOfLogin("it_nk_cr")).toBe("크리닉");
    expect(psql(`select c.name || '|' || coalesce(c.fan_name, '-') from public.creators c join public.profiles p on p.id = c.profile_id where p.login_id = 'it_nk_cr';`)).toBe(
      "닉크리|별님들",
    );

    const p2 = phone();
    const noFan = { ...creator, name: "닉크리둘", fanName: "" };
    expect(await signUp(signUpDeps(), signupBody("it_nk_cr2", "크리닉둘", p2, await verified(p2), { role: "creator", creator: noFan }))).toMatchObject({ ok: true });
    expect(psql(`select coalesce(c.fan_name, '-') from public.creators c join public.profiles p on p.id = c.profile_id where p.login_id = 'it_nk_cr2';`)).toBe("-");
  });

  it("추가 요청 3 (실패경로): 팬덤 이름이 11자·연락처·금칙어면 거부하고 계정이 남지 않는다", async () => {
    const banned = psql(`select word from public.creator_tag_banned_words order by word limit 1`);
    const cases: [string, string][] = [
      ["가".repeat(11), "fanName"],
      ["010-1234-5678", "fanName"],
      [`a${banned}`, "fanName"],
    ];
    let i = 0;
    for (const [fanName, field] of cases) {
      i += 1;
      const p = phone();
      const creator = { name: `팬덤시험${i}`, channelTitle: "채널", tagIds: [psql(`select id from public.creator_tag_options where name = 'SOOP'`)], customTag: "", fanName };
      const r = await signUp(signUpDeps(), signupBody(`it_nk_fan${i}`, `팬덤닉${i}`, p, await verified(p), { role: "creator", creator }));
      expect([fanName, r]).toMatchObject([fanName, { ok: false, field }]);
      expect(authCount(`it_nk_fan${i}`)).toBe("0");
    }
  });

  it("INV-U13 (실패경로): 공개 이름을 바꿔도 닉네임은 그대로다 — 다른 사람 닉네임과 같은 공개 이름으로 바꿔도 막히지 않는다", async () => {
    const p = phone();
    const creator = { name: "이름바꿈", channelTitle: "채널", tagIds: [psql(`select id from public.creator_tag_options where name = 'SOOP'`)], customTag: "" };
    expect(await signUp(signUpDeps(), signupBody("it_nk_rename", "바꿈닉", p, await verified(p), { role: "creator", creator }))).toMatchObject({ ok: true });
    const c = anonClient();
    expect((await c.auth.signInWithPassword({ email: "it_nk_rename@login.fankkuk.invalid", password: "long-enough-pw1" })).error).toBeNull();
    const r = await c.rpc("update_my_creator_profile", { p_name: "별빛" });
    expect(r.error).toBeNull();
    expect(nicknameOfLogin("it_nk_rename")).toBe("바꿈닉");
    psql(`begin; set local session_replication_role = replica; delete from public.creator_name_changes where creator_id in (select c.id from public.creators c join public.profiles p on p.id = c.profile_id where p.login_id = 'it_nk_rename'); commit;`);
  });
});

describe("INV-U13·my-account INV-A5: 내 정보에서 닉네임을 바꿀 때도 같은 규칙", () => {
  it("INV-U13 (실패경로): 다른 사람이 쓰는 닉네임(대소문자·공백만 다름)으로 바꾸면 FKU04, 아무 칸도 바뀌지 않는다", async () => {
    psql(`update public.profiles set nickname = 'MoonRabbit' where id = '${SEED.otherFanId}';`);
    const fan = await signedInClient("byeolbit_fan");
    const r = await fan.rpc("update_my_account", { p_nickname: " moonrabbit ", p_email: "byeolbit.fan@example.com", p_notify_kakao: false, p_notify_email: true });
    expect(r.error?.code).toBe("FKU04");
    expect(nicknameOf(SEED.fanId)).toBe("별빛");
    expect(psql(`select notify_kakao from pii.account_contacts where account_id = '${SEED.fanId}';`)).toBe("t");
  });

  it("INV-U13: 내 닉네임을 대소문자만 바꿔 저장하는 것은 된다(내 것과 겹치는 것은 겹침이 아니다)", async () => {
    psql(`update public.profiles set nickname = 'Byeol' where id = '${SEED.fanId}';`);
    const fan = await signedInClient("byeolbit_fan");
    const r = await fan.rpc("update_my_account", { p_nickname: "BYEOL", p_email: "byeolbit.fan@example.com", p_notify_kakao: true, p_notify_email: true });
    expect(r.error).toBeNull();
    expect(nicknameOf(SEED.fanId)).toBe("BYEOL");
  });

  it("INV-U13 (실패경로): 내 정보 닉네임도 금칙어·연락처 필터를 거친다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const r = await fan.rpc("update_my_account", { p_nickname: "01012345678", p_email: "byeolbit.fan@example.com", p_notify_kakao: true, p_notify_email: true });
    expect(r.error?.code).toBe("FKU06");
    expect(nicknameOf(SEED.fanId)).toBe("별빛");
  });

  it("INV-U13 (실패경로): 내 정보 닉네임 — 금칙어(FKU05)·연락처(FKU06)·기호만(FKU07)·13자·보이지 않는 글자는 가입 때처럼 거부, 닉네임은 그대로", async () => {
    const banned = psql(`select word from public.creator_tag_banned_words order by word limit 1`);
    const cases: [string, string][] = [
      [`x${banned}x`, "FKU05"],
      ["010.1234.567", "FKU06"],
      ["!!!", "FKU07"],
      ["가".repeat(13), "22023"],
      ["보이지​않음", "22023"],
    ];
    const fan = await signedInClient("byeolbit_fan");
    for (const [nickname, code] of cases) {
      const r = await fan.rpc("update_my_account", { p_nickname: nickname, p_email: "byeolbit.fan@example.com", p_notify_kakao: true, p_notify_email: true });
      expect([nickname, r.error?.code]).toEqual([nickname, code]);
      expect(nicknameOf(SEED.fanId)).toBe("별빛");
    }
  });

  it("INV-U13 (동시): 두 팬이 같은 새 닉네임으로 동시에 바꾸면 하나만 성공", async () => {
    const [a, b] = [await signedInClient("byeolbit_fan"), await signedInClient("daltokki_fan")];
    const edit = (email: string) => ({ p_nickname: "같은새닉", p_email: email, p_notify_kakao: true, p_notify_email: true });
    const results = await Promise.all([a.rpc("update_my_account", edit("byeolbit.fan@example.com")), b.rpc("update_my_account", edit("daltokki.fan@example.com"))]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.code).toBe("FKU04");
    expect(psql(`select count(*) from public.profiles where nickname = '같은새닉';`)).toBe("1");
  });

  it("INV-U13: 내 정보 저장은 겹친 닉네임을 닉네임 칸 「이미 쓰는 닉네임」으로 돌려준다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const r = await saveAccount(
      {
        client: fan,
        admin: adminClient(),
        viewer: { userId: SEED.fanId, role: "fan" },
        getMailer: () => {
          throw new Error("메일을 보낼 일이 없다");
        },
      },
      { nickname: "달토끼", email: "byeolbit.fan@example.com", notifyKakao: true, notifyEmail: true },
    );
    expect(r).toEqual({ ok: false, status: 409, field: "nickname", message: "이미 쓰는 닉네임이에요." });
    expect(nicknameOf(SEED.fanId)).toBe("별빛");
  });
});

describe("INV-U14: 아이디·닉네임 미리 확인", () => {
  it("INV-U14: 답은 쓸 수 있음·이미 씀·형식 틀림 셋 — 아이디는 꼴, 닉네임은 길이·필터, 겹침은 대소문자·공백 무시", async () => {
    expect((await createAccount("it_nk_check", "CaseNick")).error).toBeNull();
    const h = ipHash();
    const answers: [string, string, string][] = [
      ["login_id", "haru_creator", "taken"],
      ["login_id", "it_nk_check", "taken"],
      ["login_id", "it_nk_free_zz", "available"],
      ["login_id", "Haru_Creator", "invalid"],
      ["login_id", "ab", "invalid"],
      ["nickname", "하루", "taken"],
      ["nickname", " casenick ", "taken"],
      ["nickname", "아무도안씀", "available"],
      ["nickname", "가".repeat(13), "invalid"],
      ["nickname", "010-1234-5678", "invalid"],
      ["nickname", "   ", "invalid"],
    ];
    for (const [kind, value, want] of answers) {
      const r = await check(h, kind, value);
      expect([kind, value, r.error, r.data]).toEqual([kind, value, null, want]);
    }
  });

  it("INV-U14: 돌려주는 것은 글자 하나뿐이다 — 계정 ID·가입 시각 같은 다른 정보가 없다", async () => {
    const r = await check(ipHash(), "login_id", "haru_creator");
    expect(r.data).toBe("taken");
    expect(typeof r.data).toBe("string");
    expect(psql(`select pg_get_function_result('public.signup_name_check(text, text, text)'::regprocedure);`)).toBe("text");
    expect(JSON.stringify(r.data)).not.toContain(SEED.creatorProfileId);
  });

  it("INV-U14 (실패경로): 한 접속 주소에서 1분에 30번을 넘으면 31번째부터 DB 를 찾지 않고 rate_limited — 이미 쓰는 아이디도 「쓰고 있다」고 답하지 않는다", async () => {
    const h = ipHash();
    for (let i = 0; i < 30; i += 1) expect((await check(h, "login_id", "haru_creator")).data).toBe("taken");
    expect((await check(h, "login_id", "haru_creator")).data).toBe("rate_limited");
    expect((await check(h, "nickname", "아무도안씀")).data).toBe("rate_limited");
    // 다른 주소는 그대로
    expect((await check(ipHash(), "login_id", "haru_creator")).data).toBe("taken");
    // 1분 창이 지나도 쉬는 1분이 끝나기 전에는 계속 rate_limited — 횟수가 새로 시작돼도 답하지 않는다
    psql(`update public.signup_check_hits set window_started_at = now() - interval '2 minutes' where ip_hash = '${h}';`);
    expect((await check(h, "login_id", "haru_creator")).data).toBe("rate_limited");
    // 1분 쉰 뒤에는 다시 답한다
    psql(`update public.signup_check_hits set blocked_until = now() - interval '1 second', window_started_at = now() - interval '2 minutes' where ip_hash = '${h}';`);
    expect((await check(h, "login_id", "haru_creator")).data).toBe("taken");
  });

  it("INV-U14: 1분이 지난 횟수는 세지 않는다 — 61초 전 30번 뒤에도 새 확인은 답한다", async () => {
    const h = ipHash();
    for (let i = 0; i < 30; i += 1) await check(h, "login_id", "haru_creator");
    psql(`update public.signup_check_hits set window_started_at = now() - interval '61 seconds' where ip_hash = '${h}';`);
    expect((await check(h, "login_id", "haru_creator")).data).toBe("taken");
  });

  it("INV-U14: 31번째에 걸리면 쉬는 시간은 1분이다 — blocked_until 이 지금부터 약 60초 뒤", async () => {
    const h = ipHash();
    for (let i = 0; i < 31; i += 1) await check(h, "login_id", "haru_creator");
    const left = Number(psql(`select extract(epoch from blocked_until - now()) from public.signup_check_hits where ip_hash = '${h}';`));
    expect(left).toBeGreaterThan(55);
    expect(left).toBeLessThanOrEqual(60);
  });

  it("INV-U14 (실패경로): 1분 창 안(59초 전 시작)에서 이미 30번이면 다음 확인은 rate_limited — 창이 일찍 새로 시작되지 않는다", async () => {
    const h = ipHash();
    expect((await check(h, "login_id", "haru_creator")).data).toBe("taken");
    psql(`update public.signup_check_hits set window_started_at = now() - interval '59 seconds', hits = 30 where ip_hash = '${h}';`);
    expect((await check(h, "login_id", "haru_creator")).data).toBe("rate_limited");
  });

  it("INV-U14: 형식이 틀린 값은 한도와 상관없이 invalid — 31번째 이후에도, 쉬는 중에도 같은 답이고 횟수에 넣지 않는다", async () => {
    const h = ipHash();
    for (let i = 0; i < 31; i += 1) await check(h, "login_id", "haru_creator");
    expect((await check(h, "login_id", "haru_creator")).data).toBe("rate_limited");
    for (const [kind, value] of [
      ["login_id", "Haru_Creator"],
      ["login_id", "ab"],
      ["nickname", "가".repeat(13)],
      ["nickname", "010-1234-5678"],
      ["nickname", "   "],
    ] as const) {
      const r = await check(h, kind, value);
      expect([kind, value, r.error, r.data]).toEqual([kind, value, null, "invalid"]);
    }
    // 형식이 틀린 값은 센 횟수를 늘리지 않는다
    const fresh = ipHash();
    for (let i = 0; i < 40; i += 1) await check(fresh, "nickname", "!!!");
    expect((await check(fresh, "login_id", "haru_creator")).data).toBe("taken");
  });

  it("INV-U14 (동시): 한 주소에서 40번을 동시에 물어도 답은 30번만", async () => {
    const h = ipHash();
    const results = await Promise.all(Array.from({ length: 40 }, () => check(h, "nickname", "아무도안씀")));
    expect(results.filter((r) => r.data === "available")).toHaveLength(30);
    expect(results.filter((r) => r.data === "rate_limited")).toHaveLength(10);
  });

  it("INV-U14 (실패경로): 접속 주소는 해시로만 받는다 — 원문 주소·빈 값은 거부, 표에는 64자리 해시만 있다", async () => {
    expect((await check("203.0.113.7", "login_id", "haru_creator")).error?.code).toBe("22023");
    expect((await check("", "login_id", "haru_creator")).error?.code).toBe("22023");
    expect((await check(ipHash(), "email", "x")).error?.code).toBe("22023");
    expect(psql(`select count(*) from public.signup_check_hits where ip_hash !~ '^[0-9a-f]{64}$';`)).toBe("0");
  });

  it("INV-U14 (실패경로): 미리 확인 함수와 횟수 표는 앱 서버 키만 — 로그인 안 한 사람·로그인한 사람은 부르지도 읽지도 못한다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const c of [anonClient(), fan]) {
      expect((await c.rpc("signup_name_check", { p_ip_hash: ipHash(), p_kind: "login_id", p_value: "haru_creator" })).error?.code).toBe("42501");
      expect((await c.from("signup_check_hits").select("*").limit(1)).error?.code).toBe("42501");
    }
    expect(psql(`select relrowsecurity from pg_class where oid = 'public.signup_check_hits'::regclass;`)).toBe("t");
    expect(psql(`select count(*) from pg_policies where schemaname = 'public' and tablename = 'signup_check_hits';`)).toBe("0");
    // 개인정보 구역 함수가 아니다 — 보안 정의자로 돌아도 pii 를 읽지 않는다
    expect(psql(`select prosrc from pg_proc where proname = 'signup_name_check';`)).not.toMatch(/pii\./);
  });
});
