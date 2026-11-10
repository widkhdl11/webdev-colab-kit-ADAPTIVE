-- 크리에이터 이름 = 닉네임(20261110000030) 고침 — 2026-11-11 코드 리뷰 낮음 둘.
-- 스펙: docs/specs/creator-display-name.md INV-CN1·CN3. 동작(무엇을 저장하나)은 그대로이고 잠금 순서·트리거 조건만 바뀐다.
--   1) update_my_creator_profile — 닉네임 갱신(profiles 잠금 → 트리거가 creators 를 고침)을 크리에이터 줄 잠금보다 먼저.
--      전에는 creators 를 먼저 잠그고 profiles 를 고쳐, 닉네임 트리거(profiles → creators)와 반대 순서라 동시에 오면 서로 기다리며 멈출 수 있었다.
--   2) creators_name_from_nickname 트리거 — 모든 update 가 아니라 이름·계정 칸이 바뀔 때만(before insert or update of name, profile_id).
--      다른 칸(소개·색 등)을 고칠 때마다 profiles 를 읽지 않는다.
-- 개인정보 구역(pii)을 건드리지 않는다.

drop trigger if exists creators_name_from_nickname on public.creators;
create trigger creators_name_from_nickname before insert or update of name, profile_id on public.creators
  for each row execute function public.creators_name_from_nickname();

create or replace function public.update_my_creator_profile(
  p_nickname text default null,
  p_intro text default null,
  p_searchable boolean default null,
  p_fan_name text default null,
  p_personal_color text default null,
  p_fan_color text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_intro text := public.app_trim(coalesce(p_intro, ''));
  v_fan_name text := public.app_trim(coalesce(p_fan_name, ''));
  v_problem text;
  v_constraint text;
  v_creator public.creators;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  -- 보낸 칸만 검사한다. null 은 「그대로 둔다」
  -- 닉네임(creator-display-name INV-CN2, signup INV-U13): 내 정보 고치기·팬 프로필과 같은 검사
  if p_nickname is not null then
    v_problem := public.nickname_problem(v_nickname);
    if v_problem = 'banned' then
      raise exception '닉네임에 쓸 수 없는 말이 들어 있다' using errcode = 'FKU05';
    elsif v_problem = 'contact' then
      raise exception '닉네임에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'FKU06';
    elsif v_problem = 'symbols' then
      raise exception '닉네임에 글자나 숫자가 하나는 있어야 한다' using errcode = 'FKU07';
    elsif v_problem is not null then
      raise exception '닉네임은 1~12자, 보이지 않는 글자 없이' using errcode = '22023';
    end if;
  end if;
  -- INV-E6: 한 줄 소개 0~40자, 줄바꿈(제어 문자·줄 구분자)과 보이지 않는 글자 없음 + 직접 입력 태그와 같은 업계 기본 필터
  if p_intro is not null then
    if char_length(v_intro) > 40 then
      raise exception '한 줄 소개는 0~40자다' using errcode = '22023';
    end if;
    if v_intro ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
      raise exception '한 줄 소개에 줄바꿈·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
    end if;
    if v_intro <> '' then
      v_problem := public.creator_tag_text_problem(v_intro);
      if v_problem = 'banned' then
        raise exception '한 줄 소개에 쓸 수 없는 말이 들어 있다' using errcode = 'P0081';
      elsif v_problem = 'contact' then
        raise exception '한 줄 소개에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'P0082';
      elsif v_problem = 'symbols' then
        raise exception '한 줄 소개에 글자나 숫자가 하나는 있어야 한다' using errcode = 'P0083';
      end if;
    end if;
  end if;
  -- 팬을 부르는 이름(추가분 4-1): 0~10자, 한 줄 소개와 같은 글자 규칙과 같은 필터
  if p_fan_name is not null then
    if char_length(v_fan_name) > 10 then
      raise exception '팬을 부르는 이름은 0~10자다' using errcode = '22023';
    end if;
    if v_fan_name ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
      raise exception '팬을 부르는 이름에 줄바꿈·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
    end if;
    if v_fan_name <> '' then
      v_problem := public.creator_tag_text_problem(v_fan_name);
      if v_problem = 'banned' then
        raise exception '팬을 부르는 이름에 쓸 수 없는 말이 들어 있다' using errcode = 'P0084';
      elsif v_problem = 'contact' then
        raise exception '팬을 부르는 이름에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'P0085';
      elsif v_problem = 'symbols' then
        raise exception '팬을 부르는 이름에 글자나 숫자가 하나는 있어야 한다' using errcode = 'P0086';
      end if;
    end if;
  end if;

  -- creator-link INV-E13: 테마 색(퍼스널 컬러) — null 은 그대로, 빈 문자열은 기본(null), 그 밖에는 파스텔 8색 가운데 하나만(대소문자 무관, 대문자로 저장).
  -- p_fan_color 는 받기만 하고 쓰지 않는다 — 팬컬러는 바꾸지 않는다(INV-E13 「저장 함수는 팬컬러를 바꾸지 않는다」)
  if p_personal_color is not null and p_personal_color <> ''
     and upper(p_personal_color) not in ('#FDE2E4', '#FFE5CC', '#FFF1B8', '#DFF5D8', '#D3F0EC', '#DCEBFF', '#E6E0FF', '#F6DFF0') then
    raise exception '테마 색은 파스텔 8색 가운데 하나다' using errcode = '22023';
  end if;

  -- 잠금 순서는 언제나 profiles → creators(닉네임 트리거·가입과 같은 순서) — 닉네임 갱신을 크리에이터 줄 잠금보다 먼저 한다(2026-11-11 코드 리뷰).
  -- 한 처리로 고친다. 닉네임이 겹치면(유일 인덱스) 다른 칸도 함께 되돌아간다.
  -- 닉네임이 바뀌면 트리거가 creators.name 을 맞추고 바꾼 기록을 남긴다(INV-CN1·CN3)
  if not exists (select 1 from public.creators c where c.profile_id = v_uid) then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  begin
    if p_nickname is not null then
      update public.profiles p set nickname = v_nickname where p.id = v_uid;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_nickname_key' then
      raise exception '이미 쓰는 닉네임이다' using errcode = 'FKU04';
    end if;
    raise;
  end;

  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  update public.creators c
  set intro = case when p_intro is null then c.intro else v_intro end,
      searchable = coalesce(p_searchable, c.searchable),
      fan_name = case when p_fan_name is null then c.fan_name else nullif(v_fan_name, '') end,
      personal_color = case when p_personal_color is null then c.personal_color else nullif(upper(p_personal_color), '') end
  where c.id = v_creator.id;
end $$;
revoke all on function public.update_my_creator_profile(text, text, boolean, text, text, text) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean, text, text, text) to authenticated;
