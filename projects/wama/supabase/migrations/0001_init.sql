-- wama 초기 스키마 — docs/specs/auth-isolation.md (approved) 구현
-- 격리 원칙: 모든 접근은 요청자 teacher의 academy_id로 스코프되며 RLS로 서버 강제한다.
-- INV 매핑은 각 정책/함수 주석에 표기.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 테이블
-- ─────────────────────────────────────────────────────────────

create table academy (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  join_code  text not null unique,          -- 재사용 참여 코드 (INV-A6)
  created_at timestamptz not null default now()
);

-- teacher.id = auth.users.id. academy_id NOT NULL → 소속 없는 teacher 불가 (INV-A4)
create table teacher (
  id         uuid primary key references auth.users(id) on delete cascade,
  academy_id uuid not null references academy(id) on delete cascade,
  name       text,
  created_at timestamptz not null default now()
);
create index teacher_academy_idx on teacher(academy_id);

create table student (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academy(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  age        int  check (age is null or age between 1 and 120),
  school     text,
  created_at timestamptz not null default now()
);
create index student_academy_idx on student(academy_id);

create table schedule (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academy(id) on delete cascade,
  student_id uuid not null references student(id) on delete cascade,
  subject    text not null check (length(trim(subject)) > 0),
  weekday    smallint not null check (weekday between 0 and 6),  -- 0=일 … 6=토
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index schedule_student_idx on schedule(student_id);

-- 월간 평가. period_month = 'YYYY-MM'. author_teacher_id는 작성자, 이후 불변 (INV-A8)
create table evaluation (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references academy(id) on delete cascade,
  student_id        uuid not null references student(id) on delete cascade,
  subject           text not null check (length(trim(subject)) > 0),
  period_month      text not null check (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  content           text,
  author_teacher_id uuid not null references teacher(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (student_id, subject, period_month)
);
create index evaluation_student_idx on evaluation(student_id);

-- ─────────────────────────────────────────────────────────────
-- 헬퍼: 현재 요청자의 academy_id (정책에서 사용)
-- security definer + 고정 search_path. 소속 없으면 NULL → 모든 정책이 거부 (INV-A1/A4)
-- ─────────────────────────────────────────────────────────────
create or replace function current_academy_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select academy_id from teacher where id = auth.uid()
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS — 모든 테이블 활성화. 인증(authenticated) + academy_id 격리
-- INV-A1: 인증 없으면 접근 불가 (to authenticated) / auth.uid() 없으면 current_academy_id()=NULL
-- INV-A2: 조회·수정·삭제는 내 학원 행만 (USING)
-- INV-A3: write의 academy_id는 내 학원으로 강제 (WITH CHECK)
-- ─────────────────────────────────────────────────────────────
alter table academy    enable row level security;
alter table teacher    enable row level security;
alter table student    enable row level security;
alter table schedule   enable row level security;
alter table evaluation enable row level security;

-- academy: 내 학원만 조회. 생성·코드 변경은 RPC(정의자 권한)로만 → 직접 write 정책 없음
create policy academy_select on academy for select to authenticated
  using (id = current_academy_id());

-- teacher: 같은 학원 구성원 조회. 본인 행만 수정하되 academy_id는 못 바꿈 (INV-A5)
-- 직접 insert/delete 정책 없음 → 가입은 RPC로만
create policy teacher_select on teacher for select to authenticated
  using (academy_id = current_academy_id());
create policy teacher_update_self on teacher for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and academy_id = current_academy_id());

-- student / schedule / evaluation: 같은 학원 내 공유 CRUD (공유 편집)
create policy student_all on student for all to authenticated
  using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

create policy schedule_all on schedule for all to authenticated
  using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

create policy evaluation_all on evaluation for all to authenticated
  using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

-- ─────────────────────────────────────────────────────────────
-- INV-A8: 평가 작성자 불변 + insert 시 작성자·academy 서버 강제
-- ─────────────────────────────────────────────────────────────
create or replace function evaluation_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_teacher_id := auth.uid();          -- 작성자는 요청자로 강제
    new.academy_id := current_academy_id();       -- academy_id 서버 강제 (INV-A3 보강)
  elsif tg_op = 'UPDATE' then
    new.author_teacher_id := old.author_teacher_id; -- 작성자 불변 (INV-A8)
    new.academy_id := old.academy_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;

-- risk-surface-exempt: concurrency 이 트리거는 파생 상태 갱신이 아니라 INV-A8(작성자 불변·academy 서버 강제) 강제 장치 — 실제 표면은 authz 이고 auth-isolation.md 가 커버한다
create trigger evaluation_guard_trg
  before insert or update on evaluation
  for each row execute function evaluation_guard();

-- ─────────────────────────────────────────────────────────────
-- 가입/참여 RPC — 소속 지정은 서버에서만 (INV-A4/A5/A6)
-- 모두 security definer: teacher 행 생성/조정을 RLS 밖에서 원자적으로 수행
-- ─────────────────────────────────────────────────────────────

-- 새 학원 생성 + 본인을 소속시킴. 이미 소속이 있으면 거부(정확히 1개 소속: INV-A4)
create or replace function create_academy_and_join(academy_name text, teacher_name text default null)
  returns academy
  language plpgsql security definer set search_path = public as $$
declare
  a academy;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from teacher where id = auth.uid()) then
    raise exception 'already belongs to an academy';
  end if;
  insert into academy(name, join_code)
    values (academy_name, upper(encode(gen_random_bytes(6), 'hex')))
    returning * into a;
  insert into teacher(id, academy_id, name) values (auth.uid(), a.id, teacher_name);
  return a;
end $$;

-- 참여 코드로 기존 학원 참여. 코드는 서버에서만 검증(INV-A6), 무효면 거부.
-- 이미 소속이 있으면 거부(임의 학원 변경 금지: INV-A5)
create or replace function join_academy(code text, teacher_name text default null)
  returns academy
  language plpgsql security definer set search_path = public as $$
declare
  a academy;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from teacher where id = auth.uid()) then
    raise exception 'already belongs to an academy';
  end if;
  select * into a from academy where join_code = code;
  if not found then raise exception 'invalid join code'; end if;   -- INV-A6
  insert into teacher(id, academy_id, name) values (auth.uid(), a.id, teacher_name);
  return a;
end $$;

-- 참여 코드 재발급 — 이전 코드 무효화(INV-A6). 요청자 학원에 한함.
create or replace function regenerate_join_code()
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  new_code text;
  aid uuid := current_academy_id();
begin
  if aid is null then raise exception 'no academy'; end if;
  new_code := upper(encode(gen_random_bytes(6), 'hex'));
  update academy set join_code = new_code where id = aid;
  return new_code;
end $$;
