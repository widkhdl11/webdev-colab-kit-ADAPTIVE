-- 크리에이터 가입 때 계정 닉네임도 공개 이름으로 (creator-verification INV-V1 둘레, 2026-10-06 화면 확인에서 발견).
-- 가입 공통 함수(create_account, pii 쪽)는 닉네임을 로그인 아이디 앞 12자로 정한다. 크리에이터는 공개 이름을 따로 받으므로
-- 머리 메뉴·인사말이 「it_screen_cr님」처럼 아이디로 나왔다. 같은 처리 안에서 닉네임을 공개 이름으로 덮는다(둘 다 1~20자).

create or replace function public.create_creator_account(
  p_user_id uuid,
  p_login_id text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb,
  p_name text,
  p_channel_title text,
  p_category text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_title text := btrim(coalesce(p_channel_title, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_slug text;
  v_constraint text;
begin
  if char_length(v_name) not between 1 and 20 or char_length(v_title) not between 1 and 40 or char_length(v_category) not between 1 and 20 then
    raise exception '이름은 1~20자, 채널 이름은 1~40자, 분야는 1~20자다' using errcode = '22023';
  end if;
  perform public.create_account(p_user_id, p_login_id, 'creator', p_email, p_phone, p_verification_id, p_terms);
  update public.profiles set nickname = v_name where id = p_user_id;
  loop
    v_slug := 'c-' || encode(extensions.gen_random_bytes(5), 'hex');
    begin
      insert into public.creators (profile_id, slug, name, channel, channel_title, category)
      values (p_user_id, v_slug, v_name, '', v_title, v_category);
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'creators_slug_key' then
        raise;
      end if;
    end;
  end loop;
end $$;
