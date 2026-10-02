-- 팬꾹 첫 스키마 (결정 카드 d9, 2026-10-02 「추천대로 진행」).
--
-- 읽기·쓰기 방식
-- - 표를 직접 읽는 권한은 아무에게도 주지 않는다. 모든 표에 RLS 를 켜고 정책을 두지 않으며,
--   anon·authenticated 의 표 권한도 걷는다. 화면은 아래 읽기 함수로만 읽는다 — 함수가 auth.uid() 로
--   로그인한 사람을 확인하고 보여도 되는 칸만 돌려준다.
-- - 돈과 상태를 바꾸는 쓰기 함수는 service_role(앱 서버 키)만 부를 수 있다. 앱 서버가 로그인 확인 →
--   입력 검사 → 금액 계산을 한 뒤 부른다.
-- - 실명·주소·전화번호는 여기 없다. pii 구역은 supabase/manual/ 의 파일을 사람이 적용한다.
--
-- 이 파일은 최초 생성 파일이다 — 조건 없는 update/delete 를 넣지 않는다.

create extension if not exists pgcrypto with schema extensions;

-- ── 값 목록 ──────────────────────────────────────────────

create type public.user_role as enum ('fan', 'creator', 'operator');

-- 크리에이터 승인은 상태가 아니라 approved_at 칸이다(2026-10-02: 승인을 기다리지 않고 보낸다 —
-- 승인은 입고·검수와 나란히 언제든 올 수 있고 출고 전에만 있으면 된다).
-- pending_payment: 결제가 끝나기 전. 크리에이터에게 보이지 않는다(INV-M6).
create type public.order_status as enum (
  'pending_payment', 'registered', 'received', 'labeled', 'inspected',
  'label_printed', 'shipped', 'rejected', 'expired', 'canceled'
);

create type public.parcel_tier as enum ('small', 'medium', 'oversize');
create type public.payment_status as enum ('pending', 'confirming', 'done', 'failed');
create type public.approval_request_status as enum ('waiting', 'approved', 'declined', 'expired');

-- ── 표 ──────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique check (login_id ~ '^[a-z0-9_]{4,30}$'),
  nickname text not null check (char_length(nickname) between 1 and 20),
  role public.user_role not null,
  created_at timestamptz not null default now()
);

-- 크리에이터 공개 정보. 계정(profile_id)이 없는 크리에이터도 둘 수 있다(가입 전 예시·초대).
create table public.creators (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 20),
  channel text not null,
  channel_title text not null default '',
  category text not null default '',
  intro text not null default '',
  alias text not null default '',
  avg_approval_hours integer check (avg_approval_hours >= 0),
  face_tone text not null default 'var(--face-1)',
  -- 본인 확인을 마친 크리에이터만 찾기 목록에 나온다
  identity_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique check (order_no ~ '^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$'),
  fan_id uuid not null references public.profiles (id),
  creator_id uuid not null references public.creators (id),
  item_kind text not null check (char_length(item_kind) between 1 and 60),
  has_electronics_or_metal boolean not null,
  status public.order_status not null default 'pending_payment',
  created_at timestamptz not null default now(),
  registered_at timestamptz, -- 결제가 끝나 등록된 시각
  approved_at timestamptz,
  received_at timestamptz,
  inspection_result text check (inspection_result in ('passed', 'returned')),
  inspected_at timestamptz,
  shipped_at timestamptz,
  expected_arrival_date date,
  delivery text check (delivery in ('in_transit', 'delivered')),
  outbound_waybill_no text, -- 크리에이터행 송장. 팬에게 주지 않는다
  fan_tracking_no text check (fan_tracking_no ~ '^[0-9]{10,14}$'),
  check ((inspection_result is null) = (inspected_at is null)),
  check (status = 'pending_payment' or registered_at is not null)
);
create index orders_fan_idx on public.orders (fan_id, registered_at desc);
create index orders_creator_idx on public.orders (creator_id, registered_at);

create table public.boxes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- 상자 수 상한은 등록 입력 경계(MAX_BOX_COUNT = 10)와 같게 DB 에도 둔다
  seq smallint not null check (seq between 1 and 10),
  -- 중형을 넘는 상자는 받지 않는다(INV-M1) — 신고 구간에 oversize 는 들어올 수 없다
  declared_tier public.parcel_tier not null check (declared_tier <> 'oversize'),
  measured_tier public.parcel_tier,
  unique (order_id, seq)
);

-- 결제 한 건. 첫 결제(initial)와 상자별 차액(difference).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  kind text not null check (kind in ('initial', 'difference')),
  box_id uuid references public.boxes (id),
  toss_order_id text not null unique check (toss_order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  amount_krw integer not null check (amount_krw > 0),
  goods_krw integer not null check (goods_krw >= 0),
  service_fee_krw integer not null check (service_fee_krw >= 0),
  shipping_fee_krw integer not null check (shipping_fee_krw >= 0),
  status public.payment_status not null default 'pending',
  payment_key text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  -- INV-M7: 세 칸의 합 = 결제 금액
  constraint payments_breakdown_sum check (goods_krw + service_fee_krw + shipping_fee_krw = amount_krw),
  check ((kind = 'difference') = (box_id is not null)),
  check ((status = 'done') = (payment_key is not null))
);
-- INV-M5: 한 주문의 첫 결제 완료는 하나
create unique index payments_one_done_initial on public.payments (order_id) where kind = 'initial' and status = 'done';
-- INV-M11: 한 상자의 차액 요청은 하나
create unique index payments_one_difference_per_box on public.payments (box_id) where kind = 'difference';

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique check (request_id ~ '^apr_[0-9A-Za-z]{1,40}$'),
  order_id uuid not null references public.orders (id),
  payload text not null,
  created_at timestamptz not null,
  status public.approval_request_status not null default 'waiting',
  decided_at timestamptz,
  check ((status = 'waiting') = (decided_at is null))
);
-- 한 주문에 열린 요청은 하나, 승인된 요청도 하나(INV-S5)
create unique index approval_requests_one_open on public.approval_requests (order_id) where status = 'waiting';
create unique index approval_requests_one_approved on public.approval_requests (order_id) where status = 'approved';

-- 주소 열람 기록(INV-P7). 쓰기는 복호화 전용 역할만, 수정·삭제는 아무도.
create table public.decrypt_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  order_id uuid not null references public.orders (id),
  requester_id uuid not null,
  result text not null check (result in ('opened', 'denied')),
  print_no smallint check (print_no between 1 and 3),
  deny_reason text check (deny_reason in (
    'not_owner', 'no_valid_approval', 'order_mismatch', 'order_not_printable', 'difference_unpaid', 'decrypt_limit_reached'
  )),
  check ((result = 'opened') = (print_no is not null and deny_reason is null)),
  check ((result = 'denied') = (deny_reason is not null and print_no is null))
);

create table public.follows (
  fan_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.creators (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fan_id, creator_id)
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  title text not null check (char_length(title) between 1 and 100),
  body jsonb not null, -- 본문 덩어리 배열(제목·문단·목록·서명)
  published_at timestamptz not null,
  pinned boolean not null default false
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 4000),
  answer text,
  answered_at timestamptz,
  status text not null default 'open' check (status in ('open', 'answered')),
  created_at timestamptz not null default now(),
  check ((status = 'answered') = (answer is not null and answered_at is not null))
);

-- ── 표 직접 접근 차단 ───────────────────────────────────

alter table public.profiles enable row level security;
alter table public.creators enable row level security;
alter table public.orders enable row level security;
alter table public.boxes enable row level security;
alter table public.payments enable row level security;
alter table public.approval_requests enable row level security;
alter table public.decrypt_log enable row level security;
alter table public.follows enable row level security;
alter table public.notices enable row level security;
alter table public.inquiries enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- 앞으로 만드는 표도 기본으로 닫는다
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
-- 함수 실행 권한을 PUBLIC 에 주는 것은 전역 기본값이라 스키마 단위로는 걷히지 않는다 — 전역으로 걷는다.
-- (postgres 가 만드는 함수에 적용. 그래도 함수마다 revoke·grant 를 적는다 — 0002 이후 파일 참고)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ── 열람 기록: 고치거나 지울 수 없다(INV-P7) ─────────────

-- 복호화 함수 전용 역할. 로그인할 수 없고, 복호화 함수가 붙을 때 이 역할로 접속하는 사용자를 따로 만든다.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'address_decryptor') then
    create role address_decryptor nologin;
  end if;
end $$;

revoke all on public.decrypt_log from service_role;
grant select on public.decrypt_log to service_role;
grant usage on schema public to address_decryptor;
grant select, insert on public.decrypt_log to address_decryptor;
-- RLS 가 켜져 있으므로 이 역할에만 넣기·읽기 정책을 준다. 고치기·지우기 정책은 어느 역할에도 없다.
create policy decrypt_log_append on public.decrypt_log for insert to address_decryptor with check (true);
create policy decrypt_log_read on public.decrypt_log for select to address_decryptor using (true);
-- 로컬 Supabase 의 postgres 는 슈퍼유저가 아니라서, 이 역할로 바꿔 확인하려면 소속이 있어야 한다(통합 테스트 INV-P7)
grant address_decryptor to postgres;

create function public.decrypt_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'decrypt_log 는 고치거나 지울 수 없다 (INV-P7)' using errcode = '42501';
end $$;

create trigger decrypt_log_no_update before update or delete on public.decrypt_log
  for each row execute function public.decrypt_log_append_only();
create trigger decrypt_log_no_truncate before truncate on public.decrypt_log
  for each statement execute function public.decrypt_log_append_only();

-- ── 결제 완료 전 승인 요청 금지(INV-M6) ──────────────────

create function public.approval_request_requires_payment() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from public.payments p
    where p.order_id = new.order_id and p.kind = 'initial' and p.status = 'done'
  ) then
    raise exception '결제가 끝나지 않은 주문에는 승인 요청을 만들 수 없다 (INV-M6)' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger approval_requests_require_payment before insert on public.approval_requests
  for each row execute function public.approval_request_requires_payment();

-- ── 승인 상태를 바꾸는 입구는 approve_request 하나(INV-S7) ──

-- approve_request 만 이 트랜잭션 안에서 표시를 켠다. 다른 경로(표 직접 갱신·직접 삽입)로
-- 주문의 approved_at 이나 요청의 approved 상태를 만들면 거부한다.
-- 표마다 함수를 따로 둔다 — 한 함수에서 두 표의 칸을 같이 비교하면 다른 표의 값 목록으로 해석하다 실패한다.
create function public.approval_change_allowed() returns boolean
language sql stable as $$
  select coalesce(current_setting('fankkuk.approving', true), '') = 'on';
$$;

create function public.guard_order_approval() returns trigger
language plpgsql as $$
begin
  if public.approval_change_allowed() then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.approved_at is not null)
     or (tg_op = 'UPDATE' and new.approved_at is distinct from old.approved_at) then
    raise exception '승인은 approve_request 로만 바꿀 수 있다 (INV-S7)' using errcode = '42501';
  end if;
  return new;
end $$;

create function public.guard_request_approval() returns trigger
language plpgsql as $$
begin
  if public.approval_change_allowed() then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.status = 'approved')
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and 'approved' in (new.status, old.status)) then
    raise exception '승인은 approve_request 로만 바꿀 수 있다 (INV-S7)' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger orders_guard_approval before insert or update on public.orders
  for each row execute function public.guard_order_approval();
create trigger approval_requests_guard_approval before insert or update on public.approval_requests
  for each row execute function public.guard_request_approval();
