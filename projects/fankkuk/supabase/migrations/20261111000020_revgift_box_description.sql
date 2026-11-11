-- 선물함에 「간단한 설명」 한 칸을 더한다(2026-11-11 사용자 지시 — 만들기 모달 1단계 「선물함 이름」 아래, 선택 입력).
-- 팬 신청 화면 · 크리에이터 공개 페이지의 선물함 입구 · 크리에이터의 목록·신청 관리에 이름 아래 한 줄로 보인다.
--
-- 규칙: 선택(없으면 null), 앞뒤 공백을 뺀 뒤 1~100자, 한 줄(줄바꿈·보이지 않는 글자 없음).
-- 글자 검사는 팬을 부르는 이름과 같은 수준이다 — 같은 보이지 않는 글자 목록 + 같은 필터(creator_tag_text_problem: 금칙어 · 연락처 꼴 · 기호만).
-- 빈 문자열·공백만 보내면 설명 없음(null)으로 저장한다.
--
-- create_revgift_box 는 인자가 하나 늘어 옛 3인자 함수를 지우고 다시 만든다(권한도 다시). 크리에이터 판정 · 이름·인원·공개 검사 ·
-- 초대 토큰은 20261108000004 본문 그대로다(revgift-box INV-GB3). 계정·크리에이터 id 인자는 여전히 없다 — auth.uid() 한 줄만(INV-GB7).
-- 읽기 함수 넷은 바로 앞 정의 그대로에 description 한 칸만 더했다. 주인 판정 · 공개/토큰 판정 · 사람 칸(닉네임뿐, INV-GB9)은 바꾸지 않는다.
-- 다시 돌려도 결과가 같다.

-- ── 1) 칸 ──────────────────────────────────

alter table public.revgift_boxes add column if not exists description text;
alter table public.revgift_boxes drop constraint if exists revgift_boxes_description_check;
alter table public.revgift_boxes add constraint revgift_boxes_description_check check (
  description is null
  or (char_length(description) between 1 and 100
      and description = public.app_trim(description)
      and description !~ '[\r\n  ]')
);

-- ── 2) 만들기 ──────────────────────────────────

drop function if exists public.create_revgift_box(text, integer, boolean);

create or replace function public.create_revgift_box(p_name text, p_capacity integer, p_is_public boolean, p_description text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_rules jsonb := public.revgift_box_rules();
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := public.app_trim(coalesce(p_description, ''));
  v_problem text;
  v_token text;
  v_id uuid;
begin
  select c.id into v_creator_id
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where auth.uid() is not null and c.profile_id = auth.uid() and p.role = 'creator';
  if v_creator_id is null then
    raise exception '크리에이터만 선물함을 만든다' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > (v_rules ->> 'name_max')::integer then
    raise exception '선물함 이름 꼴이 틀리다' using errcode = '22023';
  end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > (v_rules ->> 'capacity_max')::integer then
    raise exception '받을 인원 꼴이 틀리다' using errcode = '22023';
  end if;
  if p_is_public is null then
    raise exception '공개 여부가 없다' using errcode = '22023';
  end if;
  -- 간단한 설명: 0~100자, 팬을 부르는 이름과 같은 글자 규칙과 같은 필터
  if char_length(v_description) > 100 then
    raise exception '간단한 설명은 0~100자다' using errcode = '22023';
  end if;
  if v_description ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
    raise exception '간단한 설명에 줄바꿈·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
  end if;
  if v_description <> '' then
    v_problem := public.creator_tag_text_problem(v_description);
    if v_problem = 'banned' then
      raise exception '간단한 설명에 쓸 수 없는 말이 들어 있다' using errcode = 'P0087';
    elsif v_problem = 'contact' then
      raise exception '간단한 설명에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'P0088';
    elsif v_problem = 'symbols' then
      raise exception '간단한 설명에 글자나 숫자가 하나는 있어야 한다' using errcode = 'P0089';
    end if;
  end if;
  if not p_is_public then
    v_token := public.revgift_box_new_token();
  end if;
  insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, invite_token, description)
  values (auth.uid(), v_creator_id, v_name, p_capacity, p_is_public, v_token, nullif(v_description, ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end $$;

revoke all on function public.create_revgift_box(text, integer, boolean, text) from public, anon, service_role;
grant execute on function public.create_revgift_box(text, integer, boolean, text) to authenticated;

-- ── 3) 읽기 ──────────────────────────────────

-- 내 선물함 목록 — 20261109000040 본문 그대로에 description 만. 돌려주는 칸이 바뀌어 지우고 다시 만든다.
drop function if exists public.my_revgift_boxes();
create function public.my_revgift_boxes()
returns table (id uuid, name text, capacity smallint, is_public boolean, status text, created_at timestamptz, active_count integer, description text)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, b.capacity, b.is_public, b.status, b.created_at,
         (select count(*)::integer from public.revgift_box_applications a
          where a.box_id = b.id and a.status not in ('excluded', 'withdrawn', 'ended', 'waitlisted')),
         b.description
  from public.revgift_boxes b
  where auth.uid() is not null and b.owner_id = auth.uid()
  order by b.created_at desc;
$$;
revoke all on function public.my_revgift_boxes() from public, anon, service_role;
grant execute on function public.my_revgift_boxes() to authenticated;

-- 신청 관리 창 — 20261110000020 본문 그대로에 description 만
create or replace function public.my_revgift_box(p_box_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'description', b.description, 'capacity', b.capacity, 'is_public', b.is_public, 'status', b.status,
    'invite_token', b.invite_token, 'created_at', b.created_at, 'ended_at', b.ended_at,
    'inbound_code', case when b.code_voided_at is null and b.status in ('awaiting_box', 'arrived', 'held') then b.inbound_code end,
    'carton_count', b.carton_count,
    'cartons_received', (select count(*) from public.revgift_box_cartons c where c.box_id = b.id),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nickname', p.nickname, 'applied_at', a.applied_at, 'status', a.status, 'chosen_tier', a.chosen_tier,
                                         'waitlist_no', public.revgift_box_waitlist_no(a.id))
                       order by a.applied_at, a.id)
      from public.revgift_box_applications a
      join public.profiles p on p.id = a.fan_id
      where a.box_id = b.id and a.status <> 'withdrawn'
    ), '[]'::jsonb),
    'invoice', (
      select jsonb_build_object(
        'amount_krw', i.amount_krw, 'shipping_fee_krw', i.shipping_fee_krw, 'service_fee_krw', i.service_fee_krw,
        'carton_cod_krw', i.carton_cod_krw, 'created_at', i.created_at,
        'pay_due_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'pay_due_hours')::integer),
        'return_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'unpaid_return_hours')::integer),
        'paying', exists (select 1 from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'confirming'),
        'paid_at', (select x.settled_at from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'done'),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'nickname', p.nickname, 'tier', l.tier, 'shipping_fee_krw', l.shipping_fee_krw, 'surcharge_region', l.surcharge_region,
                   'surcharge_krw', l.surcharge_krw, 'service_fee_krw', l.service_fee_krw, 'amount_krw', l.amount_krw,
                   'progress', case
                     when a.status in ('shipped', 'delivered') then 'shipped'
                     when a.status = 'ended' and exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done') then 'refunded'
                     when a.status = 'ended' then 'ended'
                     when a.status = 'paid' then 'paid'
                     else 'unpaid' end,
                   -- 배송 단계 재료(delivery-status INV-DS1·DS2) — 송장 출력 여부·출고한 서울 날짜·팬의 받았어요. 송장번호는 넣지 않는다(INV-DS3)
                   'printed', a.printed_at is not null or a.shipped_at is not null,
                   'shipped_on', case when a.shipped_at is not null then to_char((a.shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') end,
                   'received', a.fan_received_at is not null,
                   'carrier', (select t.carrier_state from public.delivery_trackings t where t.application_id = a.id order by t.created_at desc limit 1)) order by l.line_no)
          from public.revgift_box_invoice_lines l
          join public.revgift_box_applications a on a.id = l.application_id
          join public.profiles p on p.id = a.fan_id
          where l.invoice_id = i.id), '[]'::jsonb))
      from public.revgift_box_invoices i where i.box_id = b.id))
  from public.revgift_boxes b
  where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid();
$$;
revoke all on function public.my_revgift_box(uuid) from public, anon, service_role;
grant execute on function public.my_revgift_box(uuid) to authenticated;

-- 팬이 보는 선물함 — 20261110000010 본문 그대로에 description 만
create or replace function public.revgift_box_for_fan(p_box_id uuid, p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'description', b.description,
    'creator', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name),
    'open', b.status = 'open',
    -- 새 신청이 대기로 들어가는가(신청 함수와 같은 조건) — 숫자 없이 참/거짓만(Q6)
    'full', b.status = 'open' and (
      (select count(*) from public.revgift_box_applications x where x.box_id = b.id and x.status = 'applied') >= b.capacity
      or exists (select 1 from public.revgift_box_applications x where x.box_id = b.id and x.status = 'waitlisted')),
    'viewer', case
      when auth.uid() is null then 'guest'
      when b.owner_id = auth.uid() then 'owner'
      when (select p.role from public.profiles p where p.id = auth.uid()) <> 'fan' then 'not_fan'
      when exists (select 1 from public.follows f where f.fan_id = auth.uid() and f.creator_id = b.creator_id) then 'follower'
      else 'not_follower' end,
    'my_state', case
      when a.status is null or a.status in ('withdrawn') then 'none'
      when a.status in ('applied', 'excluded') and b.status = 'open' then 'applied'
      when a.status = 'waitlisted' and b.status = 'open' then 'waitlisted'
      when a.status in ('selected', 'measured', 'paid', 'shipped', 'delivered') then 'preparing'
      when b.status = 'cancelled' then 'cancelled'
      else 'closed' end,
    -- 자기 대기 순번 하나(INV-GB9 · Q6, 2026-11-09) — 다른 대기자·신청자는 보이지 않는다
    'waitlist_no', public.revgift_box_waitlist_no(a.id),
    'delivery', case
      when a.status in ('paid', 'shipped', 'delivered') and (a.printed_at is not null or a.shipped_at is not null) then jsonb_build_object(
        'shipped_on', case when a.shipped_at is not null then to_char((a.shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') end,
        'received', a.fan_received_at is not null,
        'can_confirm', a.status in ('shipped', 'delivered') and a.fan_received_at is null,
        'carrier', (select t.carrier_state from public.delivery_trackings t where t.application_id = a.id order by t.created_at desc limit 1)) end)
  from public.revgift_boxes b
  join public.creators c on c.id = b.creator_id
  left join public.revgift_box_applications a on a.box_id = b.id and auth.uid() is not null and a.fan_id = auth.uid()
  where b.id = p_box_id and (b.is_public or (p_token is not null and b.invite_token = p_token));
$$;
revoke all on function public.revgift_box_for_fan(uuid, text) from public, service_role;
grant execute on function public.revgift_box_for_fan(uuid, text) to anon, authenticated;

-- 크리에이터 공개 페이지의 선물함 입구 — 20261108000004 본문 그대로에 description 만. 돌려주는 칸이 바뀌어 지우고 다시 만든다.
drop function if exists public.creator_open_revgift_boxes(uuid);
create function public.creator_open_revgift_boxes(p_creator_id uuid)
returns table (id uuid, name text, description text)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, b.description from public.revgift_boxes b
  where b.creator_id = p_creator_id and b.is_public and b.status = 'open'
  order by b.created_at desc;
$$;
revoke all on function public.creator_open_revgift_boxes(uuid) from public;
grant execute on function public.creator_open_revgift_boxes(uuid) to anon, authenticated;
