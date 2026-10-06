-- 크리에이터 본인 확인 — 코드 다시 받기의 상태 재확인 (creator-verification INV-V4, 보안 리뷰 권고 2026-10-06).
-- 다시 받기는 신청 상태를 잠그지 않고 읽은 뒤 채널 잠금을 기다린다. 그 사이 같은 사람의 「확인 요청」이 끝나면
-- 이미 확인 대기가 된 신청을 거두고 새 코드를 만들었다(끝내기 함수는 확인 대기도 끝낸다).
-- 잠금 순서(크리에이터 → 채널 → 신청)를 지키려고, 신청 줄은 채널 잠금 뒤에 잠가 다시 읽고 「코드 받음」일 때만 거둔다.

create or replace function public.regenerate_creator_verification_code()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_open public.creator_verification_applications;
  v_status text;
begin
  v_creator := public.cv_lock_my_creator();
  select * into v_open from public.creator_verification_applications a
  where a.account_id = v_creator.profile_id and a.status in ('issued', 'posted');
  if not found then
    raise exception '다시 받을 신청이 없다' using errcode = 'P0002';
  end if;
  if v_open.status <> 'issued' then
    raise exception '이미 코드를 올린 신청이다' using errcode = '55000';
  end if;
  if not public.cv_is_live(v_open.status, v_open.issued_at) then
    raise exception '올리기 기한이 지났어요. 새로 신청해 주세요' using errcode = 'FKV08';
  end if;
  if public.cv_failure_count(v_creator.profile_id, v_open.platform, v_open.channel_key) >= 2 then
    raise exception '이 채널로는 코드를 더 받을 수 없어요. 1:1 문의로 알려 주세요' using errcode = 'FKV07';
  end if;
  perform public.cv_lock_channel(v_open.platform, v_open.channel_key);
  -- 채널 잠금을 기다리는 사이 확인 요청·거두기·승인이 끝났을 수 있다
  select a.status into v_status from public.creator_verification_applications a where a.id = v_open.id for no key update;
  if v_status is distinct from 'issued' then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  if not public.cv_end_application(v_open.id, 'withdrawn', null, true) then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  return public.cv_open_application(v_creator.profile_id, v_creator.id, v_open.platform, v_open.channel_key);
end $$;
