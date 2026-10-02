-- 공지 읽기 (공지 화면·메인 공지 줄). 공지는 누구나 보는 글이라 로그인하지 않은 사람에게도 연다.
-- 순서: 고정 글이 먼저, 그다음 최신순(같은 날이면 slug 순). 날짜는 서울 기준 YYYY-MM-DD 로 돌려준다.

create function public.list_notices()
returns table (slug text, title text, published_on text, pinned boolean, body jsonb)
language sql stable security definer set search_path = ''
as $$
  select n.slug, n.title, to_char(n.published_at at time zone 'Asia/Seoul', 'YYYY-MM-DD'), n.pinned, n.body
  from public.notices n
  where n.published_at <= now()
  order by n.pinned desc, n.published_at desc, n.slug;
$$;

revoke all on function public.list_notices() from public;
grant execute on function public.list_notices() to anon, authenticated;
