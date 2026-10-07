-- 크리에이터 태그 (docs/specs/creator-tags.md INV-T1~T6). 결정 카드 fankkuk-20261001-1-d43·d44.
-- 가입 때 자유롭게 적던 「분야」(creators.category) 대신, 운영자가 관리하는 선택지에서 여러 개 + 직접 입력 한 개를 고른다.
-- category 칸은 지우지 않고 더는 쓰지 않는다 — 읽기 함수는 이 파일부터 category 대신 tags(숨기지 않은 선택지 이름 배열)를 돌려주고,
-- 가입 함수는 category 를 받지 않는다(칸의 처음 값 '' 이 들어간다).
--
-- 1) 표 셋 — 선택지(creator_tag_options) · 크리에이터가 고른 선택지(creator_tags) · 직접 입력(creator_custom_tags, 크리에이터당 0~1).
--    셋 다 RLS 를 켜고 화면 쪽 키(anon·authenticated)의 권한을 모두 뺀다. 읽기·쓰기는 아래 함수로만(INV-T1·T2).
--    선택지 이름은 겹치지 않는다 — 앞뒤 공백을 빼고(app_trim, 앱의 trim 과 같은 범위) 영문 대소문자를 무시해 비교한다(유일 색인).
-- 2) 크리에이터 태그 고치기(update_my_creator_tags) — 계정·크리에이터 ID 를 받지 않는다. 로그인 토큰의 크리에이터 한 줄만(INV-T2).
--    규칙(INV-T3): 숨기지 않은 선택지 0~5개(같은 것 두 번 금지) + 직접 입력 0~1개(앞뒤 공백 뺀 1~20자), 합쳐 1~5개.
--    직접 입력이 숨기지 않은 선택지 이름과 같으면 그 선택지를 고른 것으로 저장한다. 하나라도 어기면 아무것도 바꾸지 않는다.
--    직접 입력에 제어 문자·보이지 않는 글자가 있으면 거부한다 — 공개 이름과 같은 목록(20261006000018). 같은 말로 묶을 때 어긋나지 않게.
-- 3) 가입 함수(create_creator_account)가 분야 대신 태그를 받는다 — 같은 규칙으로 1개 이상(INV-T3).
-- 4) 운영자 — 선택지 목록·추가·이름 고치기·숨기기/보이기·순서(INV-T1), 직접 입력 목록(같은 말 묶어 인원수),
--    「선택지에 넣기」(INV-T5 — 한 함수 = 한 트랜잭션. 중간에 실패하면 전부 되돌아간다).
-- 5) 읽기 — 공개 선택지 목록(creator_tag_options), 공개 크리에이터 목록(list_creators·find_creators)은 숨기지 않은 선택지 이름만(INV-T4, T6).
--    직접 입력은 본인 설정 읽기(my_creator_settings)와 운영자 함수에서만 나온다.
--
-- 동시성: 운영자의 선택지 쓰기는 선택지 표에 SHARE ROW EXCLUSIVE 잠금을 잡고, 크리에이터의 태그 쓰기(고치기·가입)는 SHARE 잠금을 잡는다.
-- 두 잠금은 서로를 기다리므로 「선택지에 넣기」가 도는 동안 같은 말의 직접 입력이 새로 들어와 남는 일이 없고(INV-T5),
-- 숨기기와 그 선택지를 고르는 저장이 엇갈려 숨긴 선택지가 새로 붙는 일도 없다(INV-T3). 크리에이터끼리는 서로 막지 않는다.
--
-- 오류 꼴: 42501 로그인 안 함·크리에이터 아님·운영자 아님 · 22023 입력 꼴 · 55000 같은 이름의 선택지가 이미 있음 · P0002 없음

-- ── 1) 표 ───────────────────────────────────────────────

-- 선택지 이름을 비교하는 값 — 앞뒤 공백을 빼고 소문자로. 색인에 쓰므로 immutable.
create function public.creator_tag_key(p text)
returns text
language sql immutable set search_path = ''
as $$
  select lower(public.app_trim(p));
$$;

revoke all on function public.creator_tag_key(text) from public, anon, authenticated;

create table public.creator_tag_options (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20 and name = public.app_trim(name)),
  position integer not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index creator_tag_options_name_key on public.creator_tag_options (public.creator_tag_key(name));
alter table public.creator_tag_options enable row level security;
revoke all on public.creator_tag_options from anon, authenticated;

-- 같은 선택지는 한 크리에이터에게 한 번만(기본 키). 크리에이터 줄이 지워지면 같이 지운다.
create table public.creator_tags (
  creator_id uuid not null references public.creators (id) on delete cascade,
  option_id uuid not null references public.creator_tag_options (id),
  created_at timestamptz not null default now(),
  primary key (creator_id, option_id)
);
create index creator_tags_option_idx on public.creator_tags (option_id);
alter table public.creator_tags enable row level security;
revoke all on public.creator_tags from anon, authenticated;

-- 직접 입력 — 크리에이터당 0~1개(기본 키 = 크리에이터).
create table public.creator_custom_tags (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 20 and tag = public.app_trim(tag)),
  created_at timestamptz not null default now()
);
create index creator_custom_tags_key_idx on public.creator_custom_tags (public.creator_tag_key(tag));
alter table public.creator_custom_tags enable row level security;
revoke all on public.creator_custom_tags from anon, authenticated;

-- 처음 선택지(스펙 「처음 선택지」 순서)
insert into public.creator_tag_options (name, position) values
  ('SOOP', 1), ('치지직', 2), ('유튜브', 3), ('알플레이', 4), ('인스타그램', 5), ('X', 6), ('스레드', 7), ('틱톡', 8), ('버추얼', 9)
on conflict do nothing;

-- ── 2) 크리에이터 태그 규칙 · 저장 (내부 함수) ─────────────────

-- 태그 이름(선택지 이름·직접 입력)의 꼴 — 앞뒤 공백을 뺀 1~20자, 제어 문자·보이지 않는 글자 없음. 어기면 22023.
create function public.creator_tag_text_checked(p text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := public.app_trim(coalesce(p, ''));
begin
  if char_length(v) not between 1 and 20 then
    raise exception '태그는 1~20자다' using errcode = '22023';
  end if;
  if v ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
    raise exception '태그에 제어 문자·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
  end if;
  return v;
end $$;

revoke all on function public.creator_tag_text_checked(text) from public, anon, authenticated;

-- INV-T3: 화면이 보낸 선택지 ID 목록과 직접 입력을 검사해 저장할 값으로 바꾼다. 어기면 22023 — 부르는 쪽은 아무것도 바꾸지 않은 채 끝난다.
create function public.creator_tags_checked(p_option_ids uuid[], p_custom text, out o_option_ids uuid[], out o_custom text)
language plpgsql stable set search_path = ''
as $$
declare
  v_custom text := public.app_trim(coalesce(p_custom, ''));
  v_match uuid;
  v_visible integer;
begin
  if p_option_ids is null or array_position(p_option_ids, null) is not null then
    raise exception '선택지 목록이 비었다' using errcode = '22023';
  end if;
  if cardinality(p_option_ids) <> (select count(distinct x) from unnest(p_option_ids) x) then
    raise exception '같은 선택지를 두 번 골랐다' using errcode = '22023';
  end if;
  select count(*) into v_visible from public.creator_tag_options o where o.id = any (p_option_ids) and not o.hidden;
  if v_visible <> cardinality(p_option_ids) then
    raise exception '없거나 숨긴 선택지다' using errcode = '22023';
  end if;

  o_option_ids := p_option_ids;
  o_custom := null;
  if v_custom <> '' then
    v_custom := public.creator_tag_text_checked(v_custom);
    -- 숨기지 않은 선택지와 같은 말이면 그 선택지를 고른 것으로(S3c)
    select o.id into v_match from public.creator_tag_options o
    where public.creator_tag_key(o.name) = public.creator_tag_key(v_custom) and not o.hidden;
    if found then
      if not (v_match = any (o_option_ids)) then
        o_option_ids := o_option_ids || v_match;
      end if;
    else
      o_custom := v_custom;
    end if;
  end if;

  if cardinality(o_option_ids) + (case when o_custom is null then 0 else 1 end) not between 1 and 5 then
    raise exception '태그는 합쳐 1~5개다' using errcode = '22023';
  end if;
end $$;

revoke all on function public.creator_tags_checked(uuid[], text) from public, anon, authenticated;

-- 검사를 마친 값으로 한 크리에이터의 태그를 통째로 바꾼다. 숨긴 선택지는 검사에서 걸러졌으므로 여기서 빠진다(INV-T6).
create function public.creator_tags_apply(p_creator_id uuid, p_option_ids uuid[], p_custom text)
returns void
language plpgsql volatile set search_path = ''
as $$
begin
  delete from public.creator_tags t where t.creator_id = p_creator_id and not (t.option_id = any (p_option_ids));
  insert into public.creator_tags (creator_id, option_id)
  select p_creator_id, x from unnest(p_option_ids) x
  on conflict do nothing;
  if p_custom is null then
    delete from public.creator_custom_tags c where c.creator_id = p_creator_id;
  else
    insert into public.creator_custom_tags (creator_id, tag) values (p_creator_id, p_custom)
    on conflict (creator_id) do update set tag = excluded.tag, created_at = now();
  end if;
end $$;

revoke all on function public.creator_tags_apply(uuid, uuid[], text) from public, anon, authenticated;

-- ── 2) 크리에이터 태그 고치기 (INV-T2·T3) ─────────────────────

create function public.update_my_creator_tags(p_option_ids uuid[], p_custom_tag text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_creator_id uuid;
  v_ids uuid[];
  v_custom text;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  lock table public.creator_tag_options in share mode;
  select c.o_option_ids, c.o_custom into v_ids, v_custom from public.creator_tags_checked(p_option_ids, p_custom_tag) c;

  select c.id into v_creator_id from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  perform public.creator_tags_apply(v_creator_id, v_ids, v_custom);
end $$;

revoke all on function public.update_my_creator_tags(uuid[], text) from public, anon;
grant execute on function public.update_my_creator_tags(uuid[], text) to authenticated;

-- ── 3) 가입 함수 — 분야 대신 태그 (INV-T3) ────────────────────
-- 나머지(이름·채널 이름 검사, 계정 만들기, 닉네임 = 공개 이름, slug 정하기)는 20261006000005 와 같다.

drop function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, text);

create function public.create_creator_account(
  p_user_id uuid,
  p_login_id text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb,
  p_name text,
  p_channel_title text,
  p_tag_ids uuid[],
  p_custom_tag text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_title text := btrim(coalesce(p_channel_title, ''));
  v_slug text;
  v_constraint text;
  v_creator_id uuid;
  v_ids uuid[];
  v_custom text;
begin
  if char_length(v_name) not between 1 and 20 or char_length(v_title) not between 1 and 40 then
    raise exception '이름은 1~20자, 채널 이름은 1~40자다' using errcode = '22023';
  end if;
  lock table public.creator_tag_options in share mode;
  select c.o_option_ids, c.o_custom into v_ids, v_custom from public.creator_tags_checked(p_tag_ids, p_custom_tag) c;

  perform public.create_account(p_user_id, p_login_id, 'creator', p_email, p_phone, p_verification_id, p_terms);
  update public.profiles set nickname = v_name where id = p_user_id;
  loop
    v_slug := 'c-' || encode(extensions.gen_random_bytes(5), 'hex');
    begin
      insert into public.creators (profile_id, slug, name, channel, channel_title)
      values (p_user_id, v_slug, v_name, '', v_title)
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

revoke all on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, uuid[], text) from public, anon, authenticated;
grant execute on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, uuid[], text) to service_role;

-- ── 4) 운영자 — 선택지 관리 (INV-T1) ──────────────────────────

create function public.admin_creator_tag_options()
returns table (id uuid, name text, "position" integer, hidden boolean, creator_count integer)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, o.position, o.hidden,
         (select count(*)::integer from public.creator_tags t where t.option_id = o.id)
  from public.creator_tag_options o
  where public.is_operator()
  order by o.position, o.created_at, o.id;
$$;

create function public.admin_add_creator_tag_option(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_id uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 선택지를 바꾼다' using errcode = '42501';
  end if;
  v_name := public.creator_tag_text_checked(p_name);
  lock table public.creator_tag_options in share row exclusive mode;
  if exists (select 1 from public.creator_tag_options o where public.creator_tag_key(o.name) = public.creator_tag_key(v_name)) then
    raise exception '같은 이름의 선택지가 있다' using errcode = '55000';
  end if;
  insert into public.creator_tag_options (name, position)
  values (v_name, coalesce((select max(o.position) from public.creator_tag_options o), 0) + 1)
  returning id into v_id;
  return v_id;
end $$;

create function public.admin_rename_creator_tag_option(p_id uuid, p_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_operator() then
    raise exception '운영자만 선택지를 바꾼다' using errcode = '42501';
  end if;
  v_name := public.creator_tag_text_checked(p_name);
  lock table public.creator_tag_options in share row exclusive mode;
  if not exists (select 1 from public.creator_tag_options o where o.id = p_id) then
    raise exception '선택지가 없다' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.creator_tag_options o where o.id <> p_id and public.creator_tag_key(o.name) = public.creator_tag_key(v_name)) then
    raise exception '같은 이름의 선택지가 있다' using errcode = '55000';
  end if;
  update public.creator_tag_options o set name = v_name where o.id = p_id;
end $$;

-- INV-T6: 숨겨도 크리에이터가 고른 기록(creator_tags)은 지우지 않는다.
create function public.admin_set_creator_tag_option_hidden(p_id uuid, p_hidden boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 선택지를 바꾼다' using errcode = '42501';
  end if;
  if p_hidden is null then
    raise exception '숨김은 참·거짓이다' using errcode = '22023';
  end if;
  lock table public.creator_tag_options in share row exclusive mode;
  update public.creator_tag_options o set hidden = p_hidden where o.id = p_id;
  if not found then
    raise exception '선택지가 없다' using errcode = 'P0002';
  end if;
end $$;

-- 한 칸 위(p_up)·아래로. 맨 위·맨 아래면 그대로. 숨긴 선택지도 순서 안에 있다(운영자 목록 순서 그대로).
create function public.admin_move_creator_tag_option(p_id uuid, p_up boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pos integer;
  v_other uuid;
  v_other_pos integer;
begin
  if not public.is_operator() then
    raise exception '운영자만 선택지를 바꾼다' using errcode = '42501';
  end if;
  if p_up is null then
    raise exception '방향은 참·거짓이다' using errcode = '22023';
  end if;
  lock table public.creator_tag_options in share row exclusive mode;
  -- 순서 값을 1부터 빈틈없이 다시 매긴 뒤 이웃과 바꾼다
  update public.creator_tag_options o set position = r.rn
  from (select x.id, row_number() over (order by x.position, x.created_at, x.id)::integer as rn from public.creator_tag_options x) r
  where o.id = r.id and o.position <> r.rn;

  select o.position into v_pos from public.creator_tag_options o where o.id = p_id;
  if not found then
    raise exception '선택지가 없다' using errcode = 'P0002';
  end if;
  select o.id, o.position into v_other, v_other_pos from public.creator_tag_options o
  where o.position = case when p_up then v_pos - 1 else v_pos + 1 end;
  if v_other is null then
    return;
  end if;
  update public.creator_tag_options o set position = v_other_pos where o.id = p_id;
  update public.creator_tag_options o set position = v_pos where o.id = v_other;
end $$;

-- ── 4) 운영자 — 직접 입력 목록 · 선택지에 넣기 (INV-T5) ────────────

-- 같은 말(선택지 비교 방법)끼리 묶어 인원수. 보이는 글자는 묶음 안의 한 표기.
create function public.admin_custom_creator_tags()
returns table (tag text, creator_count integer)
language sql stable security definer set search_path = ''
as $$
  select min(c.tag), count(*)::integer
  from public.creator_custom_tags c
  where public.is_operator()
  group by public.creator_tag_key(c.tag)
  order by count(*) desc, min(c.tag);
$$;

-- 한 함수 = 한 트랜잭션 — 선택지 만들기(또는 있는 것 쓰기·다시 보이기)와 모든 크리에이터 바꾸기가 함께 되거나 함께 안 된다.
-- 이미 그 선택지를 가진 크리에이터는 직접 입력만 지운다. 직접 입력 1개가 선택지 1개로 바뀌거나 사라지므로 태그 수는 늘지 않는다.
create function public.admin_promote_custom_creator_tag(p_tag text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_tag text;
  v_key text;
  v_id uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 선택지를 바꾼다' using errcode = '42501';
  end if;
  v_tag := public.creator_tag_text_checked(p_tag);
  v_key := public.creator_tag_key(v_tag);
  lock table public.creator_tag_options in share row exclusive mode;
  if not exists (select 1 from public.creator_custom_tags c where public.creator_tag_key(c.tag) = v_key) then
    raise exception '그 말을 적은 크리에이터가 없다' using errcode = 'P0002';
  end if;

  select o.id into v_id from public.creator_tag_options o where public.creator_tag_key(o.name) = v_key;
  if found then
    update public.creator_tag_options o set hidden = false where o.id = v_id and o.hidden;
  else
    insert into public.creator_tag_options (name, position)
    values (v_tag, coalesce((select max(o.position) from public.creator_tag_options o), 0) + 1)
    returning id into v_id;
  end if;

  insert into public.creator_tags (creator_id, option_id)
  select c.creator_id, v_id from public.creator_custom_tags c where public.creator_tag_key(c.tag) = v_key
  on conflict do nothing;
  delete from public.creator_custom_tags c where public.creator_tag_key(c.tag) = v_key;
  return v_id;
end $$;

revoke all on function public.admin_creator_tag_options() from public, anon;
revoke all on function public.admin_add_creator_tag_option(text) from public, anon;
revoke all on function public.admin_rename_creator_tag_option(uuid, text) from public, anon;
revoke all on function public.admin_set_creator_tag_option_hidden(uuid, boolean) from public, anon;
revoke all on function public.admin_move_creator_tag_option(uuid, boolean) from public, anon;
revoke all on function public.admin_custom_creator_tags() from public, anon;
revoke all on function public.admin_promote_custom_creator_tag(text) from public, anon;
grant execute on function public.admin_creator_tag_options() to authenticated;
grant execute on function public.admin_add_creator_tag_option(text) to authenticated;
grant execute on function public.admin_rename_creator_tag_option(uuid, text) to authenticated;
grant execute on function public.admin_set_creator_tag_option_hidden(uuid, boolean) to authenticated;
grant execute on function public.admin_move_creator_tag_option(uuid, boolean) to authenticated;
grant execute on function public.admin_custom_creator_tags() to authenticated;
grant execute on function public.admin_promote_custom_creator_tag(text) to authenticated;

-- ── 5) 읽기 (INV-T4·T6) ──────────────────────────────────

-- 고를 수 있는 선택지 — 숨기지 않은 것, 선택지 순서. 가입 화면(로그인 전)도 쓰므로 anon 에게도 연다.
create function public.creator_tag_options()
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name from public.creator_tag_options o where not o.hidden order by o.position, o.created_at, o.id;
$$;

revoke all on function public.creator_tag_options() from public;
grant execute on function public.creator_tag_options() to anon, authenticated;

-- 공개 목록 — category 대신 tags. 직접 입력 칸은 없다(INV-T4). 반환 꼴이 바뀌므로 지우고 다시 만든다(find_creators 가 list_creators 를 읽는다).
drop function public.find_creators();
drop function public.list_creators();

create function public.list_creators()
returns table (
  id uuid,
  slug text,
  name text,
  channel text,
  channel_title text,
  tags text[],
  intro text,
  alias text,
  avg_approval_hours integer,
  face_tone text,
  approval_minutes_from_orders integer
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, c.channel, c.channel_title,
         coalesce((select array_agg(o.name order by o.position, o.created_at, o.id)
                     from public.creator_tags t
                     join public.creator_tag_options o on o.id = t.option_id
                    where t.creator_id = c.id and not o.hidden), '{}'::text[]),
         c.intro, c.alias, c.avg_approval_hours, c.face_tone,
         (select round(avg(extract(epoch from (o.approved_at - o.registered_at)) / 60))::integer
            from public.orders o
           where o.creator_id = c.id and o.approved_at is not null and o.registered_at is not null)
  from public.creators c
  where c.identity_verified
  order by c.created_at, c.id;
$$;

create function public.find_creators()
returns table (
  id uuid,
  slug text,
  name text,
  channel text,
  channel_title text,
  tags text[],
  intro text,
  alias text,
  avg_approval_hours integer,
  face_tone text,
  approval_minutes_from_orders integer
)
language sql stable security definer set search_path = ''
as $$
  select l.* from public.list_creators() l
  join public.creators c on c.id = l.id
  where c.identity_verified and c.searchable;
$$;

revoke all on function public.list_creators() from public;
revoke all on function public.find_creators() from public;
grant execute on function public.list_creators() to anon, authenticated;
grant execute on function public.find_creators() to anon, authenticated;

-- 본인 설정 읽기 — 고른 선택지(숨기지 않은 것, 선택지 순서)와 직접 입력을 더한다. 로그인한 크리에이터 자신의 것만.
drop function public.my_creator_settings();

create function public.my_creator_settings()
returns table (name text, intro text, searchable boolean, tag_ids uuid[], custom_tag text)
language sql stable security definer set search_path = ''
as $$
  select c.name, c.intro, c.searchable,
         coalesce((select array_agg(t.option_id order by o.position, o.created_at, o.id)
                     from public.creator_tags t
                     join public.creator_tag_options o on o.id = t.option_id
                    where t.creator_id = c.id and not o.hidden), '{}'::uuid[]),
         (select x.tag from public.creator_custom_tags x where x.creator_id = c.id)
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;

revoke all on function public.my_creator_settings() from public, anon;
grant execute on function public.my_creator_settings() to authenticated;
