import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestPasswordReset, RESET_REQUESTED_MESSAGE } from "@/features/password-reset/model/request-reset";
import { RESET_LINK_INVALID } from "@/features/password-reset/model/reset-messages";
import { resetPassword } from "@/features/password-reset/model/reset-password";
import { changePassword } from "@/features/password-change/model/change-password";
import { PASSWORD_SAME_AS_ID, PASSWORD_WEAK } from "@/entities/session/model/password-rule";
import {
  accountPasswordDeps,
  canSignIn,
  createTestAccount,
  device,
  FIXTURE_PASSWORD,
  latestResetToken,
  localMailer,
  mailRecipients,
  mailText,
  removeTestAccounts,
  settledMailsTo,
  stillSignedIn,
  testEmail,
} from "./account-fixtures";
import { adminClient, anonClient, holdRowLock, psql, signedInClient } from "./helpers";
import { putTestEnvelope, sealTestAddress, testKeyPair } from "./invoice-helpers";
import { createTestCreator, removeTestCreator, TEST_CREATOR } from "./test-creator";
import { PHONE_IN_TEXT } from "./pii-shape";

// 비밀번호 재설정(session-login INV-L10·L11)을 실제 DB·실제 Auth·실제 메일 서버(로컬 Mailpit)로 돈다.
// 링크 만들기(request_password_reset)는 연락처(pii)를 읽어 사람이 적용하는 supabase/manual/0013 에 있다 —
// 「manual 0013 뒤」가 붙은 시험은 그 파일이 적용되기 전에는 빨간불이 맞다. 링크를 쓰는 쪽(INV-L11) 시험은 링크를 DB 에 바로 넣어 따로 돈다.
// 시험 전용 계정(it_ 접두어)만 쓴다. 시드 계정의 비밀번호는 건드리지 않는다.

/** 라우트는 메일을 응답 뒤(after)에 보낸다. 시험은 응답을 받은 뒤 미룬 일을 기다려, 메일이 실제로 나간 뒤에 센다. */
async function request(loginId: string, email: string) {
  const deferred: Promise<void>[] = [];
  const result = await requestPasswordReset({ admin: adminClient(), getMailer: localMailer, defer: (task) => void deferred.push(task()) }, { loginId, email });
  await Promise.all(deferred);
  return result;
}

const reset = (token: string, password: string, extra: Record<string, unknown> = {}) =>
  resetPassword({ ...accountPasswordDeps(), admin: adminClient() }, { token, password, passwordConfirm: password, ...extra });

/**
 * 재설정 링크 하나를 DB 에 바로 넣는다(시험 준비) — 링크를 쓰는 쪽(INV-L11)을 링크 만들기 함수(manual 0013)와 따로 시험하려고.
 * 만들기 함수와 같은 꼴이다: 64자리 16진수 값, 표에는 SHA-256 해시, 1시간 뒤 만료.
 */
function issueReset(userId: string): string {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  psql(
    `insert into public.password_resets (account_id, token_hash, expires_at) values ('${userId}', extensions.digest('${token}', 'sha256'), now() + interval '1 hour')`,
  );
  return token;
}

const resetRows = (userId: string) => Number(psql(`select count(*) from public.password_resets where account_id = '${userId}'`));

beforeAll(removeTestAccounts);
afterAll(removeTestAccounts);

describe("INV-L10: 재설정 요청은 아이디+이메일, 응답은 언제나 하나 (manual 0013 뒤)", () => {
  it("INV-L10 S8 (실패경로): 없는 아이디·틀린 이메일·확인된 이메일 없는 계정·맞는 아이디+이메일 — 네 응답이 같고 메일은 마지막 하나에만 한 통", async () => {
    const mail = testEmail("s8");
    const wrongMail = testEmail("s8wrong");
    const pendingOnly = testEmail("s8pending");
    const a = await createTestAccount({ tag: "s8a", email: mail });
    const b = await createTestAccount({ tag: "s8b", email: null, pendingEmail: pendingOnly });

    const responses = [
      await request("it_nobody_zz9q", mail),
      await request(a.loginId, wrongMail),
      await request(b.loginId, pendingOnly),
      await request(a.loginId, mail),
    ];
    for (const r of responses) expect(r).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });

    expect(await settledMailsTo(mail, 1)).toHaveLength(1);
    expect(await settledMailsTo(wrongMail, 0)).toHaveLength(0);
    expect(await settledMailsTo(pendingOnly, 0)).toHaveLength(0);
    expect(resetRows(a.userId)).toBe(1);
    expect(resetRows(b.userId)).toBe(0);
  });

  it("INV-L10: 이메일 대소문자·앞뒤 공백은 같은 주소로 본다", async () => {
    const mail = testEmail("case");
    const a = await createTestAccount({ tag: "case", email: mail });
    await request(` ${a.loginId} `, `  ${mail.toUpperCase()} `);
    expect(await settledMailsTo(mail, 1)).toHaveLength(1);
  });

  it("INV-L10 S8b (실패경로): 확인 대기 이메일만 있는 계정은 그 주소로 요청해도 같은 응답, 메일 없음", async () => {
    const pending = testEmail("s8b");
    const b = await createTestAccount({ tag: "s8bb", email: testEmail("s8bconfirmed"), pendingEmail: pending });
    expect(await request(b.loginId, pending)).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });
    expect(await settledMailsTo(pending, 0)).toHaveLength(0);
    expect(resetRows(b.userId)).toBe(0);
  });

  it("INV-L10 S8b (실패경로): 한 시간에 다섯 통까지 — 여섯 번째는 같은 응답, 메일 없음", async () => {
    const mail = testEmail("limit");
    const a = await createTestAccount({ tag: "limit", email: mail });
    for (let i = 0; i < 5; i += 1) expect(await request(a.loginId, mail)).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });
    expect(await settledMailsTo(mail, 5)).toHaveLength(5);
    expect(await request(a.loginId, mail)).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });
    expect(await settledMailsTo(mail, 0)).toHaveLength(5);
    expect(resetRows(a.userId)).toBe(5);
  });

  it("INV-L10 (manual 0013 뒤): 한도는 지난 한 시간만 센다 — 61분 전에 다섯 통이면 여섯 번째가 나간다", async () => {
    const mail = testEmail("window");
    const a = await createTestAccount({ tag: "window", email: mail });
    psql(
      `insert into public.password_resets (account_id, token_hash, sent_at, expires_at)
       select '${a.userId}', extensions.digest('old-${a.userId}-' || g, 'sha256'), now() - interval '61 minutes', now() - interval '1 minute' from generate_series(1, 5) g`,
    );
    expect(await request(a.loginId, mail)).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });
    expect(await settledMailsTo(mail, 1)).toHaveLength(1);
    expect(resetRows(a.userId)).toBe(6);
  });

  it("INV-L10 (manual 0013 뒤): 받는 사람(To)은 그 계정의 확인된 이메일 그대로 — 입력한 대소문자·공백도, 확인 대기 이메일·로그인 주소도 아니다", async () => {
    const mail = testEmail("to");
    const pending = testEmail("topending");
    const a = await createTestAccount({ tag: "to", email: mail, pendingEmail: pending });
    await request(a.loginId, ` ${mail.toUpperCase()} `);
    const [m] = await settledMailsTo(mail, 1);
    expect(await mailRecipients(m!.ID)).toEqual([mail]);
    expect(await settledMailsTo(pending, 0)).toHaveLength(0);
    expect(await settledMailsTo(a.loginEmail, 0)).toHaveLength(0);
  });

  it("INV-L10 (실패경로): 동시에 일곱 번 요청해도 다섯 통만 나간다", async () => {
    const mail = testEmail("burst");
    const a = await createTestAccount({ tag: "burst", email: mail });
    const all = await Promise.all(Array.from({ length: 7 }, () => request(a.loginId, mail)));
    for (const r of all) expect(r).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });
    expect(resetRows(a.userId)).toBe(5);
    expect(await settledMailsTo(mail, 5)).toHaveLength(5);
  });

  it("INV-L10: 메일 본문에는 링크와 닉네임만 — 번호·로그인 주소가 없다", async () => {
    const mail = testEmail("body");
    const a = await createTestAccount({ tag: "body", email: mail, phone: "01090009911" });
    await request(a.loginId, mail);
    const [m] = await settledMailsTo(mail, 1);
    const text = await mailText(m!.ID);
    expect(text).toContain("body님");
    expect(text).toMatch(/http:\/\/127\.0\.0\.1:3311\/password\/reset\?token=[0-9a-f]{64}/);
    // 링크 값(64자리 16진수)의 숫자가 번호 꼴로 우연히 읽히지 않게, 링크를 뺀 본문에서 번호를 찾는다
    expect(text.replace(/http\S+/g, "")).not.toMatch(PHONE_IN_TEXT);
    expect(text).not.toContain(a.loginEmail);
  });

  it("INV-L10 (실패경로): 링크 만들기 함수는 앱 서버 키만 — 로그인 키·익명 키로는 부를 수 없다", async () => {
    const mail = testEmail("grant");
    const a = await createTestAccount({ tag: "grant", email: mail });
    const fan = await signedInClient("byeolbit_fan");
    for (const client of [fan, anonClient()]) {
      expect((await client.rpc("request_password_reset", { p_login_id: a.loginId, p_email: mail })).error).not.toBeNull();
      expect((await client.rpc("claim_password_reset", { p_token: "0".repeat(64) })).error).not.toBeNull();
      expect((await client.rpc("password_reset_login_id", { p_token: "0".repeat(64) })).error).not.toBeNull();
    }
    expect(resetRows(a.userId)).toBe(0);
  });
});

describe("INV-L11: 재설정 링크는 한 번·1시간·그 계정 하나, 끝나면 모든 세션이 끝난다", () => {
  it("INV-L11 S9: 링크로 새 비밀번호를 정하면 새 비밀번호로 로그인되고, 다른 기기 두 대는 로그인 안 함", async () => {
    const mail = testEmail("s9");
    const a = await createTestAccount({ tag: "s9", email: mail });
    const phone = await device(a.loginEmail);
    const laptop = await device(a.loginEmail);
    expect(await stillSignedIn(phone)).toBe(true);

    const token = issueReset(a.userId);
    expect(await reset(token, "new-pass-s9-001")).toEqual({ ok: true });

    expect(await canSignIn(a.loginEmail, "new-pass-s9-001")).toBe(true);
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(false);
    expect(await stillSignedIn(phone)).toBe(false);
    expect(await stillSignedIn(laptop)).toBe(false);
    // 갱신 토큰으로도 다시 살아나지 않는다
    expect((await laptop.auth.refreshSession()).error).not.toBeNull();
  });

  it("INV-L11 S9b (실패경로): 이미 쓴 링크는 거부, 비밀번호 그대로", async () => {
    const mail = testEmail("used");
    const a = await createTestAccount({ tag: "used", email: mail });
    const token = issueReset(a.userId);
    expect(await reset(token, "new-pass-used-1")).toEqual({ ok: true });
    expect(await reset(token, "new-pass-used-2")).toMatchObject({ ok: false, field: "link", message: RESET_LINK_INVALID });
    expect(await canSignIn(a.loginEmail, "new-pass-used-1")).toBe(true);
    expect(await canSignIn(a.loginEmail, "new-pass-used-2")).toBe(false);
  });

  it("INV-L11 S9b (실패경로): 1시간 지난 링크는 거부, 비밀번호 그대로", async () => {
    const mail = testEmail("expired");
    const a = await createTestAccount({ tag: "expired", email: mail });
    const token = issueReset(a.userId);
    psql(`update public.password_resets set sent_at = now() - interval '61 minutes', expires_at = now() - interval '1 minute' where account_id = '${a.userId}'`);
    expect(await reset(token, "new-pass-expired-7")).toMatchObject({ ok: false, field: "link" });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L11: 발급 뒤 59분 된 링크는 아직 쓸 수 있다", async () => {
    const a = await createTestAccount({ tag: "fresh59", email: testEmail("fresh59") });
    const token = issueReset(a.userId);
    psql(`update public.password_resets set sent_at = now() - interval '59 minutes', expires_at = now() + interval '1 minute' where account_id = '${a.userId}'`);
    expect(await reset(token, "new-pass-fresh59")).toEqual({ ok: true });
    expect(await canSignIn(a.loginEmail, "new-pass-fresh59")).toBe(true);
  });

  it("INV-L11 (manual 0013 뒤): 링크는 발급 뒤 1시간에 만료되게 기록된다", async () => {
    const mail = testEmail("ttl");
    const a = await createTestAccount({ tag: "ttl", email: mail });
    await request(a.loginId, mail);
    expect(Number(psql(`select round(extract(epoch from expires_at - sent_at)) from public.password_resets where account_id = '${a.userId}'`))).toBe(3600);
  });

  it("INV-L11 S9b (실패경로, manual 0013 뒤): 새 요청으로 무효가 된 이전 링크는 거부되고, 새 링크는 된다", async () => {
    const mail = testEmail("revoked");
    const a = await createTestAccount({ tag: "revoked", email: mail });
    await request(a.loginId, mail);
    await settledMailsTo(mail, 1);
    const first = await latestResetToken(mail);
    await request(a.loginId, mail);
    await settledMailsTo(mail, 2);
    const second = await latestResetToken(mail);
    expect(second).not.toBe(first);
    expect(await reset(first, "new-pass-first-7")).toMatchObject({ ok: false, field: "link" });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await reset(second, "new-pass-second-7")).toEqual({ ok: true });
  });

  it("INV-L11 S9b (실패경로): 무효 표시가 된 링크(새 요청이 나온 링크)는 거부, 비밀번호 그대로", async () => {
    const a = await createTestAccount({ tag: "revokedd", email: testEmail("revokedd") });
    const token = issueReset(a.userId);
    psql(`update public.password_resets set revoked_at = now() where account_id = '${a.userId}'`);
    expect(await reset(token, "new-pass-revoked-7")).toMatchObject({ ok: false, field: "link", message: RESET_LINK_INVALID });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L11 S9b (실패경로): 링크는 그 계정 하나에만 — 본문에 다른 계정을 적어도 다른 계정 비밀번호는 그대로", async () => {
    const mailC = testEmail("ownerc");
    const victim = await createTestAccount({ tag: "victim", email: testEmail("victim") });
    const c = await createTestAccount({ tag: "ownerc", email: mailC });
    const token = issueReset(c.userId);
    const r = await reset(token, "new-pass-owner-c-7", { accountId: victim.userId, userId: victim.userId, loginId: victim.loginId });
    expect(r).toEqual({ ok: true });
    expect(await canSignIn(victim.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await canSignIn(victim.loginEmail, "new-pass-owner-c-7")).toBe(false);
    expect(await canSignIn(c.loginEmail, "new-pass-owner-c-7")).toBe(true);
  });

  it("INV-L11 S9b (실패경로): DB 에는 링크 원문이 없다 — 해시만", async () => {
    const mail = testEmail("hash");
    const a = await createTestAccount({ tag: "hash", email: mail });
    const token = issueReset(a.userId);
    expect(psql(`select count(*) from public.password_resets r where account_id = '${a.userId}' and (r::text like '%${token}%' or encode(r.token_hash, 'hex') = '${token}')`)).toBe("0");
    expect(psql(`select count(*) from public.password_resets where token_hash = extensions.digest('${token}', 'sha256')`)).toBe("1");
  });

  it("INV-L11 (실패경로): 새 비밀번호가 짧거나 아이디와 같거나 확인과 다르면 거부되고, 링크는 버려지지 않는다", async () => {
    const mail = testEmail("bounds");
    // 아이디를 그대로 비밀번호로 넣어 「아이디와 같음」에 닿게 하려면 아이디가 세 종류 규칙을 먼저 통과해야 한다 — 무작위 끝 글자에 숫자가 없을 때가 있어 태그에 숫자를 넣는다
    const a = await createTestAccount({ tag: "bounds7", email: mail });
    const token = issueReset(a.userId);
    expect(await reset(token, "short-9")).toMatchObject({ ok: false, field: "password" });
    expect(await reset(token, a.loginId)).toMatchObject({ ok: false, field: "password", message: PASSWORD_SAME_AS_ID });
    expect(await reset(token, "new-pass-bounds-7", { passwordConfirm: "new-pass-other-7" })).toMatchObject({ ok: false, field: "passwordConfirm" });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await reset(token, "new-pass-bounds-7")).toEqual({ ok: true });
  });

  it("INV-L11·signup INV-U6 (실패경로): 8자 이상이어도 영문·숫자 2종류뿐이면 거부되고, 비밀번호 그대로, 링크는 버려지지 않는다", async () => {
    const a = await createTestAccount({ tag: "kinds", email: testEmail("kinds") });
    const token = issueReset(a.userId);
    expect(await reset(token, "abcdefgh12")).toEqual({ ok: false, status: 400, field: "password", message: PASSWORD_WEAK });
    expect(await canSignIn(a.loginEmail, "abcdefgh12")).toBe(false);
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await reset(token, "abcdefgh12!")).toEqual({ ok: true });
  });

  it("INV-L11 (실패경로): 같은 링크로 동시에 두 번 저장하면 하나만 지나간다", async () => {
    const a = await createTestAccount({ tag: "race", email: testEmail("race") });
    const token = issueReset(a.userId);
    // 링크 줄을 다른 연결에서 잠가 두 저장을 그 뒤에 줄 세운다 — 운 좋게 앞뒤로 와서 통과하지 않게
    const lock = await holdRowLock(`select 1 from public.password_resets where account_id = '${a.userId}' for update`, 2);
    const results = await Promise.all([reset(token, "new-pass-race-a-7"), reset(token, "new-pass-race-b-7")]);
    await lock.released;
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const winner = results[0]!.ok ? "new-pass-race-a-7" : "new-pass-race-b-7";
    const loser = winner === "new-pass-race-a-7" ? "new-pass-race-b-7" : "new-pass-race-a-7";
    expect(await canSignIn(a.loginEmail, winner)).toBe(true);
    expect(await canSignIn(a.loginEmail, loser)).toBe(false);
  });

  it("INV-L11 (실패경로): 링크 쓰기 함수는 쓴·무효·만료·없는 링크를 직접 불러도 거부한다(앞의 미리 보기와 따로)", async () => {
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
    expect(psql(`select count(*) from public.password_resets where token_hash = extensions.digest('${revoked}', 'sha256') and used_at is null`)).toBe("1");
  });

  it("INV-L11 (실패경로): 미리 보기 함수도 쓴·무효·만료 링크에는 아이디를 주지 않는다", async () => {
    const a = await createTestAccount({ tag: "peekdb", email: testEmail("peekdb") });
    const peek = async (token: string) => (await adminClient().rpc("password_reset_login_id", { p_token: token })).data as string | null;
    const live = issueReset(a.userId);
    expect(await peek(live)).toBe(a.loginId);
    const used = issueReset(a.userId);
    psql(`update public.password_resets set used_at = now() where token_hash = extensions.digest('${used}', 'sha256')`);
    const revoked = issueReset(a.userId);
    psql(`update public.password_resets set revoked_at = now() where token_hash = extensions.digest('${revoked}', 'sha256')`);
    const expired = issueReset(a.userId);
    psql(`update public.password_resets set sent_at = now() - interval '2 hours', expires_at = now() - interval '1 second' where token_hash = extensions.digest('${expired}', 'sha256')`);
    for (const t of [used, revoked, expired, "f".repeat(64)]) expect(await peek(t)).toBeNull();
    expect(psql(`select count(*) from public.password_resets where token_hash = extensions.digest('${live}', 'sha256') and used_at is null`)).toBe("1");
  });


  it("INV-L11 (실패경로, manual 0013 뒤): 비밀번호를 바꾸면(내 정보에서) 아직 안 쓴 재설정 링크는 무효가 된다", async () => {
    const a = await createTestAccount({ tag: "pwrevoke", email: testEmail("pwrevoke") });
    const token = issueReset(a.userId);
    const me = await device(a.loginEmail);
    const changed = await changePassword(
      { ...accountPasswordDeps(), viewer: { userId: a.userId, role: "fan" }, sessionAuth: me.auth },
      { currentPassword: FIXTURE_PASSWORD, newPassword: "new-pass-pwrev-1", newPasswordConfirm: "new-pass-pwrev-1" },
    );
    expect(changed).toEqual({ ok: true });
    expect(await reset(token, "new-pass-pwrev-2")).toMatchObject({ ok: false, field: "link", message: RESET_LINK_INVALID });
    expect(await canSignIn(a.loginEmail, "new-pass-pwrev-1")).toBe(true);
  });

  it("INV-L11 (실패경로, manual 0013 뒤): 확인된 이메일이 바뀌면(확인 링크로 새 주소 확인) 아직 안 쓴 재설정 링크는 무효가 된다", async () => {
    const a = await createTestAccount({ tag: "mailrev", email: testEmail("mailrev") });
    const token = issueReset(a.userId);
    const peek = async () => (await adminClient().rpc("password_reset_login_id", { p_token: token })).data as string | null;
    const me = await device(a.loginEmail);
    const next = testEmail("mailrevnext");
    expect((await me.rpc("update_my_account", { p_nickname: "mailrev", p_email: next, p_notify_kakao: true, p_notify_email: true })).error).toBeNull();
    expect(await peek()).toBe(a.loginId); // 확인 대기만으로는 링크가 살아 있다
    const issued = await adminClient().rpc("issue_email_verification", { p_account_id: a.userId });
    expect(issued.error).toBeNull();
    const confirm = await me.rpc("confirm_my_email", { p_token: (issued.data as { token: string }[])[0]!.token });
    expect(confirm.error).toBeNull();
    expect(psql(`select email from pii.account_contacts where account_id = '${a.userId}'`)).toBe(next);
    expect(await peek()).toBeNull();
    expect(await reset(token, "new-pass-mailrev-7")).toMatchObject({ ok: false, field: "link", message: RESET_LINK_INVALID });
    expect(await canSignIn(a.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L11: 재설정은 비밀번호만 바꾼다 — 연락처(번호·이메일)는 그대로", async () => {
    const mail = testEmail("only");
    const a = await createTestAccount({ tag: "only", email: mail, phone: "01090009922" });
    const before = psql(`select email || '|' || phone from pii.account_contacts where account_id = '${a.userId}'`);
    expect(await reset(issueReset(a.userId), "new-pass-only-1")).toEqual({ ok: true });
    expect(psql(`select email || '|' || phone from pii.account_contacts where account_id = '${a.userId}'`)).toBe(before);
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
    expect(await reset(issueReset(TEST_CREATOR.profileId), "new-pass-creator-1")).toEqual({ ok: true });
    expect(await canSignIn(`${TEST_CREATOR.loginId}@fankkuk.test`, "new-pass-creator-1")).toBe(true);
    expect(snapshot()).toBe(before);
  });
});
