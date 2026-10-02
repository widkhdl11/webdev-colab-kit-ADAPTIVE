-- 크리에이터 목록 읽기 (선물 보내기·크리에이터 찾기). 본인 확인을 마친 크리에이터의 공개 칸만.
-- 로그인하지 않은 사람도 크리에이터를 찾을 수 있으므로 anon 에게도 연다. 계정(profile_id)은 돌려주지 않는다.
-- 평균 승인 시간(분)은 승인된 주문 기록으로 계산한다. 기록이 없으면 null — 화면은 소개 칸 값(avg_approval_hours)을 쓴다.

create function public.list_creators()
returns table (
  id uuid,
  slug text,
  name text,
  channel text,
  channel_title text,
  category text,
  intro text,
  alias text,
  avg_approval_hours integer,
  face_tone text,
  approval_minutes_from_orders integer
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, c.channel, c.channel_title, c.category, c.intro, c.alias, c.avg_approval_hours, c.face_tone,
         (select round(avg(extract(epoch from (o.approved_at - o.registered_at)) / 60))::integer
            from public.orders o
           where o.creator_id = c.id and o.approved_at is not null and o.registered_at is not null)
  from public.creators c
  where c.identity_verified
  order by c.created_at, c.id;
$$;

-- 로그인한 팬이 팔로우한 크리에이터 id.
create function public.my_follows()
returns table (creator_id uuid)
language sql stable security definer set search_path = ''
as $$
  select f.creator_id from public.follows f where f.fan_id = auth.uid() order by f.created_at;
$$;

revoke all on function public.list_creators() from public;
revoke all on function public.my_follows() from public, anon;
grant execute on function public.list_creators() to anon, authenticated;
grant execute on function public.my_follows() to authenticated;
