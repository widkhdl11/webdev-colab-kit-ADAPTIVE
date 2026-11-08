-- 선물함(팬에게 보내기) 3부 — 상자 고르기(「다음」) · 6자리 · 번호 라벨 · 큰 상자 입고 · 실측 · 확인 필요 · 168시간 도착 안 함 · 명세서 생성 · 취소한 선물함 상자.
-- 스펙: docs/specs/revgift-box.md (INV-GB1 awaiting_box~invoiced · GB9 라벨 · GB10 · GB11 · GB12 · GB13 · GB16 · GB17 · GB23), 순서: workspace/revgift-box-plan.md 3부.
--
-- 개인정보 구역(pii)을 쓰는 곳은 둘이다 — 사람이 적용하는 supabase/manual/0033_revgift_box_intake.sql 이 만든다.
--   · 명세서 생성이 신청 사본의 할증 구분을 읽는 함수 pii.revgift_box_regions(INV-GB17). 0033 전에는 명세서를 만들지 않고 기다린다
--     (실측·입고는 그대로 된다 — 예약 작업이 5분마다 다시 본다).
--   · 도착 안 함(missing)이 사본을 지울 때의 까닭 「missing」(pii.revgift_box_drop_copies). 0033 전에는 그 선물함의 도착 안 함 처리가 실패하고 그대로 남는다.
-- 그래서 함수 본문 검사를 끄고 만든다.
-- 옛 역조공(revgift_sends·revgift_shares)은 그대로 둔다(INV-GB22 는 4부). 결제·반송·발송은 4부.
--
-- 누구인지는 모두 로그인 토큰으로 정한다(크리에이터 = 선물함 주인, 사무실 = is_operator). 앱 서버 키(service_role)로는 부르지 못한다.
-- 잠금 순서: 선물함 줄 → 확인 필요 줄 → 신청 줄 (INV-GB2, office-workflow INV-W12 의 순서).
--
-- 오류 코드(2부와 같은 뜻)
--   22023 입력 꼴(구간·실측 값·실비·착불 금액·송장번호·선반·보낸 상자 수·고른 팬)
--   42501 운영자가 아님
--   P0002 선물함·확인 필요·카드를 찾을 수 없음(없음 · 주인이 아님 — 같은 답)
--   P0022 지금 상태에서 할 수 없음(INV-GB1 전환표 밖)
--   55000 이미 실측한 신청

set local check_function_bodies = off;

-- ── 규칙 값 ────────────────────────────────────────────
-- 1부 값에 3부 값을 더한다. 구간 경계는 admin-console INV-K15 의 팬에게 보내기 구간(극소형 80cm·2kg … 대형 140cm·15kg, 무게와 크기 중 큰 쪽).
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
    'cod_max_krw', 100000,      -- INV-GB13 착불 큰 상자 택배비 상한 (Q13)
    'tier_limits', jsonb_build_array(                                   -- INV-GB12 실측 구간(작은 것부터)
      jsonb_build_object('tier', 'xsmall', 'size_cm', 80, 'weight_kg', 2),
      jsonb_build_object('tier', 'small', 'size_cm', 100, 'weight_kg', 5),
      jsonb_build_object('tier', 'medium', 'size_cm', 120, 'weight_kg', 10),
      jsonb_build_object('tier', 'large', 'size_cm', 140, 'weight_kg', 15)),
    'carton_count_max', 100,    -- INV-GB11 보낸 상자 수(1 이상 — 상한은 선물함 받을 인원과 같게)
    'carton_wait_hours', 168,   -- INV-GB11 첫 큰 상자 입고 뒤 도착 안 함까지
    'awaiting_box_hours', 720,  -- INV-GB1 Q10 「다음」 뒤 큰 상자가 하나도 없으면 자동 취소
    'hold_hours', 168,          -- INV-GB12 Q11 확인 필요 카드 기한
    'cancelled_arrival_hours', 168 -- INV-GB23 취소한 선물함 상자 카드 기한
  )
$$;

-- 실측 → 구간. 세 변 합과 무게 중 큰 쪽(둘 다 들어가는 가장 작은 구간), 대형을 넘으면 개인접수(oversize) (INV-GB12).
create or replace function public.revgift_box_tier_of(p_size_cm numeric, p_weight_kg numeric)
returns text
language sql immutable set search_path = ''
as $$
  select coalesce((
    select l ->> 'tier'
    from jsonb_array_elements(public.revgift_box_rules() -> 'tier_limits') with ordinality t (l, n)
    where p_size_cm <= (l ->> 'size_cm')::numeric and p_weight_kg <= (l ->> 'weight_kg')::numeric
    order by t.n limit 1), 'oversize')
$$;

-- ── 표 ────────────────────────────────────────────────

-- 선물함: 6자리(선물함마다 하나, INV-GB10) · 무효 시각 · 보낸 상자 수(Q8) · 「다음」 시각(Q10 기한) · 첫 입고 시각(INV-GB11 기한) · 명세서 시각 · 취소 전 상태(INV-GB23 다시 열기)
alter table public.revgift_boxes add column if not exists inbound_code text;
alter table public.revgift_boxes add column if not exists code_voided_at timestamptz;
alter table public.revgift_boxes add column if not exists carton_count smallint;
alter table public.revgift_boxes add column if not exists box_requested_at timestamptz;
alter table public.revgift_boxes add column if not exists first_received_at timestamptz;
alter table public.revgift_boxes add column if not exists invoiced_at timestamptz;
alter table public.revgift_boxes add column if not exists cancelled_from text;
alter table public.revgift_boxes add constraint revgift_boxes_inbound_code_shape check (inbound_code is null or public.inbound_code_wellformed(inbound_code));
alter table public.revgift_boxes add constraint revgift_boxes_code_void check (code_voided_at is null or inbound_code is not null);
alter table public.revgift_boxes add constraint revgift_boxes_carton_count check (carton_count is null or carton_count between 1 and 100);
alter table public.revgift_boxes add constraint revgift_boxes_cancelled_from check (cancelled_from is null or cancelled_from in ('open', 'closed', 'awaiting_box'));
create unique index if not exists revgift_boxes_code_valid_once on public.revgift_boxes (inbound_code) where inbound_code is not null and code_voided_at is null;

-- 신청: 번호 라벨의 신청 번호(바코드에는 이것만 — INV-GB9) · 실측 값과 구간 · 개인접수 실비 · 끝나기 전 상태(INV-GB23 다시 열기)
create sequence if not exists public.revgift_box_label_seq;
revoke all on sequence public.revgift_box_label_seq from public, anon, authenticated;
alter table public.revgift_box_applications add column if not exists label_no bigint not null default nextval('public.revgift_box_label_seq');
alter table public.revgift_box_applications add constraint revgift_box_applications_label_no_key unique (label_no);
alter table public.revgift_box_applications add column if not exists measured_tier text;
alter table public.revgift_box_applications add column if not exists measured_size_cm numeric(6, 1);
alter table public.revgift_box_applications add column if not exists measured_weight_kg numeric(6, 2);
alter table public.revgift_box_applications add column if not exists personal_krw integer;
alter table public.revgift_box_applications add column if not exists measured_at timestamptz;
alter table public.revgift_box_applications add column if not exists status_before_end text;
alter table public.revgift_box_applications add constraint revgift_box_applications_measured_tier
  check (measured_tier is null or measured_tier in ('xsmall', 'small', 'medium', 'large', 'oversize'));
alter table public.revgift_box_applications add constraint revgift_box_applications_measured_set
  check ((measured_tier is null) = (measured_at is null) and (measured_tier is null) = (measured_size_cm is null) and (measured_tier is null) = (measured_weight_kg is null));
alter table public.revgift_box_applications add constraint revgift_box_applications_personal
  check (coalesce(measured_tier = 'oversize', false) = (personal_krw is not null) and (personal_krw is null or personal_krw between 1 and 100000));

-- 큰 상자: 원 송장번호(Q16 착불 반송은 이 송장의 보내는 사람 주소로 — 4부)
alter table public.revgift_box_cartons add column if not exists waybill_no text;
alter table public.revgift_box_cartons add constraint revgift_box_cartons_waybill check (waybill_no is null or waybill_no ~ '^[0-9]{10,14}$');

-- 주소 사본 기록의 까닭에 「도착 안 함」을 더한다(INV-GB11·GB20)
alter table public.revgift_box_address_events drop constraint revgift_box_address_events_reason_check;
alter table public.revgift_box_address_events add constraint revgift_box_address_events_reason_check
  check (reason in ('excluded_at_close', 'box_cancelled', 'withdrawn', 'missing'));

-- 확인 필요 선물(INV-GB12) — 바코드·닉네임이 이 선물함의 선택된 신청과 맞지 않는 선물. 실측 값은 이미 재 둔다(고르면 그 신청의 실측이 된다).
-- 작성한 닉네임(라벨이 다른 선물함 것이면 그 라벨의 닉네임)만 있다. 크리에이터가 팬을 고르거나(resolved) 7일이 지나면(expired, Q11) 닫힌다.
create table public.revgift_box_holds (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.revgift_boxes (id) on delete cascade,
  written_nickname text not null check (char_length(written_nickname) between 1 and 40),
  measured_tier text not null check (measured_tier in ('xsmall', 'small', 'medium', 'large', 'oversize')),
  measured_size_cm numeric(6, 1) not null,
  measured_weight_kg numeric(6, 2) not null,
  personal_krw integer check (personal_krw is null or personal_krw between 1 and 100000),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  resolved_application_id uuid references public.revgift_box_applications (id) on delete set null,
  resolved_at timestamptz,
  expired_at timestamptz,
  check (num_nonnulls(resolved_at, expired_at) <= 1),
  check ((measured_tier = 'oversize') = (personal_krw is not null))
);
create index revgift_box_holds_box_idx on public.revgift_box_holds (box_id) where resolved_at is null and expired_at is null;
alter table public.revgift_box_holds enable row level security;
revoke all on public.revgift_box_holds from anon, authenticated;

-- 취소한 선물함 6자리로 온 상자의 크리에이터 카드(INV-GB23). 상자 자체는 보류 줄(office_unmatched, void_code)에 있다.
create table public.revgift_box_cancelled_arrivals (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.revgift_boxes (id) on delete cascade,
  unmatched_id uuid references public.office_unmatched (id) on delete set null,
  waybill_no text not null check (waybill_no ~ '^[0-9]{10,14}$'),
  cod_fee_krw integer not null default 0 check (cod_fee_krw between 0 and 100000),
  created_at timestamptz not null default now(),
  choice text check (choice in ('reopen', 'return')),
  chosen_at timestamptz,
  auto boolean not null default false,
  check ((choice is null) = (chosen_at is null))
);
create index revgift_box_cancelled_arrivals_box_idx on public.revgift_box_cancelled_arrivals (box_id);
alter table public.revgift_box_cancelled_arrivals enable row level security;
revoke all on public.revgift_box_cancelled_arrivals from anon, authenticated;

-- ── 6자리 (INV-GB10, inbound-address-code INV-C1) ──────
-- 이미 쓰인 값인가 — 상자·몫의 6자리(지금 유효하거나 최근 1년 안에 쓰임·무효)에 선물함 6자리를 더한다. 일반 발급도 이 함수로 겹침을 본다.
create or replace function public.inbound_code_taken(p_code text)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.inbound_codes c
    where c.code = p_code
      and (c.state = 'valid' or coalesce(c.used_at, c.voided_at) > now() - interval '1 year')
  ) or exists (
    select 1 from public.revgift_boxes b
    where b.inbound_code = p_code
      and (b.code_voided_at is null or b.code_voided_at > now() - interval '1 year')
  );
$$;

-- 바코드에 찍는 신청 번호 — GB + 8자리(넘으면 그대로 늘어난다). 주소·이름·6자리가 없다(INV-GB9).
create or replace function public.revgift_box_label_text(p_label_no bigint)
returns text
language sql immutable set search_path = ''
as $$ select 'GB' || lpad(p_label_no::text, 8, '0') $$;

-- ── 선물함 취소 (INV-GB1 · GB2 · GB20) ───────────────
-- 크리에이터 취소와 30일 자동 취소(Q10)가 같이 쓴다. 선물함 줄은 부르는 쪽이 잠갔다.
-- 끝나지 않은 신청은 같은 처리에서 함께 끝나고(끝나기 전 상태를 남긴다 — INV-GB23 다시 열기), 모든 사본을 지우고, 6자리를 무효로 한다(Q7).
create or replace function public.revgift_box_cancel_locked(p_box_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
begin
  select * into v from public.revgift_boxes b where b.id = p_box_id;
  perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
  update public.revgift_box_applications set status_before_end = status, status = 'ended'
  where box_id = v.id and status in ('applied', 'excluded', 'selected');
  update public.revgift_boxes
  set status = 'cancelled', cancelled_from = v.status,
      code_voided_at = case when inbound_code is not null then coalesce(code_voided_at, now()) end
  where id = v.id;
  perform pii.revgift_box_drop_copies(array(
    select a.id from public.revgift_box_applications a where a.box_id = v.id), 'box_cancelled');
end $$;

-- 크리에이터 선물함 취소 — 본문은 2부 그대로에 위 공용 처리(끝나기 전 상태·6자리 무효)를 쓴다.
create or replace function public.revgift_box_cancel(p_box_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
begin
  if v.status not in ('open', 'closed', 'awaiting_box')
     or exists (select 1 from public.revgift_box_cartons c where c.box_id = v.id) then
    raise exception '지금은 선물함을 취소할 수 없다' using errcode = 'P0022';
  end if;
  perform public.revgift_box_cancel_locked(v.id);
end $$;

-- ── 2페이지 「다음」 · 3페이지 보낸 상자 수 (INV-GB1 · GB10 · GB11 Q8) ──

-- 선택된 신청 모두에 구간을 받아 저장하고 closed → awaiting_box. 같은 처리에서 6자리를 발급한다. 보낸 상자 수는 1로 시작한다(3페이지에서 고친다).
-- p_tiers: {신청 id: 구간} — 이 선물함의 선택된 신청만, 구간은 극소형~대형. 돌려주는 값: 6자리.
create or replace function public.revgift_box_submit_tiers(p_box_id uuid, p_tiers jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
  v_code text;
  v_try integer := 0;
begin
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'object' then
    raise exception '구간 꼴이 틀리다' using errcode = '22023';
  end if;
  if v.status <> 'closed' then
    raise exception '마감된 선물함에서만 고른다' using errcode = 'P0022';
  end if;
  perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
  if exists (
    select 1 from jsonb_each_text(p_tiers) x
    where x.value not in ('xsmall', 'small', 'medium', 'large')
       or x.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from public.revgift_box_applications a where a.id = x.key::uuid and a.box_id = v.id and a.status = 'selected')
  ) then
    raise exception '이 선물함의 담길 신청과 구간만 받는다' using errcode = '22023';
  end if;
  if exists (select 1 from public.revgift_box_applications a where a.box_id = v.id and a.status = 'selected' and not (p_tiers ? a.id::text)) then
    raise exception '구간을 고르지 않은 신청이 있다' using errcode = 'P0022';
  end if;
  update public.revgift_box_applications a set chosen_tier = p_tiers ->> a.id::text where a.box_id = v.id and a.status = 'selected';
  loop
    v_try := v_try + 1;
    if v_try > 100 then
      raise exception '받는 주소 6자리를 발급하지 못했다' using errcode = '55000';
    end if;
    v_code := public.inbound_code_draw();
    exit when not public.inbound_code_taken(v_code);
  end loop;
  update public.revgift_boxes
  set status = 'awaiting_box', inbound_code = v_code, box_requested_at = now(), carton_count = 1
  where id = v.id;
  return v_code;
end $$;

-- 보낸 상자 수 — 첫 큰 상자 입고 전까지만(Q8).
create or replace function public.revgift_box_set_carton_count(p_box_id uuid, p_count integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
begin
  if p_count is null or p_count < 1 or p_count > (public.revgift_box_rules() ->> 'carton_count_max')::integer then
    raise exception '보낸 상자 수 꼴이 틀리다' using errcode = '22023';
  end if;
  -- 첫 큰 상자 입고가 같은 처리에서 arrived 로 바꾸므로, 상자 보내 주세요인 동안 = 첫 상자 입고 전이다
  if v.status <> 'awaiting_box' then
    raise exception '첫 상자 입고 전에만 고친다' using errcode = 'P0022';
  end if;
  update public.revgift_boxes set carton_count = p_count where id = v.id;
end $$;

-- ── 명세서 생성 (INV-GB11 · GB12 · GB13 · GB17) ───────
-- 선물함이 arrived 이고, 확인 필요가 없고, 담길 차례(selected)가 남지 않았고, 보낸 상자 수만큼 입고됐거나 첫 입고 + 168시간이 지났으면
-- 실측된 신청으로 명세서를 쓰고 invoiced 로 바꾸며 6자리를 무효로 한다(Q7). 선물함 줄은 부르는 쪽이 잠갔다. 만든 명세서 id(없으면 null).
-- 할증 구분은 pii 의 읽기 함수로만 읽는다(INV-GB17) — 0033 전에는 그 함수가 없어 만들지 않고 기다린다.
-- 사본이 없는 실측 신청(취소 뒤 다시 연 선물함에서 주소를 다시 넣지 않은 신청, INV-GB23)은 발송 대상이 아니라 명세서에 넣지 않고 끝낸다.
-- 줄이 하나도 없으면(모두 도착 안 함 등) 만들지 않는다(INV-GB11) — 남은 물건 처리는 4부(Q12).
create or replace function public.revgift_box_try_invoice(p_box_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
  v_rules jsonb := public.revgift_box_rules();
  v_measured uuid[];
  v_lines jsonb;
  v_invoice uuid;
begin
  select * into v from public.revgift_boxes b where b.id = p_box_id for update;
  if v.status is distinct from 'arrived'
     or exists (select 1 from public.revgift_box_holds h where h.box_id = v.id and h.resolved_at is null and h.expired_at is null)
     or exists (select 1 from public.revgift_box_applications a where a.box_id = v.id and a.status = 'selected')
     or ((select count(*) from public.revgift_box_cartons c where c.box_id = v.id) < coalesce(v.carton_count, 1)
         and now() < v.first_received_at + make_interval(hours => (v_rules ->> 'carton_wait_hours')::integer)) then
    return null;
  end if;
  if to_regprocedure('pii.revgift_box_regions(uuid[])') is null then
    return null;
  end if;
  select array_agg(a.id order by a.label_no) into v_measured
  from public.revgift_box_applications a where a.box_id = v.id and a.status = 'measured';
  if v_measured is null then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'application_id', a.id, 'tier', a.measured_tier, 'personal_krw', a.personal_krw, 'region', r.surcharge_region) order by a.label_no), '[]'::jsonb)
  into v_lines
  from public.revgift_box_applications a
  join pii.revgift_box_regions(v_measured) r on r.application_id = a.id;
  update public.revgift_box_applications a set status_before_end = a.status, status = 'ended'
  where a.id = any (v_measured) and not exists (select 1 from jsonb_array_elements(v_lines) x where (x ->> 'application_id')::uuid = a.id);
  if jsonb_array_length(v_lines) = 0 then
    return null;
  end if;
  v_invoice := public.revgift_box_write_invoice(v.id, v_lines, now());
  update public.revgift_boxes set status = 'invoiced', invoiced_at = now(), code_voided_at = coalesce(code_voided_at, now()) where id = v.id;
  return v_invoice;
end $$;

-- ── 사무실 — 큰 상자 입고 (INV-GB10 · GB13 · GB23) ─────

-- 6자리로 큰 상자를 받는다. 착불 금액(0~상한 정수)·원 송장번호·선반을 같이 받는다.
--   유효한 6자리 + 상자 보내 주세요·도착·확인 필요 → 큰 상자 줄, 첫 상자면 arrived(첫 입고 시각). 결과 received.
--   무효가 된 6자리(취소·명세서·반송, Q7) → 보류 줄(void_code). 취소한 선물함이면 같은 처리에서 크리에이터 카드(INV-GB23). 결과 held.
--   모르는 6자리 → unknown(아무것도 생기지 않는다 — 일반 입고 화면에서 받는다).
create or replace function public.office_gift_box_receive(p_code text, p_waybill_no text, p_cod_fee_krw integer, p_shelf text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_waybill text := regexp_replace(coalesce(p_waybill_no, ''), '[^0-9]', '', 'g');
  v_shelf text := btrim(coalesce(p_shelf, ''));
  v_unmatched uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_cod_fee_krw is null or p_cod_fee_krw < 0 or p_cod_fee_krw > (public.revgift_box_rules() ->> 'cod_max_krw')::integer then
    raise exception '착불 금액 꼴이 틀리다' using errcode = '22023';
  end if;
  if v_waybill !~ '^[0-9]{10,14}$' or char_length(v_shelf) not between 1 and 20 then
    raise exception '송장번호·선반 꼴이 틀리다' using errcode = '22023';
  end if;
  select * into v from public.revgift_boxes b
  where b.inbound_code = v_code
  order by (b.code_voided_at is null) desc, b.created_at desc
  limit 1
  for update;
  if not found then
    return jsonb_build_object('result', 'unknown');
  end if;
  if v.code_voided_at is null and v.status in ('awaiting_box', 'arrived', 'held') then
    insert into public.revgift_box_cartons (box_id, cod_fee_krw, waybill_no) values (v.id, p_cod_fee_krw, v_waybill);
    if v.status = 'awaiting_box' then
      update public.revgift_boxes set status = 'arrived', first_received_at = now() where id = v.id;
    end if;
    perform public.revgift_box_try_invoice(v.id);
    return jsonb_build_object('result', 'received', 'box_id', v.id, 'box_name', v.name);
  end if;
  insert into public.office_unmatched (waybill_no, shelf, recorded_by, reason)
  values (v_waybill, v_shelf, auth.uid(), 'void_code')
  returning id into v_unmatched;
  if v.status = 'cancelled' then
    insert into public.revgift_box_cancelled_arrivals (box_id, unmatched_id, waybill_no, cod_fee_krw)
    values (v.id, v_unmatched, v_waybill, p_cod_fee_krw);
  end if;
  return jsonb_build_object('result', 'held', 'box_id', v.id, 'box_name', v.name);
end $$;

-- 사무실이 6자리로 선물함을 불러온다 — 이름 · 상태 · 보낸/받은 상자 수 · 선택된 신청(닉네임·신청 번호·실측 여부) · 열린 확인 필요 수.
-- 손글씨 닉네임 선물은 이 목록에서 찾는다(INV-GB10). 주소·실명·전화 칸이 없다.
create or replace function public.office_gift_box_lookup(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  select * into v from public.revgift_boxes b
  where b.inbound_code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')) and b.code_voided_at is null;
  if not found then
    raise exception '선물함을 찾을 수 없다' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', v.id, 'name', v.name, 'status', v.status, 'carton_count', v.carton_count,
    'cartons_received', (select count(*) from public.revgift_box_cartons c where c.box_id = v.id),
    'open_holds', (select count(*) from public.revgift_box_holds h where h.box_id = v.id and h.resolved_at is null and h.expired_at is null),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('label', public.revgift_box_label_text(a.label_no), 'nickname', p.nickname, 'status', a.status, 'tier', a.measured_tier)
                       order by p.nickname, a.label_no)
      from public.revgift_box_applications a join public.profiles p on p.id = a.fan_id
      where a.box_id = v.id and a.status in ('selected', 'measured')), '[]'::jsonb));
end $$;

-- ── 사무실 — 실측 (INV-GB12 · GB16) ──────────────────

-- 선물 하나를 잰다. 바코드(신청 번호) 또는 손글씨 닉네임 중 하나, 세 변 합(cm)·무게(kg), 대형 초과면 우체국 실비.
-- 구간은 DB 가 정한다. 바코드·닉네임이 이 선물함의 담길 차례(selected) 신청과 맞으면 그 신청이 measured,
-- 맞지 않으면(다른 선물함의 라벨·모르는 닉네임·이미 실측된 팬 닉네임) 확인 필요 하나 + 선물함 held. 마지막 선물이면 같은 처리에서 명세서.
create or replace function public.office_gift_box_measure(p_code text, p_label text, p_nickname text, p_size_cm numeric, p_weight_kg numeric, p_personal_krw integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
  v_rules jsonb := public.revgift_box_rules();
  v_tier text;
  v_large integer;
  v_label_no bigint;
  v_app public.revgift_box_applications;
  v_written text;
  v_nick text := btrim(coalesce(p_nickname, ''));
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if num_nonnulls(nullif(btrim(coalesce(p_label, '')), ''), nullif(v_nick, '')) <> 1
     or p_size_cm is null or p_size_cm <= 0 or p_size_cm > 1000 or p_weight_kg is null or p_weight_kg <= 0 or p_weight_kg > 1000 then
    raise exception '실측 값 꼴이 틀리다' using errcode = '22023';
  end if;
  v_tier := public.revgift_box_tier_of(p_size_cm, p_weight_kg);
  -- INV-GB16: 대형 초과는 실비가 있어야 하고 대형 택배비 이상 상한 이하, 그 밖에는 실비가 없다
  select f.fee_krw into v_large from public.fan_send_fees f where f.tier = 'large';
  if v_tier = 'oversize' then
    if p_personal_krw is null or p_personal_krw < v_large or p_personal_krw > (v_rules ->> 'personal_max_krw')::integer then
      raise exception '개인접수 실비는 대형 택배비 이상 상한 이하' using errcode = '22023';
    end if;
  elsif p_personal_krw is not null then
    raise exception '대형 초과에만 실비를 넣는다' using errcode = '22023';
  end if;

  select * into v from public.revgift_boxes b
  where b.inbound_code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')) and b.code_voided_at is null
  for update;
  if not found then
    raise exception '선물함을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v.status not in ('arrived', 'held') then
    raise exception '도착한 선물함만 잰다' using errcode = 'P0022';
  end if;

  if v_nick = '' then
    if upper(btrim(p_label)) ~ '^GB[0-9]{1,12}$' then
      v_label_no := substr(upper(btrim(p_label)), 3)::bigint;
      select * into v_app from public.revgift_box_applications a where a.label_no = v_label_no;
    end if;
    if v_app.id is not null and v_app.box_id = v.id then
      perform 1 from public.revgift_box_applications a where a.id = v_app.id for update;
      select * into v_app from public.revgift_box_applications a where a.id = v_app.id;
      if v_app.status = 'measured' then
        raise exception '이미 실측한 선물이다' using errcode = '55000';
      end if;
    end if;
    -- 라벨이 다른 선물함 것이면 그 라벨에 찍힌 닉네임이 「작성한 닉네임」이다(S10c)
    v_written := coalesce((select p.nickname from public.profiles p where p.id = v_app.fan_id), upper(btrim(p_label)));
  else
    select a.* into v_app from public.revgift_box_applications a join public.profiles p on p.id = a.fan_id
    where a.box_id = v.id and a.status = 'selected' and p.nickname = v_nick
    for update of a;
    v_written := v_nick;
  end if;

  if v_app.id is not null and v_app.box_id = v.id and v_app.status = 'selected' then
    update public.revgift_box_applications
    set status = 'measured', measured_tier = v_tier, measured_size_cm = p_size_cm, measured_weight_kg = p_weight_kg, personal_krw = p_personal_krw, measured_at = now()
    where id = v_app.id;
    perform public.revgift_box_try_invoice(v.id);
    return jsonb_build_object('result', 'measured', 'nickname', (select p.nickname from public.profiles p where p.id = v_app.fan_id), 'tier', v_tier);
  end if;

  insert into public.revgift_box_holds (box_id, written_nickname, measured_tier, measured_size_cm, measured_weight_kg, personal_krw, recorded_by)
  values (v.id, left(v_written, 40), v_tier, p_size_cm, p_weight_kg, p_personal_krw, auth.uid());
  if v.status = 'arrived' then
    update public.revgift_boxes set status = 'held' where id = v.id;
  end if;
  return jsonb_build_object('result', 'held', 'tier', v_tier);
end $$;

-- ── 크리에이터 — 확인 필요 팬 고르기 (INV-GB12 · Q11) ───

-- 선물함 주인이 확인 필요 선물의 팬을 고른다 — 그 선물함의 선택된(아직 실측 전이거나 실측된) 신청만.
-- 실측 전이면 그 신청의 실측이 되고, 이미 실측된 팬이면 한 송장으로 묶어 합친 상자로 다시 잰다(그 신청이 다시 담길 차례, Q11).
-- 확인 필요가 남지 않으면 선물함은 arrived 로 돌아가고 같은 처리에서 명세서를 본다.
create or replace function public.revgift_box_resolve_hold(p_hold_id uuid, p_application_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_box_id uuid := (select h.box_id from public.revgift_box_holds h where h.id = p_hold_id);
  v public.revgift_boxes;
  v_hold public.revgift_box_holds;
  v_app public.revgift_box_applications;
begin
  if v_box_id is null then
    raise exception '확인 필요를 찾을 수 없다' using errcode = 'P0002';
  end if;
  v := public.revgift_box_lock_mine(v_box_id);
  select * into v_hold from public.revgift_box_holds h where h.id = p_hold_id for update;
  if v_hold.resolved_at is not null or v_hold.expired_at is not null or v.status not in ('arrived', 'held') then
    raise exception '이미 닫힌 확인 필요다' using errcode = 'P0022';
  end if;
  select * into v_app from public.revgift_box_applications a
  where a.id = p_application_id and a.box_id = v.id and a.status in ('selected', 'measured') for update;
  if not found then
    raise exception '이 선물함의 담길 신청만 고른다' using errcode = '22023';
  end if;
  if v_app.status = 'selected' then
    update public.revgift_box_applications
    set status = 'measured', measured_tier = v_hold.measured_tier, measured_size_cm = v_hold.measured_size_cm,
        measured_weight_kg = v_hold.measured_weight_kg, personal_krw = v_hold.personal_krw, measured_at = now()
    where id = v_app.id;
  else
    update public.revgift_box_applications
    set status = 'selected', measured_tier = null, measured_size_cm = null, measured_weight_kg = null, personal_krw = null, measured_at = null
    where id = v_app.id;
  end if;
  update public.revgift_box_holds set resolved_at = now(), resolved_application_id = v_app.id where id = v_hold.id;
  if v.status = 'held' and not exists (select 1 from public.revgift_box_holds h where h.box_id = v.id and h.resolved_at is null and h.expired_at is null) then
    update public.revgift_boxes set status = 'arrived' where id = v.id;
  end if;
  perform public.revgift_box_try_invoice(v.id);
end $$;

-- ── 크리에이터 — 취소한 선물함 상자 카드 (INV-GB23) ───

-- 「돌려받기」(return): 보류 줄을 반송 대상으로(30일을 기다리지 않는다). 「선물함 다시 열기」(reopen): 주인만 한 번 —
-- 취소 전 상태(상자 보내 주세요)·같은 신청자(담길 차례)로 돌아가고 6자리가 다시 유효해지며, 이 상자가 그 선물함의 큰 상자로 입고된다(arrived).
-- 취소 때 지운 주소는 돌아오지 않는다 — 신청자가 다시 넣어야 발송 대상이다(넣지 않은 신청은 명세서에 들지 않는다).
create or replace function public.revgift_box_choose_cancelled_arrival(p_card_id uuid, p_choice text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_box_id uuid := (select c.box_id from public.revgift_box_cancelled_arrivals c where c.id = p_card_id);
  v public.revgift_boxes;
  v_card public.revgift_box_cancelled_arrivals;
begin
  if p_choice is null or p_choice not in ('reopen', 'return') then
    raise exception '고를 수 있는 것은 둘이다' using errcode = '22023';
  end if;
  if v_box_id is null then
    raise exception '카드를 찾을 수 없다' using errcode = 'P0002';
  end if;
  v := public.revgift_box_lock_mine(v_box_id);
  select * into v_card from public.revgift_box_cancelled_arrivals c where c.id = p_card_id for update;
  if v_card.choice is not null then
    raise exception '이미 골랐다' using errcode = 'P0022';
  end if;
  if p_choice = 'return' then
    update public.revgift_box_cancelled_arrivals set choice = 'return', chosen_at = now() where id = v_card.id;
    update public.office_unmatched set expired_at = coalesce(expired_at, now()) where id = v_card.unmatched_id and matched_at is null;
    return;
  end if;
  if v.status <> 'cancelled' or v.cancelled_from is distinct from 'awaiting_box'
     or exists (select 1 from public.revgift_box_cancelled_arrivals c where c.box_id = v.id and c.choice = 'reopen')
     or exists (select 1 from public.revgift_boxes b where b.inbound_code = v.inbound_code and b.id <> v.id and b.code_voided_at is null) then
    raise exception '다시 열 수 없다' using errcode = 'P0022';
  end if;
  update public.revgift_box_applications set status = 'selected', status_before_end = null
  where box_id = v.id and status = 'ended' and status_before_end = 'selected';
  update public.revgift_boxes
  set status = 'arrived', cancelled_from = null, code_voided_at = null, first_received_at = now()
  where id = v.id;
  insert into public.revgift_box_cartons (box_id, cod_fee_krw, waybill_no) values (v.id, v_card.cod_fee_krw, v_card.waybill_no);
  update public.revgift_box_cancelled_arrivals set choice = 'reopen', chosen_at = now() where id = v_card.id;
  delete from public.office_unmatched where id = v_card.unmatched_id and matched_at is null;
end $$;

-- ── 크리에이터 읽기 (INV-GB9 · GB10 · GB13) ────────────

-- 신청 관리 창·2·3·명세서 화면. 주인 본인만. 2부 칸에 더해: 6자리(상자 보내 주세요·도착·확인 필요일 때만 — 무효가 되면 없음),
-- 보낸/받은 상자 수, 신청마다 고른 구간, 명세서(줄마다 닉네임·구간·택배비·할증 구분·할증·서비스료·금액). 사람 칸은 닉네임뿐이다.
create or replace function public.my_revgift_box(p_box_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'capacity', b.capacity, 'is_public', b.is_public, 'status', b.status,
    'invite_token', b.invite_token, 'created_at', b.created_at,
    'inbound_code', case when b.code_voided_at is null and b.status in ('awaiting_box', 'arrived', 'held') then b.inbound_code end,
    'carton_count', b.carton_count,
    'cartons_received', (select count(*) from public.revgift_box_cartons c where c.box_id = b.id),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nickname', p.nickname, 'applied_at', a.applied_at, 'status', a.status, 'chosen_tier', a.chosen_tier)
                       order by a.applied_at, a.id)
      from public.revgift_box_applications a
      join public.profiles p on p.id = a.fan_id
      where a.box_id = b.id and a.status <> 'withdrawn'
    ), '[]'::jsonb),
    'invoice', (
      select jsonb_build_object(
        'amount_krw', i.amount_krw, 'shipping_fee_krw', i.shipping_fee_krw, 'service_fee_krw', i.service_fee_krw,
        'carton_cod_krw', i.carton_cod_krw, 'created_at', i.created_at,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'nickname', p.nickname, 'tier', l.tier, 'shipping_fee_krw', l.shipping_fee_krw, 'surcharge_region', l.surcharge_region,
                   'surcharge_krw', l.surcharge_krw, 'service_fee_krw', l.service_fee_krw, 'amount_krw', l.amount_krw) order by l.line_no)
          from public.revgift_box_invoice_lines l
          join public.revgift_box_applications a on a.id = l.application_id
          join public.profiles p on p.id = a.fan_id
          where l.invoice_id = i.id), '[]'::jsonb))
      from public.revgift_box_invoices i where i.box_id = b.id))
  from public.revgift_boxes b
  where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid();
$$;

-- 번호 라벨(INV-GB9·GB10) — 주인만, 상자 보내 주세요부터. 선택된 신청마다 닉네임 + 바코드(신청 번호)뿐.
create or replace function public.my_revgift_box_labels(p_box_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
begin
  select * into v from public.revgift_boxes b where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid();
  if not found then
    raise exception '선물함을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v.status in ('open', 'closed', 'cancelled') then
    raise exception '상자 보내 주세요 단계부터 받는다' using errcode = 'P0022';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('nickname', p.nickname, 'barcode', public.revgift_box_label_text(a.label_no)) order by p.nickname, a.label_no)
    from public.revgift_box_applications a join public.profiles p on p.id = a.fan_id
    where a.box_id = v.id and a.status in ('selected', 'measured', 'paid', 'shipped', 'delivered')), '[]'::jsonb);
end $$;

-- 2페이지 예상 금액용 요금 — 팬에게 보내기 택배비(구간마다) · 서비스료 정가 · 초기 크리에이터 서비스료와 이번 달 남은 건수(초기 크리에이터가 아니면 0).
-- 표시일 뿐 판단 근거가 아니다(INV-GB13). 택배사 계약 원가는 없다.
create or replace function public.revgift_box_price_table()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'fees', (select jsonb_object_agg(f.tier, f.fee_krw) from public.fan_send_fees f),
    'service_fee_krw', s.box_service_fee_krw,
    'early_fee_krw', s.box_early_service_fee_krw,
    'early_left', case when public.early_creator_active(c.id, now())
                       then 30 - coalesce((select u.used from public.early_creator_monthly_usage u
                                           where u.creator_id = c.id and u.month = date_trunc('month', now() at time zone 'Asia/Seoul')::date), 0)
                       else 0 end)
  from public.pricing_settings s
  join public.creators c on c.profile_id = auth.uid()
  where auth.uid() is not null;
$$;

-- 처리할 일 카드 — 확인 필요(INV-GB12: 선물함 이름 · 작성한 닉네임 · 고를 수 있는 팬) · 취소한 선물함 상자(INV-GB23). 주인 본인 것만.
create or replace function public.my_revgift_box_cards()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.card order by x.at), '[]'::jsonb)
  from (
    select h.created_at as at, jsonb_build_object(
      'kind', 'hold', 'id', h.id, 'box_id', b.id, 'box_name', b.name, 'written_nickname', h.written_nickname, 'created_at', h.created_at,
      'due_at', h.created_at + make_interval(hours => (public.revgift_box_rules() ->> 'hold_hours')::integer),
      'candidates', coalesce((
        select jsonb_agg(jsonb_build_object('application_id', a.id, 'nickname', p.nickname) order by p.nickname)
        from public.revgift_box_applications a join public.profiles p on p.id = a.fan_id
        where a.box_id = b.id and a.status in ('selected', 'measured')), '[]'::jsonb)) as card
    from public.revgift_box_holds h join public.revgift_boxes b on b.id = h.box_id
    where auth.uid() is not null and b.owner_id = auth.uid() and h.resolved_at is null and h.expired_at is null
    union all
    select c.created_at, jsonb_build_object(
      'kind', 'cancelled_arrival', 'id', c.id, 'box_id', b.id, 'box_name', b.name, 'created_at', c.created_at,
      'due_at', c.created_at + make_interval(hours => (public.revgift_box_rules() ->> 'cancelled_arrival_hours')::integer))
    from public.revgift_box_cancelled_arrivals c join public.revgift_boxes b on b.id = c.box_id
    where auth.uid() is not null and b.owner_id = auth.uid() and c.choice is null
  ) x;
$$;

-- ── 자동 처리 (INV-GB1 Q10 · GB11 · GB12 Q11 · GB23) ──
-- 5분마다. 선물함마다 따로 처리한다 — 한 선물함이 실패해도(0033 전의 도착 안 함 등) 나머지는 진행하고, 실패한 것은 다음 회차에 다시 본다.
--   ① 「다음」 + 720시간, 큰 상자 없음 → 자동 취소(Q10)
--   ② 첫 입고 + 168시간 → 담길 차례로 남은 신청은 도착 안 함, 같은 처리에서 사본 삭제(INV-GB11)
--   ③ 확인 필요 + 168시간 → 닫힘(신청 없는 선물, Q11). 남은 확인 필요가 없으면 arrived
--   ④ 취소한 선물함 상자 카드 + 168시간 무응답 → 「돌려받기」(INV-GB23)
--   ⑤ 도착한 선물함마다 명세서를 다시 본다(0033 적용 뒤 기다리던 것이 만들어진다)
create or replace function public.revgift_box_tick()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rules jsonb := public.revgift_box_rules();
  r record;
  v public.revgift_boxes;
  v_ids uuid[];
  n_cancel integer := 0;
  n_missing integer := 0;
  n_hold integer := 0;
  n_card integer := 0;
  n_failed integer := 0;
begin
  for r in select b.id from public.revgift_boxes b
           where b.status = 'awaiting_box' and now() >= b.box_requested_at + make_interval(hours => (v_rules ->> 'awaiting_box_hours')::integer) loop
    begin
      select * into v from public.revgift_boxes b where b.id = r.id for update;
      if v.status = 'awaiting_box' and not exists (select 1 from public.revgift_box_cartons c where c.box_id = v.id) then
        perform public.revgift_box_cancel_locked(v.id);
        n_cancel := n_cancel + 1;
      end if;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 자동 취소 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select b.id from public.revgift_boxes b
           where b.status in ('arrived', 'held') and now() >= b.first_received_at + make_interval(hours => (v_rules ->> 'carton_wait_hours')::integer)
             and exists (select 1 from public.revgift_box_applications a where a.box_id = b.id and a.status = 'selected') loop
    begin
      select * into v from public.revgift_boxes b where b.id = r.id for update;
      with gone as (
        update public.revgift_box_applications set status = 'missing' where box_id = v.id and status = 'selected' returning id
      ) select array_agg(id) into v_ids from gone;
      if v_ids is not null then
        perform pii.revgift_box_drop_copies(v_ids, 'missing');
        n_missing := n_missing + cardinality(v_ids);
      end if;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 도착 안 함 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select h.id, h.box_id from public.revgift_box_holds h
           where h.resolved_at is null and h.expired_at is null and now() >= h.created_at + make_interval(hours => (v_rules ->> 'hold_hours')::integer) loop
    select * into v from public.revgift_boxes b where b.id = r.box_id for update;
    update public.revgift_box_holds set expired_at = now() where id = r.id and resolved_at is null and expired_at is null;
    if v.status = 'held' and not exists (select 1 from public.revgift_box_holds h where h.box_id = v.id and h.resolved_at is null and h.expired_at is null) then
      update public.revgift_boxes set status = 'arrived' where id = v.id;
    end if;
    n_hold := n_hold + 1;
  end loop;

  for r in select c.id, c.box_id, c.unmatched_id from public.revgift_box_cancelled_arrivals c
           where c.choice is null and now() >= c.created_at + make_interval(hours => (v_rules ->> 'cancelled_arrival_hours')::integer) loop
    perform 1 from public.revgift_boxes b where b.id = r.box_id for update;
    update public.revgift_box_cancelled_arrivals set choice = 'return', chosen_at = now(), auto = true where id = r.id and choice is null;
    update public.office_unmatched set expired_at = coalesce(expired_at, now()) where id = r.unmatched_id and matched_at is null;
    n_card := n_card + 1;
  end loop;

  for r in select b.id from public.revgift_boxes b where b.status = 'arrived' loop
    begin
      perform public.revgift_box_try_invoice(r.id);
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 명세서 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('cancelled', n_cancel, 'missing', n_missing, 'holds_expired', n_hold, 'cards_returned', n_card, 'failed', n_failed);
end $$;

select cron.schedule('fankkuk-gift-boxes', '*/5 * * * *', 'select public.revgift_box_tick()');

-- ── 권한 ─────────────────────────────────────────
-- 화면에서 부르는 것은 로그인한 사람만(판정은 함수 안에서 로그인 토큰으로). 내부 처리·자동 처리는 아무도 직접 부르지 못한다.

revoke all on function public.revgift_box_tier_of(numeric, numeric) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_label_text(bigint) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_cancel_locked(uuid) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_try_invoice(uuid) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_tick() from public, anon, authenticated, service_role;

revoke all on function public.revgift_box_cancel(uuid) from public, anon, service_role;
revoke all on function public.revgift_box_submit_tiers(uuid, jsonb) from public, anon, service_role;
revoke all on function public.revgift_box_set_carton_count(uuid, integer) from public, anon, service_role;
revoke all on function public.office_gift_box_receive(text, text, integer, text) from public, anon, service_role;
revoke all on function public.office_gift_box_lookup(text) from public, anon, service_role;
revoke all on function public.office_gift_box_measure(text, text, text, numeric, numeric, integer) from public, anon, service_role;
revoke all on function public.revgift_box_resolve_hold(uuid, uuid) from public, anon, service_role;
revoke all on function public.revgift_box_choose_cancelled_arrival(uuid, text) from public, anon, service_role;
revoke all on function public.my_revgift_box(uuid) from public, anon, service_role;
revoke all on function public.my_revgift_box_labels(uuid) from public, anon, service_role;
revoke all on function public.revgift_box_price_table() from public, anon, service_role;
revoke all on function public.my_revgift_box_cards() from public, anon, service_role;

grant execute on function public.revgift_box_cancel(uuid) to authenticated;
grant execute on function public.revgift_box_submit_tiers(uuid, jsonb) to authenticated;
grant execute on function public.revgift_box_set_carton_count(uuid, integer) to authenticated;
grant execute on function public.office_gift_box_receive(text, text, integer, text) to authenticated;
grant execute on function public.office_gift_box_lookup(text) to authenticated;
grant execute on function public.office_gift_box_measure(text, text, text, numeric, numeric, integer) to authenticated;
grant execute on function public.revgift_box_resolve_hold(uuid, uuid) to authenticated;
grant execute on function public.revgift_box_choose_cancelled_arrival(uuid, text) to authenticated;
grant execute on function public.my_revgift_box(uuid) to authenticated;
grant execute on function public.my_revgift_box_labels(uuid) to authenticated;
grant execute on function public.revgift_box_price_table() to authenticated;
grant execute on function public.my_revgift_box_cards() to authenticated;
