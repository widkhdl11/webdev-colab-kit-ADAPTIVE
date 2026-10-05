-- 크리에이터 본인 확인 — 화면(I2)이 쓰는 읽기 둘 (creator-verification INV-V7·V11·V12).
-- 쓰기는 하나도 더하지 않는다. 앞 파일(20261006000002)의 함수를 그대로 쓴다.

-- 로그인한 크리에이터 자신의 공개 정보 가운데 확인 상태와 채널. 계정 값을 인자로 받지 않는다(INV-V11).
-- 크리에이터 「주소와 설정」 화면이 지금 확인됐는지와 지금 채널을 보여 주는 데 쓴다 — 신청 목록만으로는
-- 신청 없이 확인된 시드 크리에이터와 승인 취소를 가릴 수 없다.
create function public.my_creator_verification_state()
returns table (
  creator_id uuid, name text, channel_title text, verified boolean, platform text, channel_url text, verified_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.channel_title, c.identity_verified, c.platform, c.channel_url,
         case when c.identity_verified then (
           select max(e.at) from public.creator_verification_events e where e.creator_id = c.id and e.action = 'approve'
         ) end
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;

-- INV-V12: 지금 채널 이사 중인(확인됐고 살아 있는 신청이 있는) 크리에이터. 선물 보내기 화면의 「채널 이사 중」 안내용.
-- 등록을 막는 것은 DB 등록 함수다(register_order) — 이 목록은 안내일 뿐이다.
-- 찾기에 나오는 크리에이터의 식별값만 돌려준다(어느 채널로 옮기는지·신청 상태는 없다).
create function public.moving_creator_ids()
returns table (creator_id uuid)
language sql stable security definer set search_path = ''
as $$
  select c.id
  from public.creators c
  where c.identity_verified
    and exists (
      select 1 from public.creator_verification_applications a
      where a.account_id = c.profile_id and public.cv_is_live(a.status, a.issued_at)
    );
$$;

revoke all on function public.my_creator_verification_state() from public, anon;
grant execute on function public.my_creator_verification_state() to authenticated;
revoke all on function public.moving_creator_ids() from public;
grant execute on function public.moving_creator_ids() to anon, authenticated;
