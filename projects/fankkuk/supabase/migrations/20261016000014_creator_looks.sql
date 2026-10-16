-- 팔로우한 크리에이터 카드에도 각자 꾸민 모양(2026-10-16 사용자 「추천대로」 — 크리에이터 찾기와 같은 카드).
-- 팔로우 목록은 찾기 노출을 끈 크리에이터도 보이므로(list_creators, my-account INV-A10 S10b) find_creators_look(노출 켠 사람만)으로는 모자란다.
-- 넘긴 id 가운데 본인 확인된 크리에이터의 배경사진·팬덤 심볼 경로와 팬덤 이름만 돌려준다 — 공개 페이지가 한 명씩 공개하는
-- creator_link_extras(조건: 본인 확인됨)와 같은 칸·같은 조건이다. 새로 드러나는 칸은 없고, 목록 한 번으로 모은 것뿐이다.
-- 로그인한 사람만 부른다(팔로우 목록은 로그인 화면). 다시 적용해도 결과가 같다(drop if exists 뒤 create).

drop function if exists public.creator_looks(uuid[]);

create function public.creator_looks(p_ids uuid[])
returns table (id uuid, bg_path text, symbol_path text, fan_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.bg_path, c.symbol_path, c.fan_name
  from public.creators c
  where c.identity_verified and c.id = any (p_ids);
$$;

revoke all on function public.creator_looks(uuid[]) from public;
grant execute on function public.creator_looks(uuid[]) to authenticated;
