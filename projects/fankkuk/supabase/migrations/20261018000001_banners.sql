-- 광고 배너 (docs/specs/banners.md INV-Y1~Y10).
-- 운영자만 만들고·고치고·순서를 바꾸고·내린다(Y1 — 판정은 is_operator(), 표에는 화면 쪽 키의 정책이 없다).
-- 공개 읽기는 한국 날짜로 지금 보이는 배너만, 순서 값 → 만든 때 순서로(Y2·Y8). 상태(보이는 중·예정·끝남)는 저장하지 않고
-- banner_state 하나로 계산해 공개 읽기와 운영자 목록이 같이 쓴다(Y2).
-- 링크·글자 수는 DB 제약이 저장 경계에서 다시 본다(Y3·Y6). 쓰기 함수는 같은 처리 안에서 기록 한 줄씩 남긴다(Y10).
-- 그림은 공개 저장소 banner-images 에 서버의 비밀 키로만 쓴다(Y4·Y5 — 저장소 정책을 두지 않는다).
-- 오류 꼴: 42501 권한 없음 · 22023 입력이 조건 밖 · P0002 대상 없음.

-- ── 검사 함수 — 화면 쪽 같은 검사(entities/banner/model/banner-rules.ts)와 같은 규칙. 시험이 둘의 답을 맞춰 본다 ──

-- 앞뒤 빈칸·제어 문자로 보는 글자 묶음 — JavaScript 의 \s 와 제어 문자(같은 목록을 banner-rules.ts 가 쓴다)
-- [\x01-\x20\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]

-- INV-Y3: 팬꾹 안 주소(/ 로 시작, 두 번째 글자가 / \ 가 아님, 빈칸·제어 문자 없음) 또는 https 바깥 주소(호스트 있음). 500자까지.
create function public.banner_link_ok(p_link text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_link is not null and char_length(p_link) <= 500 and (
    p_link ~ '^/([^/\\\x01-\x20\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff][^\x01-\x20\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*)?$'
    or p_link ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^\x01-\x20\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*)?$'
  );
$$;

-- INV-Y6: 제목 1~30자 · 설명 0~40자(글자 수 = 코드 포인트, char_length). 앞뒤 빈칸 없음, 제어 문자 없음.
create function public.banner_text_ok(p_title text, p_description text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_title is not null and p_description is not null
    and char_length(p_title) between 1 and 30
    and char_length(p_description) <= 40
    and p_title !~ '^[\x01-\x20\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\x01-\x20\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$'
    and p_description !~ '^[\x01-\x20\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\x01-\x20\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$'
    and p_title !~ '[\x01-\x1f\u007f-\u009f\u2028\u2029]'
    and p_description !~ '[\x01-\x1f\u007f-\u009f\u2028\u2029]';
$$;

-- 앞뒤 빈칸 걷기 — 화면 쪽 String.prototype.trim 과 같은 글자 묶음
create function public.banner_trim(p text)
returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(coalesce(p, ''), '^[\t\n\u000b\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\t\n\u000b\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$', '', 'g');
$$;

-- 그림 경로 — 서버가 정한 이름(b- + 짐작할 수 없는 32자 + .webp)만(INV-Y4)
create function public.banner_image_path_ok(p_path text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_path is not null and p_path ~ '^b-[0-9a-f]{32}\.webp$';
$$;

-- INV-Y2: 한국 날짜 — 시작·끝은 그날 하루 전체를 포함한다
create function public.banner_korea_date(p_at timestamptz)
returns date
language sql immutable set search_path = ''
as $$
  select (p_at at time zone 'Asia/Seoul')::date;
$$;

-- INV-Y2: 상태 규칙 하나 — live(보이는 중) · scheduled(예정) · ended(끝남). 공개 읽기와 운영자 목록이 함께 쓴다.
create function public.banner_state(p_starts_on date, p_ends_on date, p_today date)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_today < p_starts_on then 'scheduled'
    when p_ends_on is not null and p_today > p_ends_on then 'ended'
    else 'live'
  end;
$$;

-- ── 표 ───────────────────────────────────────────────────

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  link text not null,
  is_ad boolean not null default false,
  starts_on date not null,
  ends_on date,
  sort_order integer not null default 0,
  image_path text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id),
  constraint banners_text_ok check (public.banner_text_ok(title, description)),          -- INV-Y6
  constraint banners_link_ok check (public.banner_link_ok(link)),                         -- INV-Y3
  constraint banners_period_ok check (ends_on is null or ends_on >= starts_on),           -- INV-Y2
  constraint banners_image_path_ok check (public.banner_image_path_ok(image_path))        -- INV-Y4
);
-- INV-Y1·Y2: RLS 를 켜고 화면 쪽 키(anon·authenticated)의 정책을 두지 않는다 — 읽기·쓰기 모두 아래 함수로만.
alter table public.banners enable row level security;
revoke all on public.banners from anon, authenticated;

-- INV-Y10: 만듦·고침·순서·내림 기록. 배너가 지워져도 남아야 하므로 배너 표를 참조하지 않는다. 그때의 제목을 함께 적는다.
create table public.banner_changes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  acted_by uuid not null references public.profiles (id),
  banner_id uuid not null,
  action text not null check (action in ('create', 'edit', 'order', 'remove')),
  title text not null,
  note text not null default ''
);
create index banner_changes_banner_idx on public.banner_changes (banner_id, at desc);
alter table public.banner_changes enable row level security;
revoke all on public.banner_changes from anon, authenticated;

create trigger banner_changes_no_update before update on public.banner_changes
  for each row execute function public.append_only_log();
create trigger banner_changes_no_delete before delete on public.banner_changes
  for each row execute function public.append_only_log();

-- ── 읽기 ─────────────────────────────────────────────────

-- 시각을 받는 안쪽 함수 — 시험이 「그 시각의 오늘」을 정해 부른다. 화면 쪽 키에는 열지 않는다.
-- INV-Y2·Y8: 그 시각 한국 날짜로 보이는 배너만, 순서 값 → 만든 때 → id 순. 만든 사람·고친 사람·기간은 내보내지 않는다.
create function public.list_banners_at(p_at timestamptz)
returns table (id uuid, title text, description text, link text, is_ad boolean, image_path text)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.title, b.description, b.link, b.is_ad, b.image_path
  from public.banners b
  where public.banner_state(b.starts_on, b.ends_on, public.banner_korea_date(p_at)) = 'live'
  order by b.sort_order, b.created_at, b.id;
$$;

-- 운영자 목록의 안쪽 함수 — 모든 배너와 그 시각의 상태
create function public.admin_banners_at(p_at timestamptz)
returns table (
  id uuid, title text, description text, link text, is_ad boolean, image_path text,
  sort_order integer, starts_on date, ends_on date, state text
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.title, b.description, b.link, b.is_ad, b.image_path, b.sort_order, b.starts_on, b.ends_on,
    public.banner_state(b.starts_on, b.ends_on, public.banner_korea_date(p_at))
  from public.banners b
  order by b.sort_order, b.created_at, b.id;
$$;

revoke all on function public.list_banners_at(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_banners_at(timestamptz) from public, anon, authenticated;

-- 공개 읽기 — 누구나(로그인 없이)
create function public.list_banners()
returns table (id uuid, title text, description text, link text, is_ad boolean, image_path text)
language sql stable security definer set search_path = ''
as $$
  select * from public.list_banners_at(now());
$$;
revoke all on function public.list_banners() from public;
grant execute on function public.list_banners() to anon, authenticated;

-- 운영자 목록 — 운영자가 아니면 빈 목록
create function public.admin_banners()
returns table (
  id uuid, title text, description text, link text, is_ad boolean, image_path text,
  sort_order integer, starts_on date, ends_on date, state text
)
language sql stable security definer set search_path = ''
as $$
  select * from public.admin_banners_at(now()) where public.is_operator();
$$;
revoke all on function public.admin_banners() from public, anon;
grant execute on function public.admin_banners() to authenticated;

-- ── 쓰기 (운영자만, 기록 한 줄씩) ────────────────────────

-- 만들기(p_id null — 그림 경로 필수) · 고치기(p_id — 그림은 admin_set_banner_image 로만 바꾼다). 돌려주는 값은 배너 id.
create function public.admin_save_banner(
  p_id uuid, p_title text, p_description text, p_link text, p_is_ad boolean,
  p_starts_on date, p_ends_on date, p_image_path text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_title text := public.banner_trim(p_title);
  v_description text := public.banner_trim(p_description);
  v_link text := public.banner_trim(p_link);
  v_id uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 배너를 바꾼다' using errcode = '42501';
  end if;
  if not public.banner_text_ok(v_title, v_description) then
    raise exception '제목은 1~30자, 설명은 40자까지다' using errcode = '22023';
  end if;
  if not public.banner_link_ok(v_link) then
    raise exception '누르면 가는 곳은 팬꾹 주소 또는 https 주소다' using errcode = '22023';
  end if;
  if p_is_ad is null or p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on) then
    raise exception '끝 날짜는 시작 날짜보다 앞설 수 없다' using errcode = '22023';
  end if;

  if p_id is null then
    if not public.banner_image_path_ok(p_image_path) then
      raise exception '새 배너에는 그림이 있어야 한다' using errcode = '22023';
    end if;
    insert into public.banners (title, description, link, is_ad, starts_on, ends_on, sort_order, image_path, created_by, updated_by)
    values (v_title, v_description, v_link, p_is_ad, p_starts_on, p_ends_on,
      coalesce((select max(b.sort_order) from public.banners b), 0) + 1, p_image_path, auth.uid(), auth.uid())
    returning id into v_id;
    insert into public.banner_changes (acted_by, banner_id, action, title) values (auth.uid(), v_id, 'create', v_title);
    return v_id;
  end if;

  if p_image_path is not null then
    raise exception '그림은 그림 바꾸기로만 바꾼다' using errcode = '22023';
  end if;
  update public.banners b
  set title = v_title, description = v_description, link = v_link, is_ad = p_is_ad,
      starts_on = p_starts_on, ends_on = p_ends_on, updated_at = now(), updated_by = auth.uid()
  where b.id = p_id
  returning b.id into v_id;
  if v_id is null then
    raise exception '없는 배너다' using errcode = 'P0002';
  end if;
  insert into public.banner_changes (acted_by, banner_id, action, title) values (auth.uid(), v_id, 'edit', v_title);
  return v_id;
end $$;

-- 그림 바꾸기 — 옛 경로를 돌려준다(서버가 옛 파일을 지운다, INV-Y4)
create function public.admin_set_banner_image(p_id uuid, p_image_path text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_old text;
  v_title text;
begin
  if not public.is_operator() then
    raise exception '운영자만 배너를 바꾼다' using errcode = '42501';
  end if;
  if not public.banner_image_path_ok(p_image_path) then
    raise exception '그림 경로가 조건 밖이다' using errcode = '22023';
  end if;
  select b.image_path, b.title into v_old, v_title from public.banners b where b.id = p_id for update;
  if v_old is null then
    raise exception '없는 배너다' using errcode = 'P0002';
  end if;
  update public.banners b set image_path = p_image_path, updated_at = now(), updated_by = auth.uid() where b.id = p_id;
  insert into public.banner_changes (acted_by, banner_id, action, title, note) values (auth.uid(), p_id, 'edit', v_title, 'image');
  return v_old;
end $$;

-- 순서 정하기 — 받은 id 순서대로 순서 값 1, 2, 3 … 값이 바뀐 배너마다 기록 한 줄. 이미 내려진 id 는 건너뛴다.
create function public.admin_set_banner_order(p_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if not public.is_operator() then
    raise exception '운영자만 배너를 바꾼다' using errcode = '42501';
  end if;
  if p_ids is null or array_position(p_ids, null) is not null
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception '순서 목록이 조건 밖이다' using errcode = '22023';
  end if;
  for r in
    update public.banners b
    set sort_order = o.ord, updated_at = now(), updated_by = auth.uid()
    from unnest(p_ids) with ordinality as o (id, ord)
    where b.id = o.id and b.sort_order <> o.ord
    returning b.id, b.title, o.ord
  loop
    insert into public.banner_changes (acted_by, banner_id, action, title, note)
    values (auth.uid(), r.id, 'order', r.title, r.ord::text);
  end loop;
end $$;

-- 내리기 — 배너를 지우고 그림 경로를 돌려준다(서버가 그 파일을 지운다, INV-Y4). 기록은 남는다.
create function public.admin_remove_banner(p_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.banners;
begin
  if not public.is_operator() then
    raise exception '운영자만 배너를 바꾼다' using errcode = '42501';
  end if;
  delete from public.banners b where b.id = p_id returning * into v_old;
  if v_old.id is null then
    raise exception '없는 배너다' using errcode = 'P0002';
  end if;
  insert into public.banner_changes (acted_by, banner_id, action, title) values (auth.uid(), p_id, 'remove', v_old.title);
  return v_old.image_path;
end $$;

revoke all on function public.admin_save_banner(uuid, text, text, text, boolean, date, date, text) from public, anon;
revoke all on function public.admin_set_banner_image(uuid, text) from public, anon;
revoke all on function public.admin_set_banner_order(uuid[]) from public, anon;
revoke all on function public.admin_remove_banner(uuid) from public, anon;
grant execute on function public.admin_save_banner(uuid, text, text, text, boolean, date, date, text) to authenticated;
grant execute on function public.admin_set_banner_image(uuid, text) to authenticated;
grant execute on function public.admin_set_banner_order(uuid[]) to authenticated;
grant execute on function public.admin_remove_banner(uuid) to authenticated;

-- ── 저장소 (INV-Y4·Y5) ───────────────────────────────────

-- 공개 읽기, webp 1MB 까지. 쓰기 정책을 두지 않는다(서버의 비밀 키만 쓴다). 공개 저장소 세 번째 예외(DECISIONS 2026-10-18).
-- 저장소 표가 아직 없으면 건너뛴다 — 로컬은 supabase/config.toml 의 같은 버킷 설정도 만든다.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('banner-images', 'banner-images', true, 1048576, array['image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

notify pgrst, 'reload schema';
