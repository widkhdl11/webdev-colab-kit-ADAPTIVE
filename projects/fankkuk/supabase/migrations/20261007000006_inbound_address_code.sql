-- 상자별 받는 주소 6자리 — 표 · 확인 문자 · 발급 · 무효 (docs/specs/inbound-address-code.md INV-C1·C3, 카드 d48).
--
-- 결제가 끝나면 상자(팬 선물 상자 · 역조공 몫)마다 6자리를 하나씩 발급한다. 팬은 사무실 주소 끝에 그 6자리를 붙여 보내고,
-- 사무실은 원 송장 바코드 + 6자리로 상자를 찾는다(입고 함수는 20261007000007). 지금까지의 「팬이 넣은 송장번호로 찾기」는
-- 남의 송장번호를 먼저 넣으면 남의 상자를 가져갈 수 있었다 — 그 길을 닫는다.
--
-- 1) inbound_codes: 6자리 한 줄 = 상자 하나. 상태는 유효 → 사용됨 / 유효 → 무효 한 방향뿐이다(지킴이 트리거).
--    같은 값은 동시에 둘이 유효할 수 없고(부분 유일 색인), 최근 1년 안에 사용됨·무효가 된 값은 다시 뽑지 않는다(발급 함수).
-- 2) 확인 문자: Luhn mod N(N = 20). 앱(src/entities/parcel/model/address-code.ts)과 같은 계산이다 — 통합 시험이 대조한다.
-- 3) 발급: 결제 완료 처리(settle_payment · settle_revgift_payment) 안에서 상자 수만큼. 작업 줄(office_parcels)도 그때 '입고 전'으로 만든다.
-- 4) 무효: 주문이 거절·반려·취소가 되거나 역조공 몫이 받지 않음·기한 지남·취소가 되는 그 처리 안에서(트리거 — 상태를 바꾸는 길이
--    여럿이라 함수마다 넣으면 빠지는 길이 생긴다: decline_gift · reject_order_for_decline · office_run_expiry · decline_revgift ·
--    expire_revgifts · 몫 취소(manual 0005) 등).
-- 5) 송장번호 칸을 둘로 나눈다: tracking_no = 팬이 넣는 배송 조회용 번호(선택, 매칭 열쇠 아님) /
--    inbound_waybill_no = 입고 때 스캔해 상자에 묶은 원 송장 바코드(유일).
-- 6) 이미 결제가 끝난 진행 중 주문(시드 포함)의 상자에 6자리를 채운다. 시드 데이터 자체는 바꾸지 않는다.
--
-- 오류 꼴: 22023 꼴이 아님(20자 밖 글자 포함) · P0046 확인 문자가 맞지 않음(상태 변화 없음)

-- ── 확인 문자 (INV-C1) ───────────────────────────────────

create function public.inbound_code_check_char(p_body text)
returns text
language plpgsql immutable set search_path = ''
as $$
-- Damm 방식(src/entities/parcel/model/address-code.ts 와 같은 계산). 글자 순번 i 를 (i/5 의 몫, i%5) 짝으로 보고
-- (a1, b1) * (a2, b2) = (alpha_times[a1] XOR a2, (2·b1 + b2) mod 5) 로 접는다 — 한 글자 틀림·이웃 두 글자 바뀜을 예외 없이 잡는다.
declare
  c_alpha constant text := '3479ACDEFHJKMNPRTWXY';
  c_alpha_times constant integer[] := array[0, 2, 3, 1];
  v_state integer := 0;
  v_x integer;
  i integer;
begin
  if p_body is null or p_body !~ '^[3479ACDEFHJKMNPRTWXY]{5}$' then
    raise exception '확인 문자를 계산할 앞 5자리 꼴이 아니다' using errcode = '22023';
  end if;
  for i in 1..5 loop
    v_x := strpos(c_alpha, substr(p_body, i, 1)) - 1;
    v_state := ((c_alpha_times[v_state / 5 + 1] # (v_x / 5)) * 5) + ((2 * (v_state % 5) + v_x % 5) % 5);
  end loop;
  return substr(c_alpha, c_alpha_times[v_state / 5 + 1] * 5 + (5 - (2 * (v_state % 5)) % 5) % 5 + 1, 1);
end $$;

-- 6자리 칸의 꼴 검사: 20자 안의 글자 6개 + 확인 문자 일치
create function public.inbound_code_wellformed(p_code text)
returns boolean
language plpgsql immutable set search_path = ''
as $$
begin
  if p_code is null or p_code !~ '^[3479ACDEFHJKMNPRTWXY]{6}$' then
    return false;
  end if;
  return public.inbound_code_check_char(left(p_code, 5)) = right(p_code, 1);
end $$;

-- 입력 정리: 비었으면 null, 앞뒤 공백을 지우고 대문자로. 20자 밖 글자가 있으면 확인 문자 전에 22023, 확인 문자가 틀리면 P0046.
create function public.inbound_code_parse(p_input text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := upper(btrim(coalesce(p_input, '')));
begin
  if v = '' then
    return null;
  end if;
  if v !~ '^[3479ACDEFHJKMNPRTWXY]{6}$' then
    raise exception '받는 주소 6자리 꼴이 아니다' using errcode = '22023';
  end if;
  if public.inbound_code_check_char(left(v, 5)) <> right(v, 1) then
    raise exception '받는 주소 6자리의 확인 문자가 맞지 않는다' using errcode = 'P0046';
  end if;
  return v;
end $$;

-- ── 표 ──────────────────────────────────────────────────

create table public.inbound_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null check (public.inbound_code_wellformed(code)),
  box_id uuid unique references public.boxes (id) on delete cascade,
  share_id uuid unique references public.revgift_shares (id) on delete cascade,
  state text not null default 'valid' check (state in ('valid', 'used', 'void')),
  issued_at timestamptz not null default now(),
  used_at timestamptz,
  voided_at timestamptz,
  -- 이 6자리로 처음 입고된 상자 줄 — 같은 6자리로 둘째 상자가 오면 이 줄의 출고 여부를 본다(INV-C5)
  first_parcel_id uuid references public.office_parcels (id) on delete set null,
  check (num_nonnulls(box_id, share_id) = 1),
  check ((state = 'used') = (used_at is not null)),
  check ((state = 'void') = (voided_at is not null))
);
-- 같은 값은 동시에 하나만 유효하다
create unique index inbound_codes_valid_once on public.inbound_codes (code) where state = 'valid';
create index inbound_codes_code_idx on public.inbound_codes (code);

alter table public.inbound_codes enable row level security;
revoke all on public.inbound_codes from public, anon, authenticated;

-- 유효 → 사용됨 / 유효 → 무효만. 값·상자·발급 시각은 바꾸지 않는다.
create function public.inbound_codes_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.code, new.box_id, new.share_id, new.issued_at) is distinct from (old.code, old.box_id, old.share_id, old.issued_at) then
    raise exception '받는 주소 6자리의 값·상자는 바꿀 수 없다' using errcode = '55000';
  end if;
  if new.state <> old.state and not (old.state = 'valid' and new.state in ('used', 'void')) then
    raise exception '받는 주소 6자리 상태를 % 에서 % 로 바꿀 수 없다', old.state, new.state using errcode = '55000';
  end if;
  if (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.voided_at is not null and new.voided_at is distinct from old.voided_at) then
    raise exception '받는 주소 6자리의 사용·무효 시각은 바꿀 수 없다' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger inbound_codes_guard before update on public.inbound_codes
  for each row execute function public.inbound_codes_guard();

-- ── 송장번호 칸 나누기 · 보류 표시 (INV-C5·C7·C8) ─────────────

alter table public.office_parcels
  add column tracking_no text check (tracking_no ~ '^[0-9]{10,14}$'),
  -- 같은 송장번호가 다른 상자에도 등록됨(INV-C7) — 등록한 사람에게는 알리지 않는다
  add column tracking_dispute boolean not null default false,
  -- 보류(출고 목록 밖). 추적 장치 보관(state 'held')과는 다른 것이다.
  --   code_dispute = 같은 6자리로 둘째 상자가 옴 · waybill_dispute = 같은 송장번호 분쟁 · not_mine = 주인이 「제가 보낸 게 아니에요」
  --   · detached = 분쟁 끝에 주인의 상자가 아닌 것으로 확인돼 주문에서 떼어 낸 상자(도용 의심)
  add column hold_reason text check (hold_reason in ('code_dispute', 'waybill_dispute', 'not_mine', 'detached')),
  add column hold_at timestamptz,
  add constraint office_parcels_hold_at check ((hold_reason is null) = (hold_at is null));

-- 상자에 묶이지 않은 줄은 떼어 낸 상자뿐이다
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid = 'public.office_parcels'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%num_nonnulls(box_id, share_id) = 1%';
  execute format('alter table public.office_parcels drop constraint %I', v_name);
end $$;
alter table public.office_parcels add constraint office_parcels_one_unit
  check (num_nonnulls(box_id, share_id) = 1 or (num_nonnulls(box_id, share_id) = 0 and hold_reason = 'detached'));

create index office_parcels_tracking_idx on public.office_parcels (tracking_no) where tracking_no is not null;

-- 지금까지 팬이 넣은 번호는 배송 조회용 칸으로 옮긴다. 입고 전 줄의 바코드 칸은 비운다(입고 때 스캔한 값만 묶는다).
update public.office_parcels set tracking_no = inbound_waybill_no where inbound_waybill_no is not null;
update public.office_parcels set inbound_waybill_no = null where state = 'awaiting';

-- ── 발급 (INV-C1) ────────────────────────────────────────

-- 이미 쓰인 값인가: 지금 유효하거나, 최근 1년 안에 사용됨·무효가 됐다(오래된 상자가 늦게 도착하는 경우 대비)
create function public.inbound_code_taken(p_code text)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.inbound_codes c
    where c.code = p_code
      and (c.state = 'valid' or coalesce(c.used_at, c.voided_at) > now() - interval '1 year')
  );
$$;

-- 앞 5자리를 무작위로 뽑고(순번 금지) 확인 문자를 붙인다. 256 을 20 으로 나눈 나머지 쏠림을 피하려고 240 이상은 버린다.
create function public.inbound_code_draw()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  c_alpha constant text := '3479ACDEFHJKMNPRTWXY';
  v_body text := '';
  v_byte integer;
begin
  while char_length(v_body) < 5 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < 240 then
      v_body := v_body || substr(c_alpha, v_byte % 20 + 1, 1);
    end if;
  end loop;
  return v_body || public.inbound_code_check_char(v_body);
end $$;

-- 상자(또는 몫) 하나에 6자리 하나. 이미 있으면 그 줄을 돌려준다. 겹치면 다시 뽑는다.
-- p_candidates 는 시험용 — 앞에서부터 후보로 쓰고, 다 쓰면 무작위로 뽑는다(앱·화면 키는 이 함수를 부를 수 없다).
create function public.inbound_issue_code(p_box_id uuid, p_share_id uuid, p_candidates text[] default null)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_try integer := 0;
begin
  if num_nonnulls(p_box_id, p_share_id) <> 1 then
    raise exception '상자 하나에만 발급한다' using errcode = '22023';
  end if;
  select c.id into v_id from public.inbound_codes c where c.box_id = p_box_id or c.share_id = p_share_id;
  if v_id is not null then
    return v_id;
  end if;
  loop
    v_try := v_try + 1;
    if v_try > 100 then
      raise exception '받는 주소 6자리를 발급하지 못했다' using errcode = '55000';
    end if;
    v_code := case when v_try <= coalesce(cardinality(p_candidates), 0) then p_candidates[v_try] else public.inbound_code_draw() end;
    continue when public.inbound_code_taken(v_code);
    insert into public.inbound_codes (code, box_id, share_id) values (v_code, p_box_id, p_share_id)
    on conflict (code) where state = 'valid' do nothing
    returning id into v_id;
    exit when v_id is not null;
  end loop;
  return v_id;
end $$;

-- 결제가 끝난 주문의 상자마다: 작업 줄('입고 전') + 6자리
create function public.inbound_issue_for_order(p_order_id uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_box uuid;
begin
  for v_box in select b.id from public.boxes b where b.order_id = p_order_id order by b.seq loop
    insert into public.office_parcels (box_id) values (v_box) on conflict (box_id) do nothing;
    perform public.inbound_issue_code(v_box, null);
  end loop;
end $$;

-- 결제가 끝난 역조공 보내기의 몫마다: 작업 줄('입고 전') + 6자리 (reverse-gift INV-R14 — 역조공 상자도 같은 규칙)
create function public.inbound_issue_for_send(p_send_id uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_share uuid;
begin
  for v_share in select s.id from public.revgift_shares s where s.send_id = p_send_id and s.cancelled_at is null order by s.seq loop
    insert into public.office_parcels (share_id) values (v_share) on conflict (share_id) do nothing;
    perform public.inbound_issue_code(null, v_share);
  end loop;
end $$;

-- 20261006000009_notifications.sql 의 settle_payment 와 같고, 주문이 결제 완료로 바뀐 자리에서 6자리 발급을 더했다(같은 처리).
create or replace function public.settle_payment(p_toss_order_id text, p_status payment_status, p_payment_key text, p_request_id text, p_payload text, p_requested_at timestamp with time zone)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
  v_request_id uuid;
begin
  if p_status not in ('done', 'failed') then
    raise exception 'settle_payment 는 done 또는 failed 만' using errcode = '22023';
  end if;

  update public.payments
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = now()
  where toss_order_id = p_toss_order_id and status in ('pending', 'confirming')
  returning * into v_payment;

  if not found then
    return false;
  end if;

  if p_status = 'done' and v_payment.kind = 'initial' then
    update public.orders set status = 'registered', registered_at = p_requested_at
    where id = v_payment.order_id and status = 'pending_payment';
    if found then
      insert into public.approval_requests (request_id, order_id, payload, created_at)
      values (p_request_id, v_payment.order_id, p_payload, p_requested_at)
      returning id into v_request_id;
      -- 알림 INV-N3·N8: 승인 요청 1차는 그 주문의 크리에이터 계정에게
      perform public.notification_enqueue('approval_request', v_payment.order_id, v_request_id, 1::smallint,
        (select c.profile_id from public.orders o join public.creators c on c.id = o.creator_id where o.id = v_payment.order_id),
        p_requested_at);
      -- INV-C1: 상자마다 받는 주소 6자리
      perform public.inbound_issue_for_order(v_payment.order_id);
    else
      update public.orders set registered_at = p_requested_at
      where id = v_payment.order_id and status = 'rejected' and registered_at is null;
    end if;
  end if;
  return true;
end $$;

-- 20261004000002_reverse_gifts.sql 의 settle_revgift_payment 와 같고, 결제 완료가 된 자리에서 몫마다 6자리 발급을 더했다.
create or replace function public.settle_revgift_payment(p_toss_order_id text, p_status public.payment_status, p_payment_key text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_send_id uuid;
begin
  if p_status not in ('done', 'failed') then
    raise exception 'done 또는 failed 만' using errcode = '22023';
  end if;
  update public.revgift_sends
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = case when p_status = 'done' then now() end
  where toss_order_id = p_toss_order_id and status in ('pending', 'confirming')
  returning id into v_send_id;
  if v_send_id is null then
    return false;
  end if;
  if p_status = 'done' then
    perform public.inbound_issue_for_send(v_send_id);
  end if;
  return true;
end $$;

-- ── 무효 (INV-C3) ────────────────────────────────────────

-- 주문이 거절·반려·취소가 되는 그 처리 안에서 그 주문의 유효한 6자리 전부를 무효로
create function public.inbound_void_for_order()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.boxes b
  where b.order_id = new.id and c.box_id = b.id and c.state = 'valid';
  return null;
end $$;

create trigger orders_void_inbound_codes
  after update of status on public.orders
  for each row
  when (new.status in ('rejected', 'expired', 'canceled') and old.status is distinct from new.status)
  execute function public.inbound_void_for_order();

-- 역조공 몫이 받지 않음·기한 지남·취소가 되는 그 처리 안에서
create function public.inbound_void_for_share()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.inbound_codes c
  set state = 'void', voided_at = now()
  where c.share_id = new.id and c.state = 'valid';
  return null;
end $$;

create trigger revgift_shares_void_inbound_codes
  after update of reply, cancelled_at on public.revgift_shares
  for each row
  when ((new.reply in ('declined', 'expired') and old.reply is distinct from new.reply)
        or (new.cancelled_at is not null and old.cancelled_at is null))
  execute function public.inbound_void_for_share();

-- ── 이미 결제가 끝난 진행 중 주문에 채우기 ─────────────────────

-- 팬 선물: 결제 완료 · 진행 중(거절·반려·취소·출고 아님) · 아직 입고되지 않은 상자.
-- 작업 줄은 '입고 전' 주문(registered)에만 새로 만든다 — 상자 줄 없이 앞 단계로 간 시드 주문은 입고 함수가 그때 만든다.
do $$
declare
  r record;
begin
  for r in
    select b.id, o.status from public.boxes b join public.orders o on o.id = b.order_id
    where o.registered_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and not exists (select 1 from public.inbound_codes c where c.box_id = b.id)
      and not exists (select 1 from public.office_parcels p where p.box_id = b.id and p.state <> 'awaiting')
    order by o.registered_at, b.seq
  loop
    if r.status = 'registered' then
      insert into public.office_parcels (box_id) values (r.id) on conflict (box_id) do nothing;
    end if;
    perform public.inbound_issue_code(r.id, null);
  end loop;

  -- 역조공: 결제 완료 · 취소되지 않음 · 받는 중이거나 받음 · 아직 입고되지 않은 몫
  for r in
    select s.id from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where d.status = 'done' and s.cancelled_at is null and s.reply in ('waiting', 'accepted')
      and not exists (select 1 from public.inbound_codes c where c.share_id = s.id)
      and not exists (select 1 from public.office_parcels p where p.share_id = s.id and p.state <> 'awaiting')
    order by d.settled_at, s.seq
  loop
    insert into public.office_parcels (share_id) values (r.id) on conflict (share_id) do nothing;
    perform public.inbound_issue_code(null, r.id);
  end loop;
end $$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.inbound_code_check_char(text) from public, anon, authenticated;
revoke all on function public.inbound_code_wellformed(text) from public, anon, authenticated;
revoke all on function public.inbound_code_parse(text) from public, anon, authenticated;
revoke all on function public.inbound_codes_guard() from public, anon, authenticated;
revoke all on function public.inbound_code_taken(text) from public, anon, authenticated;
revoke all on function public.inbound_code_draw() from public, anon, authenticated;
revoke all on function public.inbound_issue_code(uuid, uuid, text[]) from public, anon, authenticated, service_role;
revoke all on function public.inbound_issue_for_order(uuid) from public, anon, authenticated, service_role;
revoke all on function public.inbound_issue_for_send(uuid) from public, anon, authenticated, service_role;
revoke all on function public.inbound_void_for_order() from public, anon, authenticated, service_role;
revoke all on function public.inbound_void_for_share() from public, anon, authenticated, service_role;
