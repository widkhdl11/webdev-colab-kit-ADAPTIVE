-- 0001_init.sql — study-mate 초기 스키마
--
-- 근거 스펙: docs/specs/participation-capacity.md (INV-P1~P7)
--           docs/specs/write-authorization.md   (INV-Z1~Z7)
--           docs/specs/auth-session.md          (INV-A3 — 세션은 검증된 클레임으로)
-- 근거 결정: workspace/logs/DECISION_LOG.study-mate-20260905-1.md (D1~D9)
--
-- 이 파일은 **다시 돌려도 결과가 같아야 한다**. scripts/apply-migrations.mjs --all 이
-- 폴더 전체를 이름순으로 재적용하고, 새 DB·리셋에서는 실제로 그렇게 쓴다.
-- 그래서 if not exists / create or replace / drop ... if exists 만 쓰고,
-- 조건 없는 update·delete·truncate 는 한 줄도 넣지 않는다.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. 분류 체계
-- ─────────────────────────────────────────────────────────────────────────
-- 제품 정의가 대분류→중분류→소분류 3단계라고 적고 있다. 지금 화면은 대분류만 쓰지만,
-- 나중에 깊이를 더할 때 studies 를 건드리지 않도록 자기 참조로 둔다.
create table if not exists public.categories (
  id          text primary key,
  parent_id   text references public.categories (id) on delete restrict,
  name        text not null,
  sort_order  smallint not null default 0
);

comment on table public.categories is
  '스터디 분류. parent_id 가 비어 있으면 대분류. 화면의 형광펜 8색은 대분류에 배정된다.';

insert into public.categories (id, parent_id, name, sort_order) values
  ('it',        null, 'IT/개발',        1),
  ('design',    null, '디자인',          2),
  ('language',  null, '외국어',          3),
  ('business',  null, '비즈니스/금융',    4),
  ('cert',      null, '자격증/시험',      5),
  ('academic',  null, '학업/입시',        6),
  ('hobby',     null, '취미/라이프',      7),
  ('growth',    null, '자기계발',         8)
on conflict (id) do nothing;   -- 재적용 안전용. 경합하는 쓰기 경로가 아니다.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. 프로필
-- ─────────────────────────────────────────────────────────────────────────
-- 이메일을 여기 복사하지 않는다 — 원본은 auth.users 이고, 사본은 원본이 바뀌어도
-- 안 따라간다 (D5). 성별·생년월일도 두지 않는다: 제품의 어느 기능도 쓰지 않는데
-- 쓸 데 없는 개인정보를 모으는 것이 안 모으는 것보다 나쁘다.
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          text not null,
  avatar_url        text,
  bio               text,
  region            text,
  interest_category text references public.categories (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. 스터디
-- ─────────────────────────────────────────────────────────────────────────
-- INV-P2: 인원수를 담는 컬럼이 **없다.** 수락된 참여자 행을 세면 언제나 정확하다 (D1).
-- INV-P6: 모집 상태를 담는 컬럼도 **없다.** 저장하는 것은 호스트가 닫은 시각 하나뿐이고,
--         "모집 중인가"는 그 값과 수락 인원·정원에서 파생된다 (D3).
-- INV-Z6: 삭제는 deleted_at 표시다. 호스트의 삭제가 멤버들의 대화를 없애면 안 된다 (D6).
create table if not exists public.studies (
  id               uuid primary key default gen_random_uuid(),
  host_id          uuid not null references public.profiles (id) on delete cascade,
  title            text not null,
  summary          text,
  description      text not null,
  category_id      text not null references public.categories (id) on delete restrict,
  region           text not null,
  max_participants smallint not null,
  starts_on        date,
  ends_on          date,
  closed_at        timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint studies_max_participants_range check (max_participants between 2 and 100),
  constraint studies_period_order check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

comment on column public.studies.closed_at is
  'INV-P6: 호스트가 직접 모집을 닫은 시각. 정원이 차서 마감된 것은 여기 적지 않는다 — 그건 파생값이다.';
comment on column public.studies.deleted_at is
  'INV-Z6: 소프트 삭제. 행은 남고 목록에서만 사라진다.';

create index if not exists studies_category_idx on public.studies (category_id) where deleted_at is null;
create index if not exists studies_region_idx   on public.studies (region)      where deleted_at is null;

-- 요일·시간. 시안의 "매주 화·목 저녁 8시 – 10시" 는 행 두 개다 — 요일이 여럿이라
-- 필드 하나에 못 박는다. 홈의 주간 플래너가 이 행들을 그대로 그린다.
create table if not exists public.study_sessions (
  id         uuid primary key default gen_random_uuid(),
  study_id   uuid not null references public.studies (id) on delete cascade,
  weekday    smallint not null,
  starts_at  time not null,
  ends_at    time not null,
  constraint study_sessions_weekday_range check (weekday between 0 and 6),
  constraint study_sessions_time_order    check (ends_at > starts_at),
  constraint study_sessions_unique unique (study_id, weekday, starts_at)
);

comment on column public.study_sessions.weekday is '0=일요일 … 6=토요일.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. 참여자
-- ─────────────────────────────────────────────────────────────────────────
-- INV-P7: 신청 이후에 일어날 수 있는 결과를 전부 표현한다. 들여온 구조는 셋만 허용해서
--         강퇴·탈퇴를 저장할 자리가 없었다 (D4).
-- role 컬럼을 두지 않는다: 호스트인지는 studies.host_id 와 비교하면 나온다 (파생값).
create table if not exists public.participants (
  id         uuid primary key default gen_random_uuid(),
  study_id   uuid not null references public.studies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_status_allowed
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'kicked')),
  constraint participants_unique unique (study_id, user_id)
);

create index if not exists participants_accepted_idx
  on public.participants (study_id) where status = 'accepted';
create index if not exists participants_user_idx on public.participants (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. 모집글
-- ─────────────────────────────────────────────────────────────────────────
-- likes_count 를 두지 않는다 — likes 를 세면 나온다. comments_count 도 두지 않는다:
-- 제품에 댓글이 없다. views_count 는 남긴다 — 원천 테이블이 없는 진짜 카운터다.
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  study_id    uuid not null references public.studies (id) on delete cascade,
  title       text not null,
  summary     text,
  content     text not null,
  views_count integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint posts_views_nonnegative check (views_count >= 0)
);

create index if not exists posts_study_idx   on public.posts (study_id);
create index if not exists posts_created_idx on public.posts (created_at desc);

create table if not exists public.likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_unique unique (post_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. 채팅
-- ─────────────────────────────────────────────────────────────────────────
-- last_message 사본을 두지 않는다 — chat_messages 에서 최신 한 건을 읽으면 나오고,
-- 아래 인덱스가 그것을 싸게 만든다.
create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  study_id   uuid not null references public.studies (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chats_one_per_study unique (study_id)
);

-- INV-P5: 같은 사람이 같은 방에 두 번 들어가지 않는다 — 유일성으로 강제한다.
create table if not exists public.chat_participants (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid not null references public.chats (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  constraint chat_participants_unique unique (chat_id, user_id)
);

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.chats (id) on delete cascade,
  sender_id  uuid references public.profiles (id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_recent_idx
  on public.chat_messages (chat_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. 알림
-- ─────────────────────────────────────────────────────────────────────────
-- 참조 대상에 외래키를 걸지 않는다. 알림은 "그때 이런 일이 있었다"는 사실 기록이라
-- 원본이 사라져도 문장은 유효해야 한다 — 그래서 화면에 보일 문구를 그때 그대로 담는다.
-- 링크가 죽을 수 있다는 것은 화면이 처리한다.
create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  type           text not null,
  title          text not null,
  body           text,
  reference_type text,
  reference_id   uuid,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. 공통 트리거 — updated_at
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch     on public.profiles;
drop trigger if exists studies_touch      on public.studies;
drop trigger if exists participants_touch on public.participants;
drop trigger if exists posts_touch        on public.posts;

create trigger profiles_touch     before update on public.profiles     for each row execute function public.touch_updated_at();
create trigger studies_touch      before update on public.studies      for each row execute function public.touch_updated_at();
create trigger participants_touch before update on public.participants for each row execute function public.touch_updated_at();
create trigger posts_touch        before update on public.posts        for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 9. INV-P6 — 모집 상태는 파생된다
-- ─────────────────────────────────────────────────────────────────────────
-- 저장된 값이 아니라 함수다. 주인이 둘일 수가 없다 — 다툴 값 자체가 없기 때문이다.
create or replace function public.study_accepted_count(p_study_id uuid) returns integer
language sql stable as $$
  select count(*)::integer from public.participants
   where study_id = p_study_id and status = 'accepted';
$$;

create or replace function public.study_is_recruiting(p_study_id uuid) returns boolean
language sql stable as $$
  select s.closed_at is null
     and s.deleted_at is null
     and public.study_accepted_count(s.id) < s.max_participants
    from public.studies s where s.id = p_study_id;
$$;

comment on function public.study_is_recruiting(uuid) is
  'INV-P6: 모집 중 = 호스트가 닫지 않았고 + 수락 인원 < 정원 + 지워지지 않았다. 저장하지 않는다. (삭제 조건은 0002 가 본문에 넣었고 2026-09-05 에 계약에 올랐다)';

-- ─────────────────────────────────────────────────────────────────────────
-- 10. INV-P1 — 정원 초과 금지 (동시에 들어와도)
-- ─────────────────────────────────────────────────────────────────────────
-- 컬럼 제약이 아니라 트리거로 막는다. 인원수를 저장하지 않기 때문이다 (D1·D2).
--
-- **먼저 스터디 행을 잠근다.** 이것이 경합을 닫는 장치다 — 남은 자리가 하나일 때 두 수락이
-- 동시에 들어오면, 뒤에 온 쪽은 앞선 트랜잭션이 끝날 때까지 이 자리에서 기다린다. 기다린 뒤에
-- 세면 앞선 수락이 이미 반영된 수가 나오므로 정원을 넘기지 않는다.
-- 잠그지 않으면 둘 다 "아직 자리 있음"을 보고 둘 다 통과한다.
create or replace function public.enforce_study_capacity() returns trigger
language plpgsql as $$
declare
  v_max      smallint;
  v_accepted integer;
  v_closed   timestamptz;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  select max_participants, closed_at into v_max, v_closed
    from public.studies where id = new.study_id
    for update;                                  -- ← 경합을 여기서 직렬화한다

  if v_closed is not null then
    raise exception '모집이 마감된 스터디에는 참여자를 수락할 수 없습니다 (INV-P4)'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_accepted
    from public.participants
   where study_id = new.study_id and status = 'accepted';

  if v_accepted > v_max then
    raise exception '정원을 넘겨 수락할 수 없습니다: 정원 %, 수락 % (INV-P1)', v_max, v_accepted
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists participants_capacity on public.participants;
create constraint trigger participants_capacity
  after insert or update of status on public.participants
  deferrable initially immediate
  for each row execute function public.enforce_study_capacity();

-- ─────────────────────────────────────────────────────────────────────────
-- 11. INV-P3 — 정원을 현재 인원보다 작게 줄일 수 없다
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_capacity_not_below_accepted() returns trigger
language plpgsql as $$
declare
  v_accepted integer;
begin
  if new.max_participants >= old.max_participants then
    return new;
  end if;

  select count(*) into v_accepted
    from public.participants
   where study_id = new.id and status = 'accepted';

  if new.max_participants < v_accepted then
    raise exception '이미 참여 중인 인원보다 정원을 작게 줄일 수 없습니다: 수락 %, 요청 % (INV-P3)',
      v_accepted, new.max_participants
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists studies_capacity_floor on public.studies;
create trigger studies_capacity_floor
  before update of max_participants on public.studies
  for each row execute function public.enforce_capacity_not_below_accepted();

-- ─────────────────────────────────────────────────────────────────────────
-- 12. INV-P7 — 끝난 상태에서 되돌아가지 않는다
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_participant_transition() returns trigger
language plpgsql as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('rejected', 'withdrawn', 'kicked') then
    raise exception '끝난 신청(%)의 상태를 바꿀 수 없습니다 (INV-P7)', old.status
      using errcode = 'check_violation';
  end if;

  if old.status = 'pending' and new.status not in ('accepted', 'rejected', 'withdrawn') then
    raise exception '대기 중인 신청은 수락·거절·철회만 가능합니다 (INV-P7): %', new.status
      using errcode = 'check_violation';
  end if;

  if old.status = 'accepted' and new.status not in ('withdrawn', 'kicked') then
    raise exception '참여 중인 멤버는 탈퇴·강퇴만 가능합니다 (INV-P7): %', new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists participants_transition on public.participants;
create trigger participants_transition
  before update of status on public.participants
  for each row execute function public.enforce_participant_transition();

-- ─────────────────────────────────────────────────────────────────────────
-- 13. INV-P5 — 수락되면 그룹 채팅방 참여자가 된다
-- ─────────────────────────────────────────────────────────────────────────
-- 스터디가 만들어질 때: 호스트를 수락된 참여자로 넣고, 그룹 채팅방을 만들고, 호스트를 넣는다.
--
-- **호스트도 참여자 행을 갖는다.** 시안이 "정원 5명 (호스트 포함, 현재 3명)" 이라고 적고 있어서
-- 정원에 호스트가 포함된다. 호스트를 참여자로 두면 "현재 인원"이 수락된 행의 개수 그대로가 되고,
-- 정원 검사도 예외 없이 한 규칙으로 돈다 — 호스트만 따로 세는 분기가 생기지 않는다.
create or replace function public.setup_new_study() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_chat_id uuid;
begin
  -- 채팅방이 먼저다. 참여자 행이 먼저 들어가면 아래 join_study_chat 트리거가 방을 못 찾는다.
  insert into public.chats (study_id) values (new.id)
    on conflict (study_id) do nothing
    returning id into v_chat_id;

  if v_chat_id is null then
    select id into v_chat_id from public.chats where study_id = new.id;
  end if;

  -- 호스트를 수락된 참여자로. 이 행이 들어가면서 join_study_chat 이 호스트를 방에 넣는다.
  insert into public.participants (study_id, user_id, status)
    values (new.id, new.host_id, 'accepted')
    on conflict (study_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists studies_create_chat on public.studies;
drop trigger if exists studies_setup      on public.studies;
create trigger studies_setup
  after insert on public.studies
  for each row execute function public.setup_new_study();

create or replace function public.join_study_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_chat_id uuid;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  select id into v_chat_id from public.chats where study_id = new.study_id;
  if v_chat_id is null then
    raise exception '스터디에 채팅방이 없습니다 — 수락했는데 대화를 시작할 수 없습니다 (INV-P5)';
  end if;

  insert into public.chat_participants (chat_id, user_id)
    values (v_chat_id, new.user_id)
    on conflict (chat_id, user_id) do nothing;   -- 같은 사람이 두 번 들어가지 않는다

  return new;
end;
$$;

drop trigger if exists participants_join_chat on public.participants;
create trigger participants_join_chat
  after insert or update of status on public.participants
  for each row execute function public.join_study_chat();

-- ─────────────────────────────────────────────────────────────────────────
-- 14. INV-Z5 — 행 수준 접근 정책
-- ─────────────────────────────────────────────────────────────────────────
-- **이 절이 이 파일에서 가장 중요하다.** 이 애플리케이션은 서버에서도 공개 키로
-- 데이터베이스에 접근하고 그 키는 브라우저에도 들어간다. 그래서 앱을 거치지 않고
-- 데이터베이스를 직접 부르는 것을 막는 것은 여기 있는 정책뿐이다.
-- 정책이 없으면 INV-Z1~Z4 는 우회 가능한 권고사항이지 계약이 아니다.
--
-- 정책을 켜면 **정책이 허용하지 않는 동작은 전부 거부**된다. 그래서 아래에 없는 동작
-- (예: studies 에 대한 delete)은 그 자체로 금지다 — INV-Z6 의 소프트 삭제가 이렇게 강제된다.

alter table public.categories        enable row level security;
alter table public.profiles          enable row level security;
alter table public.studies           enable row level security;
alter table public.study_sessions    enable row level security;
alter table public.participants      enable row level security;
alter table public.posts             enable row level security;
alter table public.likes             enable row level security;
alter table public.chats             enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.notifications     enable row level security;

-- 판정에 자주 쓰는 두 가지를 함수로 둔다. security definer 인 이유는 정책 안에서
-- 같은 테이블을 다시 읽으면 정책이 재귀하기 때문이다.
create or replace function public.is_study_host(p_study_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.studies where id = p_study_id and host_id = p_user_id);
$$;

create or replace function public.is_chat_member(p_chat_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_participants where chat_id = p_chat_id and user_id = p_user_id);
$$;

-- 분류: 누구나 읽고, 아무도 못 쓴다(쓰기 정책이 없다 = 거부).
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);

-- 프로필: 발견이 공개라 이름·소개는 누구나 본다. 고치는 것은 본인만.
drop policy if exists profiles_read       on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_read       on public.profiles for select using (true);
create policy profiles_insert_own on public.profiles for insert with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 스터디: 지워지지 않은 것은 누구나 본다(발견은 로그인 앞에 있다). 호스트는 자기 것을
-- 지워진 뒤에도 본다. 만드는 것은 자기를 호스트로만. 고치는 것은 호스트만.
-- **delete 정책이 없다** — INV-Z6. 삭제는 deleted_at 을 채우는 update 다.
drop policy if exists studies_read        on public.studies;
drop policy if exists studies_insert_host on public.studies;
drop policy if exists studies_update_host on public.studies;
create policy studies_read on public.studies for select
  using (deleted_at is null or host_id = (select auth.uid()));
create policy studies_insert_host on public.studies for insert
  with check (host_id = (select auth.uid()));
create policy studies_update_host on public.studies for update
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));

-- 요일·시간: 스터디를 볼 수 있으면 보이고, 쓰는 것은 그 스터디의 호스트만.
drop policy if exists sessions_read       on public.study_sessions;
drop policy if exists sessions_write_host on public.study_sessions;
drop policy if exists sessions_del_host   on public.study_sessions;
create policy sessions_read on public.study_sessions for select using (true);
create policy sessions_write_host on public.study_sessions for insert
  with check (public.is_study_host(study_id, (select auth.uid())));
create policy sessions_del_host on public.study_sessions for delete
  using (public.is_study_host(study_id, (select auth.uid())));

-- 참여자: 그 스터디의 호스트와 본인만 본다. 신청은 자기 것을 대기 상태로만 넣을 수 있다.
-- INV-Z2: 상태를 바꾸는 것은 호스트만 — 단, 본인의 탈퇴는 본인이 한다.
drop policy if exists participants_read        on public.participants;
drop policy if exists participants_apply_self  on public.participants;
drop policy if exists participants_update_host on public.participants;
drop policy if exists participants_update_self on public.participants;
create policy participants_read on public.participants for select
  using (user_id = (select auth.uid()) or public.is_study_host(study_id, (select auth.uid())));
create policy participants_apply_self on public.participants for insert
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy participants_update_host on public.participants for update
  using (public.is_study_host(study_id, (select auth.uid())))
  with check (public.is_study_host(study_id, (select auth.uid())));
create policy participants_update_self on public.participants for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'withdrawn');

-- 모집글: 누구나 읽는다. 쓰는 것은 작성자만 (INV-Z3).
drop policy if exists posts_read           on public.posts;
drop policy if exists posts_insert_author  on public.posts;
drop policy if exists posts_update_author  on public.posts;
drop policy if exists posts_delete_author  on public.posts;
create policy posts_read on public.posts for select using (true);
create policy posts_insert_author on public.posts for insert
  with check (author_id = (select auth.uid()));
create policy posts_update_author on public.posts for update
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy posts_delete_author on public.posts for delete
  using (author_id = (select auth.uid()));

-- 좋아요: 누구나 세고, 자기 것만 넣고 뺀다.
drop policy if exists likes_read       on public.likes;
drop policy if exists likes_write_self on public.likes;
drop policy if exists likes_del_self   on public.likes;
create policy likes_read       on public.likes for select using (true);
create policy likes_write_self on public.likes for insert with check (user_id = (select auth.uid()));
create policy likes_del_self   on public.likes for delete using (user_id = (select auth.uid()));

-- 채팅: 방 참여자만 본다. 방과 참여자 행은 트리거(security definer)가 만들고,
-- 사람이 직접 만들거나 지우는 정책은 두지 않는다.
drop policy if exists chats_read_member    on public.chats;
drop policy if exists chatpart_read_member on public.chat_participants;
drop policy if exists chatpart_touch_self  on public.chat_participants;
drop policy if exists messages_read_member on public.chat_messages;
drop policy if exists messages_send_member on public.chat_messages;
create policy chats_read_member on public.chats for select
  using (public.is_chat_member(id, (select auth.uid())));
create policy chatpart_read_member on public.chat_participants for select
  using (public.is_chat_member(chat_id, (select auth.uid())));
create policy chatpart_touch_self on public.chat_participants for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy messages_read_member on public.chat_messages for select
  using (public.is_chat_member(chat_id, (select auth.uid())));
create policy messages_send_member on public.chat_messages for insert
  with check (sender_id = (select auth.uid()) and public.is_chat_member(chat_id, (select auth.uid())));

-- 알림: 자기 것만.
drop policy if exists notifications_read_own   on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_read_own on public.notifications for select
  using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete
  using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────
-- 15. INV-Z7 — 파일 저장소
-- ─────────────────────────────────────────────────────────────────────────
-- 들여온 구조에는 "모든 사용자에게 읽기 허용"이라는 이름으로 **삭제를 모두에게 허용하는**
-- 정책이 있었다. 이름과 동작이 어긋나 있었다. 여기서는 올린 사람만 고치고 지운다.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists avatars_read       on storage.objects;
drop policy if exists avatars_write_self on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');
create policy avatars_write_self on storage.objects for insert
  with check (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
