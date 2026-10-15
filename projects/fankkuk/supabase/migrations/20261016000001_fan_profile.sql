-- 팬 프로필 — 사진·배경 사진·자기소개 (my-account INV-A12~A14, 카드 d91 「팬 프로필 아무나 볼 수 있어도 되지 않나, 운영자도 마찬가지」).
--
-- 운영 적용 순서: 이 파일 → 앱 배포. 개인정보 구역(pii)은 건드리지 않으므로 사람이 따로 적용할 수동 SQL 이 없다.
-- 앱만 먼저 배포되면 프로필 수정·홈 프로필 구간이 없는 함수를 불러 실패한다(홈은 프로필 없이 닉네임만 그린다).
--
-- 1) profiles 에 다섯 칸: fan_intro(0~100자, 표 제약) · fan_photo_path/fan_photo_version · fan_bg_path/fan_bg_version.
--    profiles 는 화면 쪽 키에 닫혀 있다(20261002000001) — 칸을 더해도 직접 읽거나 고칠 수 없다.
-- 2) update_my_fan_profile(p_intro) — 로그인 사용자 전용. 계정 ID 인자가 없고 auth.uid() 한 줄만, 팬 역할만 고친다(INV-A12).
--    앞뒤 공백을 뺀 0~100자, 줄바꿈·보이지 않는 글자 없음(22023), 비어 있지 않으면 태그·팬덤 이름과 같은 필터
--    (creator_tag_text_problem — 금칙어 FKF01 · 연락처 FKF02 · 글자 없음 FKF03). 틀리면 아무 칸도 바꾸지 않는다.
-- 3) fan_profile(p_profile_id) — 누구나(익명 포함) 부른다(INV-A13). 팬 역할 계정의 닉네임·사진 경로·배경 경로·소개 넷만 준다.
--    크리에이터·운영자 계정은 빈 결과.
-- 4) fan_image_next · set_fan_image — 서버의 비밀 키로만 부른다(INV-A14). 판 번호와 경로({계정 ID}/p-{판}.webp · /bg-{판}.webp)는 DB 가 정하고,
--    붙인 뒤 옛 파일 경로를 돌려준다 — 서버가 저장소에서 지운다. 그 사이 다른 요청이 판을 올렸으면 40001.
-- 5) 저장소 fan-photos — 공개 읽기(공개 값이라 누구나 여는 주소로 보여 준다, INV-A14), webp 1MB 까지.
--    화면 쪽 키(익명·로그인 사용자)의 쓰기·고치기·지우기 정책을 두지 않는다 — 서버의 비밀 키만 쓴다.
--    DECISIONS 2026-10-11 ⑫ 「공개 저장소 금지」의 두 번째 예외다(첫째 creator-photos). 근거는 승인 스펙 INV-A14(카드 d91).
--
-- 다시 적용해도 결과가 같다.

-- ── 1) 칸 ──────────────────────────────────

alter table public.profiles add column if not exists fan_intro text not null default '';
alter table public.profiles add column if not exists fan_photo_path text;
alter table public.profiles add column if not exists fan_photo_version integer not null default 0;
alter table public.profiles add column if not exists fan_bg_path text;
alter table public.profiles add column if not exists fan_bg_version integer not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_fan_intro_len') then
    alter table public.profiles add constraint profiles_fan_intro_len check (char_length(fan_intro) <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_fan_versions') then
    alter table public.profiles add constraint profiles_fan_versions check (fan_photo_version >= 0 and fan_bg_version >= 0);
  end if;
end $$;

-- ── 2) 소개 고치기 (본인만) ──────────────────────────────────

create or replace function public.update_my_fan_profile(p_intro text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_intro text := btrim(coalesce(p_intro, ''), E' \t\n\r\u3000');
  v_problem text;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'fan') then
    raise exception '팬 계정만 팬 프로필을 고친다' using errcode = '42501';
  end if;
  if char_length(v_intro) > 100 then
    raise exception '자기소개는 0~100자다' using errcode = '22023';
  end if;
  if v_intro ~ '[\u0001-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u2064\u2066-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb]' then
    raise exception '자기소개에 줄바꿈·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
  end if;
  if v_intro <> '' then
    v_problem := public.creator_tag_text_problem(v_intro);
    if v_problem = 'banned' then
      raise exception '자기소개에 쓸 수 없는 말이 들어 있다' using errcode = 'FKF01';
    elsif v_problem = 'contact' then
      raise exception '자기소개에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'FKF02';
    elsif v_problem = 'symbols' then
      raise exception '자기소개에 글자나 숫자가 하나는 있어야 한다' using errcode = 'FKF03';
    end if;
  end if;
  update public.profiles p set fan_intro = v_intro where p.id = v_uid;
end $fn$;

revoke all on function public.update_my_fan_profile(text) from public, anon;
grant execute on function public.update_my_fan_profile(text) to authenticated;

-- ── 3) 공개 읽기 (누구나, 네 칸만) ──────────────────────────────────

create or replace function public.fan_profile(p_profile_id uuid)
returns table (nickname text, photo_path text, bg_path text, intro text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.nickname, p.fan_photo_path, p.fan_bg_path, p.fan_intro
  from public.profiles p
  where p.id = p_profile_id and p.role = 'fan';
$$;

revoke all on function public.fan_profile(uuid) from public;
grant execute on function public.fan_profile(uuid) to anon, authenticated;

-- ── 4) 사진 판 (서버의 비밀 키로만) ──────────────────────────────────

-- 다음 판 번호. 팬 계정이 아니면 null. 서버가 이 번호로 저장소 경로를 만들어 먼저 올리고 set_fan_image 로 붙인다.
create or replace function public.fan_image_next(p_profile_id uuid, p_kind text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v public.profiles;
begin
  if p_kind is null or p_kind not in ('photo', 'background') then
    raise exception '사진 종류는 photo·background 다' using errcode = '22023';
  end if;
  select * into v from public.profiles p where p.id = p_profile_id and p.role = 'fan';
  if not found then
    return null;
  end if;
  return case when p_kind = 'photo' then v.fan_photo_version else v.fan_bg_version end + 1;
end $fn$;

-- p_version 이 있으면 그 판의 파일을 붙이고, null 이면 사진을 뗀다(판은 그래도 하나 올린다 — 주소가 바뀌게).
-- 돌려주는 값은 옛 파일 경로(없으면 null). 그 사이 다른 요청이 판을 올렸으면 40001.
create or replace function public.set_fan_image(p_profile_id uuid, p_kind text, p_version integer)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v public.profiles;
  v_old text;
  v_cur integer;
  v_new_path text;
begin
  if p_kind is null or p_kind not in ('photo', 'background') then
    raise exception '사진 종류는 photo·background 다' using errcode = '22023';
  end if;
  select * into v from public.profiles p where p.id = p_profile_id and p.role = 'fan' for update;
  if not found then
    raise exception '팬 계정이 없다' using errcode = 'P0002';
  end if;
  if p_kind = 'photo' then
    v_old := v.fan_photo_path;
    v_cur := v.fan_photo_version;
  else
    v_old := v.fan_bg_path;
    v_cur := v.fan_bg_version;
  end if;
  if p_version is not null and p_version <> v_cur + 1 then
    raise exception '다른 요청이 사진을 먼저 바꿨다' using errcode = '40001';
  end if;
  v_new_path := case
    when p_version is null then null
    else v.id::text || '/' || case when p_kind = 'photo' then 'p-' else 'bg-' end || p_version::text || '.webp'
  end;
  if p_kind = 'photo' then
    update public.profiles p set fan_photo_path = v_new_path, fan_photo_version = v_cur + 1 where p.id = v.id;
  else
    update public.profiles p set fan_bg_path = v_new_path, fan_bg_version = v_cur + 1 where p.id = v.id;
  end if;
  return v_old;
end $fn$;

revoke all on function public.fan_image_next(uuid, text) from public, anon, authenticated;
revoke all on function public.set_fan_image(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.fan_image_next(uuid, text) to service_role;
grant execute on function public.set_fan_image(uuid, text, integer) to service_role;

-- ── 5) 저장소 ──────────────────────────────────

-- 공개 읽기, webp 1MB 까지. 쓰기 정책을 두지 않는다(서버의 비밀 키만 쓴다). 저장소 표가 아직 없으면 건너뛴다 —
-- 로컬은 supabase/config.toml 의 같은 버킷 설정도 만든다.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('fan-photos', 'fan-photos', true, 1048576, array['image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

notify pgrst, 'reload schema';
