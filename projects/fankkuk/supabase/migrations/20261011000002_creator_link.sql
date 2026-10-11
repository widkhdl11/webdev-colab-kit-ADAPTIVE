-- 2026-10-11 선물 링크 페이지 — 링크용 아이디·한 줄 소개 40자·프로필 사진·이번 달 팬 수·열람 경보.
-- 스펙: creator-link INV-E1~E11 (추가분 F-1·F-2·F-8 공지 이미지, DECISIONS 2026-10-11 ④⑤⑥⑪⑫).
--
-- 1) creator_handles — 링크용 아이디 표. 지금 아이디(retired_until 비어 있음)와 바꾼 옛 아이디(90일 묶임)가 같은 고유 목록(handle 기본 키)에 있다(INV-E3).
--    한 크리에이터의 지금 아이디는 하나뿐이다(부분 고유 색인). 두 크리에이터가 같은 아이디를 동시에 넣으면 고유 목록이 한쪽을 거부한다.
--    90일이 지난 옛 줄은 누가 그 아이디를 고를 때 지운다(예약 작업 없음). 화면 쪽 API 로 읽기·쓰기 불가.
-- 2) creator_handle_reserved — 받지 않는 아이디(사이트 첫 단계 주소 전부 + 예약어). 지금 있는 첫 단계 주소가 다 들어 있는지는 통합 시험(S2c)이 본다.
-- 3) creators 칸: handle_changed_at(30일 잠금, INV-E4) · photo_path·photo_version·photo_updated_at(사진 판, INV-E9).
--    소개 칸은 40자·한 줄로 좁힌다(INV-E6) — 출시 전이라 기존 소개는 줄바꿈을 띄어쓰기로 바꾸고 40자로 자른다(조건이 있어 다시 적용해도 같다).
-- 4) update_my_creator_handle — 크리에이터 ID 인자 없이 로그인 토큰의 크리에이터 한 줄만(INV-E1). 꼴·예약어·본인 로그인 아이디·잠금·중복 검사(INV-E2~E4).
--    오류 꼴: 42501 로그인 안 함·크리에이터 아님 · 22023 꼴 · P0090 예약어 · P0091 잠금(detail = 남은 날) · P0092 이미 쓰임 · P0093 본인 로그인 아이디 · P0002 줄 없음
-- 5) update_my_creator_profile — 소개 0~40자, 줄바꿈·보이지 않는 글자 없음, 태그와 같은 필터(P0081 금칙어 · P0082 연락처·주소 · P0083 기호만). 나머지는 20261006000018 그대로.
-- 6) 사진 판: creator_photo_next · set_creator_photo — 서버의 비밀 키로만 부른다(화면 쪽 키 실행 권한 없음). 경로({크리에이터 ID}/{판}.webp)는 DB 가 정한다.
--    사진 저장소(creator-photos, 공개 읽기)에는 쓰기 정책을 두지 않는다 — 화면 쪽 키로는 올릴 수 없다(INV-E1). DECISIONS ⑫: 공개 저장소 금지의 유일한 예외.
-- 7) 공개 읽기: resolve_creator_handle(아이디 → 크리에이터·지금 아이디, 본인 확인된 사람만, INV-E3·E5) · creator_month_fan_total(숫자 하나, INV-E8) ·
--    creator_rows 와 목록 셋(list_creators·find_creators·creator_by_id)에 handle·photo_path 를 더한다(반환 꼴이 바뀌어 지우고 다시 만든다).
-- 8) my_creator_link — 본인 아이디·남은 잠금 날·사진 경로.
-- 9) admin_unsigned_open_alerts — 승인 서명 없이 열린 주소 열람 줄의 수·마지막 시각. 운영자만(INV-E11).
--
-- 다시 적용해도 결과가 같다(칸·표는 if not exists, 함수는 create or replace, 반환 꼴이 바뀐 함수는 drop if exists 뒤 create).

-- ── 1)·2) 아이디 표·예약어 ──────────────────────────────────

create table if not exists public.creator_handles (
  handle text primary key check (handle ~ '^[a-z0-9_]{3,20}$'),
  creator_id uuid not null references public.creators (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 비어 있으면 지금 아이디. 값이 있으면 바꾼 옛 아이디이고 이 시각까지 그 크리에이터에게 묶인다
  retired_until timestamptz
);
create unique index if not exists creator_handles_one_current on public.creator_handles (creator_id) where retired_until is null;
create index if not exists creator_handles_creator_idx on public.creator_handles (creator_id);
alter table public.creator_handles enable row level security;
revoke all on table public.creator_handles from anon, authenticated;

create table if not exists public.creator_handle_reserved (
  word text primary key check (word ~ '^[a-z0-9_-]{1,40}$')
);
alter table public.creator_handle_reserved enable row level security;
revoke all on table public.creator_handle_reserved from anon, authenticated;

-- 사이트 첫 단계 주소(src/app·public 아래) + 앞으로 쓸 만한 사이트 주소·사칭되기 쉬운 이름
insert into public.creator_handle_reserved (word)
select w from unnest(array[
  -- 지금 있는 첫 단계 주소
  'about', 'admin', 'api', 'creator', 'creators', 'gifts', 'home', 'login', 'me', 'notices', 'password', 'privacy', 'signup', 'support', 'terms',
  'brand', 'img', 'icon', 'apple-icon', 'favicon', 'robots', 'sitemap', 'manifest', 'opengraph-image', 'twitter-image', '_next',
  -- 예약어(스펙 「스스로 정한 것」)
  'fankkuk', 'fankkook', 'www', 'help', 'official', 'staff', 'root', 'system', 'null', 'undefined', 'settings', 'og',
  'auth', 'logout', 'signin', 'register', 'account', 'accounts', 'profile', 'my', 'user', 'users', 'fan', 'fans', 'gift',
  'notice', 'faq', 'contact', 'policy', 'policies', 'legal', 'cs', 'service', 'services', 'team', 'operator', 'operators',
  'manager', 'moderator', 'security', 'status', 'search', 'explore', 'new', 'edit', 'link', 'links', 'share', 'report',
  'checkout', 'pay', 'payment', 'payments', 'order', 'orders', 'shop', 'store', 'blog', 'news', 'event', 'events',
  'static', 'assets', 'public', 'files', 'media', 'images', 'image', 'photo', 'photos', 'mail', 'email', 'test', 'guest',
  'anonymous', 'dashboard', 'revgifts', 'inquiry', 'inquiries', 'creatorlink', 'kakao', 'toss'
]) as t(w)
on conflict (word) do nothing;

-- ── 3) 크리에이터 칸 ──────────────────────────────────

alter table public.creators add column if not exists handle_changed_at timestamptz;
alter table public.creators add column if not exists photo_path text;
alter table public.creators add column if not exists photo_version integer not null default 0;
alter table public.creators add column if not exists photo_updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'creators_photo_path_shape') then
    alter table public.creators add constraint creators_photo_path_shape
      check (photo_path is null or photo_path = id::text || '/' || photo_version::text || '.webp');
  end if;
end $$;

-- INV-E6: 기존 소개를 한 줄 40자로 — 줄바꿈은 띄어쓰기로 바꾸고 앞뒤 공백을 뺀 뒤 자른다
update public.creators
set intro = public.app_trim(left(public.app_trim(regexp_replace(intro, '[\r\n\u2028\u2029]+', ' ', 'g')), 40))
where char_length(intro) > 40 or intro ~ '[\r\n\u2028\u2029]';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'creators_intro_one_line') then
    alter table public.creators add constraint creators_intro_one_line
      check (char_length(intro) <= 40 and intro !~ '[\r\n\u2028\u2029]');
  end if;
end $$;

-- ── 4) 아이디 저장 ──────────────────────────────────

create or replace function public.update_my_creator_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  -- INV-E2: 앞뒤 공백을 빼고 소문자로 바꾼 뒤 검사·저장한다
  v_handle text := lower(public.app_trim(coalesce(p_handle, '')));
  v_creator public.creators;
  v_current text;
  v_left integer;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if v_handle !~ '^[a-z0-9_]{3,20}$' then
    raise exception '링크 아이디는 영문 소문자·숫자·밑줄 3~20자다' using errcode = '22023';
  end if;
  if exists (select 1 from public.creator_handle_reserved r where r.word = v_handle) then
    raise exception '사이트가 쓰는 주소라 링크 아이디로 쓸 수 없다' using errcode = 'P0090';
  end if;
  -- 본인 로그인 아이디만 본다 — 남의 로그인 아이디까지 거부하면 그 값이 누군가의 로그인 아이디라는 사실이 드러난다
  if exists (select 1 from public.profiles p where p.id = v_uid and lower(p.login_id) = v_handle) then
    raise exception '로그인 아이디와 같은 값은 링크 아이디로 쓸 수 없다' using errcode = 'P0093';
  end if;

  -- 같은 크리에이터의 저장끼리는 줄을 세운다(잠금 판정이 겹치지 않게)
  select * into v_creator from public.creators c where c.profile_id = v_uid for update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;

  select h.handle into v_current from public.creator_handles h where h.creator_id = v_creator.id and h.retired_until is null;
  if v_current = v_handle then
    return v_handle; -- 그대로면 바꾸지 않는다(잠금도 새로 걸지 않는다)
  end if;

  -- INV-E4: 정하거나 바꾼 뒤 30일 동안은 다시 바꾸지 않는다
  if v_creator.handle_changed_at is not null and v_creator.handle_changed_at > now() - interval '30 days' then
    v_left := ceil(extract(epoch from (v_creator.handle_changed_at + interval '30 days' - now())) / 86400)::integer;
    raise exception '링크 아이디는 %일 뒤에 바꿀 수 있다', v_left using errcode = 'P0091', detail = v_left::text;
  end if;

  -- INV-E3: 90일이 지난 옛 아이디는 풀어 준다(누구 것이든). 내가 묶어 둔 옛 아이디면 되찾는다
  delete from public.creator_handles h where h.handle = v_handle and h.retired_until is not null and h.retired_until <= now();
  delete from public.creator_handles h where h.handle = v_handle and h.creator_id = v_creator.id and h.retired_until is not null;
  if exists (select 1 from public.creator_handles h where h.handle = v_handle) then
    raise exception '이미 쓰는 링크 아이디다' using errcode = 'P0092';
  end if;

  update public.creator_handles h set retired_until = now() + interval '90 days' where h.creator_id = v_creator.id and h.retired_until is null;
  begin
    insert into public.creator_handles (handle, creator_id) values (v_handle, v_creator.id);
  exception when unique_violation then
    -- 같은 아이디를 다른 크리에이터가 동시에 넣었다 — 고유 목록이 한쪽만 받는다
    raise exception '이미 쓰는 링크 아이디다' using errcode = 'P0092';
  end;
  update public.creators c set handle_changed_at = now() where c.id = v_creator.id;
  return v_handle;
end $fn$;

revoke all on function public.update_my_creator_handle(text) from public, anon;
grant execute on function public.update_my_creator_handle(text) to authenticated;

-- ── 5) 공개 이름·소개·노출 저장 (소개 40자 한 줄 + 필터) ──────────────────────────────────

create or replace function public.update_my_creator_profile(p_name text, p_intro text, p_searchable boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_name text := public.app_trim(coalesce(p_name, ''));
  v_intro text := public.app_trim(coalesce(p_intro, ''));
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
  if v_name ~ '[\u0001-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb]' then
    raise exception '공개 이름에 제어 문자·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
  end if;
  -- INV-E6: 한 줄 소개 0~40자, 줄바꿈(제어 문자·줄 구분자)과 보이지 않는 글자 없음
  if p_intro is null or char_length(v_intro) > 40 then
    raise exception '한 줄 소개는 0~40자다' using errcode = '22023';
  end if;
  if v_intro ~ '[\u0001-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u2064\u2066-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb]' then
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
  if p_searchable is null then
    raise exception '찾기 노출은 참·거짓이다' using errcode = '22023';
  end if;

  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;

  update public.creators c set name = v_name, intro = v_intro, searchable = p_searchable where c.id = v_creator.id;
  if v_creator.name <> v_name then
    insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, v_name);
    update public.profiles p set nickname = v_name where p.id = v_uid;
  end if;
end $fn$;

revoke all on function public.update_my_creator_profile(text, text, boolean) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean) to authenticated;

-- ── 6) 사진 판 (서버의 비밀 키로만) ──────────────────────────────────

-- 다음 판 번호와 크리에이터 ID. 서버가 이 번호로 저장소 경로를 만들어 먼저 올리고, set_creator_photo 로 붙인다.
create or replace function public.creator_photo_next(p_profile_id uuid)
returns table (creator_id uuid, next_version integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.photo_version + 1 from public.creators c where c.profile_id = p_profile_id;
$$;

-- p_version 이 있으면 그 판의 파일({크리에이터 ID}/{판}.webp)을 붙이고, null 이면 사진을 뗀다(판은 그래도 하나 올린다 — 미리보기 주소가 바뀌게).
-- 돌려주는 값은 옛 파일 경로(없으면 null) — 서버가 저장소에서 지운다. 그 사이 다른 요청이 판을 올렸으면 40001.
create or replace function public.set_creator_photo(p_profile_id uuid, p_version integer)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_creator public.creators;
begin
  select * into v_creator from public.creators c where c.profile_id = p_profile_id for update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  if p_version is null then
    update public.creators c set photo_path = null, photo_version = c.photo_version + 1, photo_updated_at = now() where c.id = v_creator.id;
  elsif p_version <> v_creator.photo_version + 1 then
    raise exception '다른 요청이 사진을 먼저 바꿨다' using errcode = '40001';
  else
    update public.creators c
    set photo_path = c.id::text || '/' || p_version::text || '.webp', photo_version = p_version, photo_updated_at = now()
    where c.id = v_creator.id;
  end if;
  return v_creator.photo_path;
end $fn$;

revoke all on function public.creator_photo_next(uuid) from public, anon, authenticated;
revoke all on function public.set_creator_photo(uuid, integer) from public, anon, authenticated;
grant execute on function public.creator_photo_next(uuid) to service_role;
grant execute on function public.set_creator_photo(uuid, integer) to service_role;

-- 사진 저장소 — 공개 읽기, webp 1MB 까지. 쓰기 정책을 두지 않는다(서버의 비밀 키만 쓴다). 저장소 표가 아직 없으면(저장소 서비스 전) 건너뛴다 —
-- 로컬은 supabase/config.toml 의 같은 버킷 설정이 만든다.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('creator-photos', 'creator-photos', true, 1048576, array['image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- ── 7) 공개 읽기 ──────────────────────────────────

-- INV-E3·E5: 지금 아이디·묶인 옛 아이디로 찾는다. 본인 확인된 크리에이터만. 돌려주는 것은 크리에이터 ID 와 그 지금 아이디뿐.
create or replace function public.resolve_creator_handle(p_handle text)
returns table (creator_id uuid, handle text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.creator_id, cur.handle
  from public.creator_handles h
  join public.creators c on c.id = h.creator_id and c.identity_verified
  join public.creator_handles cur on cur.creator_id = h.creator_id and cur.retired_until is null
  where h.handle = lower(coalesce(p_handle, ''))
    and (h.retired_until is null or h.retired_until > now());
$$;

revoke all on function public.resolve_creator_handle(text) from public;
grant execute on function public.resolve_creator_handle(text) to anon, authenticated;

-- INV-E8: 이번 달(한국 시간 달력) 결제가 끝난 그 크리에이터 팬 선물의 서로 다른 보낸 사람 수. 결제 전·취소 제외, 거절·반려는 넣는다.
-- 숫자 하나만 돌려준다. 본인 확인 전 크리에이터는 0.
create or replace function public.creator_month_fan_total(p_creator_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct o.fan_id)::integer
  from public.orders o
  join public.creators c on c.id = o.creator_id and c.identity_verified
  where o.creator_id = p_creator_id
    and o.status not in ('pending_payment', 'canceled')
    and o.registered_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;

revoke all on function public.creator_month_fan_total(uuid) from public;
grant execute on function public.creator_month_fan_total(uuid) to anon, authenticated;

-- 공개 줄에 링크 아이디·사진 경로를 더한다. 내용은 20261010000005 의 creator_rows 그대로.
drop function if exists public.creator_by_id(uuid);
drop function if exists public.find_creators();
drop function if exists public.list_creators();
drop function if exists public.creator_rows(uuid);

create function public.creator_rows(p_only uuid default null)
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, searchable boolean, profile_id uuid, handle text, photo_path text)
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
         c.photo_path
  from public.creators c
  where c.identity_verified and (p_only is null or c.id = p_only)
  order by c.created_at, c.id;
$$;

create function public.list_creators()
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, handle text, photo_path text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders, r.handle, r.photo_path
  from public.creator_rows() r
  where r.searchable
     or r.profile_id = auth.uid()
     or exists (select 1 from public.follows f where f.creator_id = r.id and f.fan_id = auth.uid());
$$;

create function public.find_creators()
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, handle text, photo_path text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders, r.handle, r.photo_path
  from public.creator_rows() r
  where r.searchable;
$$;

create function public.creator_by_id(p_id uuid)
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, handle text, photo_path text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.slug, r.name, r.channel, r.channel_title, r.tags, r.intro, r.alias, r.avg_approval_hours, r.face_tone,
         r.approval_minutes_from_orders, r.handle, r.photo_path
  from public.creator_rows(p_id) r;
$$;

revoke all on function public.creator_rows(uuid) from public, anon, authenticated;
revoke all on function public.list_creators() from public;
revoke all on function public.find_creators() from public;
revoke all on function public.creator_by_id(uuid) from public;
grant execute on function public.list_creators() to anon, authenticated;
grant execute on function public.find_creators() to anon, authenticated;
grant execute on function public.creator_by_id(uuid) to anon, authenticated;

-- ── 8) 본인 링크 설정 읽기 ──────────────────────────────────

create or replace function public.my_creator_link()
returns table (handle text, handle_locked_days integer, photo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select (select h.handle from public.creator_handles h where h.creator_id = c.id and h.retired_until is null),
         case when c.handle_changed_at is null then 0
              else greatest(0, ceil(extract(epoch from (c.handle_changed_at + interval '30 days' - now())) / 86400))::integer end,
         c.photo_path
  from public.creators c
  where c.profile_id = auth.uid();
$$;

revoke all on function public.my_creator_link() from public, anon;
grant execute on function public.my_creator_link() to authenticated;

-- ── 9) 승인 서명 없이 열린 열람 줄 경보 (운영자만) ──────────────────────────────────

-- 열린 줄(result = opened) 가운데, 그 주문에 열기 전에 서명이 붙은 승인이 없는 줄. 운영자가 아니면 빈 목록.
create or replace function public.admin_unsigned_open_alerts()
returns table (open_rows integer, latest_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, max(l.at)
  from public.decrypt_log l
  where l.result = 'opened'
    and not exists (
      select 1
      from public.approval_requests r
      join public.approval_signatures s on s.request_id = r.request_id
      where r.order_id = l.order_id and r.status = 'approved' and s.signed_at <= l.at
    )
  having public.is_operator();
$$;

revoke all on function public.admin_unsigned_open_alerts() from public, anon;
grant execute on function public.admin_unsigned_open_alerts() to authenticated;
