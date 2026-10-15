-- 팬 프로필 리뷰 반영 — 전화번호 필터의 빈틈 · 소개와 닉네임을 한 처리로 (my-account INV-A12, creator-tags INV-T7, 2026-10-16 리뷰).
--
-- 운영 적용 순서: 이 파일 → 앱 배포. 개인정보 구역(pii)은 건드리지 않으므로 사람이 따로 적용할 수동 SQL 이 없다.
-- 앱만 먼저 배포되면 프로필 저장이 없는 인자(p_nickname)를 넘겨 실패한다. 이 파일만 적용된 사이에는 옛 앱이 소개만(p_intro) 넘기고,
-- 새 함수가 닉네임 인자를 기본값(null = 그대로)으로 받으므로 그대로 동작한다.
--
-- 1) creator_tag_text_problem — 전화번호 꼴을 넓힌다. 숫자 사이 구분자가 「공백·점·하이픈 하나」뿐이라
--    「010/1234/5678」「010_1234_5678」「010  1234  5678」(두 칸)이 지나갔다. 이제
--    ㉠ 숫자 9개 이상이, 숫자·한글·영문·쉼표·물결이 아닌 글자 0~3개로만 끊겨 이어지면 연락처다.
--       한글·영문으로 끊긴 숫자(「10월 16일 3시」)와 쉼표 자릿수(「100,000,000원」)·물결 기간(「2026.10.16~2026.10.20」)은 지나간다.
--    ㉡ 0 으로 시작하는 전화번호 모양(0+1~2자리 · 3~4자리 · 4자리)은 쉼표·물결로 끊겨도 연락처다(「010,1234,5678」).
--    나머지(이메일·인터넷 주소·금칙어·기호만)는 20261010000005 그대로. 이 함수를 쓰는 곳(태그·팬덤 이름·닉네임·소개·크리에이터 소개·
--    받는 물품 이름·답장 문구)이 모두 같이 바뀐다 — 이미 저장된 값 가운데 새 규칙에 걸리는 것은 공개 목록에서 걸러진다(필터를 통과한 것만 내보내는 곳).
-- 2) update_my_fan_profile(p_intro, p_nickname) — 소개와 닉네임을 한 처리로 고친다. 둘 다 되거나 둘 다 안 된다(INV-A12).
--    null 인 칸은 그대로 둔다. 닉네임 판정은 내 정보 고치기(update_my_account)와 같다 — nickname_problem(길이·보이지 않는 글자·같은 필터)과
--    닉네임 유일 인덱스(profiles_nickname_key, 겹치면 FKU04). 오류 코드도 같다(FKU04~07, 22023). 소개 검사는 20261016000001 그대로(FKF01~03, 22023).
--    인자가 바뀌어 옛 함수를 지우고 다시 만든다(권한도 다시). 계정 ID 인자는 여전히 없다 — auth.uid() 한 줄만.
--
-- 다시 적용해도 결과가 같다.

-- ── 1) 필터 ──────────────────────────────────

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
  -- ② 연락처·주소 꼴: 전화번호(㉠ 숫자 9개 이상이 숫자·한글·영문·쉼표·물결 아닌 글자 0~3개로만 끊김 · ㉡ 0 으로 시작하는 전화번호 모양) ·
  --    「@」 앞뒤 글자(이메일) · http·www. · 점(앞뒤 공백 허용) 뒤 흔한 도메인 끝(인터넷 주소)
  if v ~ '[0-9]([^0-9,~가-힣A-Za-z]{0,3}[0-9]){8,}'
     or v ~ '(^|[^0-9])0[0-9]{1,2}[^0-9가-힣A-Za-z]{0,3}[0-9]{3,4}[^0-9가-힣A-Za-z]{0,3}[0-9]{4}([^0-9]|$)'
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

-- ── 2) 소개·닉네임 한 처리 ──────────────────────────────────

drop function if exists public.update_my_fan_profile(text);

create or replace function public.update_my_fan_profile(p_intro text default null, p_nickname text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_intro text := btrim(coalesce(p_intro, ''), E' \t\n\r　');
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_problem text;
  v_constraint text;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'fan') then
    raise exception '팬 계정만 팬 프로필을 고친다' using errcode = '42501';
  end if;
  if p_intro is not null then
    if char_length(v_intro) > 100 then
      raise exception '자기소개는 0~100자다' using errcode = '22023';
    end if;
    if v_intro ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
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
  end if;
  if p_nickname is not null then
    -- signup INV-U13: 내 정보 고치기와 같은 닉네임 검사
    v_problem := public.nickname_problem(v_nickname);
    if v_problem = 'banned' then
      raise exception '닉네임에 쓸 수 없는 말이 들어 있다' using errcode = 'FKU05';
    elsif v_problem = 'contact' then
      raise exception '닉네임에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'FKU06';
    elsif v_problem = 'symbols' then
      raise exception '닉네임에 글자나 숫자가 하나는 있어야 한다' using errcode = 'FKU07';
    elsif v_problem is not null then
      raise exception '닉네임은 1~12자, 보이지 않는 글자 없이' using errcode = '22023';
    end if;
  end if;
  -- 한 줄을 한 번에 고친다. 닉네임이 겹치면(유일 인덱스) 소개도 함께 되돌아간다
  begin
    update public.profiles p
       set fan_intro = case when p_intro is null then p.fan_intro else v_intro end,
           nickname = case when p_nickname is null then p.nickname else v_nickname end
     where p.id = v_uid;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_nickname_key' then
      raise exception '이미 쓰는 닉네임이다' using errcode = 'FKU04';
    end if;
    raise;
  end;
end $fn$;

revoke all on function public.update_my_fan_profile(text, text) from public, anon;
grant execute on function public.update_my_fan_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
