-- 크리에이터 이름 = 닉네임 (creator-display-name INV-CN1~CN4, DECISIONS 2026-11-05 「채널 이름도 없애고…」, 사용자 11-10 「추천대로」)
--
-- 1) creators.name 칸은 남긴다 — 읽는 SQL 이 많아서 바꾸지 않는다. 대신 언제나 그 계정의 profiles.nickname 과 같게 맞춘다(INV-CN1).
--    creators 행을 넣거나 고칠 때 name 을 닉네임으로 강제하고, 닉네임이 바뀌면 같은 처리 안에서 creators.name 도 바꾼다.
--    계정이 끊긴 행(탈퇴 — profile_id 가 비고 이름은 「탈퇴한 크리에이터」)은 건드리지 않는다.
-- 2) 크리에이터가 이름을 따로 바꾸는 경로를 없앤다(INV-CN2) — update_my_creator_profile 의 p_name 을 p_nickname 으로 바꾼다
--    (닉네임 규칙·겹침은 update_my_fan_profile·update_my_account 와 같다). create_creator_account 는 이름·채널 이름을 받지 않는다.
-- 3) 크리에이터 닉네임이 바뀔 때마다 creator_name_changes 에 언제·전·후가 남는다(INV-CN3) — 어느 경로로 바꿔도 트리거가 남긴다.
--    지금 이름이 닉네임과 다른 행은 옛 이름→닉네임을 그 표에 남기고 덮는다.
-- 4) 채널 이름(channel_title)은 더 받지 않는다(INV-CN4). 칸은 남고 빈 값이 기본이다(제약 없음).
--    채널 확인 반려 사유에서 「채널 이름이 다름」(name_mismatch)을 뺀다(creator-verification INV-V19) — 예전 기록은 표 제약이 그대로 받아 남는다.

-- ── 1) creators 행의 이름은 닉네임 ─────────────────────────────
create or replace function public.creators_name_from_nickname()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nickname text;
begin
  if new.profile_id is null then
    return new;
  end if;
  select p.nickname into v_nickname from public.profiles p where p.id = new.profile_id;
  if v_nickname is not null then
    new.name := v_nickname;
  end if;
  return new;
end $$;
revoke all on function public.creators_name_from_nickname() from public, anon, authenticated;

-- 닉네임이 바뀌면 그 계정의 크리에이터 이름도 바꾸고 기록을 남긴다(INV-CN1·CN3)
create or replace function public.creators_follow_nickname()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator record;
begin
  for v_creator in
    select c.id, c.name from public.creators c where c.profile_id = new.id for no key update
  loop
    if v_creator.name is distinct from new.nickname then
      insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, new.nickname);
      update public.creators c set name = new.nickname where c.id = v_creator.id;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.creators_follow_nickname() from public, anon, authenticated;

-- ── 기존 데이터: 다른 이름은 기록을 남기고 닉네임으로 덮는다 ──────────
insert into public.creator_name_changes (creator_id, before_name, after_name)
select c.id, c.name, p.nickname
from public.creators c join public.profiles p on p.id = c.profile_id
where c.name is distinct from p.nickname;

update public.creators c set name = p.nickname
from public.profiles p
where p.id = c.profile_id and c.name is distinct from p.nickname;

drop trigger if exists creators_name_from_nickname on public.creators;
create trigger creators_name_from_nickname before insert or update on public.creators
  for each row execute function public.creators_name_from_nickname();
drop trigger if exists profiles_nickname_to_creator on public.profiles;
create trigger profiles_nickname_to_creator after update of nickname on public.profiles
  for each row when (old.nickname is distinct from new.nickname) execute function public.creators_follow_nickname();

-- ── 2) 크리에이터 프로필 저장 — 이름 칸 대신 닉네임 ─────────────────
drop function if exists public.update_my_creator_profile(text, text, boolean, text, text, text);

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

  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;

  -- 한 처리로 고친다. 닉네임이 겹치면(유일 인덱스) 다른 칸도 함께 되돌아간다.
  -- 닉네임이 바뀌면 트리거가 creators.name 을 맞추고 바꾼 기록을 남긴다(INV-CN1·CN3)
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
  update public.creators c
  set intro = case when p_intro is null then c.intro else v_intro end,
      searchable = coalesce(p_searchable, c.searchable),
      fan_name = case when p_fan_name is null then c.fan_name else nullif(v_fan_name, '') end,
      personal_color = case when p_personal_color is null then c.personal_color else nullif(upper(p_personal_color), '') end
  where c.id = v_creator.id;
end $$;
revoke all on function public.update_my_creator_profile(text, text, boolean, text, text, text) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean, text, text, text) to authenticated;

-- ── 가입 — 이름·채널 이름을 받지 않는다(INV-CN2·CN4) ─────────────────
drop function if exists public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, uuid[], text, text, text);

create or replace function public.create_creator_account(
  p_user_id uuid,
  p_login_id text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb,
  p_tag_ids uuid[],
  p_custom_tag text,
  p_nickname text,
  p_fan_name text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fan_name text := public.app_trim(coalesce(p_fan_name, ''));
  v_problem text;
  v_slug text;
  v_constraint text;
  v_creator_id uuid;
  v_ids uuid[];
  v_custom text;
begin
  if cardinality(p_tag_ids) > 5 then
    raise exception '태그는 합쳐 1~5개다' using errcode = '22023';
  end if;
  -- 팬덤 이름(추가 요청 3, 선택): update_my_creator_profile 과 같은 규칙과 같은 오류 코드
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
  lock table public.creator_tag_options in share mode;
  select c.o_option_ids, c.o_custom into v_ids, v_custom from public.creator_tags_checked(p_tag_ids, p_custom_tag) c;

  -- 닉네임 검사·겹침(INV-U13)은 create_account 가 한다
  perform public.create_account(p_user_id, p_login_id, 'creator', p_email, p_phone, p_verification_id, p_terms, p_nickname);
  loop
    v_slug := 'c-' || encode(extensions.gen_random_bytes(5), 'hex');
    begin
      -- 이름은 트리거가 닉네임으로 채운다(INV-CN1). 채널 이름은 받지 않는다(INV-CN4 — 빈 값)
      insert into public.creators (profile_id, slug, name, channel, channel_title, fan_name)
      values (p_user_id, v_slug, btrim(p_nickname), '', '', nullif(v_fan_name, ''))
      returning id into v_creator_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'creators_slug_key' then
        raise;
      end if;
    end;
  end loop;
  perform public.creator_tags_apply(v_creator_id, v_ids, v_custom);
end $$;
revoke all on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, uuid[], text, text, text) to service_role;

-- ── 채널 확인 반려 사유 — 「채널 이름이 다름」 뺌(creator-verification INV-V19) ──────
create or replace function public.admin_reject_creator_verification(p_application_id uuid, p_reason_code text, p_memo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.creator_verification_applications;
  v_creator_id uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 반려한다' using errcode = '42501';
  end if;
  perform public.cv_check_reason(p_reason_code, array['link_not_found', 'link_mismatch', 'channel_unreachable', 'other'], p_memo);
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id;
  if not found then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  select c.id into v_creator_id from public.creators c where c.profile_id = v_app.account_id for no key update;
  perform public.cv_lock_channel(v_app.platform, v_app.channel_key);
  if not public.cv_end_application(v_app.id, 'rejected', p_reason_code, true) then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  insert into public.creator_verification_events (creator_id, acted_by, action, reason, application_id, channel_url, code, method, reason_code, link_handle)
  values (v_creator_id, auth.uid(), 'reject', btrim(coalesce(p_memo, '')), v_app.id, v_app.channel_url, v_app.code, v_app.method, p_reason_code, v_app.link_handle);
end $$;
