-- 크리에이터 가입 3단계 카카오 서명 — 계정 만들기와 승인 서명 연결을 한 처리에서(2026-11-10, DECISIONS 「크리에이터 가입은 카카오 서명 한 번으로…」).
-- 스펙: docs/specs/signup.md INV-U19 ①(계정·연락처·연결 기록을 한 처리에서)·INV-U20(장애 대비 길) · approval-signature INV-S16 (S16e).
--
-- 개인정보 구역(pii)을 쓰는 곳은 둘이다 — 둘 다 사람이 적용하는 supabase/manual/0037_signup_kakao_sign.sql 이 만든다.
--   pii.signup_sign_creator_id(번호표) — 카카오 서명으로 확인된 번호표면 그 서명 요청 때 정한 크리에이터 ID(봉투 안에도 같은 값)를, 아니면 null.
--   pii.signup_sign_link(크리에이터, 번호표) — 그 서명 요청의 봉투를 승인 서명 연결(pii.signature_links)로 옮긴다. 인증번호 확인이면 아무것도 하지 않는다.
-- 확인 방법 대조(크리에이터 + 인증번호면 「창구 장애 확인」 필요, 팬 + 서명 번호표 거부)는 0037 이 고치는 public.create_account 가 한다.
--
-- 바뀌는 것
--   create_creator_account — 계정(create_account) 뒤, 크리에이터 행을 넣기 전에 정해 둔 크리에이터 ID 를 받아 그 ID 로 넣고, 넣은 뒤 연결 기록을 같은 처리에서 만든다.
--   인자·권한은 그대로다(앱 서버 키 전용).
--
-- 두 파일이 한쪽만 적용된 상태
--   이 파일만(0037 없음): 크리에이터 가입이 모두 실패한다 — 없는 pii 함수를 부르다 오류(42883)로 끝나고 아무것도 남지 않는다(한 트랜잭션).
--                     새 앱은 확인 방법을 읽는 함수가 없어 그 전에 「현재 회원가입을 이용할 수 없습니다」로 막는다. 팬 가입은 그대로 된다.
--   0037 만(이 파일 없음): 0037 의 첫 검사가 멈춘다 — 이 파일을 먼저 적용해야 한다.
-- 함수 본문이 아직 없는 pii 함수를 부르므로 본문 검사를 끄고 만든다.

set check_function_bodies = off;

create or replace function public.create_creator_account(
  p_user_id uuid,
  p_login_id text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb,
  p_tag_ids uuid[],
  p_custom_tag text,
  p_nickname text,
  p_fan_name text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fan_name text := public.app_trim(coalesce(p_fan_name, ''));
  v_problem text;
  v_slug text;
  v_constraint text;
  v_creator_id uuid;
  v_signed_creator_id uuid;
  v_ids uuid[];
  v_custom text;
begin
  if cardinality(p_tag_ids) > 5 then
    raise exception '태그는 합쳐 1~5개다' using errcode = '22023';
  end if;
  -- 팬덤 이름(추가 요청 3, 선택): update_my_creator_profile 과 같은 규칙과 같은 오류 코드
  if char_length(v_fan_name) > 10 then
    raise exception '팬을 부르는 이름은 0~10자다' using errcode = '22023';
  end if;
  if v_fan_name ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮  ⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
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

  -- 닉네임 검사·겹침(INV-U13)과 확인 방법 대조(INV-U19·U20)는 create_account 가 한다(번호표 줄을 잠그고 「씀」으로 바꾼다)
  perform public.create_account(p_user_id, p_login_id, 'creator', p_email, p_phone, p_verification_id, p_terms, p_nickname);
  -- INV-U19: 카카오 서명 길이면 서명 요청 때 정한 크리에이터 ID — 봉투 안의 크리에이터 ID 와 같아야 이후 승인 서명 요청이 게이트웨이 대조를 지난다
  v_signed_creator_id := pii.signup_sign_creator_id(p_verification_id);
  loop
    v_slug := 'c-' || encode(extensions.gen_random_bytes(5), 'hex');
    begin
      -- 이름은 트리거가 닉네임으로 채운다(INV-CN1). 채널 이름은 받지 않는다(INV-CN4 — 빈 값)
      insert into public.creators (id, profile_id, slug, name, channel, channel_title, fan_name)
      values (coalesce(v_signed_creator_id, gen_random_uuid()), p_user_id, v_slug, btrim(p_nickname), '', '', nullif(v_fan_name, ''))
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
  -- INV-U19 ①·INV-S16 (S16e): 서명 길이면 연결 기록을 같은 처리에서 만든다 — 실패하면 계정까지 함께 없던 일이 된다
  perform pii.signup_sign_link(v_creator_id, p_verification_id);
end $$;
revoke all on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, uuid[], text, text, text) to service_role;

reset check_function_bodies;
