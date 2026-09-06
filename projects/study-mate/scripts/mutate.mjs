// 변이 검증 도구 — 강제 장치를 하나 무력화하고, 그것을 붙들어야 할 테스트가
// 실제로 빨간불이 되는지 본다. 통과하는 테스트는 그것만으로 검증의 증거가 아니다.
//
// 사용: node scripts/mutate.mjs <변이이름>       변이를 심는다
//       node scripts/mutate.mjs --restore        원래대로 되돌린다(마이그레이션 재적용)
//       node scripts/mutate.mjs --list           변이 목록
//
// 되돌리기는 `supabase db reset --local` 이 아니라 정책·함수를 다시 정의하는 마이그레이션을
// 순서대로 다시 적용하는 것으로 한다(목록은 아래 RESTORE_MIGRATIONS) — 전부
// create or replace / grant / drop if exists 라서 그것만으로 원상 복구된다.

import { Client } from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// **이 도구는 인가를 일부러 무력화한다.** 손으로 부르는 사용법이 파일 머리에 적혀 있는데,
// 환경에 원격 SUPABASE_DB_URL 이 들어 있으면 그 원격에 「아무나 읽는다」 정책을 심는다.
//
// **문자열 패턴으로는 못 가린다.** 전에는 `@127.0.0.1:` 이 문자열 어디에든 있으면 통과했는데,
// URL 문법에서 호스트를 정하는 것은 **마지막** `@` 뒤다:
//   postgresql://postgres:postgres@127.0.0.1:54322@evil.com/postgres
// 이 값은 옛 검사를 통과하고 실제로는 evil.com 에 붙는다. 그래서 파싱해서 호스트만 본다.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
/** 비밀번호를 통째로 가린다. 마지막 `@` 앞이 전부 userinfo 다. */
const maskUrl = (u) => u.replace(/\/\/[^/]*@/, "//***@");
function assertLocal(url, what) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    host = null;
  }
  if (host === null || !LOCAL_HOSTS.has(host)) {
    console.error(
      `이 도구는 정책을 일부러 무력화한다. ${what}는 로컬에만 붙인다.` +
        "\n  지금 가리키는 곳: " + maskUrl(url),
    );
    process.exit(1);
  }
}
assertLocal(DB_URL, "데이터베이스");

// ── INV-Z13 판정 함수의 갈래 다섯 ──────────────────────────────────────
//
// 갈래 하나만 빼는 변이가 다섯이다. 본문을 다섯 번 베껴 적는 대신 여기서 조립한다 —
// 베껴 적으면 원본이 바뀔 때 다섯 곳을 다 고쳐야 하고, 하나를 빠뜨리면 그 변이만
// 「낡았다」로 멈춘다(안전한 실패지만 손질이 는다). md5 도 한 자리에만 적는다.
//
// **갈래마다 변이를 따로 두는 이유가 여기서 가장 중요한 부분이다.** 전에는 ②③ 을 함께
// 빼는 변이 하나였다. 그러면 ② 를 붙드는 검사가 빨간불을 내고 판정이 「잡혔다」로
// 나오는데, **③ 만 지우는 diff 는 아무도 안 잡으면서 숫자는 그대로다.** 갈래를 묶으면
// 묶인 것 중 하나만 붙들려도 전부 붙들린 것처럼 보인다.
//
// **그래서 tag 를 손으로 적는다.** 기본 이름표는 holds 의 첫 `INV-XX` 인데 그건 다섯 다
// `INV-Z13` 이라, 갈래 하나가 깨지면 다섯 변이가 전부 「잡혔다」로 보고된다. 검사 이름에도
// 같은 문자열이 들어 있어야 판정이 성립한다.
const Z13_BODY_MD5 = "6f8b8c77b85136720e7294ea308b08b2";

const Z13_BRANCHES = {
  // ① 본인
  self: "p_profile_id = p_viewer_id",
  // ② 볼 수 있는 스터디의 호스트
  host: `exists (
            select 1 from public.studies s
             where s.host_id = p_profile_id and private.study_is_visible(s.id, p_viewer_id)
          )`,
  // ③ 볼 수 있는 모집글의 작성자
  author: `exists (
            select 1 from public.posts p
             where p.author_id = p_profile_id and private.study_is_visible(p.study_id, p_viewer_id)
          )`,
  // ④-1 INV-Z11 이 보여 주기로 정한 참여자 행의 주인
  relation: `exists (
            select 1 from public.participants pt
             where pt.user_id = p_profile_id
               and (
                 pt.user_id = p_viewer_id
                 or private.is_study_host(pt.study_id, p_viewer_id)
                 or (pt.status = 'accepted' and private.is_study_member(pt.study_id, p_viewer_id))
               )
          )`,
  // ④-2 내가 읽을 수 있는 대화에서 메시지를 보낸 사람
  sender: `exists (
            select 1 from public.chat_messages m
             where m.sender_id = p_profile_id
               and private.is_chat_member(m.chat_id, p_viewer_id)
          )`,
};

/** 갈래 하나를 뺀 판정 함수를 심는 변이 조각. guard 가 원본 본문의 해시를 대조한다. */
function z13Without(drop) {
  if (!(drop in Z13_BRANCHES)) throw new Error(`Z13_BRANCHES 에 없는 갈래: ${drop}`);
  const kept = Object.entries(Z13_BRANCHES)
    .filter(([k]) => k !== drop)
    .map(([, v]) => v);
  // 전부 빠지면 `select ;` 가 되어 조용히 문법 오류로 죽는다. 그 전에 여기서 멈춘다.
  if (kept.length === 0) throw new Error("갈래를 전부 뺐다");
  return {
    guard: { schema: "private", fn: "profile_is_visible", md5: Z13_BODY_MD5 },
    sql: `
      create or replace function private.profile_is_visible(p_profile_id uuid, p_viewer_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $fn$
        select ${kept.join("\n          or ")};
      $fn$;`,
  };
}

/** 변이 이름 → 무엇을 무력화하는가 + 그것을 붙들어야 할 테스트 */
const MUTATIONS = {
  // ── 0010 이 만든 강제 장치 셋 ──────────────────────────────────────────
  "a7-no-profile-trigger": {
    holds: "INV-A7 — 계정을 만들면 프로필이 함께 생긴다",
    // 트리거를 떼면 계정만 생긴다. 옛 코드가 남기던 상태가 바로 이것이다.
    sql: `drop trigger if exists on_auth_user_created on auth.users;`,
    // 트리거는 0010 이 다시 만든다 — 복구 목록에 0010 이 있으므로 undo 가 따로 필요 없다.
  },
  "a7-username-any-length": {
    holds: "INV-A7 — 이름 길이 규칙을 데이터베이스가 지킨다",
    // 제약을 떼면 앱을 안 거친 가입이 아무 길이나 넣는다.
    sql: `alter table public.profiles drop constraint if exists profiles_username_length;`,
  },
  "a7-blank-username": {
    holds: "INV-A7 — 빈 이름과 공백뿐인 이름도 가입을 막지 않는다",
    // 씻는 자리를 뺀다. 그러면 빈 문자열은 길이 0 이라 제약에 걸려 **가입 자체가 거절되고**,
    // 전각 공백은 길이 1 이라 통과해 **빈 줄로 뜨는 사용자**가 생긴다. 두 방향으로 깨진다.
    sql: `
      create or replace function private.profile_username_from_meta(p_id uuid, p_meta jsonb)
      returns text language sql immutable set search_path = '' as $fn$
        select left(coalesce(p_meta ->> 'username', '회원' || left(p_id::text, 8)), 20);
      $fn$;`,
  },
  "z12-expose-invoker-wrapper": {
    holds: "INV-Z12 — 노출된 스키마에 새 판정 통로가 생기면 걸린다",
    // **definer 가 아니다.** anon 에게 private 실행 권한이 있으므로(정책이 그 권한으로
    // 평가된다) 껍데기 하나면 문이 다시 열린다 — 안쪽 함수가 정책을 안 지나므로 답도
    // 정확히 나온다. 2026-09-05 실측: 이 껍데기를 심으니 비로그인 호출이 200 + 판정값.
    sql: `
      create or replace function public.can_read_members(p_study_id uuid, p_user_id uuid)
      returns boolean language sql stable as $fn$
        select private.is_study_member(p_study_id, p_user_id);
      $fn$;`,
    undo: `drop function if exists public.can_read_members(uuid, uuid);`,
  },
  "z12-expose-new-definer": {
    holds: "INV-Z12 — 노출된 스키마에 새 판정 통로가 생기면 걸린다",
    // 이름 목록에 **없는** 이름이다. 이름을 세는 검사는 이걸 못 보고 구조 검사만 본다 —
    // 그래서 구조 검사에 자기 홀더가 생긴다.
    sql: `
      create or replace function public.member_check(p_study_id uuid, p_user_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $fn$
        select exists (select 1 from public.participants
                        where study_id = p_study_id and user_id = p_user_id and status = 'accepted');
      $fn$;`,
    undo: `drop function if exists public.member_check(uuid, uuid);`,
  },
  "z12-expose-via-composite": {
    holds: "INV-Z12 — 노출된 스키마에 새 판정 통로가 생기면 걸린다",
    // 구조 검사의 "행 인자는 계산 컬럼이라 면제"를 노린다. 그 면제가 성립하는 것은
    // **인자가 딱 하나이고 그것이 공개 테이블의 행 타입일 때**뿐이다 — 지어낸 복합 타입은
    // 읽을 행이 없으므로 JSON 으로 만들어 보내면 그만이다.
    sql: `
      drop type if exists public.member_q cascade;
      create type public.member_q as (study_id uuid, user_id uuid);
      create or replace function public.member_check2(q public.member_q)
      returns boolean language sql stable security definer set search_path = '' as $fn$
        select exists (select 1 from public.participants
                        where study_id = (q).study_id and user_id = (q).user_id
                          and status = 'accepted');
      $fn$;`,
    undo: `
      drop function if exists public.member_check2(public.member_q);
      drop type if exists public.member_q cascade;`,
  },
  "z12-expose-helper": {
    holds: "INV-Z12 — 인가 판정 함수가 API 에 노출되지 않는다",
    // 문을 도로 연다. **함수 본문은 그대로다** — 답이 틀려지는 것이 아니라
    // 아무나 물을 수 있게 되는 것이 이 변이가 만드는 상태다.
    sql: `
      create or replace function public.is_study_member(p_study_id uuid, p_user_id uuid) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select exists (
          select 1 from public.participants
           where study_id = p_study_id and user_id = p_user_id and status = 'accepted'
        );
      $fn$;`,
    // 0010 의 drop 이 다시 지운다. PostgREST 의 스키마 캐시는 이 설치에 걸린 DDL 감시
    // 이벤트 트리거(pgrst_ddl_watch · pgrst_drop_watch)가 심고 지울 때 각각 깨운다 —
    // 확인했다. 이 도구에 없는 필드(`after` 같은)를 적어 두면 아무 일도 안 하면서
    // 무언가 한 것처럼 읽히므로 적지 않는다.
  },
  // ── 0011 이 만든 강제 장치 (INV-Z13) ──────────────────────────────────
  // 갈래를 하나씩 빼는 다섯은 본문을 통째로 다시 적는다(z13Without). 갈래 하나를 빼는 것이
  // 그 변이의 내용이라 다른 방법이 없고, guard 가 원본 본문의 해시를 대조해서 원본이 바뀐
  // 뒤에 낡은 본문을 심는 것을 막는다.
  "z13-profiles-read-open": {
    holds: "INV-Z13 — 프로필은 볼 이유가 있는 사람에게만 보인다",
    // 원래 뚫려 있던 모양 그대로. 필터 없는 select 하나로 회원 명부 전체가 나온다.
    sql: `
      drop policy if exists profiles_read on public.profiles;
      create policy profiles_read on public.profiles for select using (true);`,
    // 0011 이 복구 목록에 있으므로 정책이 다시 걸린다.
  },
  "z13-logged-in-only": {
    holds: "INV-Z13 (S14) — 발견은 로그인 앞에 있다: 비로그인도 호스트·작성자를 읽는다",
    // 좁히는 쪽으로 틀린 경우. 「로그인한 사람만」은 명부 긁기를 막지만
    // **공개 모집글 상세에서 누가 여는 스터디인지가 빈칸이 된다.**
    sql: `
      drop policy if exists profiles_read on public.profiles;
      create policy profiles_read on public.profiles for select
      using ((select auth.uid()) is not null);`,
  },
  "z13-drop-self-branch": {
    tag: "INV-Z13 ①",
    holds: "INV-Z13 ① — 자기 프로필은 아무 관계가 없어도 읽는다",
    ...z13Without("self"),
  },
  "z13-drop-host-branch": {
    tag: "INV-Z13 ②",
    holds: "INV-Z13 ② — 볼 수 있는 스터디의 호스트는 비로그인에게도 보인다",
    ...z13Without("host"),
  },
  "z13-drop-author-branch": {
    tag: "INV-Z13 ③",
    holds: "INV-Z13 ③ — 볼 수 있는 모집글의 작성자는 비로그인에게도 보인다",
    ...z13Without("author"),
  },
  "z13-drop-relation-branch": {
    tag: "INV-Z13 ④-1",
    holds: "INV-Z13 ④-1 — INV-Z11 이 보여 주는 참여자 행의 주인은 프로필도 보인다",
    ...z13Without("relation"),
  },
  "z13-drop-sender-branch": {
    tag: "INV-Z13 ④-2",
    holds: "INV-Z13 ④-2 — 강퇴된 사람의 옛 메시지에서 이름이 빈칸이 되지 않는다",
    ...z13Without("sender"),
  },
  // ── 0012 가 만든 강제 장치 (INV-P8 실시간) ────────────────────────────
  "p8-topic-shape-loose": {
    holds: "INV-P8 (실시간) — 주제 이름이 uuid 모양일 때만 통과한다",
    // 0012 이전의 조건 그대로. 길이 36 과 글자 종류만 봐서 대시 36개도 통과하고,
    // 그 뒤의 ::uuid 형변환이 정책 평가 중에 죽는다.
    sql: `
      drop policy if exists chat_broadcast_read on realtime.messages;
      create policy chat_broadcast_read on realtime.messages for select to authenticated
      using (
        realtime.topic() ~ '^chat:[0-9a-fA-F-]{36}$'
        and private.is_chat_member(
              substring(realtime.topic() from 6)::uuid,
              (select auth.uid())
            )
      );`,
    // 0012 가 복구 목록에 있으므로 정책이 다시 걸린다.
  },
  "p8-topic-no-shape-check": {
    tag: "INV-P8",
    holds: "INV-P8 (실시간) — 모양이 아닌 주제는 오류가 아니라 null 이다",
    // 0013 이 만든 안전장치를 뺀다. 모양을 안 보고 바로 형변환하면 대시 36개짜리 주제에서
    // 예외가 나고, 그 예외가 정책 평가 중에 난다 — 구독이 오류로 끝나고 아무나 그것을 낼 수 있다.
    sql: `
      create or replace function private.chat_topic_uuid(p_topic text)
      returns uuid language sql immutable set search_path = '' as $fn$
        select substring(p_topic from 6)::uuid;
      $fn$;`,
    // 0013 이 복구 목록에 있으므로 함수가 다시 만들어진다.
  },
  "p8-topic-case-sensitive": {
    tag: "INV-P8",
    holds: "INV-P8 (실시간) — 표기가 갈려도 같은 대화를 가리킨다",
    // `~*` 를 `~` 로 되돌린다. 대문자로 주제를 만든 클라이언트가 구독을 못 하게 되는데,
    // 이 변이를 쓰기 전에는 그 상태가 초록불이었다 — 검사가 연산자를 자기 손으로 넣었다.
    sql: `
      create or replace function private.chat_topic_uuid(p_topic text)
      returns uuid language sql immutable set search_path = '' as $fn$
        select case
                 when p_topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then substring(p_topic from 6)::uuid
               end;
      $fn$;`,
  },
  "z8-participants-columns": {
    holds: "INV-Z8 (S7) — 호스트가 자기 참여 행의 user_id 를 남으로 바꿀 수 없다",
    sql: `grant update on public.participants to authenticated;`,
  },
  "z8-chatpart-columns": {
    holds: "INV-Z8 (S8) — 멤버가 chat_id 를 남의 방으로 바꿀 수 없다",
    // **열 권한만 열어서는 이 구멍이 안 열린다.** 열 권한을 통째로 준 뒤 실제로 눌러 보면
    // 여전히 42501 이 나오는데, 막고 있는 것은 갱신된 **새 행**에 다시 걸리는 읽기 정책
    // `chatpart_read_member` 다(is_chat_member 가 남의 방에 대해 거짓). 실측으로 확인했다.
    // 그래서 강제 위치가 둘이고, 하나만 걷어 낸 변이는 "아무도 안 붙들고 있다"가 아니라
    // "아무것도 무력화하지 못했다" 였다 — 그 둘은 결과가 같아 보여서 위험하다.
    sql: `
      grant update on public.chat_participants to authenticated;
      drop policy if exists chatpart_read_member on public.chat_participants;
      create policy chatpart_read_member on public.chat_participants for select using (true);`,
    // 읽기 정책은 0001 에만 있어 기본 복구 목록으로는 안 돌아온다.
    undo: `
      drop policy if exists chatpart_read_member on public.chat_participants;
      create policy chatpart_read_member on public.chat_participants for select
        using (private.is_chat_member(chat_id, (select auth.uid())));`,
  },
  "z8-posts-columns": {
    holds: "INV-Z9 — 이미 쓴 모집글을 남의 스터디로 옮길 수 없다",
    sql: `grant update on public.posts to authenticated;`,
  },
  "p8-no-leave": {
    holds: "INV-P8 — 강퇴·탈퇴하면 채팅 구성원에서 빠진다",
    sql: `
      create or replace function public.sync_study_chat() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_chat_id uuid;
      begin
        select id into v_chat_id from public.chats where study_id = new.study_id;
        if v_chat_id is null then return new; end if;
        if new.status = 'accepted' then
          insert into public.chat_participants (chat_id, user_id)
            values (v_chat_id, new.user_id) on conflict do nothing;
        end if;
        return new;
      end; $fn$;`,
  },
  "p8-join-when-pending": {
    holds: "INV-P8 — 대기 중인 신청자는 채팅방에 안 들어간다",
    sql: `
      create or replace function public.sync_study_chat() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_chat_id uuid;
      begin
        select id into v_chat_id from public.chats where study_id = new.study_id;
        if v_chat_id is null then return new; end if;
        insert into public.chat_participants (chat_id, user_id)
          values (v_chat_id, new.user_id) on conflict do nothing;
        return new;
      end; $fn$;`,
  },
  "p9-invoker-count": {
    holds: "INV-P9 — 파생값은 누가 묻든 같은 답을 준다",
    sql: `
      create or replace function private.study_accepted_count(p_study_id uuid) returns integer
      language sql stable set search_path = '' as $fn$
        select count(*)::integer from public.participants
         where study_id = p_study_id and status = 'accepted';
      $fn$;
      create or replace function private.study_is_recruiting(p_study_id uuid) returns boolean
      language sql stable set search_path = '' as $fn$
        select s.closed_at is null and s.deleted_at is null
           and private.study_accepted_count(s.id) < s.max_participants
          from public.studies s where s.id = p_study_id;
      $fn$;`,
  },
  "p9-drop-status-filter": {
    holds: "INV-P9 — 세는 것은 '수락된' 참여자다 (대기 중인 사람이 아니라)",
    sql: `
      create or replace function private.study_accepted_count(p_study_id uuid) returns integer
      language sql stable security definer set search_path = '' as $fn$
        select count(*)::integer from public.participants where study_id = p_study_id;
      $fn$;`,
  },
  "z2-self-accept": {
    holds: "INV-Z2 — 대기 중인 신청자가 자기 신청을 스스로 수락할 수 없다",
    // 자기 행이라 using 은 지나간다. 막는 것은 with check 의 status 조건 하나뿐이라,
    // 그것만 빼면 신청자가 호스트 승인 없이 멤버가 되고 트리거가 채팅방까지 넣어 준다.
    sql: `
      drop policy if exists participants_update_self on public.participants;
      create policy participants_update_self on public.participants for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()));`,
    // 이 정책은 0001 에만 있다 — 기본 복구 목록(0002·0004)이 안 되돌린다.
    undo: `
      drop policy if exists participants_update_self on public.participants;
      create policy participants_update_self on public.participants for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()) and status = 'withdrawn');`,
  },
  "p9-invoker-computed": {
    holds: "INV-P9 — 화면이 실제로 읽는 계산 컬럼도 누가 묻든 같은 답을 준다",
    // 화면은 rpc 쌍이 아니라 계산 컬럼 쌍을 쓴다. 여기서 definer 를 빼면 로그인하지 않은
    // 연결이 참여자 행을 못 읽어 인원이 0 으로 답하고, 마감된 스터디가 모집중으로 보인다.
    sql: `
      create or replace function public.accepted_count(public.studies) returns integer
      language sql stable set search_path = '' as $fn$
        select count(*)::integer from public.participants
         where study_id = $1.id and status = 'accepted';
      $fn$;`,
  },
  "p6-computed-drops-deleted": {
    holds: "INV-P6 — 지워진 스터디는 계산 컬럼도 모집 중이 아니라고 답한다",
    sql: `
      create or replace function public.recruiting(public.studies) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select $1.closed_at is null
           and public.accepted_count($1) < $1.max_participants;
      $fn$;`,
  },
  "z2-drop-self-update": {
    holds: "INV-Z2 — 본인의 탈퇴는 본인이 할 수 있다 (반대 절반)",
    // 정책이 통째로 사라지면 using 이 걸러 0행이 갱신되고 PostgREST 는 오류를 안 낸다.
    // 그래서 「error 가 null 이다」만 보는 단언은 이것을 못 잡는다 — 결과를 다시 읽어야 한다.
    sql: `drop policy if exists participants_update_self on public.participants;`,
    undo: `
      drop policy if exists participants_update_self on public.participants;
      create policy participants_update_self on public.participants for update
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()) and status = 'withdrawn');`,
  },
  "p9-computed-drops-status-filter": {
    holds: "INV-P9 — 화면이 읽는 계산 컬럼도 '수락된' 사람만 센다",
    sql: `
      create or replace function public.accepted_count(public.studies) returns integer
      language sql stable security definer set search_path = '' as $fn$
        select count(*)::integer from public.participants where study_id = $1.id;
      $fn$;`,
  },
  "p6-computed-drops-closed": {
    holds: "INV-P6 — 호스트가 닫으면 계산 컬럼도 모집 중이 아니다",
    // 화면의 「모집중」 배지와 목록의 「모집중만」 필터가 이 값 하나로 갈린다.
    sql: `
      create or replace function public.recruiting(public.studies) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select $1.deleted_at is null
           and public.accepted_count($1) < $1.max_participants;
      $fn$;`,
  },
  "filter-code-concatenated": {
    holds: "주소창에서 온 카테고리 코드가 질의를 깨지 않는다 (화면 목록 문서)",
    tag: "필터 코드",
    // **이 변이가 없으면 그 검사 둘이 아무것도 안 붙든다.** 오늘 카테고리·지역 코드는
    // `.in()`·`.eq()` 를 지나므로 supabase-js 가 값을 감싸서 넘기고, 그래서 무엇을 넣어도
    // 안 깨진다 — 검사 스스로 「지금의 방벽이 아니라 회귀를 붙든다」고 적어 놓았다.
    // 그 주장이 판정 결과가 되려면 되살릴 회귀가 실제로 있어야 한다.
    //
    // 여기서는 값을 필터 문자열로 **이어 붙이게** 바꾼다. 그러면 쉼표가 든 값
    // (`it,design`)이 논리 트리를 깨서 PGRST100 이 난다.
    file: {
      path: "src/entities/post/api/post-query.ts",
      find: `    q = q.in("study.category_id", [...query.categories]);`,
      replace: `    q = q.or(query.categories.map((c) => \`study.category_id.eq.\${c}\`).join(","));`,
    },
  },
  "deadline-order-inside-embed": {
    holds: "「마감 임박순」이 실제로 마감일 순서로 나온다 (화면 목록 문서)",
    tag: "마감 임박순",
    // **소스 파일을 바꾸는 변이다.** 이 결함은 데이터베이스가 아니라 조회 코드에 있었고,
    // 오류를 안 내고 그럴듯한 순서를 낸다. 손으로 한 번 확인했다는 것은 다음 사람에게
    // 안 남는다 — 그것이 이 도구를 만든 이유다.
    file: {
      path: "src/entities/post/api/post-order.ts",
      find: `{ column: "study_deadline_rank", options: { ascending: true } }`,
      replace: `{ column: "recruit_until", options: { referencedTable: "study", ascending: true } }`,
    },
  },
  "deadline-rank-dropped": {
    holds: "「마감 임박순」의 순위를 조회 코드가 실제로 건다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 정렬 키를 통째로 빼면 남는 것은 tiebreak(id) 뿐이다. 준비물의 id 를 손으로 줘서
    // 그때 반드시 틀린 순서가 나오게 해 뒀다(list-order.test.ts) — 안 그러면 uuid 운으로
    // 맞는 순서가 나와 「아무도 안 붙들고 있다」로 보고된다.
    //
    // **replace 는 깨끗한 소스에 없는 문장이어야 한다.** 처음엔 여기에 다른 정렬 키를
    // 적었는데 그것은 표에 원래 있는 줄이라, 복구가 손대지 않은 그 줄까지 바꿔 놓고
    // 「복구 완료」를 찍었다. 아래 복구·심기의 개수 검사가 그래서 생겼다.
    file: {
      path: "src/entities/post/api/post-order.ts",
      find: `  deadline: [{ column: "study_deadline_rank", options: { ascending: true } }],\n`,
      replace: `  deadline: [],\n`,
    },
  },
  "deadline-rank-constant": {
    holds: "「마감 임박순」의 순위를 데이터베이스가 실제로 계산한다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 앞의 둘은 조회 코드 쪽이다. 이것은 같은 규칙의 **데이터베이스 쪽** — 순위 함수가
    // 늘 0 을 답하면 정렬 키는 걸려 있는데 순서가 안 갈린다.
    sql: `
      create or replace function public.study_deadline_rank(public.posts) returns integer
      language sql stable set search_path = '' as $fn$ select 0; $fn$;`,
  },
  "deadline-rank-off-by-one": {
    holds: "「마감 임박순」에서 오늘 마감인 것은 아직 안 지났다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 경계 하나만 민다(`>=` → `>`). 오늘이 마감일인 스터디가 「지났다」 덩어리로 넘어간다.
    // 준비물에 오늘 날짜가 없으면 이 변이는 어떤 검사도 못 깨뜨린다.
    sql: `
      create or replace function public.study_deadline_rank(public.posts) returns integer
      language sql stable set search_path = '' as $fn$
        select case
                 when u.d is null         then 2000000
                 when u.d > current_date  then least(u.d - current_date, 999999)
                 else                          2000001 + least(current_date - u.d, 999998)
               end
        from (select public.study_recruit_until($1) as d) u;
      $fn$;`,
  },
  "sort-whitelist-dropped": {
    holds: "주소창의 아무 값이 정렬 키가 되지 않는다",
    tag: "정렬 화이트리스트",
    // 화이트리스트를 단언으로 바꾼다. 임의 컬럼이 `.order()` 로 가지지는 않는다 —
    // 정렬 표의 **키**로만 쓰이기 때문이다. 그리고 `post-query.ts` 의 되돌림이 붙은 뒤로는
    // 500 도 안 난다(그 되돌림은 `sort-fallback-dropped` 가 따로 붙든다). 그러니 이 변이가
    // 실제로 깨뜨리는 것은 「주소창의 값이 어휘 안으로 좁혀진다」는 약속 하나다.
    file: {
      path: "src/entities/post/api/post-order.ts",
      find: `  return SORTS.includes(value as Sort) ? (value as Sort) : "latest";`,
      replace: `  return value as Sort;`,
    },
  },
  "p6-rpc-drops-deleted": {
    holds: "INV-P6 — 지워진 스터디는 함수 쌍에서도 모집 중이 아니다",
    // 같은 공식이 데이터베이스에 두 벌 있다(함수 쌍 · 계산 컬럼 쌍). 계산 컬럼 쪽만
    // 붙들려 있어서, RPC 쪽의 `deleted_at is null` 을 지워도 전부 초록불이었다.
    sql: `
      create or replace function private.study_is_recruiting(p_study_id uuid) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select s.closed_at is null
           and private.study_accepted_count(s.id) < s.max_participants
          from public.studies s where s.id = p_study_id;
      $fn$;`,
  },
  "sort-fallback-dropped": {
    holds: "정렬 화이트리스트가 뚫려도 질의는 최신순으로 떨어진다",
    tag: "정렬 화이트리스트",
    // 화이트리스트 뒤의 두 번째 방벽. 이 되돌림이 없으면 어휘 밖의 값이 undefined 를
    // 순회하다 목록 화면 전체가 500 이 된다 — 로그인 없이 누구나 낼 수 있는 500 이다.
    file: {
      path: "src/entities/post/api/post-query.ts",
      find: `  for (const key of SORT_ORDER[query.sort ?? "latest"] ?? SORT_ORDER.latest) {`,
      replace: `  for (const key of SORT_ORDER[query.sort ?? "latest"]) {`,
    },
  },
  "deadline-rank-off-by-one-lenient": {
    holds: "「마감 임박순」에서 어제 마감은 이미 지났다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 경계를 반대 방향으로 민다. `deadline-rank-off-by-one` 은 오늘을 뒤로 보내고,
    // 이것은 어제를 앞으로 끌어온다 — 「오늘 자정까지는 봐 준다」로 읽은 코드의 모양이다.
    // 미는 방향이 하나뿐이면 26/26 이라는 숫자가 이 구멍을 못 본다.
    sql: `
      create or replace function public.study_deadline_rank(public.posts) returns integer
      language sql stable set search_path = '' as $fn$
        select case
                 when u.d is null                then 2000000
                 when u.d = 'infinity'::date     then 999999
                 when u.d = '-infinity'::date    then 2999999
                 when u.d >= current_date - 1    then least(u.d - current_date, 999999)
                 else                                 2000001 + least(current_date - u.d, 999998)
               end
        from (select public.study_recruit_until($1) as d) u;
      $fn$;`,
  },
  "deadline-rank-uncapped": {
    holds: "「마감 임박순」의 띠가 겹치지 않는다 (화면 목록 문서)",
    tag: "마감 임박순",
    // 상한을 자르는 least 를 뺀다. 아주 먼 미래의 마감일이 「지난 마감일」 띠의 숫자
    // 범위로 넘어가, 아직 오지도 않은 마감일이 목록의 꼬리에 붙는다.
    // 주석이 "least 가 겹치지 않는 것을 보장한다"고 선언한 장치라 검사 밖에 두지 않는다.
    sql: `
      create or replace function public.study_deadline_rank(public.posts) returns integer
      language sql stable set search_path = '' as $fn$
        select case
                 when u.d is null                then 2000000
                 when u.d = 'infinity'::date     then 999999
                 when u.d = '-infinity'::date    then 2999999
                 when u.d >= current_date        then (u.d - current_date)
                 else                                 2000001 + (current_date - u.d)
               end
        from (select public.study_recruit_until($1) as d) u;
      $fn$;`,
  },
  "recruit-until-allows-infinity": {
    holds: "무한한 마감일은 데이터베이스가 거부한다",
    tag: "달력에 있는 날짜",
    // 제약을 뗀다. 무한값이 들어오면 순위 함수의 뺄셈이 죽어 목록이 통째로 500 이 되는데,
    // 0009 의 안전 실패 가지가 그 뒤를 받친다 — 그래서 이 변이가 깨뜨리는 것은
    // 「거부한다」는 약속이지 목록의 생존이 아니다.
    sql: `alter table public.studies drop constraint if exists studies_recruit_until_finite;`,
    undo: `
      alter table public.studies drop constraint if exists studies_recruit_until_finite;
      alter table public.studies add constraint studies_recruit_until_finite
        check (recruit_until is null
               or (recruit_until > '-infinity'::date and recruit_until < 'infinity'::date));`,
  },
  "p6-computed-adds-deadline": {
    holds: "INV-P6 — 마감일이 지나도 계산 컬럼은 모집 중이라고 답한다",
    // **넣는 변이다.** 보통 변이는 강제 장치를 빼는데, 이 조항이 금지하는 것은
    // 「마감일을 모집 상태에 넣는 것」이라 빼는 방향으로는 어길 수 없다.
    sql: `
      create or replace function public.recruiting(public.studies) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select $1.closed_at is null
           and $1.deleted_at is null
           and ($1.recruit_until is null or $1.recruit_until >= current_date)
           and public.accepted_count($1) < $1.max_participants;
      $fn$;`,
  },
  "p6-rpc-adds-deadline": {
    holds: "INV-P6 — 마감일이 지나도 study_is_recruiting 은 참으로 답한다",
    // 같은 조항의 다른 한 벌. 두 벌이 따로 있으니 변이도 따로 있어야 한다.
    sql: `
      create or replace function private.study_is_recruiting(p_study_id uuid) returns boolean
      language sql stable security definer set search_path = '' as $fn$
        select s.closed_at is null
           and s.deleted_at is null
           and (s.recruit_until is null or s.recruit_until >= current_date)
           and private.study_accepted_count(s.id) < s.max_participants
          from public.studies s where s.id = p_study_id;
      $fn$;`,
  },
  "p4-deadline-blocks-accept": {
    holds: "INV-P4 — 마감일이 지난 스터디도 신청과 수락이 그대로 지나간다",
    // 파생값이 아니라 **쓰기 경로**에 마감일을 넣는다. 파생값 쪽만 붙들면 이 모양이
    // 빠져나가고, 그때 사용자는 「모집중」을 보고 신청했다가 거부당한다.
    sql: `
      create or replace function public.enforce_study_capacity() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare
        v_max smallint; v_accepted integer; v_closed timestamptz;
        v_deleted timestamptz; v_until date;
      begin
        if new.status <> 'accepted' then return new; end if;
        select max_participants, closed_at, deleted_at, recruit_until
          into v_max, v_closed, v_deleted, v_until
          from public.studies where id = new.study_id for update;
        if not found then
          raise exception '스터디를 찾을 수 없어 수락할 수 없습니다 (INV-P4)' using errcode = 'check_violation';
        end if;
        if v_deleted is not null then
          raise exception '지워진 스터디에는 참여자를 수락할 수 없습니다 (INV-Z10)' using errcode = 'check_violation';
        end if;
        if v_closed is not null then
          raise exception '모집이 마감된 스터디에는 참여자를 수락할 수 없습니다 (INV-P4)' using errcode = 'check_violation';
        end if;
        if v_until is not null and v_until < current_date then
          raise exception '모집 마감일이 지났습니다 (INV-P4)' using errcode = 'check_violation';
        end if;
        select count(*) into v_accepted
          from public.participants where study_id = new.study_id and status = 'accepted';
        if v_accepted > v_max then
          raise exception '정원을 넘겨 수락할 수 없습니다: 정원 %, 수락 % (INV-P1)', v_max, v_accepted
            using errcode = 'check_violation';
        end if;
        return new;
      end;
      $fn$;`,
  },
  "local-guard-by-prefix": {
    holds: "통합 스위트는 로컬에만 붙는다",
    tag: "로컬",
    // 판정을 파싱에서 문자열 패턴으로 되돌린다. `http://localhost:54321@evil.com` 이
    // 통과하게 되는데, 그 요청에는 secret 키가 실린다.
    // 이 파일은 줄끝이 CRLF 다. 여러 줄을 find 로 잡으면 개행이 안 맞아 못 찾으므로
    // **한 줄만** 잡는다(그 한 줄이 파일에서 유일하다).
    file: {
      path: "tests/integration/helpers.ts",
      find: `    if (u.username || u.password) return url.startsWith("postgresql://") && LOCAL_HOSTS.has(u.hostname);`,
      replace: `    if (u.username || u.password) return /(127\\.0\\.0\\.1|localhost)/.test(url);`,
    },
  },
  "z9-any-study": {
    holds: "INV-Z9 (S10) — 호스트가 아닌 사람은 남의 스터디에 모집글을 못 붙인다",
    sql: `
      drop policy if exists posts_insert_author on public.posts;
      create policy posts_insert_author on public.posts for insert
        with check (author_id = (select auth.uid()));`,
  },
  "z10-accept-deleted": {
    holds: "INV-Z10 (S11) — 지워진 스터디의 신청은 수락되지 않는다",
    sql: `
      create or replace function public.enforce_study_capacity() returns trigger
      language plpgsql security definer set search_path = '' as $fn$
      declare v_max smallint; v_accepted integer; v_closed timestamptz;
      begin
        if new.status <> 'accepted' then return new; end if;
        select max_participants, closed_at into v_max, v_closed
          from public.studies where id = new.study_id for update;
        if v_closed is not null then
          raise exception '마감' using errcode = 'check_violation';
        end if;
        select count(*) into v_accepted from public.participants
         where study_id = new.study_id and status = 'accepted';
        if v_accepted > v_max then
          raise exception '정원 초과' using errcode = 'check_violation';
        end if;
        return new;
      end; $fn$;`,
  },
  "z10-posts-read-open": {
    holds: "INV-Z10 — 지워진 스터디의 모집글은 목록에 안 나온다",
    sql: `
      drop policy if exists posts_read on public.posts;
      create policy posts_read on public.posts for select using (true);`,
  },
  "z10-apply-deleted": {
    holds: "INV-Z10 — 지워진 스터디에는 새 신청이 안 들어간다",
    sql: `
      drop policy if exists participants_apply_self on public.participants;
      create policy participants_apply_self on public.participants for insert
        with check (user_id = (select auth.uid()) and status = 'pending');`,
  },
  "z14-post-insert-not-recruiting": {
    holds: "INV-Z14 — 모집 중이 아닌 스터디에는 새 모집글이 안 들어간다",
    sql: `
      drop policy if exists posts_insert_author on public.posts;
      create policy posts_insert_author on public.posts for insert
        with check (
          author_id = (select auth.uid())
          and private.is_study_host(study_id, (select auth.uid()))
        );`,
  },
  "e3-write-path-any": {
    // 이름표를 손으로 적는다 — 아바타 정책의 조건 슬롯이 여섯이라 기본 이름표(INV-E3)로는
    // 어느 갈래가 깨졌는지 판정이 못 가른다
    tag: "INV-E3(경로",
    holds: "INV-E3(경로) — 아바타는 자기 아이디 폴더 아래에만 올라간다",
    sql: `
      drop policy if exists avatars_write_self on storage.objects;
      create policy avatars_write_self on storage.objects for insert
        with check (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);`,
  },
  "e4-bucket-any-mime": {
    tag: "INV-E4(형식",
    holds: "INV-E4(형식) — 아바타 버킷은 이미지라고 신고된 것만 받는다",
    sql: `update storage.buckets set allowed_mime_types = null where id = 'avatars';`,
  },
  "e4-bucket-any-size": {
    tag: "INV-E4(크기",
    holds: "INV-E4(크기) — 아바타 버킷은 정해진 크기까지만 받는다",
    sql: `update storage.buckets set file_size_limit = null where id = 'avatars';`,
  },
  "e5-drop-region-fkey": {
    holds: "INV-E5 — 프로필의 지역은 고정 목록의 값이거나 비어 있다",
    sql: `alter table public.profiles drop constraint if exists profiles_region_fkey;`,
  },
  "e3-read-list-open": {
    holds: "INV-E7 — 아바타 목록은 자기 것만 보인다(폴더 이름이 곧 회원 id 명부다)",
    sql: `
      drop policy if exists avatars_read on storage.objects;
      create policy avatars_read on storage.objects for select
        using (bucket_id = 'avatars');`,
  },
  "z11-members-hidden": {
    holds: "INV-Z11 (S12) — 수락된 멤버는 같은 스터디의 수락된 사람들을 본다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select
        using (user_id = (select auth.uid())
               or private.is_study_host(study_id, (select auth.uid())));`,
  },
  "z11-members-wide-open": {
    holds: "INV-Z11 (S13) — 관계 없는 사람에게는 하나도 안 보인다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select using (true);`,
  },
  "z11-pending-leaks": {
    holds: "INV-Z11 — 대기·거절 행은 멤버에게 새지 않는다",
    sql: `
      drop policy if exists participants_read on public.participants;
      create policy participants_read on public.participants for select
        using (user_id = (select auth.uid())
               or private.is_study_host(study_id, (select auth.uid()))
               or private.is_study_member(study_id, (select auth.uid())));`,
  },
};

/**
 * 변이가 가리키는 불변식 ID — `holds` 에 적힌 첫 `INV-XX` 를 그대로 쓴다.
 *
 * 따로 한 번 더 적지 않는 이유는 둘이 갈라지기 때문이다. 이 ID 는 장식이 아니라 판정의
 * 절반이다 — mutation-run.mjs 는 "빨간불이 났는가"만 보지 않고 "**그 INV 를 이름에 담은\n* 테스트가** 빨간불이 났는가"를 본다. 그래서 ID 가 없는 변이는 판정할 근거가 없고,
 * 목록을 내주기 전에 여기서 멈춘다.
 */
const INV_ID = /INV-[A-Z]\d+/;

/**
 * 판정에 쓸 이름표. 기본은 holds 에 적힌 첫 INV ID 이고, tag 를 적으면 그것이 이긴다.
 *
 * tag 가 필요한 이유: 붙들어야 할 규칙이 전부 스펙 불변식인 것은 아니다. 「마감 임박순」은
 * 화면 목록 문서가 정한 규칙이라 INV ID 가 없는데, ID 를 요구하면 **판정 대상이 될 수 없어서
 * 검사 밖에 남는다** — 그러면 이 도구는 스펙이 있는 것만 지키고 나머지는 조용히 놓친다.
 */
const invOf = (m) => m.tag ?? INV_ID.exec(m.holds)?.[0];

const nameless = Object.entries(MUTATIONS)
  .filter(([, m]) => !invOf(m))
  .map(([name]) => name);
if (nameless.length > 0) {
  console.error(
    `이름표가 없는 변이: ${nameless.join(", ")}\n` +
      "  판정이 '실패한 테스트 이름이 그 이름표를 담는가' 이므로, 이름표가 없으면 판정할 수 없다.\n" +
      "  holds 에 INV ID 를 적거나 tag 를 붙인다.",
  );
  process.exit(1);
}

/**
 * 강제 장치의 지문 — 정책 · 함수 본문 · 권한 · 트리거 · 제약 · 행 수준 접근 켜짐 여부를
 * 한 덩어리 문자열로 뽑는다.
 *
 * 왜 필요한가: `--restore` 는 마이그레이션을 다시 적용할 뿐이고, **다시 적용했다는 것과
 * 원래대로 돌아왔다는 것은 다르다.** 변이가 건드린 것을 어느 마이그레이션도 다시 정의하지
 * 않으면 복구는 아무 오류 없이 실패하고, 그 뒤에 도는 변이들은 전부 망가진 데이터베이스
 * 위에서 판정된다. 지문을 변이 전후로 비교하면 그 조용한 실패가 소리를 낸다.
 */
const FINGERPRINT_SQL = `
select
  coalesce((select string_agg(format('policy %s.%s %s [%s] using(%s) check(%s)',
             schemaname, tablename, policyname, cmd, coalesce(qual, '-'), coalesce(with_check, '-')),
           E'\n' order by schemaname, tablename, policyname)
      from pg_policies where schemaname in ('public', 'storage', 'realtime')), '')
  || E'\n' ||
  coalesce((select string_agg(format('func %s.%s(%s) definer=%s acl=%s src=%s',
             n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
             p.prosecdef, coalesce(p.proacl::text, '-'), md5(p.prosrc)),
           E'\n' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')), '')
  || E'\n' ||
  coalesce((select string_agg(format('grant %s.%s %s %s %s',
             table_schema, table_name, grantee, privilege_type, col),
           E'\n' order by table_schema, table_name, grantee, privilege_type, col)
      from (
        select table_schema::text, table_name::text, grantee::text, privilege_type::text, '*'::text as col
          from information_schema.role_table_grants
         where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated')
        union all
        select table_schema::text, table_name::text, grantee::text, privilege_type::text, column_name::text
          from information_schema.column_privileges
         where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated')
      ) g), '')
  || E'\n' ||
  coalesce((select string_agg(format('trigger %s.%s %s', c.relname, t.tgname, md5(pg_get_triggerdef(t.oid))),
           E'\n' order by c.relname, t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'auth') and not t.tgisinternal), '')
  || E'\n' ||
  coalesce((select string_agg(format('constraint %s.%s %s', c.relname, con.conname, pg_get_constraintdef(con.oid)),
           E'\n' order by c.relname, con.conname)
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'), '')
  || E'\n' ||
  coalesce((select string_agg(format('rls %s %s', c.relname, c.relrowsecurity), E'\n' order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'), '')
  || E'\n' ||
  -- **버킷 설정도 강제 장치다.** 아바타의 허용 형식·크기 상한은 정책이 아니라 버킷 행에
  -- 있어서(INV-E4), 여기 안 넣으면 그것을 지운 변이가 「강제 장치를 하나도 안 바꿨다」로
  -- 판정된다 — 실제로는 방벽 하나가 통째로 사라진 상태인데 판정 불가로 조용히 넘어간다
  -- (2026-09-06 실측).
  coalesce((select string_agg(format('bucket %s public=%s size=%s mime=%s',
             id, public, coalesce(file_size_limit::text, '-'),
             coalesce(array_to_string(allowed_mime_types, ','), '-')),
           E'\n' order by id)
      from storage.buckets), '')
  || E'\n' ||
  -- 강제 장치는 아니지만 **다음 판정을 바꾸는 것**이라 같이 본다. 뒷정리가 실패해 사용자가
  -- 남으면 다음 변이가 그 위에서 돌고, 그 오염은 정책 지문에는 안 잡힌다.
  (select format('users %s', count(*)) from auth.users)
  as fingerprint
`;

/**
 * 소스 파일을 바꾸는 변이의 **파일 지문**. 데이터베이스 지문과 같은 자리에 붙는다.
 *
 * 없으면 파일 변이에는 ④(복구 확인)가 통째로 비어 있게 된다 — 데이터베이스는 안 건드리므로
 * SQL 지문이 되돌아왔든 아니든 항상 같고, 그래서 판정 쪽이 「복구됐다」로 읽는다.
 */
function fileFingerprint() {
  const lines = [];
  for (const [name, m] of Object.entries(MUTATIONS)) {
    if (!m.file) continue;
    const target = join(HERE, "..", m.file.path);
    const cur = readFileSync(target, "utf-8");
    lines.push(
      `file ${name} ${m.file.path} ${createHash("sha256").update(cur).digest("hex").slice(0, 16)}`,
    );
  }
  return lines.sort().join("\n");
}

async function query(sql, params) {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

/**
 * **본문을 통째로 다시 적는 변이가 낡는 것을 막는다.**
 *
 * 판정 함수의 본문 전체를 심는 변이는, 원본이 나중에 조건을 하나 더 얻으면 「낡은 본문 +
 * 의도한 한 줄」을 심는다. 그때 빨간불이 변이 때문인지 되돌아간 본문 때문인지 안 갈린다 —
 * 변이는 하나를 무력화한다고 적혀 있는데 실제로는 둘을 무력화한 상태가 된다.
 *
 * 그래서 심기 전에 원본 본문의 해시를 대조하고, 다르면 **심지 않고 멈춘다.**
 * 고칠 곳은 원본이 아니라 변이의 sql 과 이 해시다.
 */
async function assertBodyFresh(name, guard) {
  const r = await query(
    "select md5(p.prosrc) as md5 from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
      " where n.nspname = $1 and p.proname = $2",
    [guard.schema, guard.fn],
  );
  if (r.rowCount !== 1) {
    console.error(
      `변이 ${name} 의 대조 대상 ${guard.schema}.${guard.fn} 을 못 찾았다(${r.rowCount}건).` +
        "\n  이름이 바뀌었거나 데이터베이스가 복구 전 상태다.",
    );
    process.exit(1);
  }
  if (r.rows[0].md5 !== guard.md5) {
    console.error(
      `변이 ${name} 이 낡았다 — ${guard.schema}.${guard.fn} 의 본문이 바뀌었다.` +
        `\n  등록된 해시: ${guard.md5}\n  지금 해시:   ${r.rows[0].md5}` +
        "\n  이 변이는 본문을 통째로 다시 적는다. 지금 심으면 의도한 한 줄 말고" +
        " **바뀐 부분까지 되돌린 상태**가 되고, 빨간불의 원인이 갈리지 않는다." +
        "\n  고칠 곳은 원본이 아니라 이 변이의 sql 과 guard.md5 다.",
    );
    process.exit(1);
  }
}

/**
 * 기본 복구 — 정책·권한·함수를 다시 정의하는 마이그레이션을 순서대로 다시 적용한다.
 *
 * 전부 다 돌리지 않는 이유: **0001 은 재적용 안전하지 않다.** 0002 가 `studies.region` 을
 * `region_code` 로 바꿨기 때문에 0001 의 `create index ... (region)` 이 없는 컬럼을 가리켜
 * 죽는다. 그래서 여기 목록은 손으로 고른 것이고, 손으로 고른 목록은 낡는다 —
 * 그것을 믿지 않기 위해 mutation-run.mjs 가 변이 전후의 지문을 대조한다.
 */
const RESTORE_MIGRATIONS = [
  "0002_review_fixes.sql",
  "0004_member_visibility.sql",
  "0007_deadline_sort.sql",
  "0008_deadline_rank.sql",
  // 0009 는 0008 의 순위 함수를 **덮어쓴다**(무한 날짜 가지가 붙는다). 순서대로 적용되므로
  // 이 줄이 0008 뒤에 있어야 복구가 최신 본체로 끝난다.
  "0009_recruit_until_finite.sql",
  // **0010 은 반드시 맨 뒤다.** 위의 0002·0004 는 판정 함수를 `public` 에 다시 만들고
  // 정책을 그쪽으로 다시 걸어 놓는다 — 0010 이 뒤따라 돌아야 그 함수들이 다시 지워지고
  // 정책이 `private` 을 가리킨다. 순서를 바꾸면 복구가 끝난 자리에 S4 의 구멍이 도로 열린다.
  "0010_signup_profile_and_private_helpers.sql",
  // 0011 은 0010 뒤여야 한다 — 판정 함수가 private.study_is_visible 등을 부르므로
  // 그 함수들이 이미 있어야 만들어진다. 그리고 profiles_read 를 다시 거는 것도 여기다.
  "0011_profile_visibility.sql",
  // 0012 는 0010 뒤여야 한다 — 0010 이 chat_broadcast_read 를 느슨한 조건으로 다시 걸고,
  // 0012 가 뒤따라 돌아야 그 조건이 uuid 모양으로 좁혀진다.
  "0012_topic_shape.sql",
  // 0013 은 0012 뒤여야 한다 — 0012 가 정규식을 정책 안에 직접 쓰고, 0013 이 그것을
  // private.chat_topic_uuid 로 옮겨 담는다. 순서를 바꾸면 복구가 끝난 자리에 「모양 검사와
  // 형변환이 and 로 묶인」 옛 조건이 남는다. 인덱스 셋도 여기서 다시 만들어진다.
  "0013_profile_lookup_index_and_topic_order.sql",
  // 0014 는 0010 뒤여야 한다 — 0010 이 posts_insert_author 를 「작성자 + 호스트」 두 조건으로
  // 다시 걸고, 0014 가 뒤따라 돌아야 거기에 「모집 중인 스터디」가 더해진다(INV-Z14).
  // 빠뜨리면 복구가 끝난 자리에 2026-09-06 에 닫은 구멍이 도로 열린 채로 남는다.
  "0014_post_insert_requires_recruiting_study.sql",
  // 0015 는 0001 이 만든 아바타 정책 넷을 다시 쓰고(경로 판정 · 목록 제한), 버킷 제한과
  // 지역 외래 키를 건다. 목록에 없으면 이 파일이 건드리는 것을 무력화한 변이가 복구되지
  // 않아 지문이 어긋나고, 그 뒤의 변이가 전부 오염된 데이터베이스에서 판정된다.
  // 전부 `drop … if exists` + 조건 있는 update 라 다시 돌려도 결과가 같다.
  "0015_profile_editing.sql",
];

/**
 * 복구. `undo` 를 가진 변이는 그것까지 실행한다 — 0001 에만 있는 정책처럼 위 목록으로는
 * 되돌아오지 않는 것들이다. `undo` 가 틀려도 조용히 넘어가지 않는다(지문 대조가 잡는다).
 */
/**
 * 복구를 시작하기 전에 심는 껍데기 함수 **하나**.
 *
 * **왜 필요한가**: 복구는 옛 마이그레이션을 다시 트는데, 0002·0004 의 정책 정의가
 * `public.is_study_host` 를 이름으로 가리킨다. 그 함수를 만드는 것은 0001 뿐이고 0001 은
 * 재적용이 안전하지 않다(컬럼 이름이 바뀌었다). 0010 이 그 함수를 지웠으므로 복구 두 번째
 * 줄에서 "함수가 없다"로 죽는다 — 실제로 죽었다.
 *
 * **하나뿐인 이유**: 나머지 여섯은 복구 목록 안에서 진짜 본문으로 다시 만들어진다
 * (`study_accepted_count`·`study_is_recruiting`·`study_is_visible`·`study_accepts_applications`
 * 는 0002 가, `is_study_member` 는 0004 가). `is_chat_member` 는 복구 목록의 어느 파일도
 * 부르지 않는다. 그래서 껍데기가 필요한 것은 `is_study_host` 하나다.
 *
 * **본문이 아니라 존재만 필요하다.** 정책 DDL 은 이름과 인자만 맞으면 만들어지고, 이
 * 함수는 목록 맨 뒤의 0010 이 다시 지운다. 진짜 판정을 베껴 적지 않는 이유는 정본이
 * 세 곳이 되면 언젠가 한 곳만 고쳐지기 때문이다.
 *
 * **중간에 죽으면 어떻게 되나**: 아래 `restore` 가 전부를 트랜잭션 하나로 묶으므로
 * 아무것도 안 남는다. 묶기 전에는 0002 가 지나간 뒤에 죽으면 판정 함수 다섯이 **진짜
 * 본문 그대로** public 에 남았다 — 껍데기가 연 것이 아니라 0002 가 연 것이라, 껍데기를
 * 아무리 안전하게 만들어도 그 상태는 못 막았다.
 *
 * (`create or replace` 는 반환 타입을 못 바꾸므로 타입은 원본과 같아야 한다.)
 */
const RESTORE_PRELUDE = `
create or replace function public.is_study_host(p_study_id uuid, p_user_id uuid) returns boolean
language sql immutable as $stub$ select false $stub$;
`;

/**
 * 복구가 끝난 자리를 **복구 자신이 확인한다.**
 *
 * 지문 대조로는 이것을 못 잡는다 — mutation-run 은 기준선 지문을 뜨기 전에 복구를 먼저
 * 돌리므로, 순서가 틀린 복구는 매번 같은(틀린) 상태를 만들고 그 상태가 기준선이 된다.
 * 그러면 이후 모든 복구가 「일치」로 나온다. 손으로 `--restore` 만 돌린 사람에게는
 * 대조할 원본조차 없다.
 *
 * 이 한 줄이 셋을 동시에 잡는다 — 0010 이 목록 맨 뒤가 아닌 경우 · 껍데기가 남은 경우 ·
 * 목록이 낡아 0010 이 빠진 경우.
 */
const RESTORE_ASSERT = `
select p.proname as what from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = any(array['is_study_host','is_chat_member','is_study_member',
                             'study_is_visible','study_accepts_applications',
                             'study_accepted_count','study_is_recruiting'])
union all
-- 같은 함정이 프로필 조회 정책에도 있다. 0011 이 목록에서 빠지거나 0010 앞으로 가면
-- **복구가 끝난 자리에 회원 명부가 도로 열린 채로 남는다**(INV-Z13). 이름이 아니라
-- 판정 함수를 부르는지로 본다 — 'true' 만 보면 다른 모양으로 넓힌 것을 놓친다.
select '프로필 조회 정책이 판정 함수를 안 부른다 (INV-Z13)' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read'
      and strpos(qual, 'profile_is_visible') > 0
 )
union all
-- 아바타 정책의 경로 판정(INV-E3). 0015 가 목록에서 빠지면 복구가 끝난 자리에
-- 「남의 폴더를 차지할 수 있는」 상태가 도로 남는다.
select '아바타 쓰기 정책이 경로를 안 본다 (INV-E3)' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'avatars_write_self'
      and strpos(with_check, 'foldername') > 0
 )
union all
-- 아바타 조회 정책의 목록 제한. 빠지면 회원 id 명부가 도로 열린다.
select '아바타 조회 정책이 목록을 안 막는다' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'storage' and policyname = 'avatars_read'
      and strpos(qual, 'owner_id') > 0
 )
union all
-- 버킷의 형식·크기 제한(INV-E4)과 지역 외래 키(INV-E5).
select '아바타 버킷에 형식·크기 제한이 없다 (INV-E4)' as what
 where not exists (
   select 1 from storage.buckets
    where id = 'avatars' and file_size_limit is not null and allowed_mime_types is not null
 )
union all
select '지역 외래 키가 없다 (INV-E5)' as what
 where not exists (
   select 1 from pg_constraint where conname = 'profiles_region_fkey'
 )
union all
-- 실시간 주제 정규식도 같은 함정이다. 0012 가 목록에서 빠지거나 0010 앞으로 가면
-- 복구가 끝난 자리에 느슨한 조건이 도로 남는다. strpos 로 보는 이유는 like 의
-- 밑줄이 아무 글자나 먹어서 이 패턴을 헐겁게 만들기 때문이다.
select '실시간 주제 정규식이 느슨한 채로 남아 있다 (0012)' as what
 where exists (
   select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'chat_broadcast_read'
      and strpos(qual, '[0-9a-fA-F-]{36}') > 0
 )
union all
-- 0013 이 목록에서 빠지거나 0012 앞으로 가면 복구가 끝난 자리에 「모양 검사와 형변환이
-- and 로 묶인」 옛 조건이 남는다. 그 상태는 평가 순서가 뒤집히는 날 정책 평가 중에 오류를 낸다.
select '실시간 주제 검사가 chat_topic_uuid 를 안 거친다 (0013)' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and policyname = 'chat_broadcast_read'
      and strpos(qual, 'chat_topic_uuid') > 0
 )
union all
-- 0014 가 목록에서 빠지거나 0010 앞으로 가면, 복구가 끝난 자리에 「모집 중이 아닌 스터디에도
-- 새 모집글이 들어가는」 상태가 도로 남는다(INV-Z14). 정책의 with check 에 그 판정이 있는지로 본다.
select '모집글 삽입 정책이 모집 중인지를 안 본다 (INV-Z14, 0014)' as what
 where not exists (
   select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_insert_author'
      and strpos(with_check, 'study_is_recruiting') > 0
 )
union all
-- 인덱스 셋도 0013 이 만든다. 없으면 비로그인 프로필 조회가 세 표를 통째로 훑는다
-- (실측: 1103 ms → 9 ms).
select '프로필 판정이 거는 조건에 인덱스가 없다 (0013): ' || i as what
  from unnest(array['posts_author_idx','chat_messages_sender_idx','studies_host_all_idx']) i
 where not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = i)
`;

async function restore(name) {
  const dir = join(HERE, "..", "supabase", "migrations");

  // **이름을 안 주면 등록된 undo 를 전부 돌린다.** 예전에는 하나도 안 돌면서 「복구 완료」를
  // 찍었다 — 손으로 심어 보고 파일 머리에 적힌 대로 되돌리면, 0001 에만 있는 정책을 건드리는
  // 변이(z2-self-accept · z8-chatpart-columns)가 심긴 채 남고 그 상태가 「복구됨」으로 보였다.
  // undo 는 전부 정책을 지웠다 다시 만드는 문장이라 몇 번 돌려도 같은 곳에 수렴한다.
  const undos = name
    ? [MUTATIONS[name]?.undo].filter(Boolean)
    : Object.values(MUTATIONS).map((m) => m.undo).filter(Boolean);
  // **데이터베이스 쪽 복구는 트랜잭션 하나다.** 어디서 죽든 껍데기도, 반쯤 걸린 정책도
  // 남지 않고 복구 전 상태로 되돌아간다. 복구 목록의 파일에는 트랜잭션 밖에서만 되는 문장
  // (`create index concurrently`·`vacuum`·`alter system`·`alter publication`)이 없다 —
  // 그런 문장이 들어오면 이 묶음이 바로 죽으므로 조용히 어긋나지는 않는다.
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(RESTORE_PRELUDE);
    for (const f of RESTORE_MIGRATIONS) await c.query(readFileSync(join(dir, f), "utf-8"));
    for (const u of undos) await c.query(u);

    const leftover = await c.query(RESTORE_ASSERT);
    if (leftover.rowCount > 0) {
      throw new Error(
        "복구가 끝났는데 열린 채로 남은 것이 있다: " +
          leftover.rows.map((r) => r.what).join(", ") +
          "\n  RESTORE_MIGRATIONS 의 순서를 본다 — 0002·0004 가 판정 함수를 public 에 다시" +
          " 만들므로 0010 이 그 뒤여야 하고, 0011(프로필 조회 정책)이 0010 뒤여야 한다.",
      );
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }

  // 소스 파일을 바꾸는 변이는 **이름과 무관하게 전부** 되돌린다. 이름을 준 호출이 파일을
  // 건드리지 않으면, 크래시 뒤 `--restore <이름>` 으로 되돌린 사람은 파일이 변이된 채로
  // 남은 것을 모른 채 「복구 완료」를 본다. 되돌리기는 멱등이라 전부 도는 것이 안전하다.
  // **두 바퀴로 돈다.** 한 바퀴에서 「자기 것 되돌리고 바로 자기 것 검사」를 하면, 목록에서
  // 뒤에 있는 변이가 아직 심긴 상태로 앞 변이의 개수가 세어진다. 같은 파일을 건드리는 변이가
  // 둘 이상이고 서로의 줄이 겹치면 멀쩡한 복구가 「복구 실패」로 죽는다.
  let files = 0;
  for (const m of Object.values(MUTATIONS)) {
    if (!m.file) continue;
    const target = join(HERE, "..", m.file.path);
    const cur = readFileSync(target, "utf-8");
    if (!cur.includes(m.file.replace)) continue;
    writeFileSync(target, cur.split(m.file.replace).join(m.file.find));
    files += 1;
  }

  // **읽어서 확인한다.** 조건부 no-op 는 「되돌릴 것이 없었다」와 「되돌릴 문장을 못 찾았다」를
  // 구분하지 못한다 — 포매터가 그 줄을 건드리기만 해도 조용히 후자가 된다.
  //
  // 개수까지 세는 이유: 되돌리기는 replace 를 **전부** find 로 바꾼다. 그래서 replace 가
  // 깨끗한 소스에 원래 있던 문장이면, 복구가 손대지 않은 줄까지 바꿔 놓고 「복구 완료」를
  // 찍는다. 2026-09-05 에 실제로 났다 — 정렬 키 둘 중 하나가 다른 하나로 덮여서, 기준선이
  // 빨간불인 채로 변이 판정이 시작될 뻔했다. 있음/없음만 보면 그 상태가 그대로 통과한다.
  for (const [n, m] of Object.entries(MUTATIONS)) {
    if (!m.file) continue;
    const cur = readFileSync(join(HERE, "..", m.file.path), "utf-8");
    const found = cur.split(m.file.find).length - 1;
    const left = cur.split(m.file.replace).length - 1;
    if (found === 1 && left === 0) continue;
    // 원인이 둘인데 처방이 다르다. 뭉뚱그리면 안내가 틀린 쪽을 가리킨다.
    console.error(
      found === 0 && left === 0
        ? `복구 실패: ${n} 이 바꿀 문장을 ${m.file.path} 에서 못 찾았다 — 변이가 낡았다.\n` +
            "  고칠 곳은 소스가 아니라 이 파일의 find 문자열이다."
        : `복구 실패: ${n} 의 ${m.file.path} 가 깨끗한 모양이 아니다 ` +
            `(원래 문장 ${found}건 · 변이 문장 ${left}건 — 각각 1건과 0건이어야 한다).\n` +
            "  변이의 replace 가 깨끗한 소스에도 있는 문장이면 복구가 멀쩡한 줄까지 바꾼다.\n" +
            "  손으로 되돌린 뒤 다시 돌린다(git checkout 이 가장 빠르다).",
    );
    process.exit(1);
  }

  return { migrations: RESTORE_MIGRATIONS.length, undos: undos.length, sources: files };
}

const arg = process.argv[2];

if (!arg || arg === "--list") {
  for (const [name, m] of Object.entries(MUTATIONS)) {
    console.log(`${name.padEnd(26)} ${invOf(m).padEnd(7)} ${m.holds}`);
  }
} else if (arg === "--list-json") {
  // `file` 은 소스 파일을 바꾸는 변이인가다. 그런 변이는 데이터베이스 지문을 안 건드리므로,
  // 판정 쪽이 이것을 모르면 「강제 장치를 하나도 안 바꿨다」로 잘못 읽는다.
  // mutation-run.mjs 가 읽는 자리. 사람이 읽는 --list 의 칸 나눔에 기대지 않는다.
  const list = Object.entries(MUTATIONS).map(([name, m]) => ({ name, inv: invOf(m), holds: m.holds, file: Boolean(m.file) }));
  console.log(JSON.stringify(list));
} else if (arg === "--fingerprint") {
  const r = await query(FINGERPRINT_SQL);
  const full = `${r.rows[0].fingerprint}\n${fileFingerprint()}`;
  // 마지막 줄에 요약 해시를 같이 낸다 — --restore 가 찍는 값과 같은 자리에서 만난다.
  console.log(full + `\nsha256 ${createHash("sha256").update(full).digest("hex").slice(0, 12)}`);
} else if (arg === "--restore") {
  // 이름을 주면 그 변이의 undo 만, 안 주면 전부 돌린다.
  const r = await restore(process.argv[3]);
  // 「복구 완료」라는 말만으로는 보고이지 근거가 아니다. 지문 요약을 같이 찍어
  // 사람이 원본과 대조할 수 있게 한다.
  const fp = `${(await query(FINGERPRINT_SQL)).rows[0].fingerprint}\n${fileFingerprint()}`;
  console.log(
    `복구 완료 (껍데기 1 + 마이그레이션 ${r.migrations}개 재적용 + undo ${r.undos}개 + 소스 ${r.sources}개) — 지문 ` +
      createHash("sha256").update(fp).digest("hex").slice(0, 12),
  );
} else {
  const mutation = MUTATIONS[arg];
  if (!mutation) {
    console.error(`모르는 변이: ${arg}. --list 로 목록을 본다.`);
    process.exit(1);
  }
  if (mutation.guard) await assertBodyFresh(arg, mutation.guard);
  if (mutation.sql) await query(mutation.sql);
  if (mutation.file) {
    const target = join(HERE, "..", mutation.file.path);
    const cur = readFileSync(target, "utf-8");

    // **심기 전에 검사한다.** 아래 둘은 복구도 검사하지만, 거기서 걸리면 작업 트리가 이미
    // 망가진 뒤라 안내가 「git checkout」이 된다. 심기 전에 보면 한 글자도 안 쓰고 거절된다.
    const found = cur.split(mutation.file.find).length - 1;
    if (found !== 1) {
      // **`found === 0` 의 원인은 둘이고 처방이 정반대다.** 변이가 낡은 것일 수도 있고,
      // 다른 파일 변이가 아직 심긴 채라 그 줄이 지금 다른 모양인 것일 수도 있다
      // (변이 둘의 find 가 겹치면 실제로 그렇게 된다). 뒤엣것에 "find 를 고쳐라"라고
      // 안내하면 멀쩡한 변이를 망친다 — 그래서 파일을 한 번 훑어 범인을 지목한다.
      const culprit =
        found === 0
          ? Object.entries(MUTATIONS).find(
              ([n, other]) =>
                n !== arg && other.file?.path === mutation.file.path && cur.includes(other.file.replace),
            )?.[0]
          : undefined;
      console.error(
        `${arg}: 바꿀 문장이 ${mutation.file.path} 에 ${found}건이다 — 1건이어야 한다.` +
          (culprit
            ? ` ${culprit} 가 아직 심긴 채다 — 먼저 \`node scripts/mutate.mjs --restore\` 로 되돌린다.`
            : found === 0
              ? " 변이가 낡았다 — 고칠 곳은 소스가 아니라 이 파일의 find 문자열이다."
              : " 같은 문장이 여럿이라 어디를 바꾸는지 정해지지 않는다."),
      );
      process.exit(1);
    }

    // **지금이 트리가 깨끗하다고 방금 확인된 순간이다.** 그러니 이 변이 하나가 아니라
    // 모든 파일 변이의 replace 를 여기서 한 번에 훑는다 — 비용이 0 이고, 한 번도 심어 본 적
    // 없는 변이의 잘못된 정의도 이때 드러난다.
    for (const [n, m] of Object.entries(MUTATIONS)) {
      if (!m.file || !cur.includes(m.file.replace)) continue;
      console.error(
        `${n}: 바꿔 넣을 문장이 깨끗한 소스(${m.file.path})에 이미 있다.` +
          " 복구는 그 문장을 전부 되돌리므로 손대지 않은 줄까지 바뀐다 — replace 를 소스에 없는 문장으로 고친다.",
      );
      process.exit(1);
    }

    // 변이 둘의 find 가 서로 겹치는 경우(하나가 다른 하나의 부분 문자열)는 여기서 안 본다.
    // 한 번에 하나만 심고 그 사이에 복구가 돌며, 복구가 **깨끗한 상태에서** 모든 변이의
    // 개수를 다시 세기 때문이다. 겹쳐서 심긴 상태는 위 `culprit` 가지가 이름을 대며 막는다.
    writeFileSync(target, cur.split(mutation.file.find).join(mutation.file.replace));

    // **디스크에서 다시 읽는다.** 방금 만든 문자열을 보면 위에서 `found === 1` 을 확인한
    // 이상 언제나 참이라, 확인처럼 생겼지만 아무것도 확인하지 않는다(쓰기 실패도 못 본다).
    if (!readFileSync(target, "utf-8").includes(mutation.file.replace)) {
      console.error(`${arg}: 심었는데 바꾼 문장이 파일에 없다.`);
      process.exit(1);
    }
  }
  console.log(`변이 심음: ${arg}\n  이것을 붙들어야 할 검사: ${mutation.holds}`);
}
