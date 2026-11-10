-- 팬이 보는 선물함에 「다 찼는지」 참/거짓 하나를 더한다(2026-11-10, 화면 명세 gift-boxes-boxId.md `enter_waitlist` · revgift-box INV-GB5 · Q6·Q20).
-- 팬 페이지 버튼과 신청 모달 확인 단계가 「대기 신청」·「정원이 차서 대기로 신청됩니다」로 바뀌어야 해서다.
-- full 의 조건은 신청 함수(revgift_box_apply, 20261109000040)가 새 신청을 대기로 받는 조건과 같다 —
--   신청 받는 중이고, 신청(applied) 수가 받을 인원 이상이거나 대기 신청이 남아 있다.
-- 숫자(신청 수·받을 인원·대기 수)는 내려보내지 않는다(Q6) — 참/거짓 하나뿐이다.
-- 본문은 20261109000040 의 정의 그대로에 'full' 한 칸만 더했다. 권한(security definer · search_path · grant)도 그대로다.
-- 다시 돌려도 결과가 같다(create or replace · revoke/grant).

create or replace function public.revgift_box_for_fan(p_box_id uuid, p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name,
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
