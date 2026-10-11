-- 2026-10-11 선물 링크 페이지 아래 「이런 크리에이터도 있어요」 — 몇 명만 읽는 공개 읽기 (creator-link INV-E7, 20261011000002 에 덧붙임).
--
-- 지금까지는 6명을 보이려고 list_creators 로 크리에이터 전체(태그·평균 승인 시간까지 계산한 줄)를 읽은 뒤 화면 서버에서 잘랐다.
-- list_other_creators 는 같은 사람·같은 순서(list_creators 와 같은 노출 조건 — 찾기 노출 켜짐·나 자신·내가 팔로우한 사람, 가입 순)에서
-- 그 크리에이터를 빼고 p_limit 명만 고른 뒤, 고른 사람의 줄만 계산한다(creator_rows(p_only) 를 사람마다 부른다).
-- 돌려주는 칸은 list_creators 와 같다(공개 칸만). p_limit 은 1~12 로 자른다.
--
-- 다시 적용해도 결과가 같다(create or replace).

create or replace function public.list_other_creators(p_exclude uuid, p_limit integer)
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, handle text, photo_path text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders, r.handle, r.photo_path
  from (
    select c.id, c.created_at
    from public.creators c
    where c.identity_verified
      and c.id is distinct from p_exclude
      and (c.searchable
           or c.profile_id = auth.uid()
           or exists (select 1 from public.follows f where f.creator_id = c.id and f.fan_id = auth.uid()))
    order by c.created_at, c.id
    limit greatest(1, least(coalesce(p_limit, 6), 12))
  ) pick
  cross join lateral public.creator_rows(pick.id) r
  order by pick.created_at, pick.id;
$$;

revoke all on function public.list_other_creators(uuid, integer) from public;
grant execute on function public.list_other_creators(uuid, integer) to anon, authenticated;
