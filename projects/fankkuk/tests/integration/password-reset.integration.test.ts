import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkResetCode, requestResetCode } from "@/features/password-reset/model/phone-reset";
import { RESET_CODE_AGAIN, RESET_CODE_SENT_MESSAGE, RESET_TICKET_EXPIRED } from "@/features/password-reset/model/reset-messages";
import { resetPassword } from "@/features/password-reset/model/reset-password";
import { changePassword } from "@/features/password-change/model/change-password";
import { checkPhoneCode, startPhoneVerification, type PhoneVerificationDeps } from "@/features/signup/model/phone-verification";
import { PASSWORD_SAME_AS_ID, PASSWORD_WEAK } from "@/entities/session/model/password-rule";
import { encryptPhone, phoneHash, phoneParts } from "@/shared/api/phone-crypto/phone-crypto";
import { readPhoneCodeSecret } from "@/shared/api/phone-verifier/verifier";
import { accountPasswordDeps, canSignIn, createTestAccount, device, FIXTURE_PASSWORD, removeTestAccounts, stillSignedIn, testEmail, testPhone, type TestAccount } from "./account-fixtures";
import { adminClient, anonClient, holdRowLock, psql, signedInClient, testPhoneKeys, waitPhoneCodeMinute } from "./helpers";
import { putTestEnvelope, sealTestAddress, testKeyPair } from "./invoice-helpers";
import { createTestCreator, removeTestCreator, TEST_CREATOR } from "./test-creator";

// 휴대폰 비밀번호 찾기(session-login INV-L10·L11)를 실제 DB·실제 Auth 로 돈다. 문자는 보내지 않고 시험 창구가 받은 본문에서 6자리를 꺼낸다.
// 번호로 계정 찾기(password_reset_target)·표 발급(issue_phone_password_reset)은 번호 해시를 읽어 사람이 적용하는 supabase/manual/0028 6) 절에 있다 —
// 「manual 0028 뒤」가 붙은 시험은 그 파일이 적용되기 전에는 빨간불이 맞다. 표를 쓰는 쪽(INV-L11) 시험 일부는 표를 DB 에 바로 넣어 따로 돈다.
// 시험 전용 계정(it_ 접두어)·시험 번호(0109000…)만 쓴다. 시드 계정의 비밀번호는 건드리지 않는다.

/** 시험 계정에 번호를 단다 — 가입과 같은 꼴(암호문·해시·앞 3자리·뒤 4자리, signup INV-U18). */
function attachPhone(a: TestAccount, phone: string): void {
  const keys = testPhoneKeys();
  const { prefix, last4 } = phoneParts(phone);
  psql(
    `update pii.account_contacts set phone_sealed = '${encryptPhone(keys, a.userId, phone)}', phone_hash = '${phoneHash(keys, phone)}',
       phone_prefix = '${prefix}', phone_last4 = '${last4}' where account_id = '${a.userId}'`,
  );
}

async function accountWithPhone(tag: string): Promise<{ a: TestAccount; phone: string }> {
  const a = await createTestAccount({ tag, email: testEmail(tag) });
  const phone = testPhone();
  attachPhone(a, phone);
  return { a, phone };
}

/** 인증번호 받기(라우트와 같은 조립) — 보낸 문자 본문에서 6자리를 꺼낸다. 보내지 않았으면 code 는 null. */
async function requestCode(phone: string) {
  const sent: string[] = [];
  const deps: PhoneVerificationDeps = {
    admin: adminClient(),
    verifier: { kind: "fake", sendKakaoCode: async () => false, sendSms: async (_to, text) => void sent.push(text) },
    codeSecret: () => readPhoneCodeSecret({ NODE_ENV: "test" }),
    phoneKeys: testPhoneKeys,
  };
  const ipHash = randomBytes(32).toString("hex");
  const result = await requestResetCode({ admin: adminClient(), start: (b, o) => startPhoneVerification(deps, b, ipHash, o) }, { phone });
  const code = sent.length ? (/인증번호 (\d{6})/.exec(sent[0]!)?.[1] ?? null) : null;
  return { result, code, deps };
}

async function checkCode(deps: PhoneVerificationDeps, phone: string, code: string, ticket: string | null) {
  return checkResetCode(
    { admin: adminClient(), check: (b) => checkPhoneCode(deps, b), phoneHashOf: (p) => phoneHash(testPhoneKeys(), p) },
    { phone, code },
    ticket ?? undefined,
  );
}

/** 받기 → 확인까지 — 재설정 표를 돌려준다(manual 0028 뒤). */
async function ticketFor(phone: string): Promise<string> {
  const { result, code, deps } = await requestCode(phone);
  if (result.status !== 200 || !result.verificationId || !code) throw new Error("인증번호를 받지 못했다");
  const checked = await checkCode(deps, phone, code, result.verificationId);
  if (!checked.ok) throw new Error(`표를 받지 못했다: ${checked.reason}`);
  return checked.token;
}

const reset = (ticket: string | undefined, password: string, extra: Record<string, unknown> = {}) =>
  resetPassword({ ...accountPasswordDeps(), admin: adminClient() }, { password, passwordConfirm: password, ...extra }, ticket);

/**
 * 재설정 표 하나를 DB 에 바로 넣는다(시험 준비) — 표를 쓰는 쪽(INV-L11)을 발급 함수(manual 0028)와 따로 시험하려고.
 * 발급 함수와 같은 꼴이다: 64자리 16진수 값, 표에는 SHA-256 해시, 10분 뒤 만료.
 */
function issueReset(userId: string): string {
  const token = randomBytes(32).toString("hex");
  psql(
    `insert into public.password_resets (account_id, token_hash, expires_at) values ('${userId}', extensions.digest('${token}', 'sha256'), now() + interval '10 minutes')`,
  );
  return token;
}

const resetRows = (userId: string) => Number(psql(`select count(*) from public.password_resets where account_id = '${userId}'`));
const verificationsOf = (phone: string) =>
  Number(psql(`select count(*) from pii.phone_verifications where phone_hash = '${phoneHash(testPhoneKeys(), phone)}'`));

beforeAll(removeTestAccounts);
afterAll(removeTestAccounts);

describe("INV-L10: 비밀번호 찾기는 휴대폰 인증번호로만, 받기 응답은 언제나 하나 (manual 0028 뒤)", () => {
  it("INV-L10 S8 (실패경로): 가입 안 된 번호·운영자 계정의 번호·가입된 팬 번호 — 세 응답이 같고 인증번호는 마지막 하나에만", async () => {
    const nobody = testPhone();
    const op = await accountWithPhone("s8op");
    psql(`update public.profiles set role = 'operator' where id = '${op.a.userId}'`);
    const fan = await accountWithPhone("s8fan");

    const runs = [await requestCode(nobody), await requestCode(op.phone), await requestCode(fan.phone)];
    for (const r of runs) expect(r.result).toMatchObject({ status: 200, message: RESET_CODE_SENT_MESSAGE });
    expect(runs.map((r) => r.code !== null)).toEqual([false, false, true]);
    // 계정이 없는 번호의 요청도 한도에 센다(가입과 같은 기록)
    expect(verificationsOf(nobody)).toBe(1);
  });

  it("INV-L10 S8b (실패경로): 가입 안 된 번호로 아무 6자리 확인 — 숫자가 틀린 때와 같은 응답", async () => {
    const nobody = testPhone();
    const fan = await accountWithPhone("s8bwrong");
    const n = await requestCode(nobody);
    const f = await requestCode(fan.phone);
    const wrongForFan = f.code === "111111" ? "222222" : "111111";
    const a = await checkCode(n.deps, nobody, "111111", n.result.status === 200 ? n.result.verificationId : null);
    const b = await checkCode(f.deps, fan.phone, wrongForFan, f.result.status === 200 ? f.result.verificationId : null);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: false, reason: "wrong" });
  });

  it("INV-L10 S8b (실패경로): 같은 번호 1분 안 두 번째 요청·하루 여섯 번째 요청 → 같은 응답, 인증번호 없음", async () => {
    const { phone } = await accountWithPhone("s8blimit");
    expect((await requestCode(phone)).code).not.toBeNull();
    const second = await requestCode(phone);
    expect(second.result).toEqual({ status: 200, message: RESET_CODE_SENT_MESSAGE, verificationId: null });
    expect(second.code).toBeNull();
    for (let i = 0; i < 4; i += 1) {
      waitPhoneCodeMinute(phone);
      expect((await requestCode(phone)).code).not.toBeNull();
    }
    waitPhoneCodeMinute(phone);
    const sixth = await requestCode(phone);
    expect(sixth.result).toEqual({ status: 200, message: RESET_CODE_SENT_MESSAGE, verificationId: null });
    expect(sixth.code).toBeNull();
  });

  it("INV-L10 (실패경로): DB 의 인증번호 기록에 숫자 번호가 없다 — 해시만", async () => {
    const { phone } = await accountWithPhone("nodigits");
    await requestCode(phone);
    expect(psql(`select count(*) from pii.phone_verifications v where v::text like '%${phone}%'`)).toBe("0");
    expect(verificationsOf(phone)).toBe(1);
  });

  it("INV-L10 (실패경로): 대상 확인·표 발급 함수는 앱 서버 키만 — 로그인 키·익명 키로는 부를 수 없다", async () => {
    const { a, phone } = await accountWithPhone("grant");
    const hash = phoneHash(testPhoneKeys(), phone);
    const fan = await signedInClient("byeolbit_fan");
    for (const client of [fan, anonClient()]) {
      expect((await client.rpc("password_reset_target", { p_phone_hash: hash })).error).not.toBeNull();
      expect((await client.rpc("issue_phone_password_reset", { p_verification_id: crypto.randomUUID(), p_phone_hash: hash, p_token: "0".repeat(64) })).error).not.toBeNull();
      expect((await client.rpc("claim_password_reset", { p_token: "0".repeat(64) })).error).not.toBeNull();
      expect((await client.rpc("password_reset_login_id", { p_token: "0".repeat(64) })).error).not.toBeNull();
    }
    expect(resetRows(a.userId)).toBe(0);
  });

  it("INV-L10 S8c (실패경로): 옛 아이디+이메일 링크 만들기 함수는 없다", async () => {
    expect((await adminClient().rpc("request_password_reset", { p_login_id: "it_x", p_email: "x@example.com" })).error).not.toBeNull();
  });
});

describe("INV-L11: 재설정 표는 한 번·10분·그 계정 하나, 끝나면 모든 세션이 끝난다", () => {
  it("INV-L11 S9 (manual 0028 뒤): 인증번호를 맞힌 팬이 새 비밀번호를 정하면 새 비밀번호로 로그인되고, 다른 기기 두 대는 로그인 안 함", async () => {
    const { a, phone } = await accountWithPhone("s9");
    const phoneDevice = await device(a.loginEmail);
    const laptop = await device(a.loginEmail);
    expect(await stillSignedIn(phoneDevice)).toBe(true);

    const ticket = await ticketFor(phone);
    expect(await reset(ticket, "new-pass-s9-001!")).toEqual({ ok: true });

    expect(await canSignIn(a.loginEmail, "new-pass-s9-001!")).toBe(true);
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(false);
    expect(await stillSignedIn(phoneDevice)).toBe(false);
    expect(await stillSignedIn(laptop)).toBe(false);
    // 갱신 토큰으로도 다시 살아나지 않는다
    expect((await laptop.auth.refreshSession()).error).not.toBeNull();
  });

  it("INV-L11 (manual 0028 뒤): 표는 발급 뒤 10분에 만료되게 기록되고, DB 에는 표 원문이 없다 — 해시만", async () => {
    const { a, phone } = await accountWithPhone("ttl");
    const ticket = await ticketFor(phone);
    expect(Number(psql(`select round(extract(epoch from expires_at - sent_at)) from public.password_resets where account_id = '${a.userId}'`))).toBe(600);
    expect(psql(`select count(*) from public.password_resets r where account_id = '${a.userId}' and (r::text like '%${ticket}%' or encode(r.token_hash, 'hex') = '${ticket}')`)).toBe("0");
    expect(psql(`select count(*) from public.password_resets where token_hash = extensions.digest('${ticket}', 'sha256')`)).toBe("1");
  });

  it("INV-L11 S9b (실패경로, manual 0028 뒤): 같은 인증번호 확인으로 표를 두 번 받을 수 없다", async () => {
    const { phone } = await accountWithPhone("onceissue");
    const { result, code, deps } = await requestCode(phone);
    if (result.status !== 200 || !code) throw new Error("인증번호 없음");
    expect(await checkCode(deps, phone, code, result.verificationId)).toMatchObject({ ok: true });
    expect(await checkCode(deps, phone, code, result.verificationId)).toMatchObject({ ok: false });
  });

  it("INV-L11 S9b (실패경로, manual 0028 뒤): 인증번호 확인을 다른 번호로 돌려 쓰면 표가 없다", async () => {
    const mine = await accountWithPhone("swapmine");
    const other = await accountWithPhone("swapother");
    const { result, code, deps } = await requestCode(mine.phone);
    if (result.status !== 200 || !code) throw new Error("인증번호 없음");
    // 확인은 내 번호로 맞혔지만 발급은 다른 번호 해시로 — DB 가 거부한다
    const checked = await checkResetCode(
      { admin: adminClient(), check: (b) => checkPhoneCode(deps, b), phoneHashOf: () => phoneHash(testPhoneKeys(), other.phone) },
      { phone: mine.phone, code },
      result.verificationId ?? undefined,
    );
    expect(checked).toEqual({ ok: false, status: 400, reason: "invalid", message: RESET_CODE_AGAIN });
    expect(resetRows(other.a.userId)).toBe(0);
  });

  it("INV-L11 S9b (실패경로, manual 0028 뒤): 새 표가 나오면 이전 표는 거부되고, 새 표는 된다", async () => {
    const { a, phone } = await accountWithPhone("revoked");
    const first = await ticketFor(phone);
    waitPhoneCodeMinute(phone);
    const second = await ticketFor(phone);
    expect(second).not.toBe(first);
    expect(await reset(first, "new-pass-first-7!")).toMatchObject({ ok: false, field: "ticket", message: RESET_TICKET_EXPIRED });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await reset(second, "new-pass-second-7!")).toEqual({ ok: true });
  });

  it("INV-L11 S9b (실패경로): 이미 쓴 표는 거부, 비밀번호 그대로", async () => {
    const a = await createTestAccount({ tag: "used", email: testEmail("used") });
    const token = issueReset(a.userId);
    expect(await reset(token, "new-pass-used-1!")).toEqual({ ok: true });
    expect(await reset(token, "new-pass-used-2!")).toMatchObject({ ok: false, field: "ticket", message: RESET_TICKET_EXPIRED });
    expect(await canSignIn(a.loginEmail, "new-pass-used-1!")).toBe(true);
    expect(await canSignIn(a.loginEmail, "new-pass-used-2!")).toBe(false);
  });

  it("INV-L11 S9b (실패경로): 10분 지난 표는 거부, 비밀번호 그대로", async () => {
    const a = await createTestAccount({ tag: "expired", email: testEmail("expired") });
    const token = issueReset(a.userId);
    psql(`update public.password_resets set sent_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where account_id = '${a.userId}'`);
    expect(await reset(token, "new-pass-expired-7!")).toMatchObject({ ok: false, field: "ticket" });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L11 S9b (실패경로): 표가 없으면(쿠키 없음) 본문에 표를 실어도 거부, 비밀번호 그대로", async () => {
    const a = await createTestAccount({ tag: "noticket", email: testEmail("noticket") });
    const token = issueReset(a.userId);
    expect(await reset(undefined, "new-pass-none-7!", { token })).toMatchObject({ ok: false, field: "ticket", message: RESET_TICKET_EXPIRED });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L11 S9b (실패경로): 무효 표시가 된 표는 거부, 비밀번호 그대로", async () => {
    const a = await createTestAccount({ tag: "revokedd", email: testEmail("revokedd") });
    const token = issueReset(a.userId);
    psql(`update public.password_resets set revoked_at = now() where account_id = '${a.userId}'`);
    expect(await reset(token, "new-pass-revoked-7!")).toMatchObject({ ok: false, field: "ticket", message: RESET_TICKET_EXPIRED });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L11 S9b (실패경로): 표는 그 계정 하나에만 — 본문에 다른 계정을 적어도 다른 계정 비밀번호는 그대로", async () => {
    const victim = await createTestAccount({ tag: "victim", email: testEmail("victim") });
    const c = await createTestAccount({ tag: "ownerc", email: testEmail("ownerc") });
    const token = issueReset(c.userId);
    const r = await reset(token, "new-pass-owner-c-7!", { accountId: victim.userId, userId: victim.userId, loginId: victim.loginId });
    expect(r).toEqual({ ok: true });
    expect(await canSignIn(victim.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await canSignIn(victim.loginEmail, "new-pass-owner-c-7!")).toBe(false);
    expect(await canSignIn(c.loginEmail, "new-pass-owner-c-7!")).toBe(true);
  });

  it("INV-L11 (실패경로): 새 비밀번호가 짧거나 아이디와 같거나 확인과 다르면 거부되고, 표는 버려지지 않는다", async () => {
    // 아이디를 그대로 비밀번호로 넣어 「아이디와 같음」에 닿게 하려면 아이디가 세 종류 규칙을 먼저 통과해야 한다 — 태그에 숫자를 넣는다
    const a = await createTestAccount({ tag: "bounds7", email: testEmail("bounds") });
    const token = issueReset(a.userId);
    expect(await reset(token, "short-9")).toMatchObject({ ok: false, field: "password" });
    expect(await reset(token, a.loginId)).toMatchObject({ ok: false, field: "password", message: PASSWORD_SAME_AS_ID });
    expect(await reset(token, "new-pass-bounds-7!", { passwordConfirm: "new-pass-other-7!" })).toMatchObject({ ok: false, field: "passwordConfirm" });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await reset(token, "new-pass-bounds-7!")).toEqual({ ok: true });
  });

  it("INV-L11·signup INV-U6 (실패경로): 8자 이상이어도 영문·숫자 2종류뿐이면 거부되고, 비밀번호 그대로, 표는 버려지지 않는다", async () => {
    const a = await createTestAccount({ tag: "kinds", email: testEmail("kinds") });
    const token = issueReset(a.userId);
    expect(await reset(token, "abcdefgh12")).toEqual({ ok: false, status: 400, field: "password", message: PASSWORD_WEAK });
    expect(await canSignIn(a.loginEmail, "abcdefgh12")).toBe(false);
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await reset(token, "abcdefgh12!")).toEqual({ ok: true });
  });

  it("INV-L11 (실패경로): 같은 표로 동시에 두 번 저장하면 하나만 지나간다", async () => {
    const a = await createTestAccount({ tag: "race", email: testEmail("race") });
    const token = issueReset(a.userId);
    // 표 줄을 다른 연결에서 잠가 두 저장을 그 뒤에 줄 세운다 — 운 좋게 앞뒤로 와서 통과하지 않게
    const lock = await holdRowLock(`select 1 from public.password_resets where account_id = '${a.userId}' for update`, 2);
    const results = await Promise.all([reset(token, "new-pass-race-a-7!"), reset(token, "new-pass-race-b-7!")]);
    await lock.released;
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const winner = results[0]!.ok ? "new-pass-race-a-7!" : "new-pass-race-b-7!";
    const loser = winner === "new-pass-race-a-7!" ? "new-pass-race-b-7!" : "new-pass-race-a-7!";
    expect(await canSignIn(a.loginEmail, winner)).toBe(true);
    expect(await canSignIn(a.loginEmail, loser)).toBe(false);
  });

  it("INV-L11 (실패경로): 표 쓰기 함수는 쓴·무효·만료·없는 표를 직접 불러도 거부한다(앞의 미리 보기와 따로)", async () => {
    const a = await createTestAccount({ tag: "claimdb", email: testEmail("claimdb") });
    const claim = (token: string) => adminClient().rpc("claim_password_reset", { p_token: token });
    const used = issueReset(a.userId);
    expect((await claim(used)).data).toBe(a.userId);
    expect((await claim(used)).error?.code).toBe("P0002");
    const revoked = issueReset(a.userId);
    psql(`update public.password_resets set revoked_at = now() where token_hash = extensions.digest('${revoked}', 'sha256')`);
    expect((await claim(revoked)).error?.code).toBe("P0002");
    const expired = issueReset(a.userId);
    psql(`update public.password_resets set sent_at = now() - interval '2 hours', expires_at = now() - interval '1 second' where token_hash = extensions.digest('${expired}', 'sha256')`);
    expect((await claim(expired)).error?.code).toBe("P0002");
    expect((await claim("f".repeat(64))).error?.code).toBe("P0002");
    expect((await claim("not-a-token")).error?.code).toBe("P0002");
  });

  it("INV-L11 (실패경로): 비밀번호를 바꾸면(내 정보에서) 아직 안 쓴 재설정 표는 무효가 된다", async () => {
    const a = await createTestAccount({ tag: "pwrevoke", email: testEmail("pwrevoke") });
    const token = issueReset(a.userId);
    const me = await device(a.loginEmail);
    const changed = await changePassword(
      { ...accountPasswordDeps(), viewer: { userId: a.userId, role: "fan" }, sessionAuth: me.auth },
      { currentPassword: FIXTURE_PASSWORD, newPassword: "new-pass-pwrev-1!", newPasswordConfirm: "new-pass-pwrev-1!" },
    );
    expect(changed).toEqual({ ok: true });
    expect(await reset(token, "new-pass-pwrev-2!")).toMatchObject({ ok: false, field: "ticket", message: RESET_TICKET_EXPIRED });
    expect(await canSignIn(a.loginEmail, "new-pass-pwrev-1!")).toBe(true);
  });

  it("INV-L11 (manual 0028 뒤): 재설정은 비밀번호만 바꾼다 — 연락처(번호·이메일)는 그대로", async () => {
    const { a, phone } = await accountWithPhone("only");
    const contacts = () => psql(`select coalesce(email, '') || '|' || phone_hash || '|' || phone_sealed from pii.account_contacts where account_id = '${a.userId}'`);
    const before = contacts();
    expect(await reset(await ticketFor(phone), "new-pass-only-1!")).toEqual({ ok: true });
    expect(contacts()).toBe(before);
  });
});

describe("INV-L11: 재설정은 비밀번호만 바꾼다 — 프로필·크리에이터·주소 줄은 전후가 같다", () => {
  beforeAll(() => {
    removeTestCreator();
    createTestCreator();
  });
  afterAll(removeTestCreator);

  it("INV-L11: 시험 크리에이터(주소 등록됨)가 재설정해도 프로필·크리에이터·주소 줄이 그대로", async () => {
    const keys = await testKeyPair();
    putTestEnvelope(await sealTestAddress(keys, TEST_CREATOR.creatorId));
    const snapshot = () =>
      [
        psql(`select p::text from public.profiles p where id = '${TEST_CREATOR.profileId}'`),
        psql(`select c::text from public.creators c where id = '${TEST_CREATOR.creatorId}'`),
        psql(`select updated_at::text || ':' || md5(envelope::text) from pii.creator_addresses where creator_id = '${TEST_CREATOR.creatorId}'`),
        psql(`select count(*) from pii.creator_address_events where creator_id = '${TEST_CREATOR.creatorId}'`),
      ].join("\n");
    const before = snapshot();
    expect(before).toContain(":"); // 주소 줄이 실제로 있다(비교할 대상이 비어 있지 않다)
    expect(await reset(issueReset(TEST_CREATOR.profileId), "new-pass-creator-1!")).toEqual({ ok: true });
    expect(await canSignIn(`${TEST_CREATOR.loginId}@fankkuk.test`, "new-pass-creator-1!")).toBe(true);
    expect(snapshot()).toBe(before);
  });
});
