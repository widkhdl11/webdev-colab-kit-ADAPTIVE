import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changePassword, CURRENT_PASSWORD_WRONG } from "@/features/password-change/model/change-password";
import { accountPasswordDeps, canSignIn, createTestAccount, device, FIXTURE_PASSWORD, removeTestAccounts, stillSignedIn, testEmail } from "./account-fixtures";
import { psql } from "./helpers";

// 로그인한 사람의 비밀번호 바꾸기(session-login INV-L12)를 실제 Auth 로 돈다. 시험 전용 계정(it_ 접두어)만 쓴다.
// 「기기」는 그 계정으로 로그인한 클라이언트 하나다. 바꾸기는 그 기기의 세션으로 부른다 — 앱 서버의 라우트가 요청한 사람의 세션 클라이언트를 넘기는 자리.

beforeAll(removeTestAccounts);
afterAll(removeTestAccounts);

function change(on: { userId: string } | null, session: SupabaseClient | null, body: Record<string, unknown>) {
  return changePassword(
    {
      ...accountPasswordDeps(),
      viewer: on ? { userId: on.userId, role: "fan" } : null,
      sessionAuth: session ? session.auth : { updateUser: async () => ({ error: { message: "세션 없음" } }), signOut: async () => ({ error: { message: "세션 없음" } }) },
    },
    body,
  );
}

describe("INV-L12: 비밀번호 바꾸기는 로그인한 사람 자신의 것만, 지금 비밀번호가 맞을 때만", () => {
  it("INV-L12 S10 (실패경로): 틀린 지금 비밀번호 → 거부(문구 하나), 비밀번호 그대로", async () => {
    const d = await createTestAccount({ tag: "s10wrong", email: testEmail("s10wrong") });
    const me = await device(d.loginEmail);
    const r = await change(d, me, { currentPassword: "not-my-password", newPassword: "new-pass-s10-01", newPasswordConfirm: "new-pass-s10-01" });
    expect(r).toEqual({ ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_WRONG });
    expect(await canSignIn(d.loginEmail, FIXTURE_PASSWORD)).toBe(true);
    expect(await canSignIn(d.loginEmail, "new-pass-s10-01")).toBe(false);
  });

  it("INV-L12 S10 (실패경로): 9자 새 비밀번호·아이디와 같은 새 비밀번호·확인이 다른 새 비밀번호 → 각각 거부", async () => {
    const d = await createTestAccount({ tag: "s10bound", email: testEmail("s10bound") });
    const me = await device(d.loginEmail);
    const base = { currentPassword: FIXTURE_PASSWORD };
    expect(await change(d, me, { ...base, newPassword: "short-9ch", newPasswordConfirm: "short-9ch" })).toMatchObject({ ok: false, field: "newPassword" });
    expect(await change(d, me, { ...base, newPassword: d.loginId, newPasswordConfirm: d.loginId })).toMatchObject({
      ok: false,
      field: "newPassword",
      message: "비밀번호를 아이디와 다르게 적어 주세요.",
    });
    expect(await change(d, me, { ...base, newPassword: "new-pass-bound-1", newPasswordConfirm: "new-pass-bound-2" })).toMatchObject({
      ok: false,
      field: "newPasswordConfirm",
    });
    expect(await canSignIn(d.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L12 S10 (실패경로): 본문에 다른 계정 ID 와 그 계정 비밀번호를 넣어도 거부, 다른 계정 비밀번호 그대로", async () => {
    const d = await createTestAccount({ tag: "s10me", email: testEmail("s10me") });
    const other = await createTestAccount({ tag: "s10other", email: testEmail("s10other") });
    // 두 계정의 시험 비밀번호가 같으므로, 다른 계정의 「지금 비밀번호」로 쓰일 값을 바꿔 둔다
    const otherPassword = "other-pass-777";
    expect((await accountPasswordDeps().authAdmin.updateUserById(other.userId, { password: otherPassword })).error).toBeNull();
    const me = await device(d.loginEmail);
    const r = await change(d, me, {
      userId: other.userId,
      accountId: other.userId,
      currentPassword: otherPassword,
      newPassword: "new-pass-hijack",
      newPasswordConfirm: "new-pass-hijack",
    });
    expect(r).toMatchObject({ ok: false, field: "currentPassword", message: CURRENT_PASSWORD_WRONG });
    expect(await canSignIn(other.loginEmail, otherPassword)).toBe(true);
    expect(await canSignIn(other.loginEmail, "new-pass-hijack")).toBe(false);
    expect(await canSignIn(d.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L12 (실패경로): 로그인하지 않았으면 거부", async () => {
    const r = await change(null, null, { currentPassword: FIXTURE_PASSWORD, newPassword: "new-pass-anon-1", newPasswordConfirm: "new-pass-anon-1" });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("INV-L12 S10b: 두 기기에서 로그인 → 한 기기에서 바꾸면 그 기기는 그대로, 다른 기기는 로그인 안 함", async () => {
    const d = await createTestAccount({ tag: "s10b", email: testEmail("s10b") });
    const here = await device(d.loginEmail);
    const there = await device(d.loginEmail);
    const r = await change(d, here, { currentPassword: FIXTURE_PASSWORD, newPassword: "new-pass-s10b-01", newPasswordConfirm: "new-pass-s10b-01" });
    expect(r).toEqual({ ok: true });
    expect(await stillSignedIn(here)).toBe(true);
    expect(await stillSignedIn(there)).toBe(false);
    expect((await there.auth.refreshSession()).error).not.toBeNull();
    expect(await canSignIn(d.loginEmail, "new-pass-s10b-01")).toBe(true);
    expect(await canSignIn(d.loginEmail, FIXTURE_PASSWORD)).toBe(false);
  });

  it("INV-L12 (실패경로): 지금 비밀번호를 확인하려고 만든 세션은 남지 않는다 — 실패해도, 성공해도", async () => {
    const d = await createTestAccount({ tag: "s10sess", email: testEmail("s10sess") });
    const me = await device(d.loginEmail);
    const sessions = async () => Number(psql(`select count(*) from auth.sessions where user_id = '${d.userId}'`));
    expect(await sessions()).toBe(1);
    await change(d, me, { currentPassword: FIXTURE_PASSWORD, newPassword: "short-9ch", newPasswordConfirm: "short-9ch" });
    expect(await sessions()).toBe(1);
    await change(d, me, { currentPassword: FIXTURE_PASSWORD, newPassword: "new-pass-sess-01", newPasswordConfirm: "new-pass-sess-01" });
    expect(await sessions()).toBe(1);
  });
});
