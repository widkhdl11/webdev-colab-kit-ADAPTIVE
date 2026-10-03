-- 역조공 — 크리에이터가 자기 팬에게 보내는 선물. 스펙: docs/specs/reverse-gift.md (INV-R1~R12)
-- 이 파일은 개인정보 구역(pii)을 건드리지 않는다. 팬 주소 저장(받기)과 주소 지우기(몫 닫기)는
-- supabase/manual/0005_revgift_address.sql 에 있다 — 사람이 직접 적용한다.
--
-- 용어: 보내기(revgift_sends) = 결제 하나. 몫(revgift_shares) = 보내기 안에서 팬 한 명에게 가는 상자 하나.
-- 오류 코드: 22023 입력 꼴 · 42501 보낼 수 없는 계정 · P0002 없는 몫(남의 몫 포함 — 같은 답) · P0021 받을 수 없는 사람
--            · P0022 지금 상태에서는 할 수 없음

-- ── 표 ──────────────────────────────────────────────────

create table public.revgift_sends (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id), -- 보내는 크리에이터의 계정
  creator_id uuid not null references public.creators (id), -- 그 크리에이터의 페이지(팔로우가 걸리는 곳)
  toss_order_id text not null unique check (toss_order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  amount_krw integer not null check (amount_krw > 0),
  goods_krw integer not null check (goods_krw >= 0),
  service_fee_krw integer not null check (service_fee_krw >= 0),
  -- INV-R3: 역조공은 검수비를 받지 않는다
  inspection_fee_krw integer not null check (inspection_fee_krw = 0),
  shipping_fee_krw integer not null check (shipping_fee_krw >= 0),
  status public.payment_status not null default 'pending',
  payment_key text,
  created_at timestamptz not null default now(),
  settled_at timestamptz, -- 결제 완료 시각 = 받기 기한(168시간)의 시작(INV-R10)
  constraint revgift_sends_breakdown_sum check (goods_krw + service_fee_krw + inspection_fee_krw + shipping_fee_krw = amount_krw),
  check ((status = 'done') = (payment_key is not null)),
  check ((status = 'done') = (settled_at is not null))
);
create index revgift_sends_sender_idx on public.revgift_sends (sender_id, created_at desc);

create table public.revgift_shares (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.revgift_sends (id) on delete cascade,
  seq smallint not null check (seq between 1 and 10),
  order_no text not null unique check (order_no ~ '^RG-[0-9A-Z]{3,12}$'),
  fan_id uuid not null references public.profiles (id),
  tier public.parcel_tier not null check (tier <> 'oversize'),
  amount_krw integer not null check (amount_krw > 0),
  shipping_fee_krw integer not null check (shipping_fee_krw >= 0 and shipping_fee_krw <= amount_krw),
  -- 팬의 답: 기다리는 중 → 받음 / 받지 않기 / 기한 지남(INV-R10)
  reply text not null default 'waiting' check (reply in ('waiting', 'accepted', 'declined', 'expired')),
  replied_at timestamptz,
  received_at timestamptz, -- 사무실 입고
  inspected_at timestamptz,
  shipped_at timestamptz, -- 출고 확정
  returned_at timestamptz, -- 크리에이터에게 반송
  cancelled_at timestamptz,
  unique (send_id, seq),
  -- INV-R3: 한 보내기 안에 같은 팬은 한 번
  unique (send_id, fan_id),
  check ((reply = 'waiting') = (replied_at is null)),
  check (shipped_at is null or (reply = 'accepted' and inspected_at is not null)),
  check (inspected_at is null or received_at is not null)
);
create index revgift_shares_fan_idx on public.revgift_shares (fan_id);

-- 몫마다 환불은 한 번(INV-R11). 금액 상한은 아래 트리거가 지킨다.
create table public.revgift_refunds (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null unique references public.revgift_shares (id) on delete cascade,
  amount_krw integer not null check (amount_krw >= 0),
  created_at timestamptz not null default now()
);

-- INV-R11: 몫 하나의 환불은 그 몫 금액을 넘지 않고, 한 보내기의 환불 합계는 결제 금액을 넘지 않는다.
create function public.revgift_refund_within_paid()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_paid integer;
  v_refunded integer;
begin
  select * into v_share from public.revgift_shares where id = new.share_id;
  if new.amount_krw > v_share.amount_krw then
    raise exception '몫 금액보다 많이 환불할 수 없다' using errcode = '23514';
  end if;
  select amount_krw into v_paid from public.revgift_sends where id = v_share.send_id for update;
  select coalesce(sum(r.amount_krw), 0) into v_refunded
  from public.revgift_refunds r join public.revgift_shares s on s.id = r.share_id
  where s.send_id = v_share.send_id;
  if v_refunded + new.amount_krw > v_paid then
    raise exception '환불 합계가 결제 금액을 넘는다' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger revgift_refund_within_paid before insert on public.revgift_refunds
for each row execute function public.revgift_refund_within_paid();

-- 화면 쪽 키로는 표를 직접 읽거나 쓰지 못한다 — 정책을 두지 않는다(INV-R8). 읽기는 아래 함수로만.
alter table public.revgift_sends enable row level security;
alter table public.revgift_shares enable row level security;
alter table public.revgift_refunds enable row level security;

-- ── 받는 기한 ───────────────────────────────────────────

-- INV-R10: 결제 완료 시각부터 168시간. 판정은 서버 시각 기준이다.
create function public.revgift_deadline(p_settled_at timestamptz)
returns timestamptz
language sql immutable
as $$ select p_settled_at + interval '168 hours' $$;

-- ── 받는 팬 찾기(INV-R2) ────────────────────────────────

-- 로그인한 크리에이터가 아이디를 정확히 넣었을 때, 그 아이디가 나를 팔로우하는 팬 계정이면 한 줄, 아니면 빈 결과.
-- 없는 아이디·팔로우 안 한 팬·크리에이터 아이디·부르는 사람이 크리에이터가 아님 — 모두 같은 빈 결과다.
create function public.find_revgift_fan(p_login_id text)
returns table (fan_id uuid, login_id text, nickname text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.login_id, p.nickname
  from public.profiles p
  join public.follows f on f.fan_id = p.id
  join public.creators c on c.id = f.creator_id
  join public.profiles me on me.id = c.profile_id
  where p.login_id = p_login_id
    and p.role = 'fan'
    and c.profile_id = auth.uid()
    and me.role = 'creator';
$$;

-- ── 보내기 등록(앱 서버 전용) ───────────────────────────

-- 보내기 + 몫들 + 결제 대기를 한 번에 만든다. 금액은 앱 서버가 요금표로 계산해 넘기고(INV-R3), 여기서는 합만 맞춘다.
-- p_shares: [{ fan_id, tier, order_no, amount_krw, shipping_fee_krw }, ...]
-- 앱 서버도 같은 판정을 따로 한다 — 이 함수는 그 판정이 빠져도 남는 두 번째 장치다.
create function public.register_revgift(
  p_sender uuid,
  p_shares jsonb,
  p_toss_order_id text,
  p_goods_krw integer,
  p_service_fee_krw integer,
  p_inspection_fee_krw integer,
  p_shipping_fee_krw integer,
  p_amount_krw integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_send_id uuid;
  v_n integer;
  v_sum integer;
begin
  if jsonb_typeof(p_shares) is distinct from 'array' then
    raise exception '몫 목록이 아니다' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_shares);
  if v_n = 0 or v_n > 10 then
    raise exception '받는 팬은 1~10명' using errcode = '22023';
  end if;

  select c.id into v_creator_id
  from public.creators c join public.profiles p on p.id = c.profile_id
  where c.profile_id = p_sender and p.role = 'creator';
  if v_creator_id is null then
    raise exception '역조공은 크리에이터만 보낸다' using errcode = '42501';
  end if;

  -- INV-R1: 받는 사람은 지금 이 크리에이터를 팔로우하는 팬 계정이다(크리에이터·자기 자신·팔로우 안 한 팬은 아니다)
  if exists (
    select 1 from jsonb_array_elements(p_shares) s
    where not exists (
      select 1 from public.profiles p
      join public.follows f on f.fan_id = p.id and f.creator_id = v_creator_id
      where p.id = (s ->> 'fan_id')::uuid and p.role = 'fan'
    )
  ) then
    raise exception '나를 팔로우하는 팬에게만 보낼 수 있다' using errcode = 'P0021';
  end if;

  select coalesce(sum((s ->> 'amount_krw')::integer), 0) into v_sum from jsonb_array_elements(p_shares) s;
  if v_sum <> p_amount_krw then
    raise exception '몫 금액의 합이 결제 금액과 다르다' using errcode = '22023';
  end if;

  insert into public.revgift_sends (sender_id, creator_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (p_sender, v_creator_id, p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw)
  returning id into v_send_id;

  insert into public.revgift_shares (send_id, seq, order_no, fan_id, tier, amount_krw, shipping_fee_krw)
  select v_send_id, s.ord::smallint, s.v ->> 'order_no', (s.v ->> 'fan_id')::uuid, (s.v ->> 'tier')::public.parcel_tier,
         (s.v ->> 'amount_krw')::integer, (s.v ->> 'shipping_fee_krw')::integer
  from jsonb_array_elements(p_shares) with ordinality as s(v, ord);

  return v_send_id;
end $$;

-- ── 결제(앱 서버 전용) ──────────────────────────────────

-- 결제 대기 → 승인 중은 한 요청만 성공한다(payment INV-M5 와 같은 장치).
create function public.claim_revgift_payment(p_toss_order_id text)
returns boolean
language sql security definer set search_path = ''
as $$
  with claimed as (
    update public.revgift_sends set status = 'confirming'
    where toss_order_id = p_toss_order_id and status = 'pending'
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- 결제 결과 반영. done 이면 settled_at 이 받기 기한의 시작이 된다. 이미 끝난 결제는 아무것도 바꾸지 않는다.
create function public.settle_revgift_payment(p_toss_order_id text, p_status public.payment_status, p_payment_key text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('done', 'failed') then
    raise exception 'done 또는 failed 만' using errcode = '22023';
  end if;
  update public.revgift_sends
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = case when p_status = 'done' then now() end
  where toss_order_id = p_toss_order_id and status in ('pending', 'confirming');
  return found;
end $$;

-- ── 팬: 받지 않기(INV-R10) ──────────────────────────────

-- 로그인한 팬 본인의 몫만. 결제 전·남의 몫·없는 몫은 같은 답(P0002). 기다리는 중이 아니거나 기한이 지났으면 P0022.
create function public.decline_revgift(p_order_no text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_send public.revgift_sends;
begin
  select * into v_share from public.revgift_shares where order_no = p_order_no for update;
  if not found or v_share.fan_id is distinct from auth.uid() then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  select * into v_send from public.revgift_sends where id = v_share.send_id;
  if v_send.status <> 'done' then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_share.reply <> 'waiting' or now() >= public.revgift_deadline(v_send.settled_at) then
    raise exception '지금은 받지 않기를 할 수 없다' using errcode = 'P0022';
  end if;
  update public.revgift_shares set reply = 'declined', replied_at = now() where id = v_share.id;
end $$;

-- ── 기한 처리(앱 서버 전용, INV-R10) ────────────────────

-- 168시간이 지나도록 기다리는 중인 몫을 「기한 지남」으로. 한 문장이라 같은 몫의 받기와 겹치면
-- 행 잠금 순서대로 하나만 반영된다 — 받기가 먼저 끝나면 이 문장은 그 몫을 건너뛴다.
create function public.expire_revgifts(p_now timestamptz default now())
returns integer
language sql security definer set search_path = ''
as $$
  with expired as (
    update public.revgift_shares s
    set reply = 'expired', replied_at = p_now
    from public.revgift_sends d
    where d.id = s.send_id
      and d.status = 'done'
      and s.reply = 'waiting'
      and p_now >= public.revgift_deadline(d.settled_at)
    returning 1
  )
  select count(*)::integer from expired;
$$;

-- ── 환불 기록(앱 서버 전용, INV-R11) ────────────────────

-- 받지 않음(거절·기한 지남)이 된 몫의 환불액을 정해 한 번만 기록한다.
-- payment INV-M8 의 표를 몫에 적용: 입고 전 = 그 몫 전액, 입고 뒤 = 반송 택배비(그 몫의 배송비 칸)를 뺀 금액.
create function public.record_revgift_refund(p_order_no text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_amount integer;
begin
  select * into v_share from public.revgift_shares where order_no = p_order_no for update;
  if not found then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_share.reply not in ('declined', 'expired') or v_share.shipped_at is not null then
    raise exception '환불할 수 있는 몫이 아니다' using errcode = 'P0022';
  end if;
  v_amount := case when v_share.received_at is null then v_share.amount_krw
                   else v_share.amount_krw - v_share.shipping_fee_krw end;
  insert into public.revgift_refunds (share_id, amount_krw) values (v_share.id, v_amount);
  return v_amount;
end $$;

-- ── 읽기 ────────────────────────────────────────────────

-- INV-R8: 보낸 크리에이터에게는 팬 아이디·닉네임·상자·상태 셋만. 거절과 기한 지남은 같은 「not_received」다.
-- 결제가 끝난 보내기만 나온다.
create function public.my_sent_revgifts()
returns table (order_no text, sent_at timestamptz, fan_login_id text, fan_nickname text, tier public.parcel_tier, state text)
language sql stable security definer set search_path = ''
as $$
  select s.order_no, d.settled_at, p.login_id, p.nickname, s.tier,
         case s.reply when 'waiting' then 'waiting' when 'accepted' then 'accepted' else 'not_received' end
  from public.revgift_sends d
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles p on p.id = s.fan_id
  where d.sender_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc, s.seq;
$$;

-- 팬 본인이 받은 역조공. 본인 화면에서는 거절과 기한 지남을 나눠 보여 준다.
create function public.my_received_revgifts()
returns table (
  order_no text, creator_name text, tier public.parcel_tier, reply text, deadline timestamptz, shipped boolean, returned boolean
)
language sql stable security definer set search_path = ''
as $$
  select s.order_no, cp.nickname, s.tier, s.reply, public.revgift_deadline(d.settled_at),
         s.shipped_at is not null, (s.returned_at is not null or s.cancelled_at is not null)
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  join public.profiles cp on cp.id = d.sender_id
  where s.fan_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc;
$$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.revgift_refund_within_paid() from public, anon, authenticated;
revoke all on function public.register_revgift(uuid, jsonb, text, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_revgift_payment(text) from public, anon, authenticated;
revoke all on function public.settle_revgift_payment(text, public.payment_status, text) from public, anon, authenticated;
revoke all on function public.expire_revgifts(timestamptz) from public, anon, authenticated;
revoke all on function public.record_revgift_refund(text) from public, anon, authenticated;
grant execute on function public.register_revgift(uuid, jsonb, text, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.claim_revgift_payment(text) to service_role;
grant execute on function public.settle_revgift_payment(text, public.payment_status, text) to service_role;
grant execute on function public.expire_revgifts(timestamptz) to service_role;
grant execute on function public.record_revgift_refund(text) to service_role;

revoke all on function public.find_revgift_fan(text) from public, anon;
revoke all on function public.decline_revgift(text) from public, anon;
revoke all on function public.my_sent_revgifts() from public, anon;
revoke all on function public.my_received_revgifts() from public, anon;
grant execute on function public.find_revgift_fan(text) to authenticated;
grant execute on function public.decline_revgift(text) to authenticated;
grant execute on function public.my_sent_revgifts() to authenticated;
grant execute on function public.my_received_revgifts() to authenticated;
