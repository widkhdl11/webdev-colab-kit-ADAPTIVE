-- 추가 요청 3 「정할 것 다섯」 ③ 퍼스널 컬러·팬컬러 (2026-10-15, 카드 d87 ③·d91 「색 제한은 없게」). 스펙 creator-link INV-E13·E14 · my-account INV-A9.
--
-- 1) creators.personal_color · fan_color — 비어 있음(null = 사이트 기본 모양) 또는 #RRGGBB 대문자. 표 제약이 꼴만 본다(색 제한 없음).
--    글자색 칸은 만들지 않는다 — 화면이 배경에서 그때 계산한다(INV-E14).
-- 2) update_my_creator_profile 에 p_personal_color · p_fan_color 를 더한다(기본값 null = 그대로). 빈 문자열이면 기본으로 되돌리고,
--    그 밖에는 # 뒤 16진수 여섯 자리만 받아 대문자로 저장한다. 틀리면 22023 이고 아무 칸도 바꾸지 않는다. 크리에이터 ID 인자는 여전히 없다.
--    본문은 20261015000001 그대로에 두 칸만 더했다. 인자가 바뀌어 옛 함수를 지우고 다시 만든다(권한도 다시).
-- 3) my_creator_settings 에 두 색(본인 읽기). 반환 꼴이 바뀌어 지우고 다시 만든다.
-- 4) 공개 읽기 creator_rows → creator_by_id·list_creators·find_creators·list_other_creators 에 두 색(INV-E7 공개 칸).
--    본문은 20261011000002·20261011000003 그대로에 두 칸만 더했다. 반환 꼴이 바뀌어 지우고 다시 만든다.
--
-- 개인정보는 없다 — pii 구역은 건드리지 않는다. 다시 적용해도 결과가 같다.

-- ── 1) 칸 ──────────────────────────────────

alter table public.creators add column if not exists personal_color text;
alter table public.creators add column if not exists fan_color text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_personal_color_shape') then
    alter table public.creators add constraint creators_personal_color_shape check (personal_color is null or personal_color ~ '^#[0-9A-F]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'creators_fan_color_shape') then
    alter table public.creators add constraint creators_fan_color_shape check (fan_color is null or fan_color ~ '^#[0-9A-F]{6}$');
  end if;
end $$;

-- ── 2) 프로필 저장 ──────────────────────────────────

drop function if exists public.update_my_creator_profile(text, text, boolean, text);
drop function if exists public.update_my_creator_profile(text, text, boolean, text, text, text);

create function public.update_my_creator_profile(
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

  -- creator-link INV-E13: 색 두 칸 — null 은 그대로, 빈 문자열은 기본(null), 그 밖에는 # 뒤 16진수 여섯 자리만(대문자로 저장).
  -- 앞뒤 공백도 받지 않는다(앱 서버가 먼저 다듬어 보낸다). 하나라도 틀리면 아무 칸도 바꾸지 않는다(이 검사가 update 앞에 있다)
  if p_personal_color is not null and p_personal_color <> '' and p_personal_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception '퍼스널 컬러는 #RRGGBB 꼴이다' using errcode = '22023';
  end if;
  if p_fan_color is not null and p_fan_color <> '' and p_fan_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception '팬컬러는 #RRGGBB 꼴이다' using errcode = '22023';
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
      personal_color = case when p_personal_color is null then c.personal_color else nullif(upper(p_personal_color), '') end,
      fan_color = case when p_fan_color is null then c.fan_color else nullif(upper(p_fan_color), '') end
  where c.id = v_creator.id;
  -- 공개 이름 변경 기록만 남긴다. 닉네임은 따로 둔다(signup INV-U13 — 닉네임은 계정마다 다르고 1~12자)
  if p_name is not null and v_creator.name <> v_name then
    insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, v_name);
  end if;
end $fn$;

revoke all on function public.update_my_creator_profile(text, text, boolean, text, text, text) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean, text, text, text) to authenticated;

-- ── 3) 본인 설정 읽기 ──────────────────────────────────

drop function if exists public.my_creator_settings();

create function public.my_creator_settings()
returns table (name text, intro text, searchable boolean, tag_ids uuid[], custom_tag text, fan_name text,
              personal_color text, fan_color text)
language sql stable security definer set search_path = ''
as $$
  select c.name, c.intro, c.searchable,
         coalesce((select array_agg(t.option_id order by o.position, o.created_at, o.id)
                     from public.creator_tags t
                     join public.creator_tag_options o on o.id = t.option_id
                    where t.creator_id = c.id and not o.hidden), '{}'::uuid[]),
         (select x.tag from public.creator_custom_tags x where x.creator_id = c.id),
         c.fan_name,
         c.personal_color, c.fan_color
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;

revoke all on function public.my_creator_settings() from public, anon;
grant execute on function public.my_creator_settings() to authenticated;

-- ── 4) 공개 읽기 ──────────────────────────────────

drop function if exists public.list_other_creators(uuid, integer);
drop function if exists public.creator_by_id(uuid);
drop function if exists public.find_creators();
drop function if exists public.list_creators();
drop function if exists public.creator_rows(uuid);

create function public.creator_rows(p_only uuid default null)
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, searchable boolean, profile_id uuid, handle text, photo_path text,
               personal_color text, fan_color text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.slug, c.name, c.channel, c.channel_title,
         coalesce((select array_agg(o.name order by o.position, o.created_at, o.id)
                     from public.creator_tags t
                     join public.creator_tag_options o on o.id = t.option_id
                    where t.creator_id = c.id and not o.hidden), '{}'::text[])
         || coalesce((select array_agg(x.tag)
                        from public.creator_custom_tags x
                       where x.creator_id = c.id and public.creator_tag_text_problem(x.tag) is null
                         and not exists (select 1 from public.creator_tag_options h
                                         where h.hidden and public.creator_tag_key(h.name) = public.creator_tag_key(x.tag))), '{}'::text[]),
         c.intro, c.alias, c.avg_approval_hours, c.face_tone,
         (select round(avg(extract(epoch from (o.approved_at - o.registered_at)) / 60))::integer
            from public.orders o
           where o.creator_id = c.id and o.approved_at is not null and o.registered_at is not null),
         c.searchable, c.profile_id,
         (select h.handle from public.creator_handles h where h.creator_id = c.id and h.retired_until is null),
         c.photo_path,
         c.personal_color, c.fan_color
  from public.creators c
  where c.identity_verified and (p_only is null or c.id = p_only)
  order by c.created_at, c.id;
$$;

create function public.list_creators()
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, handle text, photo_path text,
               personal_color text, fan_color text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders, r.handle, r.photo_path, r.personal_color, r.fan_color
  from public.creator_rows() r
  where r.searchable
     or r.profile_id = auth.uid()
     or exists (select 1 from public.follows f where f.creator_id = r.id and f.fan_id = auth.uid());
$$;

create function public.find_creators()
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, handle text, photo_path text,
               personal_color text, fan_color text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders, r.handle, r.photo_path, r.personal_color, r.fan_color
  from public.creator_rows() r
  where r.searchable;
$$;

create function public.creator_by_id(p_id uuid)
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, handle text, photo_path text,
               personal_color text, fan_color text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders, r.handle, r.photo_path, r.personal_color, r.fan_color
  from public.creator_rows(p_id) r;
$$;

create function public.list_other_creators(p_exclude uuid, p_limit integer)
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, handle text, photo_path text,
               personal_color text, fan_color text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders, r.handle, r.photo_path, r.personal_color, r.fan_color
  from (
    select c.id, c.created_at
    from public.creators c
    where c.identity_verified
      and c.id is distinct from p_exclude
      and (c.searchable
           or c.profile_id = auth.uid()
           or exists (select 1 from public.follows f where f.creator_id = c.id and f.fan_id = auth.uid()))
    order by c.created_at, c.id
    limit greatest(1, least(coalesce(p_limit, 6), 12))
  ) pick
  cross join lateral public.creator_rows(pick.id) r
  order by pick.created_at, pick.id;
$$;

revoke all on function public.creator_rows(uuid) from public, anon, authenticated;
revoke all on function public.list_creators() from public;
revoke all on function public.find_creators() from public;
revoke all on function public.creator_by_id(uuid) from public;
revoke all on function public.list_other_creators(uuid, integer) from public;
grant execute on function public.list_creators() to anon, authenticated;
grant execute on function public.find_creators() to anon, authenticated;
grant execute on function public.creator_by_id(uuid) to anon, authenticated;
grant execute on function public.list_other_creators(uuid, integer) to anon, authenticated;

notify pgrst, 'reload schema';
