-- 팔로우 저장. 사람 ID 를 인자로 받지 않는다 — 로그인 토큰이 확인한 사람(auth.uid())의 팔로우만 바꾼다(session-login INV-L2).
-- 팬 계정만 팔로우한다. 팔로우할 수 있는 크리에이터는 찾기 목록에 나오는 사람(본인 확인을 마친 크리에이터)뿐이다.
-- 언팔로우는 대상 확인 없이 지운다 — 자기 줄만 지우므로 없는 크리에이터를 넘겨도 지워지는 것이 없다.
-- 같은 요청이 두 번 와도 결과는 같다: 이미 있으면 그대로, 없으면 그대로.

create function public.set_follow(p_creator_id uuid, p_following boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'fan') then
    raise exception '팬 계정만 팔로우한다' using errcode = '42501';
  end if;

  if p_following then
    if not exists (select 1 from public.creators c where c.id = p_creator_id and c.identity_verified) then
      raise exception '팔로우할 수 없는 크리에이터다' using errcode = 'P0002';
    end if;
    begin
      insert into public.follows (fan_id, creator_id) values (v_uid, p_creator_id);
    exception when unique_violation then
      null; -- 이미 팔로우 중
    end;
  else
    delete from public.follows f where f.fan_id = v_uid and f.creator_id = p_creator_id;
  end if;
  return p_following;
end;
$$;

revoke all on function public.set_follow(uuid, boolean) from public, anon;
grant execute on function public.set_follow(uuid, boolean) to authenticated;
