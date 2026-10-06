import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, deleteTestOrders, psql, signedInClient } from "./helpers";

// 크리에이터 본인 확인(creator-verification INV-V1~V15) 시험 도구.
// 시험 계정은 cvt_ 로 시작하는 아이디의 크리에이터 넷 — 시드 계정의 상태를 바꾸지 않으려고 따로 만든다.
// 비밀번호는 시드와 같다(signedInClient 가 그대로 로그인한다).

export const CV = {
  ggul: { id: "00000000-0000-4000-c000-0000000000a1", creatorId: "00000000-0000-4000-c000-0000000000b1", login: "cvt_ggul", name: "꿀단지" },
  summer: { id: "00000000-0000-4000-c000-0000000000a2", creatorId: "00000000-0000-4000-c000-0000000000b2", login: "cvt_summer", name: "여름밤" },
  haru: { id: "00000000-0000-4000-c000-0000000000a3", creatorId: "00000000-0000-4000-c000-0000000000b3", login: "cvt_haru", name: "하루시험" },
  dawn: { id: "00000000-0000-4000-c000-0000000000a4", creatorId: "00000000-0000-4000-c000-0000000000b4", login: "cvt_dawn", name: "새벽시험" },
} as const;

export type CvWho = keyof typeof CV;
const ALL = Object.values(CV);
const accountIds = ALL.map((a) => `'${a.id}'`).join(", ");
const creatorIds = ALL.map((a) => `'${a.creatorId}'`).join(", ");
/** 「확인된 상태로 바로 넣기」 시험이 쓰는 행 — 막는 장치가 빠진 변이 실행 뒤에도 남지 않게 정리 때 지운다. */
export const GHOST_CREATOR_ID = "00000000-0000-4000-c000-0000000000bf";

/** 표가 있을 때만 그 문장을 돈다 — 구현 전 빨간불 확인 때도 정리가 멈추지 않게. */
function ifTable(table: string, sql: string): string {
  return `if to_regclass('public.${table}') is not null then execute $q$${sql}$q$; end if;`;
}

/** 시험 계정의 신청·점유·기록·풀기 기록을 지우고 공개 정보를 「확인 안 됨, 채널 없음」으로 되돌린다. */
export function resetCv(): void {
  deleteTestOrders();
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      "do $$ begin",
      ifTable("creator_channel_claims", `delete from public.creator_channel_claims where creator_id in (${creatorIds}) or account_id in (${accountIds})`),
      ifTable("creator_verification_unlocks", `delete from public.creator_verification_unlocks where account_id in (${accountIds})`),
      `delete from public.creator_verification_events where creator_id in (${creatorIds});`,
      ifTable("creator_verification_applications", `delete from public.creator_verification_applications where account_id in (${accountIds})`),
      `delete from public.follows where creator_id in (${creatorIds}) or fan_id in (${accountIds});`,
      `delete from public.creators where id = '${GHOST_CREATOR_ID}';`,
      `if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'channel_url') then
         execute $q$update public.creators set identity_verified = false, platform = null, channel_url = null, channel_key = null, channel = '' where id in (${creatorIds})$q$;
       else
         update public.creators set identity_verified = false, channel = '' where id in (${creatorIds});
       end if;`,
      "end $$;",
      "commit;",
    ].join(" "),
  );
}

/** 시험 계정 넷을 만든다(이미 있으면 그대로). 로그인 정보·프로필·공개 정보 행. */
export function createCvAccounts(): void {
  const values = ALL.map((a) => `('${a.id}'::uuid, '${a.login}', '${a.name}', '${a.creatorId}'::uuid)`).join(", ");
  psql(`
    with a(id, login_id, nickname, creator_id) as (values ${values})
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    select '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.login_id || '@fankkuk.test',
      extensions.crypt('fankkuk-local-1234', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    from a on conflict (id) do nothing;
    with a(id, login_id) as (values ${ALL.map((x) => `('${x.id}'::uuid, '${x.login}')`).join(", ")})
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select a.id::text, a.id, jsonb_build_object('sub', a.id::text, 'email', a.login_id || '@fankkuk.test', 'email_verified', true), 'email', now(), now(), now()
    from a on conflict do nothing;
    with a(id, login_id, nickname) as (values ${ALL.map((x) => `('${x.id}'::uuid, '${x.login}', '${x.name}')`).join(", ")})
    insert into public.profiles (id, login_id, nickname, role) select a.id, a.login_id, a.nickname, 'creator' from a on conflict (id) do nothing;
    with a(id, creator_id, login_id, nickname) as (values ${ALL.map((x) => `('${x.id}'::uuid, '${x.creatorId}'::uuid, '${x.login}', '${x.name}')`).join(", ")})
    insert into public.creators (id, profile_id, slug, name, channel, channel_title, category)
    select a.creator_id, a.id, replace(a.login_id, '_', '-'), a.nickname, '', a.nickname || ' 채널', '시험' from a on conflict (id) do nothing;
  `);
}

/** 시험 계정을 모두 지운다. */
export function dropCvAccounts(): void {
  resetCv();
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `delete from public.creators where id in (${creatorIds});`,
      `delete from public.profiles where id in (${accountIds});`,
      `delete from auth.identities where user_id in (${accountIds});`,
      `delete from auth.users where id in (${accountIds});`,
      "commit;",
    ].join(" "),
  );
}

const clients = new Map<string, SupabaseClient>();
/** 로그인한 클라이언트(시험 계정은 CV 키, 그 밖은 시드 아이디). 한 번 만든 것은 다시 쓴다. */
export async function as(who: CvWho | string): Promise<SupabaseClient> {
  const login = who in CV ? CV[who as CvWho].login : who;
  const hit = clients.get(login);
  if (hit) return hit;
  const c = await signedInClient(login);
  clients.set(login, c);
  return c;
}

export type Issued = { application_id: string; code: string; platform: string; channel_url: string; issued_at: string; post_deadline: string };

/** 신청한다. 오류면 던진다. */
export async function requestOk(who: CvWho, url: string): Promise<Issued> {
  const r = await (await as(who)).rpc("request_creator_verification", { p_channel_url: url });
  if (r.error) throw new Error(`request_creator_verification 실패(${who}, ${url}): ${r.error.code} ${r.error.message}`);
  return r.data as Issued;
}

export async function request(who: CvWho, url: string) {
  return (await as(who)).rpc("request_creator_verification", { p_channel_url: url });
}

export async function post(who: CvWho, applicationId: string) {
  return (await as(who)).rpc("mark_creator_verification_posted", { p_application_id: applicationId });
}

export async function withdraw(who: CvWho, applicationId: string) {
  return (await as(who)).rpc("withdraw_creator_verification", { p_application_id: applicationId });
}

export async function regenerate(who: CvWho) {
  return (await as(who)).rpc("regenerate_creator_verification_code");
}

export const OWNER = "fankkuk_admin"; // 모아 역
export const STAFF = "fankkuk_staff"; // 라임 역

export async function approve(applicationId: string, by: string = OWNER) {
  return (await as(by)).rpc("admin_approve_creator_verification", { p_application_id: applicationId });
}

export async function reject(applicationId: string, reasonCode = "code_not_found", memo = "", by: string = STAFF) {
  return (await as(by)).rpc("admin_reject_creator_verification", { p_application_id: applicationId, p_reason_code: reasonCode, p_memo: memo });
}

export async function revoke(creatorId: string, reasonCode = "channel_gone", memo = "", by: string = STAFF) {
  return (await as(by)).rpc("admin_revoke_creator", { p_creator_id: creatorId, p_reason_code: reasonCode, p_memo: memo });
}

export async function unlock(applicationId: string, memo = "문의 확인", by: string = STAFF) {
  return (await as(by)).rpc("admin_unlock_creator_verification_count", { p_application_id: applicationId, p_memo: memo });
}

/** 플랫폼 로그인 확인 — 서버 관리자 키로만(INV-V14). */
export function loginConfirm(who: CvWho, platform: string, channelKey: string) {
  return adminClient().rpc("confirm_creator_channel_by_login", { p_account_id: CV[who].id, p_platform: platform, p_channel_key: channelKey });
}

/** 자동 확인 ① — 1분 제한을 잡고 읽을 채널·찾을 코드를 받는다. 서버 관리자 키로만(INV-V16). */
export function autoClaim(who: CvWho, applicationId: string) {
  return adminClient().rpc("claim_creator_verification_auto_check", { p_account_id: CV[who].id, p_application_id: applicationId });
}

/** 자동 확인 ② — 소개란에서 코드를 찾았는지만 넘긴다. 서버 관리자 키로만(INV-V16). */
export function autoConfirm(applicationId: string, found: boolean) {
  return adminClient().rpc("confirm_creator_verification_auto_check", { p_application_id: applicationId, p_found: found });
}

/** 신청 → 코드 올렸어요 → 운영자 승인. 확인된 크리에이터를 만든다. */
export async function verifyVia(who: CvWho, url: string): Promise<Issued> {
  const a = await requestOk(who, url);
  const p = await post(who, a.application_id);
  if (p.error) throw new Error(`post 실패: ${p.error.message}`);
  const ap = await approve(a.application_id);
  if (ap.error) throw new Error(`approve 실패: ${ap.error.message}`);
  return a;
}

export function appStatus(applicationId: string): string {
  return psql(`select status from public.creator_verification_applications where id = '${applicationId}'`);
}

/** 신청 줄의 시각을 옮긴다(시간이 지난 상태를 만든다). 시각 칸은 고칠 수 없게 막혀 있어 트리거를 끄고 고친다. */
export function shiftApp(applicationId: string, set: string): void {
  psql(`begin; set local session_replication_role = replica; update public.creator_verification_applications set ${set} where id = '${applicationId}'; commit;`);
}

export function verified(who: CvWho): string {
  return psql(`select identity_verified from public.creators where id = '${CV[who].creatorId}'`);
}

export function liveCount(who: CvWho): number {
  return Number(
    psql(
      `select count(*) from public.creator_verification_applications where account_id = '${CV[who].id}' and (status = 'posted' or (status = 'issued' and issued_at > now() - interval '7 days'))`,
    ),
  );
}

/** 채널 키의 점유자(계정 id 또는 크리에이터 id)와 종류. 없으면 빈 문자열. */
export function claimOf(platform: string, key: string): string {
  return psql(
    `select kind || ':' || coalesce(account_id::text, '') || ':' || coalesce(creator_id::text, '') from public.creator_channel_claims where platform = '${platform}' and channel_key = '${key}'`,
  );
}

/** 채널 키의 신청 잠금 — 동시 신청을 확실히 겹치게 할 때 다른 연결에서 쥔다. DB 함수와 같은 키여야 한다. */
export function channelLockSql(platform: string, key: string): string {
  return `select pg_advisory_xact_lock(hashtextextended('cv_channel:${platform}:${key}', 0))`;
}

export function creatorRowLockSql(who: CvWho): string {
  return `select 1 from public.creators where id = '${CV[who].creatorId}' for update`;
}

export function appRowLockSql(applicationId: string): string {
  return `select 1 from public.creator_verification_applications where id = '${applicationId}' for update`;
}
