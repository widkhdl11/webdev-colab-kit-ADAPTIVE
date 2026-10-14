-- 프로필 칸을 화면마다 따로 저장한다 + 배경사진·심볼을 붙이고 뗀 뒤의 미리보기 고르기를 돌려준다 (2026-10-14 「내 팬꾹 꾸미기」 리뷰 지적).
-- 스펙 my-account INV-A9 · creator-link INV-E10·E12.
--
-- 1) update_my_creator_profile 의 네 칸을 모두 기본값 null(= 지금 값 그대로)로 바꾼다.
--    「내 팬꾹 꾸미기」는 공개 이름·한 줄 소개·팬을 부르는 이름만, 「주소와 설정」은 찾기 노출만 보낸다 — 한 화면이 처음 읽은 값으로
--    다른 화면이 고친 칸을 덮어쓰지 않게. 보낸 칸만 검사하고, 하나라도 틀리면 아무 칸도 바꾸지 않는다(INV-A9 그대로).
--    공개 이름 변경 기록은 이름을 보냈고 실제로 바뀌었을 때만 남긴다. 팬을 부르는 이름은 빈 문자열이면 지운다(전과 같다).
--    인자가 바뀌어 옛 함수를 지우고 다시 만든다(권한도 다시).
-- 2) set_creator_image 가 옛 파일 경로와 함께 그 뒤의 미리보기 고르기(preview_pick)를 돌려준다 — 심볼을 떼면 DB 가 고르기를
--    프로필 사진으로 되돌리는데, 화면이 그 값을 짐작하지 않고 서버 응답으로 받는다. 반환 꼴이 바뀌어 지우고 다시 만든다.
--
-- 개인정보는 없다 — pii 구역은 건드리지 않는다. 다시 적용해도 결과가 같다.

-- ── 1) 프로필 저장 ──────────────────────────────────

drop function if exists public.update_my_creator_profile(text, text, boolean, text);

create function public.update_my_creator_profile(
  p_name text default null,
  p_intro text default null,
  p_searchable boolean default null,
  p_fan_name text default null
)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_name text := public.app_trim(coalesce(p_name, ''));
  v_intro text := public.app_trim(coalesce(p_intro, ''));
  v_fan_name text := public.app_trim(coalesce(p_fan_name, ''));
  v_problem text;
  v_creator public.creators;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  -- 보낸 칸만 검사한다. null 은 「그대로 둔다」
  if p_name is not null then
    if char_length(v_name) not between 1 and 20 then
      raise exception '공개 이름은 1~20자다' using errcode = '22023';
    end if;
    if v_name ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
      raise exception '공개 이름에 제어 문자·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
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

  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;

  update public.creators c
  set name = case when p_name is null then c.name else v_name end,
      intro = case when p_intro is null then c.intro else v_intro end,
      searchable = coalesce(p_searchable, c.searchable),
      fan_name = case when p_fan_name is null then c.fan_name else nullif(v_fan_name, '') end
  where c.id = v_creator.id;
  if p_name is not null and v_creator.name <> v_name then
    insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, v_name);
    update public.profiles p set nickname = v_name where p.id = v_uid;
  end if;
end $fn$;

revoke all on function public.update_my_creator_profile(text, text, boolean, text) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean, text) to authenticated;

-- ── 2) 배경사진·심볼 판 (서버의 비밀 키로만) ──────────────────────────────────

drop function if exists public.set_creator_image(uuid, text, integer, boolean);

-- p_version 이 있으면 그 판의 파일을 붙이고, null 이면 뗀다(판은 그래도 하나 올린다 — 미리보기 주소가 바뀌게).
-- 돌려주는 값: 옛 파일 경로(없으면 null — 서버가 저장소에서 지운다)와 바꾼 뒤의 미리보기 고르기. 그 사이 다른 요청이 판을 올렸으면 40001.
create function public.set_creator_image(p_profile_id uuid, p_kind text, p_version integer, p_rights_checked boolean default false)
returns table (old_path text, preview_pick text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_creator public.creators;
  v_old text;
  v_now_version integer;
  v_pick text;
begin
  if p_kind is null or p_kind not in ('background', 'symbol') then
    raise exception '사진 종류는 background·symbol 이다' using errcode = '22023';
  end if;
  -- INV-E12: 심볼은 권리 확인 체크가 있는 요청에서만 붙인다
  if p_kind = 'symbol' and p_version is not null and p_rights_checked is not true then
    raise exception '팬덤 심볼은 권리 확인 체크가 있어야 올린다' using errcode = 'P0095';
  end if;
  select * into v_creator from public.creators c where c.profile_id = p_profile_id for update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;

  if p_kind = 'background' then
    v_old := v_creator.bg_path;
    v_now_version := v_creator.bg_version;
  else
    v_old := v_creator.symbol_path;
    v_now_version := v_creator.symbol_version;
  end if;
  if p_version is not null and p_version <> v_now_version + 1 then
    raise exception '다른 요청이 사진을 먼저 바꿨다' using errcode = '40001';
  end if;

  if p_kind = 'background' then
    update public.creators c
    set bg_path = case when p_version is null then null else c.id::text || '/bg-' || p_version::text || '.webp' end,
        bg_version = v_now_version + 1,
        bg_updated_at = now()
    where c.id = v_creator.id
    returning c.preview_pick into v_pick;
  elsif p_version is null then
    update public.creators c
    set symbol_path = null, symbol_version = v_now_version + 1, symbol_updated_at = now(), symbol_rights_at = null, preview_pick = 'photo'
    where c.id = v_creator.id
    returning c.preview_pick into v_pick;
  else
    update public.creators c
    set symbol_path = c.id::text || '/sym-' || p_version::text || '.webp', symbol_version = p_version,
        symbol_updated_at = now(), symbol_rights_at = now()
    where c.id = v_creator.id
    returning c.preview_pick into v_pick;
  end if;
  return query select v_old, v_pick;
end $fn$;

revoke all on function public.set_creator_image(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.set_creator_image(uuid, text, integer, boolean) to service_role;

notify pgrst, 'reload schema';
