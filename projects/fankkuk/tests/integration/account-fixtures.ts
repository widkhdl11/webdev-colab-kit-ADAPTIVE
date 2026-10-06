import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccountPasswordDeps, DetachedAuth } from "@/entities/session/api/account-password";
import type { SendMail } from "@/shared/api/mail/smtp";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { adminClient, deleteTestSignups, psql, TEST_SIGNUP_ID_PREFIX, TEST_SIGNUP_PHONE_PREFIX } from "./helpers";

// 비밀번호·휴대폰 번호를 바꾸는 시험 전용 계정. 시드 계정의 비밀번호·번호는 건드리지 않는다.
// 아이디는 가입 시험과 같은 접두어(it_)라 deleteTestSignups 가 로그인 정보째 지운다(프로필·연락처·재설정 링크가 따라 지워진다).
// 번호 바꾼 기록 표는 계정에 묶이지 않고 추가만 되므로 이 계정들의 줄만 트리거를 끄고 지운다.

export const FIXTURE_PASSWORD = "it-pass-12345";
export const APP_ORIGIN = "http://127.0.0.1:3311";
const MAILPIT = "http://127.0.0.1:55324";

export type TestAccount = { userId: string; loginId: string; loginEmail: string };

const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

let phoneSeq = crypto.getRandomValues(new Uint32Array(1))[0]! % 5000;

/** 시험 번호 — 가입 시험과 같은 접두어라 본인 확인 기록도 deleteTestSignups 가 지운다. 한 실행 안에서는 겹치지 않는다. */
export function testPhone(): string {
  phoneSeq = (phoneSeq + 1) % 10000;
  return `${TEST_SIGNUP_PHONE_PREFIX}${String(phoneSeq).padStart(4, "0")}`;
}

export function testEmail(tag: string): string {
  return `${tag}.${Date.now()}.${rand(4)}@example.com`;
}

const lit = (v: string | null | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);

export async function createTestAccount(o: { tag: string; email?: string | null; pendingEmail?: string | null; phone?: string | null }): Promise<TestAccount> {
  const loginId = `${TEST_SIGNUP_ID_PREFIX}${o.tag}_${rand(5)}`;
  const loginEmail = `${loginId}@login.fankkuk.invalid`;
  const { data, error } = await adminClient().auth.admin.createUser({ email: loginEmail, password: FIXTURE_PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`시험 계정을 만들지 못했다: ${error?.message}`);
  const userId = data.user.id;
  psql(
    [
      `insert into public.profiles (id, login_id, nickname, role) values ('${userId}', '${loginId}', '${o.tag.slice(0, 12)}', 'fan');`,
      `insert into pii.account_contacts (account_id, email, pending_email, phone) values ('${userId}', ${lit(o.email)}, ${lit(o.pendingEmail)}, ${lit(o.phone)});`,
    ].join(" "),
  );
  return { userId, loginId, loginEmail };
}

/** 시험 계정·그 번호 바꾼 기록·시험 번호의 본인 확인 기록을 지운다. */
export function removeTestAccounts(): void {
  const prefix = TEST_SIGNUP_ID_PREFIX.replace("_", "\\_");
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `do $$ begin if to_regclass('public.phone_change_events') is not null then
         delete from public.phone_change_events where account_id in (select id from auth.users where email like '${prefix}%@login.fankkuk.invalid');
       end if; end $$;`,
      "set local session_replication_role = origin;",
      "commit;",
    ].join(" "),
  );
  deleteTestSignups();
}

/** 브라우저 한 대 = 그 계정으로 로그인한 클라이언트 하나(세션은 그 클라이언트 메모리에만). */
export async function device(loginEmail: string, password = FIXTURE_PASSWORD): Promise<SupabaseClient> {
  const client = createClient(process.env.FK_TEST_API_URL ?? "", process.env.FK_TEST_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: loginEmail, password });
  if (error) throw new Error(`로그인 실패: ${loginEmail}`);
  return client;
}

/** 그 비밀번호로 로그인되는가. */
export async function canSignIn(loginEmail: string, password: string): Promise<boolean> {
  const client = createClient(process.env.FK_TEST_API_URL ?? "", process.env.FK_TEST_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: loginEmail, password });
  if (!error) await client.auth.signOut({ scope: "local" });
  return !error;
}

/** 그 기기가 아직 로그인돼 있는가 — 앱 서버처럼 Auth 서버에 토큰을 확인받는다(INV-L2). */
export async function stillSignedIn(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.auth.getUser();
  return !error && !!data.user;
}

/** 앱 서버가 쓰는 것과 같은 실제 Auth 도구(관리자 키 + 일회용 클라이언트). */
export function accountPasswordDeps(): AccountPasswordDeps {
  return {
    authAdmin: adminClient().auth.admin,
    makeDetachedAuth: (): DetachedAuth =>
      createClient(process.env.FK_TEST_API_URL ?? "", process.env.FK_TEST_ANON_KEY ?? "", {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth,
  };
}

export function localMailer(): { send: SendMail; appOrigin: string } {
  return { send: createSmtpSender({ host: "127.0.0.1", port: 55325, from: "팬꾹 <no-reply@fankkuk.test>" }), appOrigin: APP_ORIGIN };
}

type MailSummary = { ID: string; Subject: string };

export async function mailsTo(address: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: MailSummary[] | null }).messages ?? [];
}

export async function mailText(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return ((await res.json()) as { Text: string }).Text;
}

/** 메일함에 n 통이 들 때까지(최대 5초) 기다린 뒤 지금 든 메일을 돌려준다. 0 을 기다리면 1초 머문 뒤 돌려준다 — 늦게 도착한 메일도 세려고. */
export async function settledMailsTo(address: string, expected: number): Promise<MailSummary[]> {
  if (expected === 0) {
    await new Promise((r) => setTimeout(r, 1000));
    return mailsTo(address);
  }
  for (let i = 0; i < 25; i += 1) {
    const list = await mailsTo(address);
    if (list.length >= expected) {
      await new Promise((r) => setTimeout(r, 300));
      return mailsTo(address);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return mailsTo(address);
}

/** 그 메일의 받는 사람 주소(To 헤더) 목록 — 메일 서버가 실제로 받은 그대로. */
export async function mailRecipients(id: string): Promise<string[]> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return ((await res.json()) as { To: { Address: string }[] | null }).To?.map((t) => t.Address) ?? [];
}

/** 그 주소로 온 가장 최근 재설정 메일의 링크 값. */
export async function latestResetToken(address: string): Promise<string> {
  const list = await mailsTo(address);
  const text = list[0] ? await mailText(list[0].ID) : "";
  const token = /\/password\/reset\?token=([0-9a-f]{64})/.exec(text)?.[1];
  if (!token) throw new Error(`재설정 링크가 든 메일이 없다: ${address}`);
  return token;
}
