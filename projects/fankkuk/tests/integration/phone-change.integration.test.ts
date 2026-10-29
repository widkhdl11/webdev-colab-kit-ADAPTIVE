import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changePhone, PHONE_CHANGE_CLOSED, SAME_AS_CURRENT_PHONE, VERIFY_AGAIN } from "@/features/phone-change/model/change-phone";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { accountPasswordDeps, createTestAccount, FIXTURE_PASSWORD, removeTestAccounts, testEmail, testPhone, type TestAccount } from "./account-fixtures";
import { adminClient, anonClient, psql, psqlError, signedInClient, verifiedTestPhone, waitPhoneCodeMinute } from "./helpers";

// 휴대폰 번호 바꾸기(signup INV-U12)를 실제 DB 로 돈다. 인증번호 확인은 가입과 같은 함수를 쓴다(문자는 보내지 않고 시험 도구가 6자리를 꺼내 맞힌다).
// 번호 바꾸기 함수(change_my_phone)는 연락처(pii)에 쓰므로 사람이 적용하는 supabase/manual/0013 에 있다 — 적용 전에는 빨간불이 맞다.
// 시험 전용 계정(it_)·시험 번호(0109000…)만 쓴다.


/** 인증번호를 맞혀 확인까지 끝낸 번호표(INV-U1·U15). */
const verified = (p: string): Promise<string> => verifiedTestPhone(p);

function change(who: TestAccount | null, body: Record<string, unknown>, verificationId: string | undefined, verifierReady = true) {
  return changePhone(
    { ...accountPasswordDeps(), admin: adminClient(), viewer: who ? { userId: who.userId, role: "fan" } : null, verifierReady },
    body,
    verificationId,
  );
}

const phoneOf = (a: TestAccount) => psql(`select coalesce(phone, '') from pii.account_contacts where account_id = '${a.userId}'`);
const events = (a: TestAccount) => Number(psql(`select count(*) from public.phone_change_events where account_id = '${a.userId}'`));
const usedAt = (id: string) => psql(`select coalesce(used_at::text, '') from pii.phone_verifications where id = '${id}'`);

beforeAll(removeTestAccounts);
afterAll(removeTestAccounts);

describe("INV-U12: 번호 바꾸기는 로그인한 사람 자신의 번호만, 새 번호 본인 확인 + 지금 비밀번호 (manual 0013 뒤)", () => {
  it("INV-U12 S12: 새 번호로 본인 확인, 지금 비밀번호 맞음 → 연락처 줄의 번호가 바뀌고 기록 한 줄(번호 값 없음)", async () => {
    const f = await createTestAccount({ tag: "s12", email: testEmail("s12"), phone: testPhone() });
    const next = testPhone();
    const ticket = await verified(next);
    expect(await change(f, { phone: next.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3"), currentPassword: FIXTURE_PASSWORD }, ticket)).toEqual({ ok: true });
    expect(phoneOf(f)).toBe(next);
    expect(events(f)).toBe(1);
    expect(usedAt(ticket)).not.toBe("");
    const cols = psql(
      `select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'phone_change_events'`,
    );
    expect(cols).toBe("account_id,at,id");
  });

  it("INV-U12 S12b (실패경로): 010-2222-3333 꼴로 확인받고 다른 번호로 바꾸려 하면 거부, 아무것도 안 바뀜", async () => {
    const before = testPhone();
    const f = await createTestAccount({ tag: "s12mis", email: testEmail("s12mis"), phone: before });
    const ticket = await verified(testPhone());
    const other = testPhone();
    expect(await change(f, { phone: other, currentPassword: FIXTURE_PASSWORD }, ticket)).toEqual({
      ok: false,
      status: 400,
      field: "verification",
      message: VERIFY_AGAIN,
    });
    expect(phoneOf(f)).toBe(before);
    expect(events(f)).toBe(0);
  });

  it("INV-U12 S12b (실패경로): 이미 쓴 확인으로 다시 바꾸면 거부", async () => {
    const f = await createTestAccount({ tag: "s12used", email: testEmail("s12used"), phone: testPhone() });
    const next = testPhone();
    const ticket = await verified(next);
    expect(await change(f, { phone: next, currentPassword: FIXTURE_PASSWORD }, ticket)).toEqual({ ok: true });
    const g = await createTestAccount({ tag: "s12used2", email: testEmail("s12used2"), phone: testPhone() });
    const gBefore = phoneOf(g);
    expect(await change(g, { phone: next, currentPassword: FIXTURE_PASSWORD }, ticket)).toMatchObject({ ok: false, field: "verification" });
    expect(phoneOf(g)).toBe(gBefore);
    expect(events(f)).toBe(1);
  });

  it("INV-U12 S12b (실패경로): 확인한 지 11분 지난 확인은 거부", async () => {
    const before = testPhone();
    const f = await createTestAccount({ tag: "s12old", email: testEmail("s12old"), phone: before });
    const next = testPhone();
    const ticket = await verified(next);
    psql(`update pii.phone_verifications set verified_at = now() - interval '11 minutes' where id = '${ticket}'`);
    expect(await change(f, { phone: next, currentPassword: FIXTURE_PASSWORD }, ticket)).toMatchObject({ ok: false, field: "verification" });
    expect(phoneOf(f)).toBe(before);
  });

  it("INV-U12 S12b (실패경로): 틀린 지금 비밀번호 → 거부, 번호 그대로, 본인 확인은 쓰이지 않는다", async () => {
    const before = testPhone();
    const f = await createTestAccount({ tag: "s12pw", email: testEmail("s12pw"), phone: before });
    const next = testPhone();
    const ticket = await verified(next);
    expect(await change(f, { phone: next, currentPassword: "not-my-password" }, ticket)).toMatchObject({ ok: false, field: "currentPassword" });
    expect(phoneOf(f)).toBe(before);
    expect(usedAt(ticket)).toBe("");
    expect(events(f)).toBe(0);
  });

  it("INV-U12 S12b (실패경로): 다른 계정이 쓰는 번호로 확인받고 바꾸면 「이미 가입된 번호」, 둘 다 그대로", async () => {
    const fPhone = testPhone();
    const gPhone = testPhone();
    const f = await createTestAccount({ tag: "s12dup", email: testEmail("s12dup"), phone: fPhone });
    const g = await createTestAccount({ tag: "s12dupg", email: testEmail("s12dupg"), phone: gPhone });
    const ticket = await verified(gPhone);
    expect(await change(f, { phone: gPhone, currentPassword: FIXTURE_PASSWORD }, ticket)).toEqual({
      ok: false,
      status: 409,
      field: "phone",
      message: "이미 가입된 휴대폰 번호입니다.",
    });
    expect(phoneOf(f)).toBe(fPhone);
    expect(phoneOf(g)).toBe(gPhone);
  });

  it("INV-U12 (실패경로): 지금 번호와 같은 번호로 바꾸면 「현재 번호와 같습니다」 — 확인을 쓰지 않고 기록도 남기지 않는다", async () => {
    const mine = testPhone();
    const f = await createTestAccount({ tag: "s12same", email: testEmail("s12same"), phone: mine });
    const ticket = await verified(mine);
    expect(await change(f, { phone: mine, currentPassword: FIXTURE_PASSWORD }, ticket)).toEqual({
      ok: false,
      status: 400,
      field: "phone",
      message: SAME_AS_CURRENT_PHONE,
    });
    expect(usedAt(ticket)).toBe("");
    expect(events(f)).toBe(0);
  });

  it("INV-U11·U12 (실패경로): 이미 쓴 번호표에 남의 번호를 넣으면 「이미 가입된 번호」(409)가 아니라 본인 확인 오류 — 남의 번호인지 새지 않는다", async () => {
    const gPhone = testPhone();
    const g = await createTestAccount({ tag: "u11usedg", email: testEmail("u11usedg"), phone: gPhone });
    const f = await createTestAccount({ tag: "u11used", email: testEmail("u11used"), phone: testPhone() });
    const fBefore = phoneOf(f);
    const ticket = await verified(gPhone);
    psql(`update pii.phone_verifications set used_at = now() where id = '${ticket}'`);
    expect(await change(f, { phone: gPhone, currentPassword: FIXTURE_PASSWORD }, ticket)).toEqual({
      ok: false,
      status: 400,
      field: "verification",
      message: VERIFY_AGAIN,
    });
    expect(phoneOf(f)).toBe(fBefore);
    expect(phoneOf(g)).toBe(gPhone);
  });

  it("INV-U11·U12 (실패경로): 확인한 지 11분 지난 번호표에 남의 번호를 넣어도 409 가 아니라 본인 확인 오류", async () => {
    const gPhone = testPhone();
    await createTestAccount({ tag: "u11oldg", email: testEmail("u11oldg"), phone: gPhone });
    const f = await createTestAccount({ tag: "u11old", email: testEmail("u11old"), phone: testPhone() });
    const ticket = await verified(gPhone);
    psql(`update pii.phone_verifications set verified_at = now() - interval '11 minutes' where id = '${ticket}'`);
    expect(await change(f, { phone: gPhone, currentPassword: FIXTURE_PASSWORD }, ticket)).toEqual({
      ok: false,
      status: 400,
      field: "verification",
      message: VERIFY_AGAIN,
    });
  });

  it("INV-U12 S12b (실패경로): 같은 새 번호로 두 계정이 동시에 바꾸면 하나만 지나간다", async () => {
    const f = await createTestAccount({ tag: "s12racef", email: testEmail("s12racef"), phone: testPhone() });
    const g = await createTestAccount({ tag: "s12raceg", email: testEmail("s12raceg"), phone: testPhone() });
    const next = testPhone();
    const tf = await verified(next);
    waitPhoneCodeMinute(next);
    const tg = await verified(next);
    const results = await Promise.all([
      change(f, { phone: next, currentPassword: FIXTURE_PASSWORD }, tf),
      change(g, { phone: next, currentPassword: FIXTURE_PASSWORD }, tg),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.status === 409)).toHaveLength(1);
    expect(Number(psql(`select count(*) from pii.account_contacts where phone = '${next}'`))).toBe(1);
  });

  it("INV-U12 (실패경로): 로그인 안 함 → 거부 · 문자 창구가 없으면(운영, 문자 대행사 연결 전) 거부", async () => {
    const f = await createTestAccount({ tag: "s12gate", email: testEmail("s12gate"), phone: testPhone() });
    const next = testPhone();
    const ticket = await verified(next);
    expect(await change(null, { phone: next, currentPassword: FIXTURE_PASSWORD }, ticket)).toMatchObject({ ok: false, status: 401 });
    expect(await change(f, { phone: next, currentPassword: FIXTURE_PASSWORD }, ticket, false)).toEqual({ ok: false, status: 503, message: PHONE_CHANGE_CLOSED });
    expect(await change(f, { phone: next, currentPassword: FIXTURE_PASSWORD }, undefined)).toMatchObject({ ok: false, field: "verification" });
    expect(usedAt(ticket)).toBe("");
    expect(choosePhoneVerifier({ NODE_ENV: "production" })).toBeNull();
  });

  it("INV-U12 (실패경로): 번호 바꾸기 함수는 앱 서버 키만 — 로그인 키·익명 키로 부르면 비밀번호 확인을 건너뛸 수 있으므로 막혀 있다", async () => {
    const before = testPhone();
    const f = await createTestAccount({ tag: "s12grant", email: testEmail("s12grant"), phone: before });
    const next = testPhone();
    const ticket = await verified(next);
    const fan = await signedInClient("byeolbit_fan");
    for (const client of [fan, anonClient()]) {
      expect((await client.rpc("change_my_phone", { p_account_id: f.userId, p_phone: next, p_verification_id: ticket })).error).not.toBeNull();
    }
    expect(phoneOf(f)).toBe(before);
  });

  it("INV-U12 (실패경로): 번호 바꾼 기록은 고치거나 지울 수 없다", async () => {
    const f = await createTestAccount({ tag: "s12log", email: testEmail("s12log"), phone: testPhone() });
    const next = testPhone();
    expect(await change(f, { phone: next, currentPassword: FIXTURE_PASSWORD }, await verified(next))).toEqual({ ok: true });
    expect(psqlError(`update public.phone_change_events set at = now() where account_id = '${f.userId}'`)).toMatch(/추가만/);
    expect(psqlError(`delete from public.phone_change_events where account_id = '${f.userId}'`)).toMatch(/추가만/);
    expect(psqlError(`truncate public.phone_change_events`)).toMatch(/추가만/);
  });
});
