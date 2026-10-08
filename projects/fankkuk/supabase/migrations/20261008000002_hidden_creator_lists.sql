-- 찾기 노출을 끈 크리에이터는 목록 읽기에서도 뺀다 (my-account INV-A10·S10b, DECISIONS 2026-10-08 — 정책 질문 ⑥).
-- 지금까지 노출을 끄면 찾기(find_creators)에서만 빠지고, 메인·선물 보내기·팔로우 목록이 쓰는 목록(list_creators)을 직접 부르면 나왔다.
-- 1) creator_rows — 본인 확인된 크리에이터 전부의 공개 줄. 안에서만 쓴다(실행 권한 없음). 내용은 20261007000004 의 list_creators 그대로.
-- 2) list_creators — 노출 켜짐, 또는 보는 사람이 팔로우함, 또는 보는 사람이 그 크리에이터 본인. 반환 꼴은 그대로.
-- 3) find_creators — 노출 켜짐만(그대로). creator_rows 를 읽게 바꾼다.
-- 4) creator_by_id — 한 명 읽기. 노출과 상관없이 본인 확인됨이면 돌려준다. 페이지 주소로 여는 길(크리에이터 페이지·선물 보내기 미리 고르기).

create function public.creator_rows()
returns table (
  id uuid,
  slug text,
  name text,
  channel text,
  channel_title text,
  tags text[],
  intro text,
  alias text,
  avg_approval_hours integer,
  face_tone text,
  approval_minutes_from_orders integer,
  searchable boolean,
  profile_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, c.channel, c.channel_title,
         coalesce((select array_agg(o.name order by o.position, o.created_at, o.id)
                     from public.creator_tags t
                     join public.creator_tag_options o on o.id = t.option_id
                    where t.creator_id = c.id and not o.hidden), '{}'::text[]),
         c.intro, c.alias, c.avg_approval_hours, c.face_tone,
         (select round(avg(extract(epoch from (o.approved_at - o.registered_at)) / 60))::integer
            from public.orders o
           where o.creator_id = c.id and o.approved_at is not null and o.registered_at is not null),
         c.searchable, c.profile_id
  from public.creators c
  where c.identity_verified
  order by c.created_at, c.id;
$$;

create or replace function public.list_creators()
returns table (
  id uuid,
  slug text,
  name text,
  channel text,
  channel_title text,
  tags text[],
  intro text,
  alias text,
  avg_approval_hours integer,
  face_tone text,
  approval_minutes_from_orders integer
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders
  from public.creator_rows() r
  where r.searchable
     or r.profile_id = auth.uid()
     or exists (select 1 from public.follows f where f.creator_id = r.id and f.fan_id = auth.uid());
$$;

create or replace function public.find_creators()
returns table (
  id uuid,
  slug text,
  name text,
  channel text,
  channel_title text,
  tags text[],
  intro text,
  alias text,
  avg_approval_hours integer,
  face_tone text,
  approval_minutes_from_orders integer
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders
  from public.creator_rows() r
  where r.searchable;
$$;

create function public.creator_by_id(p_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  channel text,
  channel_title text,
  tags text[],
  intro text,
  alias text,
  avg_approval_hours integer,
  face_tone text,
  approval_minutes_from_orders integer
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders
  from public.creator_rows() r
  where r.id = p_id;
$$;

revoke all on function public.creator_rows() from public, anon, authenticated;
revoke all on function public.creator_by_id(uuid) from public;
grant execute on function public.creator_by_id(uuid) to anon, authenticated;
