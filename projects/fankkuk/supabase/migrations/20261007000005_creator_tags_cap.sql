-- 크리에이터 태그 — 선택지 ID 가 5개를 넘으면 검사 전에 바로 거부한다 (docs/specs/creator-tags.md INV-T3)
-- 20261007000004 의 update_my_creator_tags·create_creator_account 를 그대로 다시 정의하고, 선택지 목록을 잠그고
-- 하나하나 찾아보기 전에 개수부터 본다 — 아주 긴 목록이 와도 표를 잠그거나 훑지 않는다. 오류 꼴은 그대로 22023.
-- create or replace 라 권한(grant·revoke)은 이전 정의의 것이 그대로 남는다. 아래에 같은 권한을 다시 적어 둔다.

create or replace function public.update_my_creator_tags(p_option_ids uuid[], p_custom_tag text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_creator_id uuid;
  v_ids uuid[];
  v_custom text;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if cardinality(p_option_ids) > 5 then
    raise exception '태그는 합쳐 1~5개다' using errcode = '22023';
  end if;
  lock table public.creator_tag_options in share mode;
  select c.o_option_ids, c.o_custom into v_ids, v_custom from public.creator_tags_checked(p_option_ids, p_custom_tag) c;

  select c.id into v_creator_id from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  perform public.creator_tags_apply(v_creator_id, v_ids, v_custom);
end $$;

revoke all on function public.update_my_creator_tags(uuid[], text) from public, anon;
grant execute on function public.update_my_creator_tags(uuid[], text) to authenticated;

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
  p_custom_tag text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_title text := btrim(coalesce(p_channel_title, ''));
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
  lock table public.creator_tag_options in share mode;
  select c.o_option_ids, c.o_custom into v_ids, v_custom from public.creator_tags_checked(p_tag_ids, p_custom_tag) c;

  perform public.create_account(p_user_id, p_login_id, 'creator', p_email, p_phone, p_verification_id, p_terms);
  update public.profiles set nickname = v_name where id = p_user_id;
  loop
    v_slug := 'c-' || encode(extensions.gen_random_bytes(5), 'hex');
    begin
      insert into public.creators (profile_id, slug, name, channel, channel_title)
      values (p_user_id, v_slug, v_name, '', v_title)
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
end $$;
revoke all on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, uuid[], text) from public, anon, authenticated;
grant execute on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, uuid[], text) to service_role;
