-- 추가분 4 (2026-10-14 승인, 원문 docs/reference/addendum-2-vs-now.md 4절 4-1·4-3·4-4·4-5).
--
-- 1) creators.fan_name — 「팬을 부르는 이름」(선택, 1~10자, 앞뒤 공백 없음). 비우면 null.
-- 2) update_my_creator_profile 에 p_fan_name 을 더한다(기본값 null = 그대로 둔다 — 세 칸만 보내는 호출은 팬덤 이름을 건드리지 않는다).
--    빈 문자열이면 지운다. 검사는 한 줄 소개와 같다: 줄바꿈·보이지 않는 글자 없음 + 직접 입력 태그와 같은 업계 기본 필터
--    (creator_tag_text_problem — 금칙어 P0084 · 전화번호·이메일·인터넷 주소 P0085 · 글자·숫자 없음 P0086). 다른 크리에이터 이름 검사는 하지 않는다.
--    반환 꼴이 같아도 인자가 바뀌어 옛 함수를 지우고 다시 만든다(권한도 다시).
-- 3) my_creator_settings 에 fan_name 칸을 더한다(반환 꼴이 바뀌어 지우고 다시 만든다).
-- 4) creator_link_extras(p_creator_id) — 공개 읽기. 본인 확인된 크리에이터의 팬덤 이름과 확인된 채널(플랫폼·채널 키·채널 주소)·
--    마지막 승인 날짜(한국 시간 날짜)만. 운영자 메모·인증 코드·신청·계정 칸은 돌려주지 않는다. 확인 전·취소된 크리에이터는 빈 목록.
--
-- 개인정보는 없다 — pii 구역은 건드리지 않는다. 다시 적용해도 결과가 같다.

-- ── 1) 칸 ──────────────────────────────────

alter table public.creators add column if not exists fan_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_fan_name_shape') then
    alter table public.creators add constraint creators_fan_name_shape
      check (fan_name is null or (char_length(fan_name) between 1 and 10 and fan_name = public.app_trim(fan_name)));
  end if;
end $$;

-- ── 2) 프로필 저장 ──────────────────────────────────

drop function if exists public.update_my_creator_profile(text, text, boolean);
drop function if exists public.update_my_creator_profile(text, text, boolean, text);

create function public.update_my_creator_profile(p_name text, p_intro text, p_searchable boolean, p_fan_name text default null)
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
  if char_length(v_name) not between 1 and 20 then
    raise exception '공개 이름은 1~20자다' using errcode = '22023';
  end if;
  if v_name ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
    raise exception '공개 이름에 제어 문자·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
  end if;
  -- INV-E6: 한 줄 소개 0~40자, 줄바꿈(제어 문자·줄 구분자)과 보이지 않는 글자 없음
  if p_intro is null or char_length(v_intro) > 40 then
    raise exception '한 줄 소개는 0~40자다' using errcode = '22023';
  end if;
  if v_intro ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
    raise exception '한 줄 소개에 줄바꿈·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
  end if;
  -- INV-E6: 직접 입력 태그와 같은 업계 기본 필터(creator-tags INV-T7). 어느 금칙어에 걸렸는지는 알리지 않는다
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
  -- 팬을 부르는 이름(추가분 4-1): 0~10자, 한 줄 소개와 같은 글자 규칙과 같은 필터. null 이면 그대로 둔다
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
  if p_searchable is null then
    raise exception '찾기 노출은 참·거짓이다' using errcode = '22023';
  end if;

  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;

  update public.creators c
  set name = v_name, intro = v_intro, searchable = p_searchable,
      fan_name = case when p_fan_name is null then c.fan_name else nullif(v_fan_name, '') end
  where c.id = v_creator.id;
  if v_creator.name <> v_name then
    insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, v_name);
    update public.profiles p set nickname = v_name where p.id = v_uid;
  end if;
end $fn$;

revoke all on function public.update_my_creator_profile(text, text, boolean, text) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean, text) to authenticated;

-- ── 3) 본인 설정 읽기 ──────────────────────────────────

drop function if exists public.my_creator_settings();

create function public.my_creator_settings()
returns table (name text, intro text, searchable boolean, tag_ids uuid[], custom_tag text, fan_name text)
language sql stable security definer set search_path = ''
as $$
  select c.name, c.intro, c.searchable,
         coalesce((select array_agg(t.option_id order by o.position, o.created_at, o.id)
                     from public.creator_tags t
                     join public.creator_tag_options o on o.id = t.option_id
                    where t.creator_id = c.id and not o.hidden), '{}'::uuid[]),
         (select x.tag from public.creator_custom_tags x where x.creator_id = c.id),
         c.fan_name
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;

revoke all on function public.my_creator_settings() from public, anon;
grant execute on function public.my_creator_settings() to authenticated;

-- ── 4) 링크 페이지·선물 보내기·함께한 시간의 공개 읽기 ──────────────────────────────────

-- 확인 날짜 = 그 크리에이터의 마지막 승인 기록 날짜(한국 시간). 채널 이사 승인도 승인 기록이라 지금 채널의 확인 날짜가 된다.
create or replace function public.creator_link_extras(p_creator_id uuid)
returns table (fan_name text, platform text, channel_key text, channel_url text, verified_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select c.fan_name, c.platform, c.channel_key, c.channel_url,
         (select (max(e.at) at time zone 'Asia/Seoul')::date
            from public.creator_verification_events e
           where e.creator_id = c.id and e.action = 'approve')
  from public.creators c
  where c.id = p_creator_id and c.identity_verified;
$$;

revoke all on function public.creator_link_extras(uuid) from public;
grant execute on function public.creator_link_extras(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
