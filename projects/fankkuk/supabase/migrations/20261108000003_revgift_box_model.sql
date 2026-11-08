-- 선물함(팬에게 보내기) 1부 — 데이터 모델과 요금. 스펙: docs/specs/revgift-box.md (INV-GB2·GB3·GB13~GB17), 순서: workspace/revgift-box-plan.md.
--
-- 이 파일은 개인정보 구역(pii)을 건드리지 않는다. 신청의 주소 사본(2부)·할증 구분 읽기(3부)는 사람이 적용하는 manual SQL 로 따로 간다.
-- 명세서 쓰기 함수는 할증 구분을 인자로 받는다 — 3부의 명세서 생성 함수가 pii 의 구분 읽기 함수로 읽어 넘긴다.
-- 옛 역조공(revgift_sends·revgift_shares)은 그대로 둔다(INV-GB22 는 4부).
--
-- 1) 표: 선물함 · 신청 · 큰 상자 · 명세서 · 명세서 줄. 화면 쪽 키(anon·authenticated)에는 아무 권한이 없다 — 읽기·쓰기 함수는 2~4부.
-- 2) 서비스료 설정값(정가 700 · 초기 300, 대표만 바꿈, 변경 기록) — 정할 것 Q19.
-- 3) 초기 크리에이터: 순번(1~50, 승인 처리 안에서 카운터 줄을 잠그고 매김) · 기능 전 확인된 크리에이터 순번 채우기 · 월 사용(≤ 30).
-- 4) 요금 함수: 택배비/개인접수 실비 · 할증 · 그 달 300원 줄 세기 · 명세서 쓰기(계산과 저장이 한 처리).
--
-- 오류 코드: 22023 입력 꼴(구간·실비·할증 구분·실측 안 된 신청) · 42501 대표가 아님 · 23505 명세서 둘째.

-- ── 규칙 값 ────────────────────────────────────────────
-- 스펙에 고정된 값(Q19 — 초기 혜택 기준은 약속이라 설정값이 아니다). 아래 표 제약의 숫자와 같다 — 시험이 이 함수로 경계를 읽는다.
create or replace function public.revgift_box_rules()
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'capacity_max', 100,        -- INV-GB3 받을 인원
    'name_max', 40,             -- INV-GB3 이름 (Q3)
    'early_max_rank', 50,       -- INV-GB14 초기 크리에이터
    'early_months', 3,          -- INV-GB14 혜택 기간(달력 개월, Q14)
    'early_monthly_lines', 30,  -- INV-GB15 한 달 300원 줄
    'personal_max_krw', 100000, -- INV-GB16 개인접수 실비 상한 (Q13)
    'cod_max_krw', 100000       -- INV-GB13 착불 큰 상자 택배비 상한 (Q13)
  )
$$;

-- ── 1) 표 ──────────────────────────────────────────────

-- 선물함. 상태 전환은 2~4부의 함수만 한다(INV-GB1) — 표는 값의 꼴만 지킨다.
create table public.revgift_boxes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),          -- 만든 크리에이터 계정
  creator_id uuid not null references public.creators (id),        -- 그 크리에이터 페이지(팔로우가 걸리는 곳)
  name text not null check (char_length(name) between 1 and 40 and btrim(name) <> ''),
  capacity smallint not null check (capacity between 1 and 100),
  is_public boolean not null,
  -- 비공개만 초대 토큰이 있다. 추측할 수 없는 값(2부가 만든다) — 6자리·주문번호와 다른 꼴
  invite_token text unique check (invite_token ~ '^[A-Za-z0-9_-]{22,64}$'),
  status text not null default 'open'
    check (status in ('open', 'closed', 'awaiting_box', 'arrived', 'held', 'invoiced', 'overdue', 'paid', 'returning', 'returned', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint revgift_boxes_token_iff_private check (is_public = (invite_token is null))
);
create index revgift_boxes_creator_idx on public.revgift_boxes (creator_id, created_at desc);
alter table public.revgift_boxes enable row level security;
revoke all on public.revgift_boxes from anon, authenticated;

-- 신청 = 선물함 안에서 팬 한 명 몫(INV-GB2). 주소 사본은 pii 쪽 표(2부)에 있다 — 여기에는 사람 칸이 계정 id 뿐이다.
create table public.revgift_box_applications (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.revgift_boxes (id) on delete cascade,
  fan_id uuid not null references public.profiles (id),
  status text not null default 'applied'
    check (status in ('applied', 'excluded', 'withdrawn', 'selected', 'measured', 'missing', 'rejected', 'paid', 'shipped', 'delivered', 'ended')),
  chosen_tier text check (chosen_tier in ('xsmall', 'small', 'medium', 'large')), -- 크리에이터가 2페이지에서 고른 구간(표시용, 명세서는 실측)
  applied_at timestamptz not null default now(),
  unique (box_id, fan_id)
);
create index revgift_box_applications_fan_idx on public.revgift_box_applications (fan_id);
alter table public.revgift_box_applications enable row level security;
revoke all on public.revgift_box_applications from anon, authenticated;

-- 큰 상자(크리에이터가 팬꾹으로 보낸 상자). 착불 금액은 입고 때 운영자가 넣는다(INV-GB13, Q13 — 0~100,000원).
create table public.revgift_box_cartons (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.revgift_boxes (id) on delete cascade,
  cod_fee_krw integer not null default 0 check (cod_fee_krw between 0 and 100000),
  received_at timestamptz not null default now()
);
create index revgift_box_cartons_box_idx on public.revgift_box_cartons (box_id);
alter table public.revgift_box_cartons enable row level security;
revoke all on public.revgift_box_cartons from anon, authenticated;

-- 명세서 — 선물함마다 하나. 칸 넷의 합 = 결제 금액(payment INV-M7 과 같은 꼴). 배송비 칸 = 줄의 택배비·할증 합 + 착불 큰 상자 택배비.
create table public.revgift_box_invoices (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null unique references public.revgift_boxes (id) on delete cascade,
  amount_krw integer not null check (amount_krw > 0),
  shipping_fee_krw integer not null check (shipping_fee_krw >= 0),
  service_fee_krw integer not null check (service_fee_krw >= 0),
  inspection_fee_krw integer not null default 0 check (inspection_fee_krw = 0),
  goods_krw integer not null default 0 check (goods_krw = 0),
  carton_cod_krw integer not null default 0 check (carton_cod_krw >= 0 and carton_cod_krw <= shipping_fee_krw),
  created_at timestamptz not null default now(),
  constraint revgift_box_invoices_breakdown_sum check (shipping_fee_krw + service_fee_krw + inspection_fee_krw + goods_krw = amount_krw)
);
alter table public.revgift_box_invoices enable row level security;
revoke all on public.revgift_box_invoices from anon, authenticated;

-- 명세서 줄 = 팬 한 명 몫. 구간은 실측 구간, 넘으면 「개인접수」(oversize, 택배비 칸 = 운영자가 넣은 우체국 실비).
create table public.revgift_box_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.revgift_box_invoices (id) on delete cascade,
  application_id uuid not null unique references public.revgift_box_applications (id) on delete cascade,
  line_no smallint not null check (line_no >= 1),
  tier text not null check (tier in ('xsmall', 'small', 'medium', 'large', 'oversize')),
  shipping_fee_krw integer not null check (shipping_fee_krw >= 0),
  surcharge_region text not null check (surcharge_region in ('none', 'jeju', 'island')),
  surcharge_krw integer not null check (surcharge_krw >= 0),
  service_fee_krw integer not null check (service_fee_krw >= 0),
  early_rate boolean not null, -- 초기 크리에이터 서비스료로 적은 줄(월 사용으로 센 줄)
  amount_krw integer not null,
  unique (invoice_id, line_no),
  constraint revgift_box_invoice_lines_sum check (shipping_fee_krw + surcharge_krw + service_fee_krw = amount_krw),
  check (surcharge_region <> 'none' or surcharge_krw = 0)
);
alter table public.revgift_box_invoice_lines enable row level security;
revoke all on public.revgift_box_invoice_lines from anon, authenticated;

-- INV-GB13: 줄 칸의 합(+ 착불 큰 상자 택배비) = 명세서의 같은 칸. 한 처리의 끝(커밋)에 본다 — 명세서와 줄을 차례로 넣는 동안은 어긋나 있다.
create function public.revgift_box_invoice_sum_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v public.revgift_box_invoices;
  v_ship integer;
  v_service integer;
begin
  -- 두 표의 줄 꼴이 달라 칸 이름을 표마다 따로 읽는다(한 식에 섞으면 없는 칸을 읽는 오류가 난다)
  if tg_table_name = 'revgift_box_invoices' then
    v_invoice_id := new.id;
  elsif tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;
  select * into v from public.revgift_box_invoices where id = v_invoice_id;
  if not found then
    return null; -- 명세서째 지워졌다
  end if;
  select coalesce(sum(l.shipping_fee_krw + l.surcharge_krw), 0), coalesce(sum(l.service_fee_krw), 0)
  into v_ship, v_service
  from public.revgift_box_invoice_lines l where l.invoice_id = v_invoice_id;
  if v.shipping_fee_krw <> v_ship + v.carton_cod_krw or v.service_fee_krw <> v_service then
    raise exception '명세서 칸과 줄 칸의 합이 다르다' using errcode = '23514';
  end if;
  return null;
end $$;
revoke all on function public.revgift_box_invoice_sum_check() from public, anon, authenticated;

create constraint trigger revgift_box_invoices_sum_match after insert or update on public.revgift_box_invoices
  deferrable initially deferred for each row execute function public.revgift_box_invoice_sum_check();
create constraint trigger revgift_box_invoice_lines_sum_match after insert or update or delete on public.revgift_box_invoice_lines
  deferrable initially deferred for each row execute function public.revgift_box_invoice_sum_check();

-- ── 2) 서비스료 설정값 (Q19) ──────────────────────────

alter table public.pricing_settings add column if not exists box_service_fee_krw integer not null default 700;
alter table public.pricing_settings add column if not exists box_early_service_fee_krw integer not null default 300;
alter table public.pricing_settings add constraint pricing_settings_box_service_fees
  check (box_early_service_fee_krw >= 0 and box_early_service_fee_krw <= box_service_fee_krw and box_service_fee_krw <= 100000);

alter table public.pricing_setting_changes drop constraint pricing_setting_changes_item_check;
alter table public.pricing_setting_changes add constraint pricing_setting_changes_item_check
  check (item in ('route_cost', 'default_route', 'fan_send_fee', 'box_service_fee', 'box_early_service_fee'));

-- 대표만. 바뀐 칸마다 기록 한 줄. 이미 만든 명세서는 다시 계산하지 않는다(INV-GB13).
create function public.admin_save_box_service_fees(p_regular_krw integer, p_early_krw integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.pricing_settings;
begin
  if not public.is_owner() then
    raise exception '요금은 대표만 바꾼다' using errcode = '42501';
  end if;
  if p_regular_krw is null or p_early_krw is null or p_early_krw < 0 or p_early_krw > p_regular_krw or p_regular_krw > 100000 then
    raise exception '서비스료는 0 ≤ 초기 크리에이터 ≤ 정가 ≤ 100,000원' using errcode = '22023';
  end if;
  select * into v from public.pricing_settings for update;
  if v.box_service_fee_krw <> p_regular_krw then
    insert into public.pricing_setting_changes (changed_by, item, before_value, after_value)
    values (auth.uid(), 'box_service_fee', v.box_service_fee_krw::text, p_regular_krw::text);
  end if;
  if v.box_early_service_fee_krw <> p_early_krw then
    insert into public.pricing_setting_changes (changed_by, item, before_value, after_value)
    values (auth.uid(), 'box_early_service_fee', v.box_early_service_fee_krw::text, p_early_krw::text);
  end if;
  update public.pricing_settings set box_service_fee_krw = p_regular_krw, box_early_service_fee_krw = p_early_krw where id;
end $$;

-- 대표·직원 읽기
create function public.admin_box_service_fees()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  return (select jsonb_build_object('regular_krw', s.box_service_fee_krw, 'early_krw', s.box_early_service_fee_krw) from public.pricing_settings s);
end $$;

revoke all on function public.admin_save_box_service_fees(integer, integer) from public, anon;
revoke all on function public.admin_box_service_fees() from public, anon;
grant execute on function public.admin_save_box_service_fees(integer, integer) to authenticated;
grant execute on function public.admin_box_service_fees() to authenticated;

-- ── 3) 초기 크리에이터 (INV-GB14·GB15) ─────────────────

-- 순번 1~50 만 저장한다. 51번째부터는 줄이 없다 = 초기 크리에이터가 아니다. 한 번 받은 순번은 바뀌지 않는다(Q14).
create table public.early_creators (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  rank smallint not null unique check (rank between 1 and 50),
  granted_at timestamptz not null -- 순번을 받은 승인 시각 = 혜택 기간의 시작
);
alter table public.early_creators enable row level security;
revoke all on public.early_creators from anon, authenticated;

-- 순번 카운터 한 줄. 매긴 마지막 순번(0~50). 이 줄을 잠근 뒤 매긴다 — 마지막 자리에 승인 둘이 와도 한 명.
create table public.early_creator_counter (
  id boolean primary key default true check (id),
  last_rank smallint not null default 0 check (last_rank between 0 and 50)
);
alter table public.early_creator_counter enable row level security;
revoke all on public.early_creator_counter from anon, authenticated;
insert into public.early_creator_counter (id, last_rank) values (true, 0) on conflict (id) do nothing;

-- 한 크리에이터의 한 달(한국 시간 달력 달의 1일) 300원 줄 사용. 이 줄을 잠근 뒤 센다.
create table public.early_creator_monthly_usage (
  creator_id uuid not null references public.creators (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  used smallint not null default 0 check (used between 0 and 30),
  primary key (creator_id, month)
);
alter table public.early_creator_monthly_usage enable row level security;
revoke all on public.early_creator_monthly_usage from anon, authenticated;

-- 승인 기록 한 줄이 들어갈 때(운영자 승인·로그인 확인 모두 같은 처리에서 이 줄을 남긴다, creator-verification INV-V7) 순번을 매긴다.
-- 이미 순번이 있으면 그대로(재승인), 50 이 찼으면 매기지 않는다.
create function public.early_creator_on_approve()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_last smallint;
begin
  if new.action <> 'approve' then
    return null;
  end if;
  select c.last_rank into v_last from public.early_creator_counter c where c.id for update;
  if exists (select 1 from public.early_creators e where e.creator_id = new.creator_id) or v_last >= 50 then
    return null;
  end if;
  update public.early_creator_counter set last_rank = v_last + 1 where id;
  insert into public.early_creators (creator_id, rank, granted_at) values (new.creator_id, v_last + 1, new.at);
  return null;
end $$;
revoke all on function public.early_creator_on_approve() from public, anon, authenticated;

create trigger creator_verification_events_early_rank after insert on public.creator_verification_events
  for each row execute function public.early_creator_on_approve();

-- 기능을 켜기 전에 이미 확인된 크리에이터에게 순번을 준다 — 지금 확인됨인 계정을 첫 승인 기록 시각 순(같으면 기록 순서),
-- 승인 기록이 없는 계정(시드 등)은 그 뒤에 가입 순. 혜택 시작은 그 승인 시각(없으면 가입 시각).
-- 순번 줄이 하나라도 있으면 아무것도 하지 않는다 — 다시 적용해도 결과가 같다. 매긴 수를 돌려준다.
create function public.early_creators_backfill()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  perform 1 from public.early_creator_counter where id for update;
  if exists (select 1 from public.early_creators) then
    return 0;
  end if;
  with firsts as (
    select c.id as creator_id,
           (select e.at from public.creator_verification_events e where e.creator_id = c.id and e.action = 'approve' order by e.at, e.id limit 1) as at,
           (select e.id from public.creator_verification_events e where e.creator_id = c.id and e.action = 'approve' order by e.at, e.id limit 1) as event_id,
           c.created_at
    from public.creators c
    where c.identity_verified and c.withdrawn_at is null
  ), ranked as (
    select f.creator_id, coalesce(f.at, f.created_at) as granted_at,
           row_number() over (order by (f.at is null), f.at, f.event_id, f.created_at, f.creator_id) as rank
    from firsts f
  )
  insert into public.early_creators (creator_id, rank, granted_at)
  select r.creator_id, r.rank, r.granted_at from ranked r where r.rank <= 50;
  get diagnostics v_n = row_count;
  update public.early_creator_counter set last_rank = v_n where id;
  return v_n;
end $$;
revoke all on function public.early_creators_backfill() from public, anon, authenticated;

select public.early_creators_backfill();

-- 그 순간에 혜택 기간 안인 초기 크리에이터인가 — 승인 시각부터 한국 시간 달력 3개월(같은 날이 없으면 그 달 마지막 날, Q14).
create function public.early_creator_active(p_creator_id uuid, p_at timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.early_creators e
    where e.creator_id = p_creator_id
      and p_at >= e.granted_at
      and p_at < ((e.granted_at at time zone 'Asia/Seoul') + interval '3 months') at time zone 'Asia/Seoul'
  )
$$;
revoke all on function public.early_creator_active(uuid, timestamptz) from public, anon, authenticated;

-- 그 달 남은 300원 줄 수만큼(최대 p_count) 가져가고 그 수를 돌려준다. 월 사용 줄을 잠근 뒤 세고 적는다(INV-GB15).
-- 혜택 기간 밖이거나 순번이 없으면 0, 사용도 세지 않는다.
create function public.early_creator_take_lines(p_creator_id uuid, p_count integer, p_at timestamptz)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_at at time zone 'Asia/Seoul')::date;
  v_used smallint;
  v_take integer;
begin
  if p_count is null or p_count < 0 then
    raise exception '줄 수가 틀렸다' using errcode = '22023';
  end if;
  if p_count = 0 or not public.early_creator_active(p_creator_id, p_at) then
    return 0;
  end if;
  insert into public.early_creator_monthly_usage (creator_id, month, used) values (p_creator_id, v_month, 0)
  on conflict (creator_id, month) do nothing;
  select u.used into v_used from public.early_creator_monthly_usage u
  where u.creator_id = p_creator_id and u.month = v_month for update;
  v_take := least(p_count, 30 - v_used);
  if v_take > 0 then
    update public.early_creator_monthly_usage set used = used + v_take where creator_id = p_creator_id and month = v_month;
  end if;
  return v_take;
end $$;
revoke all on function public.early_creator_take_lines(uuid, integer, timestamptz) from public, anon, authenticated;

-- ── 4) 요금 함수 (INV-GB13·GB16·GB17) ─────────────────

-- 팬 줄의 택배비: 실측 구간이면 팬에게 보내기 택배비(admin-console INV-K15 설정값), 개인접수(oversize)면 운영자가 넣은 우체국 실비 —
-- 대형 택배비 이상 100,000원 이하 정수만(INV-GB16, Q13). 개인접수가 아닌데 실비를 주면 거부한다.
create function public.revgift_box_ship_fee(p_tier text, p_personal_krw integer)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fee integer;
  v_large integer;
begin
  if p_tier = 'oversize' then
    select f.fee_krw into v_large from public.fan_send_fees f where f.tier = 'large';
    if p_personal_krw is null or p_personal_krw < v_large or p_personal_krw > 100000 then
      raise exception '개인접수 실비는 대형 택배비 이상 100,000원 이하' using errcode = '22023';
    end if;
    return p_personal_krw;
  end if;
  if p_personal_krw is not null then
    raise exception '개인접수가 아닌 줄에는 실비를 넣지 않는다' using errcode = '22023';
  end if;
  select f.fee_krw into v_fee from public.fan_send_fees f where f.tier = p_tier;
  if v_fee is null then
    raise exception '받을 수 없는 구간' using errcode = '22023';
  end if;
  return v_fee;
end $$;
revoke all on function public.revgift_box_ship_fee(text, integer) from public, anon, authenticated;

-- 할증 구분 → 금액(설정값, payment INV-M24 와 같은 표). 「할증 없음」은 0.
create function public.revgift_box_surcharge_fee(p_region text)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fee integer;
begin
  if p_region = 'none' then
    return 0;
  end if;
  select s.fee_krw into v_fee from public.surcharge_fees s where s.region = p_region;
  if v_fee is null then
    raise exception '모르는 할증 구분' using errcode = '22023';
  end if;
  return v_fee;
end $$;
revoke all on function public.revgift_box_surcharge_fee(text) from public, anon, authenticated;

-- 명세서 쓰기 — 그 순간의 설정값으로 줄마다 계산해 명세서와 줄을 한 처리에서 저장한다(INV-GB13). 이후 설정이 바뀌어도 다시 계산하지 않는다.
--   p_lines: [{application_id, tier(xsmall|small|medium|large|oversize), personal_krw(개인접수만), region(none|jeju|island)}] — 줄 순서 그대로 적는다.
--   300원 줄은 앞 줄부터 그 달 남은 건수만큼(INV-GB15). 착불 큰 상자 택배비는 그 선물함 큰 상자들의 합.
-- 선물함 상태를 바꾸지 않는다 — 3부의 명세서 생성 함수가 상태 전환과 함께 부른다. 누구도(서비스 키 포함) 직접 부르지 못한다.
create function public.revgift_box_write_invoice(p_box_id uuid, p_lines jsonb, p_at timestamptz default now())
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_box public.revgift_boxes;
  v_n integer;
  v_early integer;
  v_regular_fee integer;
  v_early_fee integer;
  v_cod integer;
  v_invoice uuid;
  r record;
  v_ship integer;
  v_sur integer;
  v_service integer;
  v_ship_total integer := 0;
  v_service_total integer := 0;
  v_rows jsonb := '[]';
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception '명세서 줄이 없다' using errcode = '22023';
  end if;
  -- 선물함 줄 먼저, 신청 줄은 그 뒤(office-workflow INV-W12 의 순서)
  select * into v_box from public.revgift_boxes b where b.id = p_box_id for update;
  if not found then
    raise exception '없는 선물함' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.revgift_box_invoices i where i.box_id = p_box_id) then
    raise exception '이미 명세서가 있다' using errcode = '23505';
  end if;
  v_n := jsonb_array_length(p_lines);
  -- 줄마다 이 선물함의 실측된 신청 하나(같은 신청 두 번 없음)
  if (select count(distinct a.id) from jsonb_array_elements(p_lines) x
      join public.revgift_box_applications a on a.id = (x ->> 'application_id')::uuid and a.box_id = p_box_id and a.status = 'measured') <> v_n then
    raise exception '이 선물함의 실측된 신청만 명세서 줄이 된다' using errcode = '22023';
  end if;
  perform 1 from public.revgift_box_applications a
  where a.id in (select (x ->> 'application_id')::uuid from jsonb_array_elements(p_lines) x) for update;

  select s.box_service_fee_krw, s.box_early_service_fee_krw into v_regular_fee, v_early_fee from public.pricing_settings s;
  select coalesce(sum(c.cod_fee_krw), 0) into v_cod from public.revgift_box_cartons c where c.box_id = p_box_id;
  v_early := public.early_creator_take_lines(v_box.creator_id, v_n, p_at);

  -- 줄마다 먼저 계산한 뒤 명세서와 줄을 넣는다(명세서 칸 합은 넣는 순간 맞아야 한다)
  for r in select x.value as line, x.ordinality as no from jsonb_array_elements(p_lines) with ordinality x loop
    v_ship := public.revgift_box_ship_fee(r.line ->> 'tier', (r.line ->> 'personal_krw')::integer);
    v_sur := public.revgift_box_surcharge_fee(r.line ->> 'region');
    v_service := case when r.no <= v_early then v_early_fee else v_regular_fee end;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'application_id', r.line ->> 'application_id', 'no', r.no, 'tier', r.line ->> 'tier', 'ship', v_ship,
      'region', r.line ->> 'region', 'sur', v_sur, 'service', v_service, 'early', r.no <= v_early));
    v_ship_total := v_ship_total + v_ship + v_sur;
    v_service_total := v_service_total + v_service;
  end loop;

  insert into public.revgift_box_invoices (box_id, amount_krw, shipping_fee_krw, service_fee_krw, carton_cod_krw, created_at)
  values (p_box_id, v_ship_total + v_cod + v_service_total, v_ship_total + v_cod, v_service_total, v_cod, p_at)
  returning id into v_invoice;

  insert into public.revgift_box_invoice_lines
    (invoice_id, application_id, line_no, tier, shipping_fee_krw, surcharge_region, surcharge_krw, service_fee_krw, early_rate, amount_krw)
  select v_invoice, (x ->> 'application_id')::uuid, (x ->> 'no')::smallint, x ->> 'tier', (x ->> 'ship')::integer, x ->> 'region',
         (x ->> 'sur')::integer, (x ->> 'service')::integer, (x ->> 'early')::boolean,
         (x ->> 'ship')::integer + (x ->> 'sur')::integer + (x ->> 'service')::integer
  from jsonb_array_elements(v_rows) x;
  return v_invoice;
end $$;
revoke all on function public.revgift_box_write_invoice(uuid, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.early_creator_take_lines(uuid, integer, timestamptz) from service_role;
revoke all on function public.early_creator_active(uuid, timestamptz) from service_role;
revoke all on function public.early_creators_backfill() from service_role;
revoke all on function public.revgift_box_ship_fee(text, integer) from service_role;
revoke all on function public.revgift_box_surcharge_fee(text) from service_role;
