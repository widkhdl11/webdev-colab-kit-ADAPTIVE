-- 크리에이터 공개 이름 입력 경계 보강 (my-account INV-A9, S9b). 보안 리뷰 권고 반영 — 20261006000017 은 적용됐으므로 고치지 않고 이 파일로 바꾼다.
--
-- 1) 앞뒤 공백 제거를 앱(String.prototype.trim — 탭·줄바꿈·전각 공백·줄 구분자·BOM 포함)과 같은 범위로 한다.
--    017 의 btrim 은 반각 공백만 뺐다 — 앱을 거치지 않고 DB 함수를 직접 부르면 앞뒤에 탭·줄바꿈·전각 공백이 붙은 이름이 저장됐다.
-- 2) 공개 이름에 제어 문자(C0·C1)와 보이지 않는 서식 문자(소프트 하이픈, 제로폭 공백·접합자 U+200B~U+200D, 좌우 방향 표시·덮어쓰기,
--    단어 결합자 U+2060, BOM U+FEFF 등)·한글 채움 문자가 있으면 거부한다(22023). 빈 이름처럼 보이거나 다른 크리에이터와 똑같아
--    보이는 이름을 막는다. 목록은 앱 서버 검사(features/creator-settings-save/model/creator-settings-input.ts 의 HIDDEN_CHAR)와 같다.
--    앞뒤 공백을 뺀 뒤에 검사한다(앱도 trim 뒤에 검사한다) — 끝에 붙은 BOM 은 공백으로 빠지고, 가운데 있으면 거부된다.
-- 소개글은 앞뒤 공백 범위만 같게 맞춘다(줄바꿈을 쓰는 글이라 글자 거부는 하지 않는다).
-- 나머지(인자·역할 확인·고치는 칸·바꾼 기록·닉네임 동기화)는 017 과 같다.

create function public.app_trim(p text)
returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(p, '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$', '', 'g');
$$;

revoke all on function public.app_trim(text) from public, anon, authenticated;

create or replace function public.update_my_creator_profile(p_name text, p_intro text, p_searchable boolean)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_name text := public.app_trim(coalesce(p_name, ''));
  v_intro text := public.app_trim(coalesce(p_intro, ''));
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
  if p_intro is null or char_length(v_intro) > 200 then
    raise exception '소개글은 0~200자다' using errcode = '22023';
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
