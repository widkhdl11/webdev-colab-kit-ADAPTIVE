-- 가입 닉네임 · 아이디·닉네임 미리 확인 · 크리에이터 가입 때 팬덤 이름 (signup INV-U13·U14, PRODUCT 「추가 요청 3」, 2026-10-15).
--
-- 운영 적용 순서: 이 파일 → supabase/manual/0019_signup_nickname.sql(가입 함수 create_account·내 정보 update_my_account — 개인정보 구역을
-- 쓰는 함수라 사람이 적용) → 앱 배포. 셋을 같은 때에 한다. 이 파일만 적용된 사이에는 크리에이터 가입이 새 create_account(닉네임 인자)를
-- 찾지 못해 실패하고, 앱만 먼저 배포되면 가입 요청이 없는 인자를 넘겨 실패한다.
--
-- 1) nickname_problem(text) — 닉네임 검사 하나. 앞뒤 공백을 뺀 1~12자(my-account INV-A5 와 같은 경계), 줄바꿈·보이지 않는 글자 없음,
--    태그·팬덤 이름과 같은 업계 기본 필터(creator_tag_text_problem — 금칙어·전화번호·이메일·인터넷 주소·글자 없음). 문제 없으면 null.
-- 2) 닉네임 비교 값(lower(btrim(nickname)))의 유일 인덱스 — 영문 대소문자·앞뒤 공백만 다른 닉네임은 같은 닉네임이다.
--    같은 값으로 두 계정이 동시에 들어와도 하나만 들어간다. 이미 겹친 닉네임이 있으면 인덱스를 만들지 못하고 이 파일이 멈춘다 —
--    그때는 아래 조회로 겹친 계정을 찾아 먼저 정리한다:
--      select lower(btrim(nickname)), array_agg(login_id) from public.profiles group by 1 having count(*) > 1;
-- 3) signup_check_hits — 미리 확인 횟수 표. 접속 주소는 앱 서버가 비밀 값을 섞어 만든 64자리 해시로만 받는다(원문 없음).
--    RLS 켜고 정책 없음, 화면 쪽 역할의 권한 없음 — 앱 서버 키 함수만 쓴다. 10분 넘게 조용한 줄은 다음 확인 때 지운다.
-- 4) signup_name_check(p_ip_hash, p_kind, p_value) → 'available' | 'taken' | 'invalid' | 'rate_limited' 글자 하나. 앱 서버 키 전용.
--    한 해시가 1분 창에서 30번을 넘으면 1분 동안 계정 표를 찾지 않고 rate_limited 만 답한다. 계정 ID·가입 시각 같은 것은 돌려주지 않는다.
-- 5) create_creator_account — 닉네임(p_nickname)·팬덤 이름(p_fan_name, 선택) 인자를 더한다. 닉네임을 공개 이름으로 덮던 줄(20261006000005)을 뺀다 —
--    닉네임은 가입 때 적은 값이다(INV-U13). 팬덤 이름 검사는 update_my_creator_profile 과 같다(0~10자, 줄바꿈·보이지 않는 글자 없음, P0084~P0086 필터).
--    인자가 바뀌어 옛 함수를 지우고 다시 만든다(권한도 다시).
-- 6) update_my_creator_profile — 공개 이름을 바꿀 때 닉네임도 같은 값으로 바꾸던 줄을 뺀다. 닉네임은 계정마다 달라야 하고 1~12자라,
--    1~20자 공개 이름을 그대로 옮기면 길이가 맞지 않거나 남의 닉네임과 겹쳐 공개 이름 저장이 실패한다. 나머지는 20261014000005 그대로.
--
-- 개인정보 구역(pii)은 건드리지 않는다. 다시 적용해도 결과가 같다.

-- ── 1) 닉네임 검사 ──────────────────────────────────

create or replace function public.nickname_problem(p text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v text := btrim(coalesce(p, ''));
begin
  if char_length(v) not between 1 and 12 then
    return 'length';
  end if;
  if v ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
    return 'hidden';
  end if;
  return public.creator_tag_text_problem(v); -- banned · contact · symbols · null
end $fn$;

revoke all on function public.nickname_problem(text) from public, anon, authenticated;
grant execute on function public.nickname_problem(text) to service_role;

-- ── 2) 닉네임은 계정마다 다르다 ──────────────────────────────────

create unique index if not exists profiles_nickname_key on public.profiles (lower(btrim(nickname)));

-- ── 3) 미리 확인 횟수 표 ──────────────────────────────────

create table if not exists public.signup_check_hits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0),
  blocked_until timestamptz,
  touched_at timestamptz not null default now()
);
alter table public.signup_check_hits enable row level security;
revoke all on table public.signup_check_hits from public, anon, authenticated;
create index if not exists signup_check_hits_touched_at on public.signup_check_hits (touched_at);

-- ── 4) 미리 확인 ──────────────────────────────────

create or replace function public.signup_name_check(p_ip_hash text, p_kind text, p_value text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_value text := btrim(coalesce(p_value, ''));
  v_row public.signup_check_hits;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception '접속 주소는 64자리 해시로만 받는다' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('login_id', 'nickname') then
    raise exception '확인 종류는 login_id·nickname 이다' using errcode = '22023';
  end if;

  -- 10분 넘게 조용하고 쉬는 중이 아닌 주소의 줄은 지운다 — 해시도 오래 남기지 않는다
  delete from public.signup_check_hits h
  where h.touched_at < now() - interval '10 minutes' and (h.blocked_until is null or h.blocked_until < now());

  -- 같은 주소의 확인은 이 줄에서 차례로 지나간다(동시에 와도 한도를 넘지 않게)
  insert into public.signup_check_hits (ip_hash) values (p_ip_hash) on conflict (ip_hash) do nothing;
  select * into v_row from public.signup_check_hits h where h.ip_hash = p_ip_hash for update;

  if v_row.blocked_until is not null and v_row.blocked_until > now() then
    update public.signup_check_hits h set touched_at = now() where h.ip_hash = p_ip_hash;
    return 'rate_limited';
  end if;
  if v_row.window_started_at <= now() - interval '1 minute' then
    v_row.window_started_at := now();
    v_row.hits := 0;
  end if;
  v_row.hits := v_row.hits + 1;
  if v_row.hits > 30 then
    update public.signup_check_hits h
    set window_started_at = v_row.window_started_at, hits = v_row.hits, blocked_until = now() + interval '1 minute', touched_at = now()
    where h.ip_hash = p_ip_hash;
    return 'rate_limited';
  end if;
  update public.signup_check_hits h
  set window_started_at = v_row.window_started_at, hits = v_row.hits, blocked_until = null, touched_at = now()
  where h.ip_hash = p_ip_hash;

  if p_kind = 'login_id' then
    -- 가입 아이디 꼴(INV-U6)과 같다
    if v_value !~ '^[a-z0-9_]{4,20}$' then
      return 'invalid';
    end if;
    return case when exists (select 1 from public.profiles p where p.login_id = v_value) then 'taken' else 'available' end;
  end if;

  if public.nickname_problem(v_value) is not null then
    return 'invalid';
  end if;
  return case when exists (select 1 from public.profiles p where lower(btrim(p.nickname)) = lower(v_value)) then 'taken' else 'available' end;
end $fn$;

revoke all on function public.signup_name_check(text, text, text) from public, anon, authenticated;
grant execute on function public.signup_name_check(text, text, text) to service_role;

-- ── 5) 크리에이터 가입 ──────────────────────────────────

drop function if exists public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, uuid[], text);

create or replace function public.create_creator_account(
  p_user_id uuid,
  p_login_id text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb,
  p_name text,
  p_channel_title text,
  p_tag_ids uuid[],
  p_custom_tag text,
  p_nickname text,
  p_fan_name text default null
)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_title text := btrim(coalesce(p_channel_title, ''));
  v_fan_name text := public.app_trim(coalesce(p_fan_name, ''));
  v_problem text;
  v_slug text;
  v_constraint text;
  v_creator_id uuid;
  v_ids uuid[];
  v_custom text;
begin
  if char_length(v_name) not between 1 and 20 or char_length(v_title) not between 1 and 40 then
    raise exception '이름은 1~20자, 채널 이름은 1~40자다' using errcode = '22023';
  end if;
  if cardinality(p_tag_ids) > 5 then
    raise exception '태그는 합쳐 1~5개다' using errcode = '22023';
  end if;
  -- 팬덤 이름(추가 요청 3, 선택): update_my_creator_profile 과 같은 규칙과 같은 오류 코드
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
  lock table public.creator_tag_options in share mode;
  select c.o_option_ids, c.o_custom into v_ids, v_custom from public.creator_tags_checked(p_tag_ids, p_custom_tag) c;

  -- 닉네임 검사·겹침(INV-U13)은 create_account 가 한다
  perform public.create_account(p_user_id, p_login_id, 'creator', p_email, p_phone, p_verification_id, p_terms, p_nickname);
  loop
    v_slug := 'c-' || encode(extensions.gen_random_bytes(5), 'hex');
    begin
      insert into public.creators (profile_id, slug, name, channel, channel_title, fan_name)
      values (p_user_id, v_slug, v_name, '', v_title, nullif(v_fan_name, ''))
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
end $fn$;

revoke all on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, uuid[], text, text, text) to service_role;

-- ── 6) 크리에이터 프로필 저장 — 닉네임은 따로 둔다 ──────────────────────────────────

create or replace function public.update_my_creator_profile(
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
  -- 공개 이름 변경 기록만 남긴다. 닉네임은 따로 둔다(signup INV-U13 — 닉네임은 계정마다 다르고 1~12자)
  if p_name is not null and v_creator.name <> v_name then
    insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, v_name);
  end if;
end $fn$;

revoke all on function public.update_my_creator_profile(text, text, boolean, text) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
