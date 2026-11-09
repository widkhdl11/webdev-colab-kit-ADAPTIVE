-- 배송 현황 표시 — 배송 조회 웹훅 연결 전(DECISIONS 2026-11-09 「배송 현황 표시·조회 연동」 ①~⑥, docs/specs/delivery-status.md).
-- 선물함(크리에이터 → 팬)도 팬 선물과 같은 단계를 쓴다: 팬꾹에서 보냈어요(송장 출력) → 보통 1~2일 안에 도착해요(출고 다음 날) →
-- 도착했어요(받는 팬이 [받았어요]) / 확인이 없으면 출고 + 3일에 도착했어요(예상). 단계는 저장하지 않고 화면을 그릴 때 계산한다(INV-DS1) —
-- 여기서는 재료(송장 출력 여부·출고한 서울 날짜·받았어요)만 준다. 송장번호는 팬에게도 크리에이터에게도 주지 않는다(INV-DS3).
-- 신청 상태 delivered·탈퇴 기준·주소 사본 삭제 시점은 바꾸지 않는다 — 웹훅 연결 전에는 출고 기준 그대로(결정 ⑧, INV-DS5).
-- 개인정보 구역(pii)은 바꾸지 않는다.

-- ① 팬의 받았어요 기록 — 한 번 남기면 지우지 않는다. 신청 상태는 바꾸지 않는다(delivered 는 웹훅이 쓸 자리, INV-DS5)
alter table public.revgift_box_applications add column if not exists fan_received_at timestamptz;

-- ② 팬의 [받았어요](INV-DS2·DS6). 선물함 ID 만 받는다 — 신청은 로그인 토큰의 팬 것만 찾는다(남의 신청에 남길 길이 없다).
-- 출고(shipped·delivered) 뒤에만. 두 번 누르거나 동시에 눌러도 처음 시각 하나만 남는다(줄 잠금 + 비어 있을 때만 씀). 처음 남기면 true.
create or replace function public.revgift_box_fan_received(p_box_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.revgift_box_applications;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  select * into v_app from public.revgift_box_applications a
  where a.box_id = p_box_id and a.fan_id = auth.uid() for update;
  if v_app.id is null or v_app.status = 'withdrawn' then
    raise exception '신청을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_app.status not in ('shipped', 'delivered') then
    raise exception '아직 출고되지 않았다' using errcode = 'P0022';
  end if;
  if v_app.fan_received_at is not null then
    return false;
  end if;
  update public.revgift_box_applications set fan_received_at = now() where id = v_app.id;
  return true;
end $$;
revoke all on function public.revgift_box_fan_received(uuid) from public, anon, service_role;
grant execute on function public.revgift_box_fan_received(uuid) to authenticated;

-- ③ 팬이 보는 선물함 하나 — 20261108000004 본문에 「내 배송」(delivery)만 더했다. 송장을 출력했거나 출고된 내 신청일 때만 채우고, 아니면 null.
create or replace function public.revgift_box_for_fan(p_box_id uuid, p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name,
    'creator', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name),
    'open', b.status = 'open',
    'viewer', case
      when auth.uid() is null then 'guest'
      when b.owner_id = auth.uid() then 'owner'
      when (select p.role from public.profiles p where p.id = auth.uid()) <> 'fan' then 'not_fan'
      when exists (select 1 from public.follows f where f.fan_id = auth.uid() and f.creator_id = b.creator_id) then 'follower'
      else 'not_follower' end,
    'my_state', case
      when a.status is null or a.status in ('withdrawn') then 'none'
      when a.status in ('applied', 'excluded') and b.status = 'open' then 'applied'
      when a.status in ('selected', 'measured', 'paid', 'shipped', 'delivered') then 'preparing'
      when b.status = 'cancelled' then 'cancelled'
      else 'closed' end,
    'delivery', case
      when a.status in ('paid', 'shipped', 'delivered') and (a.printed_at is not null or a.shipped_at is not null) then jsonb_build_object(
        'shipped_on', case when a.shipped_at is not null then to_char((a.shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') end,
        'received', a.fan_received_at is not null,
        'can_confirm', a.status in ('shipped', 'delivered') and a.fan_received_at is null) end)
  from public.revgift_boxes b
  join public.creators c on c.id = b.creator_id
  left join public.revgift_box_applications a on a.box_id = b.id and auth.uid() is not null and a.fan_id = auth.uid()
  where b.id = p_box_id and (b.is_public or (p_token is not null and b.invite_token = p_token));
$$;
revoke all on function public.revgift_box_for_fan(uuid, text) from public, service_role;
grant execute on function public.revgift_box_for_fan(uuid, text) to anon, authenticated;

-- ④ 크리에이터의 선물함 하나 — 20261109000002 본문에 명세서 줄마다 배송 단계 재료(printed·shipped_on·received)만 더했다
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
                   'received', a.fan_received_at is not null) order by l.line_no)
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
