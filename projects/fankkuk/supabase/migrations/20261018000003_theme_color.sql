-- 크리에이터 카드 v28 · 테마 색 (2026-10-18, DECISIONS 「크리에이터 카드 v28 · 테마 색」). 스펙 creator-link INV-E13·E14 · S12~S12c.
--
-- 1) 퍼스널 컬러(화면 이름 「테마 색」)를 파스텔 8색 가운데 하나로 좁힌다(정본 src/shared/config/pastel-tones.ts).
--    이미 저장된 8색 밖 값은 비운다(기본 모양). 8색 안의 값과 빈 값은 건드리지 않으므로 다시 돌려도 결과가 같다.
--    제약 creators_personal_color_shape(꼴만 검사)를 creators_personal_color_palette(8색 목록)로 바꾼다.
-- 2) update_my_creator_profile: p_personal_color 가 8색 밖이면(빈 문자열 제외) 22023 으로 거부하고 아무 칸도 바꾸지 않는다.
--    p_fan_color 는 인자만 남기고 무시한다 — 팬컬러는 고르기·그리기에서 뺐고 저장 값은 지우지 않는다(되돌릴 수 있게).
--    인자 목록은 그대로라 create or replace 로 본문만 바꾼다. 본문은 20261016000004 그대로에 색 검사·갱신만 고쳤다.
--
-- 개인정보는 없다 — pii 구역은 건드리지 않는다.

-- ── 1) 칸 ──────────────────────────────────

update public.creators
   set personal_color = null
 where personal_color is not null
   and personal_color not in ('#FDE2E4', '#FFE5CC', '#FFF1B8', '#DFF5D8', '#D3F0EC', '#DCEBFF', '#E6E0FF', '#F6DFF0');

alter table public.creators drop constraint if exists creators_personal_color_shape;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_personal_color_palette') then
    alter table public.creators add constraint creators_personal_color_palette check (
      personal_color is null
      or personal_color in ('#FDE2E4', '#FFE5CC', '#FFF1B8', '#DFF5D8', '#D3F0EC', '#DCEBFF', '#E6E0FF', '#F6DFF0')
    );
  end if;
end $$;

-- ── 2) 프로필 저장 ──────────────────────────────────

create or replace function public.update_my_creator_profile(
  p_name text default null,
  p_intro text default null,
  p_searchable boolean default null,
  p_fan_name text default null,
  p_personal_color text default null,
  p_fan_color text default null
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

  -- creator-link INV-E13: 테마 색(퍼스널 컬러) — null 은 그대로, 빈 문자열은 기본(null), 그 밖에는 파스텔 8색 가운데 하나만(대소문자 무관, 대문자로 저장).
  -- 앞뒤 공백도 받지 않는다(앱 서버가 먼저 다듬어 보낸다). 틀리면 아무 칸도 바꾸지 않는다(이 검사가 update 앞에 있다).
  -- p_fan_color 는 받기만 하고 쓰지 않는다 — 팬컬러는 바꾸지 않는다(INV-E13 「저장 함수는 팬컬러를 바꾸지 않는다」)
  if p_personal_color is not null and p_personal_color <> ''
     and upper(p_personal_color) not in ('#FDE2E4', '#FFE5CC', '#FFF1B8', '#DFF5D8', '#D3F0EC', '#DCEBFF', '#E6E0FF', '#F6DFF0') then
    raise exception '테마 색은 파스텔 8색 가운데 하나다' using errcode = '22023';
  end if;

  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;

  update public.creators c
  set name = case when p_name is null then c.name else v_name end,
      intro = case when p_intro is null then c.intro else v_intro end,
      searchable = coalesce(p_searchable, c.searchable),
      fan_name = case when p_fan_name is null then c.fan_name else nullif(v_fan_name, '') end,
      personal_color = case when p_personal_color is null then c.personal_color else nullif(upper(p_personal_color), '') end
  where c.id = v_creator.id;
  -- 공개 이름 변경 기록만 남긴다. 닉네임은 따로 둔다(signup INV-U13 — 닉네임은 계정마다 다르고 1~12자)
  if p_name is not null and v_creator.name <> v_name then
    insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, v_name);
  end if;
end $fn$;

revoke all on function public.update_my_creator_profile(text, text, boolean, text, text, text) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean, text, text, text) to authenticated;

notify pgrst, 'reload schema';
