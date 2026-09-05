-- ═════════════════════════════════════════════════════════════════════════
-- 0002 — 2026-09-05 리뷰 개정
--
-- 리뷰어 셋(security · code · test-auditor)이 독립적으로 같은 자리를 짚었다.
-- 이 파일이 닫는 것은 네 종류다.
--
--   ① 조건은 있는데 지켜야 할 열을 안 붙드는 갱신 정책 (INV-Z8)
--   ② 파생값이 묻는 사람마다 다른 답을 주는 것 (INV-P9)
--   ③ 참가 상태와 채팅 구성원이 한 방향으로만 이어져 있던 것 (INV-P8)
--   ④ 스펙이 정한 적 없어서 열려 있던 것 — 모집글 작성 권한(INV-Z9),
--      지워진 스터디의 쓰기·노출(INV-Z10)
--
-- 그리고 화면 목록(docs/IA.md)의 2026-09-05 결정 셋을 스키마에 반영한다:
-- 지역 3분해 · 모집 마감일 · 스터디 1:N 모집글.
--
-- 재적용 안전: 조건 없는 update/delete/truncate 를 쓰지 않고,
-- create or replace · if not exists · drop ... if exists 만 쓴다.
-- 확인: `npm run db:reset` (내부적으로 `supabase db reset --local`) 이 폴더 전체를
-- 이름순으로 다시 적용한다.
-- ═════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. 지역을 셋으로 가른다 (IA.md 「지역은 세 가지를 따로 담는다」)
-- ─────────────────────────────────────────────────────────────────────────
-- `region` 한 칸이 필터 값('서울')과 표시 값('서울 강남')을 같이 담고 있었다.
-- 그러면 region='서울' 필터가 '서울 강남' 스터디를 **조용히 빠뜨린다** —
-- 오류가 아니라 "그런 스터디가 없다"로 보인다.

create table if not exists public.regions (
  id         text primary key,
  name       text not null,
  sort_order smallint not null default 0
);

comment on table public.regions is
  '필터 축이 되는 지역. 자유 텍스트가 아니라 고정 목록이라야 필터가 빠뜨리지 않는다.';

insert into public.regions (id, name, sort_order) values
  ('seoul',     '서울',       1),
  ('gyeonggi',  '경기·인천',   2),
  ('busan',     '부산·경남',   3),
  ('daegu',     '대구·경북',   4),
  ('daejeon',   '대전·충청',   5),
  ('gwangju',   '광주·전라',   6),
  ('gangwon',   '강원',       7),
  ('jeju',      '제주',       8)
on conflict (id) do nothing;   -- 재적용 안전용. 경합하는 쓰기 경로가 아니다.

alter table public.regions enable row level security;
drop policy if exists regions_read on public.regions;
create policy regions_read on public.regions for select using (true);

-- 지역(고정) · 상세 위치(자유) · 진행 방식(셋 중 하나)로 나눈다.
alter table public.studies add column if not exists region_code text references public.regions (id);
alter table public.studies add column if not exists location_detail text;
alter table public.studies add column if not exists meeting_mode text not null default 'offline';

-- 옛 자유 텍스트를 고정 목록으로 옮긴다. 배포 전이라 개발 데이터만 존재한다.
-- (컬럼이 이미 없으면 아래 세 문장은 건너뛴다 — 재적용 안전)
do $migrate_region$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'studies' and column_name = 'region'
  ) then
    update public.studies s set region_code = r.id
      from public.regions r
     where s.region_code is null and s.region like r.name || '%';

    update public.studies set region_code = 'seoul', meeting_mode = 'online'
     where region_code is null and region = '온라인';

    update public.studies set region_code = 'seoul'
     where region_code is null;
  end if;
end;
$migrate_region$;

alter table public.studies drop column if exists region;
alter table public.studies alter column region_code set not null;

alter table public.studies drop constraint if exists studies_meeting_mode_allowed;
alter table public.studies add constraint studies_meeting_mode_allowed
  check (meeting_mode in ('offline', 'online', 'hybrid'));

comment on column public.studies.location_detail is
  '상세 위치. 상세 화면에만 나오고 필터는 이 값을 안 본다 — 필터가 보는 것은 region_code 다.';
comment on column public.studies.meeting_mode is
  '진행 방식. 「온라인」은 지역이 아니라 이 축이다 — 시안의 「온라인 병행」이 hybrid.';

create index if not exists studies_region_code_idx
  on public.studies (region_code) where deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. 모집 마감일 (IA.md 「마감 임박순」의 기준)
-- ─────────────────────────────────────────────────────────────────────────
-- 시안의 정렬 옵션 「마감 임박순」에 기준이 될 값이 없었다. closed_at 은 호스트가
-- **이미 닫은** 시각(과거)이라 임박을 계산할 수 없다.
alter table public.studies add column if not exists recruit_until date;

comment on column public.studies.recruit_until is
  '언제까지 신청을 받는가. 「마감 임박순」 정렬의 기준. 비어 있으면 기한 없음.';

create index if not exists studies_recruit_until_idx
  on public.studies (recruit_until)
  where deleted_at is null and closed_at is null and recruit_until is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. INV-P9 — 파생값은 누가 묻든 같은 답을 준다
-- ─────────────────────────────────────────────────────────────────────────
-- 이 두 함수는 security definer 가 아니어서 **부르는 사람의 시야로** participants 를 셌다.
-- 참여자 행은 본인과 호스트에게만 보이므로, 로그인하지 않은 방문자에게는 언제나 0 이 나오고
-- 정원이 꽉 찬 스터디도 "모집 중"으로 답했다. 발견 화면 셋이 전부 비로그인 공개라
-- 제품의 첫 화면부터 거짓 숫자를 보여주던 자리다.
--
-- definer 로 바꿔도 새는 것은 **수와 참/거짓뿐**이다 — 참여자 행 자체는 계속 안 보인다.

create or replace function public.study_accepted_count(p_study_id uuid) returns integer
language sql stable security definer set search_path = '' as $fn$
  select count(*)::integer from public.participants
   where study_id = p_study_id and status = 'accepted';
$fn$;

create or replace function public.study_is_recruiting(p_study_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select s.closed_at is null
     and s.deleted_at is null
     and public.study_accepted_count(s.id) < s.max_participants
    from public.studies s where s.id = p_study_id;
$fn$;

-- 목록 화면이 스터디마다 함수를 따로 부르지 않게, 같은 값을 계산 컬럼으로도 낸다.
-- (PostgREST 는 `f(테이블)` 모양의 함수를 그 테이블의 컬럼처럼 select 에 넣게 해 준다)
create or replace function public.accepted_count(public.studies) returns integer
language sql stable security definer set search_path = '' as $fn$
  select count(*)::integer from public.participants
   where study_id = $1.id and status = 'accepted';
$fn$;

create or replace function public.recruiting(public.studies) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select $1.closed_at is null
     and $1.deleted_at is null
     and public.accepted_count($1) < $1.max_participants;
$fn$;

-- 좋아요 수는 정책이 이미 공개(likes_read using true)라 definer 가 필요 없다.
create or replace function public.likes_count(public.posts) returns integer
language sql stable set search_path = '' as $fn$
  select count(*)::integer from public.likes where post_id = $1.id;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. INV-Z8 — 소유·소속을 나타내는 열은 갱신으로 바뀌지 않는다
-- ─────────────────────────────────────────────────────────────────────────
-- **접근 정책의 with check 로는 이걸 못 막는다.** 조건이 한 열만 보면 나머지 열은
-- 요청이 보낸 값 그대로 들어가기 때문이다. 실제로 두 자리가 뚫려 있었다:
--
--   participants_update_host  → study_id 만 보고 user_id 를 안 봄
--     ⇒ 호스트가 자기 참여 행의 user_id 를 남으로 바꾸면, 신청한 적 없는 사람이
--       "참여 중" 멤버가 되고 트리거가 이어서 그룹 채팅방에 넣었다.
--   chatpart_touch_self       → user_id 만 보고 chat_id 를 안 봄
--     ⇒ 자기 채팅 참여 행을 남의 방으로 옮기면 그 방의 대화를 전부 읽고 쓸 수 있었다.
--
-- 열 단위 갱신 권한은 정책보다 **앞에서** 판정한다 — SET 절에 허용되지 않은 열이
-- 들어오면 정책을 보기도 전에 거부된다. service_role 은 건드리지 않는다(관리 경로).

revoke update on public.participants      from anon, authenticated;
revoke update on public.chat_participants from anon, authenticated;
revoke update on public.posts             from anon, authenticated;
revoke update on public.studies           from anon, authenticated;

grant update (status)       on public.participants      to authenticated;
grant update (last_read_at) on public.chat_participants to authenticated;
grant update (title, summary, content) on public.posts  to authenticated;
grant update (
  title, summary, description, category_id,
  region_code, location_detail, meeting_mode,
  max_participants, starts_on, ends_on, recruit_until,
  closed_at, deleted_at
) on public.studies to authenticated;

-- 조회수는 위 목록에 없다 — 남의 글을 읽어도 올라가야 하는 값이라 아래 9절의 함수가 올린다.

-- ─────────────────────────────────────────────────────────────────────────
-- 5. INV-P8 — 채팅방 구성원은 참가 상태에서 파생된다 (양쪽 방향)
-- ─────────────────────────────────────────────────────────────────────────
-- 옛 트리거는 수락될 때 **넣기만** 했다. 빼는 경로가 없고 chat_participants 에
-- delete 정책도 없어서, 강퇴당한 사람이 대화를 계속 읽고 계속 썼다 —
-- 호스트가 멤버를 내보내는 것이 제품에서 실제로 의미하는 자리가 대화인데도.
--
-- 사람이 직접 지우는 delete 정책은 여전히 두지 않는다. 구성원 자리의 주인은
-- participants.status 하나여야 하기 때문이다.

create or replace function public.sync_study_chat() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  v_chat_id uuid;
begin
  select id into v_chat_id from public.chats where study_id = new.study_id;
  if v_chat_id is null then
    return new;
  end if;

  if new.status = 'accepted' then
    insert into public.chat_participants (chat_id, user_id)
      values (v_chat_id, new.user_id)
      on conflict (chat_id, user_id) do nothing;
  else
    -- 대기·거절·탈퇴·강퇴 — 전부 "지금 멤버가 아님"이다. 메시지는 그대로 남는다.
    delete from public.chat_participants
     where chat_id = v_chat_id and user_id = new.user_id;
  end if;

  return new;
end;
$fn$;

drop trigger if exists participants_join_chat on public.participants;
drop trigger if exists participants_sync_chat on public.participants;
create trigger participants_sync_chat
  after insert or update of status on public.participants
  for each row execute function public.sync_study_chat();

drop function if exists public.join_study_chat();

-- ─────────────────────────────────────────────────────────────────────────
-- 6. INV-Z9 — 모집글을 만들 수 있는 것은 그 스터디의 호스트뿐이다
-- ─────────────────────────────────────────────────────────────────────────
-- 옛 정책은 작성자만 보고 study_id 를 안 봐서, 아무 로그인 사용자가 **남의 스터디를
-- 가리키는** 모집글을 쓸 수 있었다. 그 글의 참가 신청 버튼은 남의 스터디로 사람을 보낸다.
-- 옮기는 것은 4절의 열 권한이 막는다(posts 갱신 목록에 study_id 가 없다).

drop policy if exists posts_insert_author on public.posts;
create policy posts_insert_author on public.posts for insert
  with check (
    author_id = (select auth.uid())
    and public.is_study_host(study_id, (select auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 7. INV-Z10 — 지워진 스터디는 새 쓰기를 받지 않고 목록에도 안 나온다
-- ─────────────────────────────────────────────────────────────────────────
-- INV-Z6 은 "목록·검색에 나타나지 않는다"까지를 계약으로 삼았는데, posts_read 가
-- 무조건 참이라 **모집글 쪽에서 샜다.** 목록에서 누른 카드가 반쯤 빈 상세로 이어졌다.

create or replace function public.study_is_visible(p_study_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.studies s
     where s.id = p_study_id and (s.deleted_at is null or s.host_id = p_user_id)
  );
$fn$;

create or replace function public.study_accepts_applications(p_study_id uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.studies s
     where s.id = p_study_id and s.deleted_at is null and s.closed_at is null
  );
$fn$;

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select
  using (public.study_is_visible(study_id, (select auth.uid())));

drop policy if exists participants_apply_self on public.participants;
create policy participants_apply_self on public.participants for insert
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and public.study_accepts_applications(study_id)
  );

-- 수락 경로도 같은 정의를 쓴다. 옛 트리거는 closed_at 만 보고 deleted_at 을 안 봐서
-- **지워진 스터디에 새 멤버가 들어왔다.**
create or replace function public.enforce_study_capacity() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  v_max      smallint;
  v_accepted integer;
  v_closed   timestamptz;
  v_deleted  timestamptz;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  select max_participants, closed_at, deleted_at
    into v_max, v_closed, v_deleted
    from public.studies where id = new.study_id
    for update;                                  -- ← 경합을 여기서 직렬화한다

  -- 행을 못 읽으면 거부한다. 옛 구현은 NULL 을 담고 그대로 통과했다(fail-open) —
  -- "행을 못 읽으면 허용"인 검사는 검사가 아니다.
  if not found then
    raise exception '스터디를 찾을 수 없어 수락할 수 없습니다 (INV-P4)'
      using errcode = 'check_violation';
  end if;

  if v_deleted is not null then
    raise exception '지워진 스터디에는 참여자를 수락할 수 없습니다 (INV-Z10)'
      using errcode = 'check_violation';
  end if;

  if v_closed is not null then
    raise exception '모집이 마감된 스터디에는 참여자를 수락할 수 없습니다 (INV-P4)'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_accepted
    from public.participants
   where study_id = new.study_id and status = 'accepted';

  -- AFTER 트리거라 이 시점의 count 에는 방금 들어온 행이 이미 포함돼 있다.
  -- 그래서 경계는 `>` 다: 정원 3 · 수락 3 → 통과, 네 번째 → 거부.
  if v_accepted > v_max then
    raise exception '정원을 넘겨 수락할 수 없습니다: 정원 %, 수락 % (INV-P1)', v_max, v_accepted
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. 알림을 만들 수 있는 주체를 만든다
-- ─────────────────────────────────────────────────────────────────────────
-- notifications 에는 select·update·delete 정책만 있었다. insert 정책이 없다 =
-- **아무도 못 넣는다.** 제품의 필수 기능(참가 요청·수락·거절·탈퇴 알림)에 쓰기 경로가
-- 아예 없었다는 뜻이고, 그대로 두면 "서버에 비밀 키를 넣자"는 결론으로 밀려간다 —
-- 그 순간 INV-Z5 의 전제(서버도 공개 키로만 붙는다)가 무너진다.
--
-- 알림은 사용자가 직접 쓰는 것이 아니라 사건에서 파생되는 기록이므로 트리거가 만든다.
-- insert 정책은 계속 두지 않는다 — 그게 정확한 상태다("사람은 못 넣는다").

alter table public.notifications drop constraint if exists notifications_type_allowed;
alter table public.notifications add constraint notifications_type_allowed
  check (type in (
    'participation_requested',
    'participation_accepted',
    'participation_rejected',
    'participation_kicked',
    'participation_withdrawn'
  ));

create or replace function public.notify_participation() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  v_host  uuid;
  v_title text;
  v_type  text;
  v_to    uuid;
begin
  select host_id, title into v_host, v_title
    from public.studies where id = new.study_id;
  if not found then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 스터디를 만들 때 호스트 자신이 accepted 로 들어온다 — 그건 알릴 일이 아니다.
    if new.status <> 'pending' then
      return new;
    end if;
    v_type := 'participation_requested';
    v_to   := v_host;
  else
    if new.status = old.status then
      return new;
    end if;
    case new.status
      when 'accepted'  then v_type := 'participation_accepted';  v_to := new.user_id;
      when 'rejected'  then v_type := 'participation_rejected';  v_to := new.user_id;
      when 'kicked'    then v_type := 'participation_kicked';    v_to := new.user_id;
      when 'withdrawn' then v_type := 'participation_withdrawn'; v_to := v_host;
      else return new;
    end case;
  end if;

  -- 호스트가 자기 스터디에서 스스로 나가는 경우, 알림을 자기에게 보내지 않는다.
  if v_to = new.user_id and tg_op = 'UPDATE' and new.status = 'withdrawn' then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, reference_type, reference_id)
    values (v_to, v_type, v_title, 'study', new.study_id);

  return new;
end;
$fn$;

drop trigger if exists participants_notify on public.participants;
create trigger participants_notify
  after insert or update of status on public.participants
  for each row execute function public.notify_participation();

create index if not exists notifications_recent_idx
  on public.notifications (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. 조회수를 올릴 수 있는 주체를 만든다
-- ─────────────────────────────────────────────────────────────────────────
-- posts 갱신 정책이 작성자로 묶여 있어 **남이 글을 읽어도 카운터가 안 올라갔다.**
-- 읽고-쓰기가 아니라 한 문장으로 올린다 — 동시 조회에서 값이 튀지 않는다.
create or replace function public.increment_post_views(p_post_id uuid) returns void
language sql security definer set search_path = '' as $fn$
  update public.posts set views_count = views_count + 1 where id = p_post_id;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. 목록 화면이 실제로 쓸 인덱스
-- ─────────────────────────────────────────────────────────────────────────
-- 아래 넷은 지금 규모에서는 안 느리다. 다만 느려질 때 원인이 화면이 아니라 여기라
-- 찾는 데 시간이 걸리고, 지금 붙이는 비용이 가장 싸다.
create extension if not exists pg_trgm;

-- 검색: 제목 부분 일치. 인덱스가 없으면 posts 전체 스캔 + 스터디 조인이다.
create index if not exists posts_title_trgm_idx
  on public.posts using gin (title gin_trgm_ops);

-- /chats 목록: 유일 제약의 선두 컬럼이 chat_id 라 "내가 속한 방"은 전체 스캔이었다.
create index if not exists chat_participants_user_idx
  on public.chat_participants (user_id);

-- /profile 내 스터디
create index if not exists studies_host_idx
  on public.studies (host_id) where deleted_at is null;

-- 스터디마다 가장 최근 모집글 하나를 뽑는 목록 질의(IA.md 「목록은 하나만 보여준다」)
create index if not exists posts_study_created_idx
  on public.posts (study_id, created_at desc);
