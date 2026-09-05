-- ═════════════════════════════════════════════════════════════════════════
-- 0010 — 배포 준비 국면의 보안 하한선 둘
--
-- 서로 다른 두 구멍을 한 파일에 담는다. 둘 다 "앱은 지키는데 데이터베이스는 안 지킨다"
-- 라는 같은 모양이고, 둘 다 배포 전에 닫기로 한 것이다.
--
--   ① 회원가입이 프로필 없는 계정을 남긴다 (S1)
--   ② 인가 판정 함수가 그대로 API 에 노출돼 있다 (S4)
-- ═════════════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════════════════
-- ① 계정과 프로필은 함께 생긴다
--
-- 지금까지 프로필은 **앱이** 만들었다: `signUp` 이 끝나면 그때 생긴 세션으로
-- `profiles` 에 한 줄 넣었다. 그 세션이 항상 생긴다는 전제가 틀렸다 —
-- 이메일 확인이 켜져 있으면 `signUp` 은 사용자만 만들고 세션 없이 돌아온다.
-- 그러면 뒤따르는 insert 는 `auth.uid()` 가 null 이라 `profiles_insert_own` 에 걸려
-- 거부되고, **계정은 남고 프로필은 없다.** 그 계정은 스터디 개설도 신청도 못 한다
-- (둘 다 profiles 를 가리키는 외래 키를 지난다).
--
-- 그래서 만드는 자리를 데이터베이스로 옮긴다. 계정 행이 들어오는 그 트랜잭션에서
-- 프로필도 들어오므로 **세션이 있든 없든, 어느 경로로 가입하든 둘은 같이 생긴다.**
-- ═════════════════════════════════════════════════════════════════════════

-- 이름의 길이 규칙을 데이터베이스로 내린다.
-- 지금까지 "20자까지"는 회원가입 폼 코드에만 있었다. 아래 트리거가 이름을
-- 가입 요청이 실어 보낸 값에서 꺼내게 되면, **앱을 거치지 않은 가입이 그 규칙을
-- 통째로 건너뛴다.** 규칙을 지키는 자리가 값이 들어오는 자리와 같아야 한다.
alter table public.profiles drop constraint if exists profiles_username_length;
alter table public.profiles add constraint profiles_username_length
  check (char_length(username) between 1 and 20);

comment on constraint profiles_username_length on public.profiles is
  '이름은 1~20자. 회원가입 폼과 handle_new_user 트리거가 같은 이 하한을 본다.';

-- **배포 전에 한 번 세어 볼 것**: 기존 행에 21자 이상이나 빈 이름이 하나라도 있으면 위
-- 문장에서 마이그레이션이 멈추고, **그 뒤의 ②(판정 함수 이동)가 통째로 안 올라간다.**
-- 실패 방향은 안전하지만, 「인가 구멍을 닫는 배포가 이름 하나 때문에 멈췄다」는 상황은
-- 급할 때 잘못된 판단(제약을 빼고 다시 돌린다)을 부른다.
--
--   select count(*) from public.profiles where char_length(username) not between 1 and 20;
--
-- 0 이 아니면 정정을 손으로 한 번 돌린다 — 데이터 정정은 이 파일에 넣지 않는다.

-- 스키마를 먼저 만든다 — 아래 이름 규칙 함수가 여기 들어간다. 이 스키마의 성격은 ②에 적었다.
create schema if not exists private;

-- 이름을 꺼내는 규칙 하나. 트리거와 백필이 **같은 함수**를 부른다 —
-- 두 벌로 적으면 기존 계정과 새 계정의 이름이 서로 다른 규칙으로 만들어진다.
--
-- 이름이 없으면 가입을 **거절하지 않고** 대신 지어 준다. 이 마이그레이션이 세우려는 것이
-- "계정에는 반드시 프로필이 있다"인데, 트리거가 예외를 던지면 그 예외가 계정 생성 자체를
-- 되돌린다 — 세우려는 규칙을 트리거 자신이 어기는 모양이 된다.
--
-- **공백의 정의를 앱과 맞춘다.** 기본 `btrim` 은 U+0020 하나만 자른다. 그러면 전각 공백
-- (U+3000) 이나 줄바꿈 없는 공백(U+00A0) 한 글자짜리 이름이 길이 1 을 통과해서, **멤버
-- 목록에 빈 줄로 뜨는 사용자**가 생긴다. 폼의 `trim()` 은 그것들을 전부 지우므로,
-- 강제 위치를 데이터베이스로 옮긴 이 변경이 만든 차이다 — 옮기기 전에는 없던 자리다.
--
-- **패턴에 백슬래시 이스케이프를 안 쓴다.** 문자 코드가 필요한 자리에는 `chr()` 를 부른다.
-- 이 파일이 도구를 거치는 동안 유니코드 이스케이프가 실제 문자로 바뀌어 들어간 적이 있고,
-- 그때 규칙이 조용히 달라진다. `chr(12288)` 은 어느 도구를 지나도 `chr(12288)` 이다.
--
-- 무엇이 공백인지는 이 데이터베이스에 물어서 정했다(실측):
--   chr(12288)(전각 공백) ~ '[[:space:]]' → 참 · chr(160) → 참 · chr(8203)(폭 없는 공백) → 거짓
--   chr(1) ~ '[[:cntrl:]]' → 참 · chr(127) → 참
--
-- 폭 없는 글자와 양방향 텍스트 제어는 여기서 안 지운다 — 폼의 `trim()` 도 안 지우므로
-- 앱과 데이터베이스가 어긋나는 자리가 아니다. 그건 별도 판단이라 백로그로 뺐다.
create or replace function private.profile_username_from_meta(p_id uuid, p_meta jsonb)
returns text language sql immutable set search_path = '' as $fn$
  select left(
    coalesce(
      nullif(
        -- ② 앞뒤 공백을 자른다. 자바스크립트 trim() 이 자르는 것과 같은 집합이 되게
        regexp_replace(
          -- ① 제어문자를 지운다. `safe-next.ts` 가 주소에 하는 판단을 이름에도 한다
          regexp_replace(coalesce(p_meta ->> 'username', ''), '[[:cntrl:]]', '', 'g'),
          '^([[:space:]]|' || chr(65279) || ')+|([[:space:]]|' || chr(65279) || ')+$',
          '', 'g'),
        ''),
      '회원' || left(p_id::text, 8)          -- 10자. 위 제약의 20자 안이다
    ),
    20
  );
$fn$;

-- **이 트리거는 `profiles` 의 not null 컬럼 집합에 묶여 있다.** 기본값 없는 not null 컬럼이
-- 하나 더 붙는 순간 이 insert 가 실패하고, 그러면 **모든 회원가입이 실패한다**(예외가 계정
-- 생성까지 되돌린다). 예외를 삼키면 안 된다 — 그건 INV-A7 을 정면으로 어기는 것이라,
-- 컬럼을 더하는 쪽이 여기를 같이 고쳐야 한다. `signup-profile.test.ts` 가 그 집합을 세어
-- 붙든다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.profiles (id, username)
  values (new.id, private.profile_username_from_meta(new.id, new.raw_user_meta_data))
  on conflict (id) do nothing;   -- 백필과 겹쳐도, 재실행돼도 안전하다
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 만들어진 프로필 없는 계정을 메운다. 지금 로컬에는 0건이지만, 이 마이그레이션이
-- 올라가는 데이터베이스에는 있을 수 있다 — 구멍이 열려 있던 동안 가입한 계정들이다.
--
-- **지워진 계정은 빼고 메운다.** `auth.users` 에는 소프트 삭제된 계정이 행으로 남는데,
-- 그것까지 메우면 `profiles_read` 가 무조건 참이라 「지운 계정인데 명단에 있다」가 된다.
insert into public.profiles (id, username)
select u.id, private.profile_username_from_meta(u.id, u.raw_user_meta_data)
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
   and u.deleted_at is null;


-- ═════════════════════════════════════════════════════════════════════════
-- ② 인가 판정 함수를 API 밖으로 옮긴다
--
-- PostgREST 는 **노출된 스키마의 함수를 전부 RPC 로 연다.** 판정 함수들이 `public` 에
-- 있으므로, 비로그인이 이렇게 물을 수 있었다(2026-09-05 실측, 200 + false):
--
--   POST /rest/v1/rpc/is_study_member {"p_study_id": …, "p_user_id": …}
--
-- 이건 INV-Z11 이 정한 경계를 **정책이 지키지 않는 문으로** 넘는 것이다. 참여자 명단을
-- 볼 수 있는 사람은 셋뿐인데, 이 함수는 아무에게나 "그 사람이 그 스터디의 수락된 멤버인가"를
-- 한 건씩 답한다. 명단을 통째로 주지 않을 뿐, 한 명씩 물으면 같은 답이 나온다.
-- `is_study_host` 는 호스트가 누구인지를, `study_accepted_count` 는 **지워진 스터디의**
-- 인원수까지 답한다(판정 함수라 가시성을 안 본다).
--
-- **`revoke execute` 로는 못 고친다.** 접근 정책의 식은 요청한 사람의 권한으로 평가되므로,
-- anon·authenticated 에게서 실행 권한을 뺏으면 정책 자신이 그 함수를 못 부른다.
-- 노출을 끊는 자리는 권한이 아니라 **스키마**다 — PostgREST 는 노출 목록에 없는 스키마를
-- 라우팅하지 않고, 그 목록에 `private` 은 없다.
-- ═════════════════════════════════════════════════════════════════════════

-- 스키마 자체는 잠가 두고, 쓸 역할에만 연다.
-- 정책 식은 anon·authenticated 의 권한으로 평가되므로 이 둘에게 usage 가 필요하다.
-- **그래도 API 로는 못 부른다** — usage 는 데이터베이스 안에서의 권한이고, 노출은
-- PostgREST 의 스키마 목록이 정한다. 두 가지가 다른 층이라는 것이 이 수정의 전부다.
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

comment on schema private is
  'API 에 노출하지 않는 내부 함수. 접근 정책이 부르는 판정 함수는 전부 여기 있다 — public 에 두면 PostgREST 가 RPC 로 열어서 정책이 지키는 경계를 우회한다 (S4).';

-- ── 판정 함수 일곱. 본문은 그대로고 스키마만 바뀐다 ──────────────────────
-- security definer 인 이유는 옮기기 전과 같다: 정책 안에서 같은 테이블을 다시 읽으면
-- 그 읽기에 또 정책이 걸려 무한히 되돌아간다.

create or replace function private.is_study_host(p_study_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.studies where id = p_study_id and host_id = p_user_id);
$fn$;

create or replace function private.is_chat_member(p_chat_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.chat_participants where chat_id = p_chat_id and user_id = p_user_id);
$fn$;

create or replace function private.is_study_member(p_study_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.participants
     where study_id = p_study_id and user_id = p_user_id and status = 'accepted'
  );
$fn$;

create or replace function private.study_is_visible(p_study_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.studies s
     where s.id = p_study_id and (s.deleted_at is null or s.host_id = p_user_id)
  );
$fn$;

create or replace function private.study_accepts_applications(p_study_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.studies s
     where s.id = p_study_id and s.deleted_at is null and s.closed_at is null
  );
$fn$;

create or replace function private.study_accepted_count(p_study_id uuid) returns integer
language sql stable security definer set search_path = '' as $fn$
  select count(*)::integer from public.participants
   where study_id = p_study_id and status = 'accepted';
$fn$;

create or replace function private.study_is_recruiting(p_study_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select s.closed_at is null
     and s.deleted_at is null
     and private.study_accepted_count(s.id) < s.max_participants
    from public.studies s where s.id = p_study_id;
$fn$;

-- 실행 권한을 명시한다. 새 함수는 기본으로 PUBLIC 이 실행할 수 있는데, 그 기본값에
-- 기대면 "누가 부를 수 있는지"가 파일 어디에도 안 적힌다.
do $grants$
declare fn text;
begin
  foreach fn in array array[
    'private.is_study_host(uuid, uuid)',
    'private.is_chat_member(uuid, uuid)',
    'private.is_study_member(uuid, uuid)',
    'private.study_is_visible(uuid, uuid)',
    'private.study_accepts_applications(uuid)',
    'private.study_accepted_count(uuid)',
    'private.study_is_recruiting(uuid)',
    'private.profile_username_from_meta(uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', fn);
  end loop;
end;
$grants$;

-- ── 정책 열둘을 새 자리로 다시 건다 ──────────────────────────────────────
-- 먼저 정책을 옮겨야 아래 drop 이 통한다. 정책 식이 함수를 가리키는 동안에는
-- Postgres 가 그 함수를 못 지운다 — 순서를 바꾸면 이 파일이 중간에서 멈춘다.

drop policy if exists messages_read_member on public.chat_messages;
create policy messages_read_member on public.chat_messages for select
using (private.is_chat_member(chat_id, (select auth.uid())));

drop policy if exists messages_send_member on public.chat_messages;
create policy messages_send_member on public.chat_messages for insert
with check (
  sender_id = (select auth.uid())
  and private.is_chat_member(chat_id, (select auth.uid()))
);

drop policy if exists chatpart_read_member on public.chat_participants;
create policy chatpart_read_member on public.chat_participants for select
using (private.is_chat_member(chat_id, (select auth.uid())));

drop policy if exists chats_read_member on public.chats;
create policy chats_read_member on public.chats for select
using (private.is_chat_member(id, (select auth.uid())));

drop policy if exists participants_apply_self on public.participants;
create policy participants_apply_self on public.participants for insert
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and private.study_accepts_applications(study_id)
);

drop policy if exists participants_read on public.participants;
create policy participants_read on public.participants for select
using (
  user_id = (select auth.uid())
  or private.is_study_host(study_id, (select auth.uid()))
  or (status = 'accepted' and private.is_study_member(study_id, (select auth.uid())))
);

drop policy if exists participants_update_host on public.participants;
create policy participants_update_host on public.participants for update
using (private.is_study_host(study_id, (select auth.uid())))
with check (private.is_study_host(study_id, (select auth.uid())));

drop policy if exists posts_insert_author on public.posts;
create policy posts_insert_author on public.posts for insert
with check (
  author_id = (select auth.uid())
  and private.is_study_host(study_id, (select auth.uid()))
);

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select
using (private.study_is_visible(study_id, (select auth.uid())));

drop policy if exists sessions_del_host on public.study_sessions;
create policy sessions_del_host on public.study_sessions for delete
using (private.is_study_host(study_id, (select auth.uid())));

drop policy if exists sessions_write_host on public.study_sessions;
create policy sessions_write_host on public.study_sessions for insert
with check (private.is_study_host(study_id, (select auth.uid())));

drop policy if exists chat_broadcast_read on realtime.messages;
create policy chat_broadcast_read on realtime.messages for select to authenticated
using (
  realtime.topic() ~ '^chat:[0-9a-fA-F-]{36}$'
  and private.is_chat_member(
        substring(realtime.topic() from 6)::uuid,
        (select auth.uid())
      )
);

-- ── 옛 자리를 지운다. 이것이 노출을 끊는 그 줄이다 ───────────────────────
-- 위 정책들이 이미 private 을 가리키므로 여기서 의존성이 없다. 만약 이 drop 이
-- "다른 객체가 의존한다"로 실패하면, 내가 못 찾은 정책이 하나 더 있다는 뜻이다 —
-- cascade 를 붙이지 않는 이유가 그것이다. 조용히 지우면 그 정책이 사라진다.
drop function if exists public.is_study_host(uuid, uuid);
drop function if exists public.is_chat_member(uuid, uuid);
drop function if exists public.is_study_member(uuid, uuid);
drop function if exists public.study_is_visible(uuid, uuid);
drop function if exists public.study_accepts_applications(uuid);
drop function if exists public.study_is_recruiting(uuid);
drop function if exists public.study_accepted_count(uuid);

-- ── 옮기지 않은 것과 그 이유 ────────────────────────────────────────────
--
-- **계산 컬럼 여섯은 public 에 남는다** — `accepted_count(studies)` · `recruiting(studies)` ·
-- `likes_count(posts)` · `is_latest_for_study(posts)` · `study_recruit_until(posts)` ·
-- `study_deadline_rank(posts)`. PostgREST 는 노출된 스키마에서 이 함수들을 찾아야 컬럼처럼
-- 읽어 준다. private 로 옮기면 목록·상세 화면이 통째로 깨진다. 그리고 이것들은 새는 것이
-- 아니다 — 인자가 행이라, 부르려면 그 행을 이미 읽을 수 있어야 하고 그 읽기에 정책이 걸린다.
--
-- **트리거 함수도 남는다.** PostgREST 는 `trigger` 를 반환하는 함수를 RPC 로 열지 않는다.
--
-- **`increment_post_views` 는 이 파일이 건드리지 않는다.** 옮기면 앱이 못 부른다 —
-- 앱도 PostgREST 를 지나므로 private 은 앱에게도 닫혀 있다. 이건 "노출을 끊는다"로
-- 풀리는 문제가 아니라 "조회수를 누가 어떻게 올리나"를 정하는 문제라, 보류로 올렸다.
