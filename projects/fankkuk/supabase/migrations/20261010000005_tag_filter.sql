-- 2026-10-10 태그 직접 입력 공개 + 업계 기본 필터 — 정책 문제집 메모 A4 (DECISIONS 2026-10-10 A~C).
-- 스펙: creator-tags INV-T4(바꿈) · INV-T7 · INV-T8.
--
-- 1) 금칙어 표 creator_tag_banned_words — 운영자가 관리. 같은 말(필터 비교 키)은 한 번만. 화면 쪽 API 로 읽기·쓰기 불가.
--    처음 목록은 흔한 욕설·성적 표현·도박 광고 말로 채운다(다시 적용해도 같다 — 없는 말만 넣는다).
-- 2) creator_tag_filter_key(text) — 전각·풀어 쓴 자모를 표준형(NFKC)으로, 영문 소문자로 바꾸고 글자·숫자만 남긴다(「시 발」「S.E.X」「ＳＥＸ」도 같은 키).
--    금칙어 표는 이 키를 계산 칸(word_key)으로 저장해 비교마다 다시 계산하지 않는다.
-- 3) creator_tag_text_problem(text) — 'symbols'(어떤 글자·숫자도 없음) · 'contact'(전화번호·이메일·인터넷 주소 꼴) · 'banned'(금칙어) · null.
--    금칙어는 부분 일치라 정상 말 안에 든 경우(sussex·시발점·토토로…)를 허용 목록으로 먼저 지운 뒤 비교한다.
-- 4) creator_tag_text_checked — 기존 검사(길이·보이지 않는 글자) 뒤에 3)을 더한다. 사유마다 오류 코드: P0081 금칙어 · P0082 연락처·주소 · P0083 기호만.
--    가입·태그 고치기·선택지 추가·이름 고치기·올리기가 모두 이 함수를 거친다.
-- 5) creator_rows — 공개 태그 목록 끝에 필터를 통과한 직접 입력을 붙인다(INV-T4). 칩 목록 함수(creator_tag_options)는 그대로 선택지만.
-- 6) 운영자 함수: admin_tag_banned_words · admin_add_tag_banned_word · admin_remove_tag_banned_word · admin_delete_custom_creator_tag.

-- ── 2) 비교 키 ──────────────────────────────────

create or replace function public.creator_tag_filter_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(normalize(coalesce(p, ''), NFKC)), '[^[:alnum:]]', '', 'g');
$$;

-- ── 1) 금칙어 표 ──────────────────────────────────

create table if not exists public.creator_tag_banned_words (
  id uuid primary key default gen_random_uuid(),
  word text not null check (char_length(word) between 1 and 20 and public.creator_tag_filter_key(word) <> ''),
  created_at timestamptz not null default now()
);
alter table public.creator_tag_banned_words
  add column if not exists word_key text generated always as (public.creator_tag_filter_key(word)) stored;
drop index if exists public.creator_tag_banned_words_key_idx;
create unique index if not exists creator_tag_banned_words_word_key_idx on public.creator_tag_banned_words (word_key);
alter table public.creator_tag_banned_words enable row level security;
revoke all on table public.creator_tag_banned_words from anon, authenticated;

-- 처음 목록 — 뜻이 여럿인 짧은 말(니미·애비·토토·보지 등)은 정상 말에 자주 들어 있어 넣지 않는다(운영자가 필요하면 더한다)
insert into public.creator_tag_banned_words (word)
select w from unnest(array[
  '시발', '씨발', '씨바', 'ㅅㅂ', 'ㅆㅂ', '개새끼', '개새기', '병신', '븅신', 'ㅂㅅ', '좆', '존나', '지랄', '미친놈', '미친년', '느금', '엠창',
  '섹스', '야동', '조건만남', '성인방송',
  'fuck', 'shit', 'sex', 'porn', 'bitch', 'pussy', 'dick',
  '카지노', '바카라', '먹튀'
]) as t(w)
where not exists (select 1 from public.creator_tag_banned_words b where b.word_key = public.creator_tag_filter_key(t.w));

-- ── 3) 필터 ──────────────────────────────────

create or replace function public.creator_tag_text_problem(p text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- 전각 숫자·＠·．, 풀어 쓴 자모도 보통 글자로 바꾼 뒤 본다
  v text := normalize(coalesce(p, ''), NFKC);
  v_key text := public.creator_tag_filter_key(v);
  v_allowed text;
begin
  -- ③ 기호만: 어떤 글자(한글·영문·일본어·한자 등)나 숫자도 없다
  if v_key = '' then
    return 'symbols';
  end if;
  -- ② 연락처·주소 꼴: 숫자 9개 이상이 이어지거나 하이픈·공백·점으로만 끊김(전화번호) · 「@」 앞뒤 글자(이메일) ·
  --    http·www. · 점(앞뒤 공백 허용) 뒤 흔한 도메인 끝(인터넷 주소)
  if v ~ '[0-9]([ .-]?[0-9]){8,}'
     or v ~ '[^[:space:]@]@[^[:space:]@]'
     or v ~* '(https?:|www[[:space:]]*\.)'
     or v ~* '[[:space:]]*\.[[:space:]]*(com|net|org|kr|co|io|me|tv|gg|ly|xyz|link|shop|site|info|biz|app|dev|jp|cn|us)([^0-9a-z]|$)' then
    return 'contact';
  end if;
  -- ① 금칙어: 허용 목록(정상 말 안에 금칙어가 든 흔한 경우)을 비교 키에서 지운 뒤, 금칙어의 비교 키가 들어 있으면
  foreach v_allowed in array array['sussex', 'essex', 'middlesex', 'dickens', 'dickinson', '시발점', '시발역', '토토로', '애비뉴'] loop
    v_key := replace(v_key, v_allowed, '');
  end loop;
  if exists (select 1 from public.creator_tag_banned_words b where position(b.word_key in v_key) > 0) then
    return 'banned';
  end if;
  return null;
end $$;

revoke all on function public.creator_tag_text_problem(text) from public, anon, authenticated;

-- ── 4) 저장 때 검사 ──────────────────────────────────

create or replace function public.creator_tag_text_checked(p text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text := public.app_trim(coalesce(p, ''));
  v_problem text;
begin
  if char_length(v) not between 1 and 20 then
    raise exception '태그는 1~20자다' using errcode = '22023';
  end if;
  if v ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
    raise exception '태그에 제어 문자·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
  end if;
  -- INV-T7: 업계 기본 필터. 어느 금칙어에 걸렸는지는 알리지 않는다
  v_problem := public.creator_tag_text_problem(v);
  if v_problem = 'banned' then
    raise exception '태그에 쓸 수 없는 말이 들어 있다' using errcode = 'P0081';
  elsif v_problem = 'contact' then
    raise exception '태그에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'P0082';
  elsif v_problem = 'symbols' then
    raise exception '태그에 글자나 숫자가 하나는 있어야 한다' using errcode = 'P0083';
  end if;
  return v;
end $$;

revoke all on function public.creator_tag_text_checked(text) from public, anon, authenticated;

-- ── 5) 공개 태그 목록 ──────────────────────────────────

create or replace function public.creator_rows(p_only uuid default null)
returns table (id uuid, slug text, name text, channel text, channel_title text, tags text[], intro text, alias text, avg_approval_hours integer,
               face_tone text, approval_minutes_from_orders integer, searchable boolean, profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.slug, c.name, c.channel, c.channel_title,
         -- INV-T4 (2026-10-10): 숨기지 않은 선택지(선택지 순서) 뒤에 직접 입력 하나 — 지금 필터(INV-T7)를 통과하고,
         -- 운영자가 숨긴 선택지와 같은 말이 아닐 때만(숨김을 직접 입력으로 돌아 나오지 않게)
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
         c.searchable, c.profile_id
  from public.creators c
  where c.identity_verified and (p_only is null or c.id = p_only)
  order by c.created_at, c.id;
$$;

-- ── 6) 운영자 함수 ──────────────────────────────────

create or replace function public.admin_tag_banned_words()
returns table (id uuid, word text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_operator() then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  return query select b.id, b.word, b.created_at from public.creator_tag_banned_words b order by b.word;
end $$;

create or replace function public.admin_add_tag_banned_word(p_word text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := public.app_trim(coalesce(p_word, ''));
  v_id uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 바꾼다' using errcode = '42501';
  end if;
  if char_length(v) not between 1 and 20 or public.creator_tag_filter_key(v) = '' then
    raise exception '금칙어는 글자나 숫자가 든 1~20자다' using errcode = '22023';
  end if;
  insert into public.creator_tag_banned_words (word) values (v) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_remove_tag_banned_word(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 바꾼다' using errcode = '42501';
  end if;
  delete from public.creator_tag_banned_words where id = p_id;
  if not found then
    raise exception '그런 금칙어가 없다' using errcode = 'P0002';
  end if;
end $$;

-- 같은 말(용어 「선택지」의 비교 방법)을 적은 모든 크리에이터의 직접 입력을 한 처리에서 지운다. 지운 수를 돌려준다(INV-T8)
create or replace function public.admin_delete_custom_creator_tag(p_tag text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_operator() then
    raise exception '운영자만 지운다' using errcode = '42501';
  end if;
  delete from public.creator_custom_tags c where public.creator_tag_key(c.tag) = public.creator_tag_key(p_tag);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.admin_tag_banned_words() from public, anon;
revoke all on function public.admin_add_tag_banned_word(text) from public, anon;
revoke all on function public.admin_remove_tag_banned_word(uuid) from public, anon;
revoke all on function public.admin_delete_custom_creator_tag(text) from public, anon;
grant execute on function public.admin_tag_banned_words() to authenticated;
grant execute on function public.admin_add_tag_banned_word(text) to authenticated;
grant execute on function public.admin_remove_tag_banned_word(uuid) to authenticated;
grant execute on function public.admin_delete_custom_creator_tag(text) to authenticated;

notify pgrst, 'reload schema';
