-- creator-verification INV-V15: 한 계정·한 채널의 확인 요청 한도를 3번에서 10번으로 늘린다(2026-11-02 사용자 결정).
-- 한도는 cv_verification_tries() 한 곳에서 읽는다 — 요청 거부와 남은 횟수 계산이 같은 값을 본다.

create function public.cv_verification_tries()
returns integer
language sql immutable set search_path = ''
as $$ select 10; $$;
revoke all on function public.cv_verification_tries() from public, anon, authenticated;

-- INV-V17: 확인 요청. 인자는 채널 주소 하나. 링크용 아이디가 없으면 거부. 만들어지면 바로 확인 대기.
-- 잠그는 순서는 앞 파일과 같다: ① 공개 정보 행 → ② 채널 키 → ③ 신청 행.
create or replace function public.request_creator_verification(p_channel_url text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_ch record;
  v_handle text;
  v_open public.creator_verification_applications;
  v_claim public.creator_channel_claims;
  v_holder public.creator_verification_applications;
  v_app public.creator_verification_applications;
begin
  v_creator := public.cv_lock_my_creator();
  v_handle := public.cv_current_handle(v_creator.id);
  if v_handle is null then
    raise exception '팬꾹 링크를 먼저 만들어 주세요' using errcode = 'FKV17';
  end if;
  select * into v_ch from public.cv_parse_channel_url(p_channel_url);

  -- INV-V4: 같은 계정의 살아 있는 요청은 하나
  for v_open in
    select * from public.creator_verification_applications a where a.account_id = v_creator.profile_id and a.status in ('issued', 'posted')
  loop
    if public.cv_is_live(v_open.status, v_open.issued_at) then
      raise exception '이미 진행 중인 신청이 있어요' using errcode = 'FKV03';
    end if;
    perform public.cv_end_application(v_open.id, 'expired', null, false);
  end loop;

  -- INV-V15: 이 채널로 끝난 요청이 한도에 닿으면 거부
  if public.cv_failure_count(v_creator.profile_id, v_ch.platform, v_ch.channel_key) >= public.cv_verification_tries() then
    raise exception '이 채널로는 더 신청할 수 없어요. 1:1 문의로 알려 주세요' using errcode = 'FKV04';
  end if;

  -- INV-V8: 채널 키 잠금 뒤 점유 확인
  perform public.cv_lock_channel(v_ch.platform, v_ch.channel_key);
  select * into v_claim from public.creator_channel_claims k where k.platform = v_ch.platform and k.channel_key = v_ch.channel_key for no key update;
  if found then
    if v_claim.kind = 'verified' then
      if v_claim.creator_id = v_creator.id then
        raise exception '지금 확인된 채널이에요' using errcode = 'FKV13';
      end if;
      raise exception '이미 등록한 채널이에요' using errcode = 'FKV05';
    end if;
    select * into v_holder from public.creator_verification_applications a where a.id = v_claim.application_id;
    if public.cv_is_live(v_holder.status, v_holder.issued_at) then
      raise exception '이미 확인중인 채널이에요' using errcode = 'FKV06';
    end if;
    perform public.cv_end_application(v_holder.id, 'expired', null, false);
  end if;

  insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status, posted_at, link_handle)
  values (v_creator.profile_id, v_ch.platform, v_ch.channel_key, public.cv_channel_url(v_ch.platform, v_ch.channel_key), null, 'link', 'posted', now(), v_handle)
  returning * into v_app;

  insert into public.creator_channel_claims (platform, channel_key, kind, account_id, application_id)
  values (v_ch.platform, v_ch.channel_key, 'application', v_creator.profile_id, v_app.id);

  return jsonb_build_object(
    'application_id', v_app.id, 'platform', v_app.platform, 'channel_url', v_app.channel_url, 'link_handle', v_app.link_handle, 'issued_at', v_app.issued_at
  );
end $$;

create or replace function public.my_creator_verifications()
returns table (
  id uuid, platform text, channel_url text, link_handle text, method text, status text,
  issued_at timestamptz, reason_code text, remaining_count integer
)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.platform, a.channel_url, a.link_handle, public.cv_shown_method(a.id, a.method), public.cv_shown_status(a.status, a.issued_at),
         a.issued_at, a.reason_code, greatest(0, public.cv_verification_tries() - public.cv_failure_count(a.account_id, a.platform, a.channel_key))
  from public.creator_verification_applications a
  where a.account_id = auth.uid()
  order by greatest(
             a.issued_at, a.revoked_at,
             case when public.cv_shown_status(a.status, a.issued_at) = 'expired' then a.issued_at + public.cv_post_window() else a.ended_at end
           ) desc,
           a.issued_at desc, a.id;
$$;
revoke all on function public.my_creator_verifications() from public, anon;
grant execute on function public.my_creator_verifications() to authenticated;
