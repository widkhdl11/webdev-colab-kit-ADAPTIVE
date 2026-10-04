-- 관리자 환불 (admin-console INV-K2·K7·K8, payment INV-M8·M9, reverse-gift INV-R11).
--
-- 환불 한 건 = 팬 선물 결제 한 건(첫 결제·차액 결제 각각) 또는 역조공 몫 하나. 기록은 한 단위에 하나다.
-- 흐름: 대표가 「환불」 → 잡기(admin_claim_refund, 대표 로그인 토큰) 가 금액을 정하고 기록을 「처리 중」으로 잡는다
--       → 앱 서버가 결제사 취소를 부른다(멱등 키 = 환불 기록 ID) → 결과(settle_refund, 앱 서버 키) 가 완료·실패를 남긴다.
-- 실패한 기록은 다시 잡을 수 있고, 다시 잡아도 같은 기록·같은 금액이다 — 같은 멱등 키로 다른 금액을 보내지 않는다.
-- 처리 중인 기록은 2분 동안 다시 잡지 못한다(두 번 누름). 2분이 지나면 앱 서버가 중간에 죽은 것으로 보고 다시 잡게 한다 —
-- 같은 멱등 키라 결제사는 첫 요청의 결과를 돌려준다.
--
-- 오류 코드: 42501 대표가 아님 · P0002 없는 결제·몫 · P0022 환불할 수 있는 상태가 아님(돌려줄 금액 0 포함)
--            · P0023 이미 환불함 · P0024 처리 중 · 22023 입력 꼴

-- 옛 역조공 전용 환불 기록 함수는 부르는 곳이 없었다. 환불은 아래 공용 표로 한다.
-- 옛 표 revgift_refunds 는 표를 지우지 않는 규칙(표는 최초 파일에서만 만들고 지운다)에 따라 남겨 두고 쓰지 않는다 — 비어 있다.
drop function public.record_revgift_refund(text);

-- ── 표 ──────────────────────────────────────────────────

create table public.refunds (
  id uuid primary key default gen_random_uuid(), -- 결제사 취소의 멱등 키
  payment_id uuid unique references public.payments (id),
  share_id uuid unique references public.revgift_shares (id),
  amount_krw integer not null check (amount_krw > 0),
  status text not null default 'requesting' check (status in ('requesting', 'done', 'failed')),
  attempts integer not null default 1 check (attempts >= 1),
  requested_by uuid not null references public.profiles (id), -- 마지막으로 누른 대표
  last_error text check (char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  claimed_at timestamptz not null default now(),
  settled_at timestamptz,
  check (num_nonnulls(payment_id, share_id) = 1),
  check ((status = 'done') = (settled_at is not null))
);
alter table public.refunds enable row level security;
revoke all on public.refunds from anon, authenticated;

-- INV-M9 · INV-R11: 금액은 처음 정한 뒤 바뀌지 않는다. 한 결제의 환불은 그 결제 금액을, 몫 하나의 환불은 그 몫 금액을,
-- 한 보내기의 환불 합계는 그 결제 금액을 넘지 않는다.
create function public.refunds_within_paid()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit integer;
  v_share public.revgift_shares;
  v_refunded integer;
begin
  if tg_op = 'UPDATE' then
    if new.amount_krw <> old.amount_krw or new.payment_id is distinct from old.payment_id
       or new.share_id is distinct from old.share_id then
      raise exception '환불 금액·대상은 바꿀 수 없다' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.payment_id is not null then
    select amount_krw into v_limit from public.payments where id = new.payment_id for update;
    if new.amount_krw > v_limit then
      raise exception '결제 금액보다 많이 환불할 수 없다' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into v_share from public.revgift_shares where id = new.share_id;
  if new.amount_krw > v_share.amount_krw then
    raise exception '몫 금액보다 많이 환불할 수 없다' using errcode = '23514';
  end if;
  select amount_krw into v_limit from public.revgift_sends where id = v_share.send_id for update;
  select coalesce(sum(r.amount_krw), 0) into v_refunded
  from public.refunds r join public.revgift_shares s on s.id = r.share_id
  where s.send_id = v_share.send_id;
  if v_refunded + new.amount_krw > v_limit then
    raise exception '환불 합계가 결제 금액을 넘는다' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger refunds_within_paid before insert or update on public.refunds
for each row execute function public.refunds_within_paid();

-- ── 금액 (INV-M8 표) ────────────────────────────────────

-- 팬 선물 결제 한 건의 환불액. 환불할 수 없으면 null.
--   입고 전 거절·7일 자동 반려·팬 취소 → 전액
--   입고 뒤 검수 불합격 반송 → 상품 대금 칸만
--   입고 뒤 거절·7일 자동 반려 → 배송비 칸(반송 택배비)을 뺀 금액
--   입고 뒤 팬 취소 → 배송비 칸만 / 출고 뒤 → 없음
-- 차액 미납 반송은 주문에 그 상태가 아직 없어 계산하지 않는다(BACKLOG).
create function public.refund_due_of_payment(p_payment_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case
    when p.status <> 'done' or o.shipped_at is not null then null
    when o.received_at is not null and o.inspection_result = 'returned' then p.goods_krw
    when o.status not in ('rejected', 'expired', 'canceled') then null
    when o.received_at is null then p.amount_krw
    when o.status = 'canceled' then p.shipping_fee_krw
    else p.amount_krw - p.shipping_fee_krw
  end
  from public.payments p join public.orders o on o.id = p.order_id
  where p.id = p_payment_id;
$$;

-- 역조공 몫 하나의 환불액(INV-R11). 받지 않음(거절·기한 지남)이 된 몫만: 입고 전 = 그 몫 전액, 입고 뒤 = 그 몫의 배송비 칸을 뺀 금액.
create function public.refund_due_of_share(p_share_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case
    when d.status <> 'done' or s.shipped_at is not null or s.reply not in ('declined', 'expired') then null
    when s.received_at is null then s.amount_krw
    else s.amount_krw - s.shipping_fee_krw
  end
  from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
  where s.id = p_share_id;
$$;

-- ── 잡기 (대표 로그인 토큰) ──────────────────────────────

-- INV-K2·K7: 대표만. 금액은 이 함수가 정하고 화면은 금액을 보내지 않는다.
-- 결제(또는 몫) 줄을 먼저 잠가 같은 단위의 잡기를 한 줄로 세운다 — 두 번째는 첫 번째가 남긴 「처리 중」을 보고 거부된다.
create function public.admin_claim_refund(p_kind text, p_unit_id uuid)
returns table (refund_id uuid, payment_key text, amount_krw integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text;
  v_refund public.refunds;
  v_due integer;
begin
  if not public.is_owner() then
    raise exception '환불은 대표만 한다' using errcode = '42501';
  end if;
  if p_kind = 'gift' then
    select p.payment_key into v_key from public.payments p where p.id = p_unit_id for update;
    if not found then
      raise exception '결제를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.payment_id = p_unit_id for update;
  elsif p_kind = 'revgift' then
    select d.payment_key into v_key
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_unit_id for update of s;
    if not found then
      raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.share_id = p_unit_id for update;
  else
    raise exception '환불 종류는 gift 또는 revgift' using errcode = '22023';
  end if;

  if v_refund.id is not null then
    if v_refund.status = 'done' then
      raise exception '이미 환불했다' using errcode = 'P0023';
    end if;
    if v_refund.status = 'requesting' and v_refund.claimed_at > now() - interval '2 minutes' then
      raise exception '환불을 처리하고 있다' using errcode = 'P0024';
    end if;
    update public.refunds r
    set status = 'requesting', attempts = r.attempts + 1, claimed_at = now(), requested_by = auth.uid(), last_error = null
    where r.id = v_refund.id;
    return query select v_refund.id, v_key, v_refund.amount_krw;
    return;
  end if;

  v_due := case when p_kind = 'gift' then public.refund_due_of_payment(p_unit_id) else public.refund_due_of_share(p_unit_id) end;
  if v_due is null or v_due <= 0 or v_key is null then
    raise exception '환불할 수 있는 상태가 아니다' using errcode = 'P0022';
  end if;
  insert into public.refunds (payment_id, share_id, amount_krw, requested_by)
  values (case when p_kind = 'gift' then p_unit_id end, case when p_kind = 'revgift' then p_unit_id end, v_due, auth.uid())
  returning * into v_refund;
  return query select v_refund.id, v_key, v_refund.amount_krw;
end $$;

-- ── 결과 (앱 서버 키 전용) ───────────────────────────────

-- 「처리 중」인 기록에만 한 번 남는다. 바꿨으면 true.
create function public.settle_refund(p_refund_id uuid, p_ok boolean, p_error text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.refunds
  set status = case when p_ok then 'done' else 'failed' end,
      settled_at = case when p_ok then now() end,
      last_error = case when p_ok then null else left(coalesce(p_error, ''), 200) end
  where id = p_refund_id and status = 'requesting';
  return found;
end $$;

-- ── 읽기 (운영자) ───────────────────────────────────────

-- INV-K1·K8: 운영자만(아니면 빈 결과), 사람은 닉네임으로만. 결제가 끝난 것만.
-- 팬 선물은 결제 한 건이 한 줄, 역조공은 몫 하나가 한 줄(몫의 칸: 상품 대금 0 · 검수비 0 · 배송비 칸 · 나머지는 기본 서비스료).
-- refund_status: none(환불 대상 아님) · due(환불 대기) · requesting · failed · done. refund_krw: 기록된 금액, 없으면 지금 계산한 금액.
create function public.admin_payment_rows()
returns table (
  unit_kind text, unit_id uuid, order_no text, payment_kind text, payer_nickname text,
  amount_krw integer, goods_krw integer, service_fee_krw integer, inspection_fee_krw integer, shipping_fee_krw integer,
  paid_at timestamptz, refund_status text, refund_krw integer, refund_error text
)
language sql stable security definer set search_path = ''
as $$
  with units as (
    select 'gift'::text as unit_kind, p.id as unit_id, o.order_no, p.kind as payment_kind, fp.nickname as payer_nickname,
           p.amount_krw, p.goods_krw, p.service_fee_krw, p.inspection_fee_krw, p.shipping_fee_krw, p.settled_at as paid_at,
           public.refund_due_of_payment(p.id) as due, r.status as refund_state, r.amount_krw as refunded, r.last_error
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.profiles fp on fp.id = o.fan_id
    left join public.refunds r on r.payment_id = p.id
    where p.status = 'done'
    union all
    select 'revgift', s.id, s.order_no, 'revgift', cp.nickname,
           s.amount_krw, 0, s.amount_krw - s.shipping_fee_krw, 0, s.shipping_fee_krw, d.settled_at,
           public.refund_due_of_share(s.id), r.status, r.amount_krw, r.last_error
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.refunds r on r.share_id = s.id
    where d.status = 'done'
  )
  select u.unit_kind, u.unit_id, u.order_no, u.payment_kind, u.payer_nickname,
         u.amount_krw, u.goods_krw, u.service_fee_krw, u.inspection_fee_krw, u.shipping_fee_krw, u.paid_at,
         coalesce(u.refund_state, case when u.due > 0 then 'due' else 'none' end),
         coalesce(u.refunded, case when u.due > 0 then u.due end),
         u.last_error
  from units u
  where public.is_operator()
  order by u.paid_at desc, u.order_no
  limit 500;
$$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.refunds_within_paid() from public, anon, authenticated;
revoke all on function public.refund_due_of_payment(uuid) from public, anon, authenticated;
revoke all on function public.refund_due_of_share(uuid) from public, anon, authenticated;
revoke all on function public.admin_claim_refund(text, uuid) from public, anon;
revoke all on function public.settle_refund(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_payment_rows() from public, anon;
grant execute on function public.admin_claim_refund(text, uuid) to authenticated;
grant execute on function public.admin_payment_rows() to authenticated;
grant execute on function public.settle_refund(uuid, boolean, text) to service_role;
