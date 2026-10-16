-- 크리에이터 찾기 카드에 각자 꾸민 모양을 싣는다(2026-10-16 사용자 「크리에이터 찾기에서 보면 그렇게 등록한대로 나오도록」).
-- 카드 목록(find_creators)과 같은 사람 — 본인 확인됨 그리고 찾기 노출 켜짐 — 의 배경사진·팬덤 심볼 경로와 팬덤 이름만 한 번에 돌려준다.
-- 이 값은 공개 페이지에서 이미 누구나 읽는 공개 칸이다(creator_link_extras, 20261014000004). 새로 드러나는 칸은 없다 —
-- 카드마다 creator_link_extras 를 부르지 않게 목록 한 번으로 모은 것뿐이다. 퍼스널 컬러·팬컬러는 find_creators 가 이미 준다.
-- 다시 적용해도 결과가 같다(drop if exists 뒤 create).

drop function if exists public.find_creators_look();

create function public.find_creators_look()
returns table (id uuid, bg_path text, symbol_path text, fan_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.bg_path, c.symbol_path, c.fan_name
  from public.creators c
  where c.identity_verified and c.searchable;
$$;

revoke all on function public.find_creators_look() from public;
grant execute on function public.find_creators_look() to anon, authenticated;
