-- 「내 팬꾹 꾸미기」(2026-10-14 시안 승인 카드 d82, 디자인 기준 10절) — 프로필 배경사진·팬덤 심볼·링크 미리보기 이미지 고르기.
-- 스펙 creator-link INV-E1·E7·E9·E10·E12.
--
-- 1) creators 칸: bg_path·bg_version·bg_updated_at(배경사진) · symbol_path·symbol_version·symbol_updated_at·symbol_rights_at(팬덤 심볼과 권리 확인 체크 시각)
--    · preview_pick('photo' | 'symbol' — 링크 미리보기 이미지에 쓸 사진).
--    경로는 프로필 사진과 같은 저장소(creator-photos, 공개 읽기)에 {크리에이터 ID}/bg-{판}.webp · {크리에이터 ID}/sym-{판}.webp — DB 가 정한다.
-- 2) creator_image_next · set_creator_image — 서버의 비밀 키로만 부른다(화면 쪽 키 실행 권한 없음). 프로필 사진의 creator_photo_next · set_creator_photo 와 같은 방식.
--    사람은 서버가 세션에서 확인한 계정(p_profile_id)이고, 크리에이터 ID 는 받지 않는다(INV-E1).
--    심볼은 권리 확인 체크(p_rights_checked)가 참일 때만 붙이고 그 시각을 남긴다 — 아니면 P0095(INV-E12). 심볼을 떼면 체크 시각을 지우고 고르기를 프로필 사진으로 되돌린다.
-- 3) set_my_preview_pick(p_pick) — 로그인한 크리에이터 본인 한 줄만(auth.uid()). 심볼이 없는데 'symbol' 이면 P0096, 두 값 밖은 22023.
-- 4) creator_link_extras 에 bg_path·symbol_path·preview_pick 을 더한다(공개 칸만, INV-E7 — 체크 시각·판 번호는 돌려주지 않는다). 반환 꼴이 바뀌어 지우고 다시 만든다.
-- 5) my_creator_look() — 로그인한 크리에이터 본인의 배경사진·심볼 경로·고르기.
--
-- 저장소 버킷은 새로 만들지 않는다 — 프로필 사진 저장소(20261011000002, 쓰기 정책 없음)를 같이 쓴다. 개인정보는 없다 — pii 구역은 건드리지 않는다.
-- 다시 적용해도 결과가 같다.

-- ── 1) 칸 ──────────────────────────────────

alter table public.creators add column if not exists bg_path text;
alter table public.creators add column if not exists bg_version integer not null default 0;
alter table public.creators add column if not exists bg_updated_at timestamptz;
alter table public.creators add column if not exists symbol_path text;
alter table public.creators add column if not exists symbol_version integer not null default 0;
alter table public.creators add column if not exists symbol_updated_at timestamptz;
alter table public.creators add column if not exists symbol_rights_at timestamptz;
alter table public.creators add column if not exists preview_pick text not null default 'photo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_bg_path_shape') then
    alter table public.creators add constraint creators_bg_path_shape
      check (bg_path is null or bg_path = id::text || '/bg-' || bg_version::text || '.webp');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'creators_symbol_path_shape') then
    alter table public.creators add constraint creators_symbol_path_shape
      check (symbol_path is null or (symbol_path = id::text || '/sym-' || symbol_version::text || '.webp' and symbol_rights_at is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'creators_preview_pick_shape') then
    alter table public.creators add constraint creators_preview_pick_shape
      check (preview_pick in ('photo', 'symbol') and (preview_pick = 'photo' or symbol_path is not null));
  end if;
end $$;

-- ── 2) 배경사진·심볼 판 (서버의 비밀 키로만) ──────────────────────────────────

-- 다음 판 번호와 크리에이터 ID. 서버가 이 번호로 저장소 경로를 만들어 먼저 올리고, set_creator_image 로 붙인다.
create or replace function public.creator_image_next(p_profile_id uuid, p_kind text)
returns table (creator_id uuid, next_version integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, case p_kind when 'background' then c.bg_version + 1 when 'symbol' then c.symbol_version + 1 end
  from public.creators c
  where c.profile_id = p_profile_id and p_kind in ('background', 'symbol');
$$;

-- p_version 이 있으면 그 판의 파일을 붙이고, null 이면 뗀다(판은 그래도 하나 올린다 — 미리보기 주소가 바뀌게).
-- 돌려주는 값은 옛 파일 경로(없으면 null) — 서버가 저장소에서 지운다. 그 사이 다른 요청이 판을 올렸으면 40001.
create or replace function public.set_creator_image(p_profile_id uuid, p_kind text, p_version integer, p_rights_checked boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_creator public.creators;
  v_old text;
  v_now_version integer;
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
    where c.id = v_creator.id;
  elsif p_version is null then
    update public.creators c
    set symbol_path = null, symbol_version = v_now_version + 1, symbol_updated_at = now(), symbol_rights_at = null, preview_pick = 'photo'
    where c.id = v_creator.id;
  else
    update public.creators c
    set symbol_path = c.id::text || '/sym-' || p_version::text || '.webp', symbol_version = p_version,
        symbol_updated_at = now(), symbol_rights_at = now()
    where c.id = v_creator.id;
  end if;
  return v_old;
end $fn$;

revoke all on function public.creator_image_next(uuid, text) from public, anon, authenticated;
revoke all on function public.set_creator_image(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.creator_image_next(uuid, text) to service_role;
grant execute on function public.set_creator_image(uuid, text, integer, boolean) to service_role;

-- ── 3) 미리보기 이미지 고르기 (로그인한 크리에이터 본인) ──────────────────────────────────

create or replace function public.set_my_preview_pick(p_pick text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_creator public.creators;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if p_pick is null or p_pick not in ('photo', 'symbol') then
    raise exception '고르기는 photo·symbol 이다' using errcode = '22023';
  end if;
  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  if p_pick = 'symbol' and v_creator.symbol_path is null then
    raise exception '팬덤 심볼이 없어 고를 수 없다' using errcode = 'P0096';
  end if;
  update public.creators c set preview_pick = p_pick where c.id = v_creator.id;
end $fn$;

revoke all on function public.set_my_preview_pick(text) from public, anon;
grant execute on function public.set_my_preview_pick(text) to authenticated;

-- ── 4) 공개 읽기 ──────────────────────────────────

drop function if exists public.creator_link_extras(uuid);

create function public.creator_link_extras(p_creator_id uuid)
returns table (fan_name text, platform text, channel_key text, channel_url text, verified_on date, bg_path text, symbol_path text, preview_pick text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.fan_name, c.platform, c.channel_key, c.channel_url,
         (select (max(e.at) at time zone 'Asia/Seoul')::date
            from public.creator_verification_events e
           where e.creator_id = c.id and e.action = 'approve'),
         c.bg_path, c.symbol_path, c.preview_pick
  from public.creators c
  where c.id = p_creator_id and c.identity_verified;
$$;

revoke all on function public.creator_link_extras(uuid) from public;
grant execute on function public.creator_link_extras(uuid) to anon, authenticated;

-- ── 5) 본인 꾸미기 읽기 ──────────────────────────────────

create or replace function public.my_creator_look()
returns table (bg_path text, symbol_path text, preview_pick text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.bg_path, c.symbol_path, c.preview_pick
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;

revoke all on function public.my_creator_look() from public, anon;
grant execute on function public.my_creator_look() to authenticated;

notify pgrst, 'reload schema';
