-- 보낸 역조공 읽기에 「사무실로 보낼 상자가 남았는지」(ship_to_office) 칸을 더한다.
-- 스펙: docs/specs/reverse-gift.md (INV-R14)
--
-- 주소 값 자체는 DB 에 두지 않는다 — 앱 서버가 팬 선물 안내와 같은 한 곳에서 읽어, 이 칸이 참인 보내기에만 붙인다.
-- 참 조건(보내기 단위, 그 보내기의 모든 몫에 같은 값): 결제가 끝났고(이 함수는 원래 결제 완료만 준다),
-- 몫 가운데 하나라도 아직 상자를 받을 수 있다 — 받음이거나 기한 안에 기다리는 중이고, 반송·취소되지 않았다.
-- 팬의 받기는 기다리지 않는다(받기는 출고 전에만 있으면 된다, INV-R7). 기한이 지났는데 아직 기한 처리 전인 몫은
-- 크리에이터 화면의 「받지 않았어요」와 같은 기준으로 받지 않음으로 본다.
-- 돌려주는 칸이 늘어 create or replace 가 안 되므로 지우고 다시 만든다(권한도 다시 준다).

drop function public.my_sent_revgifts();

create function public.my_sent_revgifts()
returns table (order_no text, sent_at timestamptz, fan_login_id text, fan_nickname text, tier public.parcel_tier, state text, ship_to_office boolean)
language sql stable security definer set search_path = ''
as $$
  select s.order_no, d.settled_at, p.login_id, p.nickname, s.tier,
         case
           when s.reply = 'accepted' then 'accepted'
           when s.reply = 'waiting' and now() < public.revgift_deadline(d.settled_at) then 'waiting'
           else 'not_received'
         end,
         exists (
           select 1 from public.revgift_shares x
           where x.send_id = d.id and x.returned_at is null and x.cancelled_at is null
             and (x.reply = 'accepted' or (x.reply = 'waiting' and now() < public.revgift_deadline(d.settled_at)))
         )
  from public.revgift_sends d
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles p on p.id = s.fan_id
  where d.sender_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc, s.seq;
$$;

revoke all on function public.my_sent_revgifts() from public, anon;
grant execute on function public.my_sent_revgifts() to authenticated;
