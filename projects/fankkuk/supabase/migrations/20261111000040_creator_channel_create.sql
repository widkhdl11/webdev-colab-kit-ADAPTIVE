-- 크리에이터 가입: 닉네임·팬덤 이름·태그를 마지막 「채널 만들기」 단계로 (2026-11-11, DECISIONS 같은 날 「크리에이터 가입: 닉네임·팬덤 이름·태그를 …」).
-- 스펙: docs/specs/signup.md INV-U13(첫 문장)·INV-U21 · docs/specs/creator-display-name.md INV-CN1(채널 만들기 전에는 이름도 빈 값).
--
-- 「채널 없음」 = 계정이 연결된 크리에이터 행인데 닉네임(과 크리에이터 이름)이 비어 있는 상태.
-- 크리에이터 행 자체는 가입 3단계에서 그대로 만든다 — 카카오톡 연결 기록(pii.signature_links)이 크리에이터 행을 가리키기 때문이다.
--
-- 바뀌는 것
--   1) profiles.nickname — 크리에이터만 비울 수 있다(팬은 언제나 있다). 한 번 생긴 닉네임은 다시 비우지 못한다(트리거).
--   2) creators.name — 계정이 연결된 행은 비울 수 있다(닉네임을 따른다). 계정 없는 행(탈퇴·예시)은 언제나 이름이 있다.
--      creators_name_from_nickname: 닉네임이 비어 있으면 이름도 비운다(전에는 덮지 않았다).
--      creators_follow_nickname: 빈 이름 → 첫 닉네임은 「이름 바꾼 기록」(INV-CN3)에 남기지 않는다 — 바꾼 것이 아니라 처음 정한 것이다.
--   3) create_creator_account — 닉네임·팬덤 이름·태그를 받지 않는다(인자 10개 → 6개). 크리에이터 행은 이름 없이 만든다.
--   4) create_my_channel(닉네임, 팬덤 이름, 태그, 직접 입력 태그) — 새로. 본인이 크리에이터이고 닉네임이 비어 있을 때 한 번. 셋을 한 처리에서 저장한다.
--   5) 채널 없는 크리에이터를 막는 트리거 셋 — 선물함 만들기(revgift_boxes), 팬꾹 링크 만들기(creator_handles), 채널 확인 요청(creator_verification_applications).
--      함수마다 검사를 넣지 않고 표에 걸어, 다른 길로 넣어도 같이 막힌다.
--
-- 한쪽만 적용된 상태: manual/0039 (create_account 고침)와 함께 간다 — 그 파일 머리말 참고. 이 파일만 적용되면 크리에이터 가입은 실패하고 팬 가입은 그대로다.
-- 개인정보 구역(pii)을 고치지 않는다(가입 함수가 pii 함수를 부르는 것은 그대로).

set check_function_bodies = off;

-- 1) 닉네임: 크리에이터만 빈 값 허용
alter table public.profiles alter column nickname drop not null;
alter table public.profiles drop constraint if exists profiles_nickname_role_check;
alter table public.profiles add constraint profiles_nickname_role_check check (nickname is not null or role = 'creator');

create or replace function public.profiles_keep_nickname()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.nickname is not null and new.nickname is null then
    raise exception '닉네임은 비울 수 없다' using errcode = '22023';
  end if;
  -- INV-U21: 비어 있던 닉네임(채널 없음)을 처음 채우는 길은 채널 만들기(create_my_channel) 하나뿐이다 —
  -- 프로필 수정·내 정보 저장으로 채우면 태그·팬덤 이름 검사를 건너뛴 채 채널이 생긴다. 이 처리 안에서만 켜지는 표시로 가른다.
  if old.nickname is null and new.nickname is not null and coalesce(current_setting('fankkuk.channel_create', true), '') <> 'on' then
    raise exception '채널을 먼저 만들어야 한다' using errcode = 'FKN01';
  end if;
  return new;
end $$;
revoke all on function public.profiles_keep_nickname() from public, anon, authenticated;
drop trigger if exists profiles_keep_nickname on public.profiles;
create trigger profiles_keep_nickname before update of nickname on public.profiles
  for each row execute function public.profiles_keep_nickname();

-- 2) 크리에이터 이름: 계정이 연결된 행만 빈 값 허용
alter table public.creators alter column name drop not null;
alter table public.creators drop constraint if exists creators_name_or_profile_check;
alter table public.creators add constraint creators_name_or_profile_check check (name is not null or profile_id is not null);

create or replace function public.creators_name_from_nickname()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.profile_id is null then
    -- 채널 없는 크리에이터의 계정이 지워져 연결이 끊기면(가입 실패 정리·계정 삭제 — 외래 키가 profile_id 를 비운다) 이름이 남지 않는다.
    -- 계정 없는 행은 이름이 있어야 하므로(creators_name_or_profile_check) 탈퇴한 크리에이터와 같은 이름을 넣는다. 없으면 계정 삭제가 통째로 실패한다
    if new.name is null then
      new.name := '탈퇴한 크리에이터';
    end if;
    return new;
  end if;
  -- INV-CN1: 이름은 언제나 닉네임 — 닉네임이 비어 있으면(채널 없음, INV-U21) 이름도 비운다
  select p.nickname into new.name from public.profiles p where p.id = new.profile_id;
  return new;
end $$;
revoke all on function public.creators_name_from_nickname() from public, anon, authenticated;

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
      -- INV-CN3: 바꾼 것만 남긴다. 채널 만들기로 처음 정한 이름(빈 값 → 닉네임)은 기록하지 않는다
      if v_creator.name is not null then
        insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, new.nickname);
      end if;
      update public.creators c set name = new.nickname where c.id = v_creator.id;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.creators_follow_nickname() from public, anon, authenticated;

-- 팬덤 이름 검사 — create_creator_account 에 있던 것을 그대로 옮겼다(update_my_creator_profile 과 같은 규칙·같은 오류 코드). 다듬은 값을 돌려준다(빈 값이면 '')
create or replace function public.fan_name_checked(p_fan_name text)
returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_fan_name text := public.app_trim(coalesce(p_fan_name, ''));
  v_problem text;
begin
  if char_length(v_fan_name) > 10 then
    raise exception '팬을 부르는 이름은 0~10자다' using errcode = '22023';
  end if;
  if v_fan_name ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
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
  return v_fan_name;
end $$;
revoke all on function public.fan_name_checked(text) from public, anon, authenticated;

-- 3) 가입: 닉네임·팬덤 이름·태그를 받지 않는다
drop function if exists public.create_creator_account(uuid, text, text, text, uuid, jsonb, uuid[], text, text, text);

create or replace function public.create_creator_account(
  p_user_id uuid,
  p_login_id text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_slug text;
  v_constraint text;
  v_creator_id uuid;
  v_signed_creator_id uuid;
begin
  -- 확인 방법 대조(INV-U19·U20)는 create_account 가 한다. 크리에이터는 닉네임 없이(INV-U21, manual/0039)
  perform public.create_account(p_user_id, p_login_id, 'creator', p_email, p_phone, p_verification_id, p_terms, null);
  -- INV-U19: 카카오 서명 길이면 서명 요청 때 정한 크리에이터 ID — 봉투 안의 크리에이터 ID 와 같아야 이후 승인 서명 요청이 게이트웨이 대조를 지난다
  v_signed_creator_id := pii.signup_sign_creator_id(p_verification_id);
  loop
    v_slug := 'c-' || encode(extensions.gen_random_bytes(5), 'hex');
    begin
      -- 이름은 트리거가 닉네임으로 맞춘다(INV-CN1) — 아직 닉네임이 없어 빈 값이다(채널 없음, INV-U21)
      insert into public.creators (id, profile_id, slug, name, channel, channel_title)
      values (coalesce(v_signed_creator_id, gen_random_uuid()), p_user_id, v_slug, null, '', '')
      returning id into v_creator_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'creators_slug_key' then
        raise;
      end if;
    end;
  end loop;
  -- INV-U19 ①·INV-S16 (S16e): 서명 길이면 연결 기록을 같은 처리에서 만든다 — 실패하면 계정까지 함께 없던 일이 된다
  perform pii.signup_sign_link(v_creator_id, p_verification_id);
end $$;
revoke all on function public.create_creator_account(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_creator_account(uuid, text, text, text, uuid, jsonb) to service_role;

-- 4) 채널 만들기
create or replace function public.create_my_channel(
  p_nickname text,
  p_fan_name text default null,
  p_tag_ids uuid[] default '{}',
  p_custom_tag text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_fan_name text;
  v_problem text;
  v_constraint text;
  v_creator_id uuid;
  v_ids uuid[];
  v_custom text;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  -- 잠금 순서: profiles → creators (update_my_creator_profile·닉네임 트리거와 같은 순서, 20261111000010)
  select * into v_profile from public.profiles p where p.id = v_uid for update;
  if not found or v_profile.role <> 'creator' then
    raise exception '크리에이터만 채널을 만든다' using errcode = '42501';
  end if;
  if v_profile.nickname is not null then
    raise exception '이미 채널을 만들었다' using errcode = 'FKN02';
  end if;
  -- INV-U13: 가입 닉네임과 같은 검사·같은 오류 코드
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
  v_fan_name := public.fan_name_checked(p_fan_name);
  if cardinality(coalesce(p_tag_ids, '{}')) > 5 then
    raise exception '태그는 합쳐 1~5개다' using errcode = '22023';
  end if;
  lock table public.creator_tag_options in share mode;
  select c.o_option_ids, c.o_custom into v_ids, v_custom from public.creator_tags_checked(coalesce(p_tag_ids, '{}'), p_custom_tag) c;

  begin
    -- 트리거가 크리에이터 이름을 닉네임으로 맞춘다(INV-CN1). 빈 닉네임을 채우는 것은 이 처리에서만 허용된다(profiles_keep_nickname)
    perform set_config('fankkuk.channel_create', 'on', true);
    update public.profiles p set nickname = v_nickname where p.id = v_uid;
    perform set_config('fankkuk.channel_create', '', true);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_nickname_key' then
      raise exception '이미 쓰는 닉네임이다' using errcode = 'FKU04';
    end if;
    raise;
  end;
  update public.creators c set fan_name = nullif(v_fan_name, '') where c.profile_id = v_uid returning c.id into v_creator_id;
  if v_creator_id is null then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  perform public.creator_tags_apply(v_creator_id, v_ids, v_custom);
end $$;
revoke all on function public.create_my_channel(text, text, uuid[], text) from public, anon;
grant execute on function public.create_my_channel(text, text, uuid[], text) to authenticated;

-- 5) 채널 없는 크리에이터를 막는 트리거 (INV-U21) — 오류 코드 FKN01 「채널을 먼저 만들어야 한다」
create or replace function public.require_creator_channel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_named boolean;
begin
  if tg_table_name = 'creator_verification_applications' then
    select p.nickname is not null into v_named from public.profiles p where p.id = new.account_id;
  else
    select c.name is not null into v_named from public.creators c where c.id = new.creator_id;
  end if;
  if not coalesce(v_named, false) then
    raise exception '채널을 먼저 만들어야 한다' using errcode = 'FKN01';
  end if;
  return new;
end $$;
revoke all on function public.require_creator_channel() from public, anon, authenticated;

drop trigger if exists revgift_boxes_require_channel on public.revgift_boxes;
create trigger revgift_boxes_require_channel before insert on public.revgift_boxes
  for each row execute function public.require_creator_channel();
drop trigger if exists creator_handles_require_channel on public.creator_handles;
create trigger creator_handles_require_channel before insert on public.creator_handles
  for each row when (new.retired_until is null) execute function public.require_creator_channel();
drop trigger if exists creator_verification_applications_require_channel on public.creator_verification_applications;
create trigger creator_verification_applications_require_channel before insert on public.creator_verification_applications
  for each row execute function public.require_creator_channel();

reset check_function_bodies;

notify pgrst, 'reload schema';
