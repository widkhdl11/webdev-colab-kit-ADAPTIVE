-- 역조공 받는 팬 고르기를 팔로워 목록으로 (reverse-gift INV-R2, 문제집 E4①).
--
-- - 아이디로 팬 찾기(find_revgift_fan)를 없앤다 — 받는 팬은 내 팔로워 목록에서 고른다.
--   찾기 횟수 기록 표(revgift_fan_lookups)는 이제 아무도 쓰지 않지만 지우지 않는다(표 drop 은 처음 만든 파일에서만).
-- - 팔로워 목록은 로그인한 크리에이터 본인 것만 돌려준다. 누구 것인지는 인자가 아니라 auth.uid() 로 정한다.
-- - 한 줄 = 계정 ID(등록에 넘길 값) + 닉네임. 아이디·이메일·연락처·주소는 싣지 않는다.
-- - 크리에이터 계정·팔로우를 끊은 팬은 목록에 없다. 받는 사람이 지금 팔로워인지는 등록 함수(register_revgift)가 다시 판정한다(INV-R1).
-- - 차단(decline-block)은 역조공과 상관없다 — 목록에도 등록에도 영향이 없다.

drop function public.find_revgift_fan(text);

create function public.my_revgift_followers()
returns table (fan_id uuid, nickname text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.nickname
  from public.creators c
  join public.profiles me on me.id = c.profile_id and me.role = 'creator'
  join public.follows f on f.creator_id = c.id
  join public.profiles p on p.id = f.fan_id and p.role = 'fan'
  where c.profile_id = auth.uid()
  order by f.created_at desc, p.id;
$$;

revoke all on function public.my_revgift_followers() from public, anon;
grant execute on function public.my_revgift_followers() to authenticated;
