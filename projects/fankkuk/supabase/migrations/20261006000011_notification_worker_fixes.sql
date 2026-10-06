-- 알림 — 보내는 일꾼 함수 고침 (docs/specs/notifications.md INV-N5·N8·N11). 20261006000009 리뷰(security·code) 반영.
--
-- 1) 꺼낸 표(claimed_at)로만 끝낸다. 일꾼 A 가 10분 넘게 멈춰 그 줄이 대기로 돌아가고 일꾼 B 가 다시 꺼낸 뒤에
--    A 의 늦은 끝내기가 오면, 지금은 B 가 보내는 중인 줄을 A 의 결과로 바꾼다(오류면 대기로 돌아가 세 번째 발송까지 간다).
--    꺼내기가 꺼낸 시각을 돌려주고, 끝내기는 그 시각이 줄의 지금 꺼낸 시각과 같을 때만 받는다.
-- 2) 사건 뒤 24시간이 지난 대기 줄은 꺼낼 때 보내지 않고 실패로 끝낸다(INV-N5 「사건 뒤 24시간이 지나면 실패로 끝나」).
--    지금까지는 실패를 기록할 때만 24시간을 봐서, 일꾼이 하루 넘게 안 돌면 오래된 알림이 그대로 나갔다.
-- 3) 꺼내기는 다른 일꾼이 잠근 줄을 기다리지 않고 건너뛴다(skip locked). 겹쳐 보내지 않는 것은 그대로 — 「대기인 줄만」 바꾼다.
-- 4) 3차 재알림 함수는 실제로 넣은 줄 수를 돌려준다(표 전체를 앞뒤로 세지 않는다).
-- 5) 가짜 표시가 거부되는 DB(운영)에서 가짜 통로의 「보냄」은 이번 시도 실패로 처리한다 — 줄은 대기로 돌아가 다시 보낼 차례가 되고
--    다섯 번이면 실패로 끝나 운영자 목록에 남는다(S11b 「줄은 대기」). 지금까지는 오류로 멈춰 줄이 「보내는 중」에 남았다.
--    가짜 표시를 직접 쓰는 갱신은 지킴이가 그대로 거부한다.

-- ── 지킴이: 대기 → 실패(24시간 지남) 허용 ─────────────────

create or replace function public.notification_outbox_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.attempts <> 0 then
      raise exception '발송 대기 줄은 대기로만 생긴다' using errcode = '23514';
    end if;
  else
    -- INV-N5: 보냄·실패·건너뜀은 끝이다
    if old.status in ('sent', 'failed', 'skipped') then
      raise exception '끝난 발송 줄은 바꿀 수 없다' using errcode = '55000';
    end if;
    -- 줄의 이름(멱등 키)과 사건 시각은 바꾸지 않는다
    if (new.kind, new.order_id, new.approval_request_id, new.round, new.account_id, new.channel, new.event_at, new.created_at)
       is distinct from (old.kind, old.order_id, old.approval_request_id, old.round, old.account_id, old.channel, old.event_at, old.created_at) then
      raise exception '발송 줄의 이름은 바꿀 수 없다' using errcode = '55000';
    end if;
    -- 대기 → 보내는 중 → 보냄/실패/건너뜀. 보내는 중 → 대기(다시 보냄).
    -- 꺼낼 때 끝난 승인 요청은 대기 → 건너뜀, 사건 뒤 24시간이 지난 줄은 대기 → 실패.
    if not (
      (old.status = 'pending' and new.status in ('pending', 'sending', 'skipped', 'failed'))
      or (old.status = 'sending' and new.status in ('pending', 'sent', 'failed', 'skipped'))
    ) then
      raise exception '발송 줄 상태를 % 에서 % 로 바꿀 수 없다', old.status, new.status using errcode = '55000';
    end if;
  end if;
  -- INV-N11: 가짜 표시는 허용 줄이 있는 DB(로컬 — seed.sql 이 넣는다)에서만
  if new.fake and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_notifications') then
    raise exception '가짜 발송 표시는 이 DB 에서 받지 않는다' using errcode = '42501';
  end if;
  return new;
end $$;

-- ── 줄 넣기: 넣은 줄 수를 돌려준다 ─────────────────────────

drop function public.notification_enqueue(text, uuid, uuid, smallint, uuid, timestamptz);

create function public.notification_enqueue(
  p_kind text,
  p_order_id uuid,
  p_request_id uuid,
  p_round smallint,
  p_account_id uuid,
  p_event_at timestamptz
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_account_id is null then
    return 0;
  end if;
  insert into public.notification_outbox (kind, order_id, approval_request_id, round, account_id, channel, event_at)
  select p_kind, p_order_id, p_request_id, p_round, p_account_id, ch.channel, p_event_at
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email'
     or exists (select 1 from public.notification_kakao_templates t where t.kind = p_kind)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.notification_enqueue_due()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  select coalesce(sum(public.notification_enqueue('approval_request', o.id, r.id, 3::smallint, c.profile_id, now())), 0)::integer
  into v_count
  from public.approval_requests r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  where r.status = 'waiting'
    and o.approved_at is null
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and o.registered_at <= now() - interval '72 hours';
  return v_count;
end $$;

-- ── 꺼내기: 꺼낸 시각을 돌려주고, 잠긴 줄은 건너뛰고, 24시간 지난 줄은 실패로 ──

drop function public.notification_claim(integer);

create function public.notification_claim(p_limit integer default 20)
returns table (
  id uuid,
  kind text,
  channel text,
  round smallint,
  order_no text,
  nickname text,
  auto_reject_at timestamptz,
  must_deliver boolean,
  attempts integer,
  claimed_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with picked as (
    select n.id,
           (n.kind = 'approval_request' and not exists (
              select 1 from public.approval_requests r where r.id = n.approval_request_id and r.status = 'waiting')) as closed,
           (now() >= n.event_at + interval '24 hours') as expired
    from public.notification_outbox n
    where n.status = 'pending' and n.next_attempt_at <= now()
    order by n.next_attempt_at, n.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update of n skip locked
  ), expired as (
    update public.notification_outbox n
    set status = 'failed', error_code = 'expired', finished_at = now()
    from picked p
    where n.id = p.id and p.expired and n.status = 'pending'
    returning n.id
  ), skipped as (
    update public.notification_outbox n
    set status = 'skipped', error_code = 'request_not_waiting', finished_at = now()
    from picked p
    where n.id = p.id and not p.expired and p.closed and n.status = 'pending'
    returning n.id
  ), claimed as (
    update public.notification_outbox n
    set status = 'sending', claimed_at = clock_timestamp()
    from picked p
    where n.id = p.id and not p.expired and not p.closed and n.status = 'pending'
    returning n.*
  )
  select c.id, c.kind, c.channel, c.round, o.order_no, pr.nickname,
         case when c.kind = 'approval_request' then o.registered_at + interval '168 hours' end,
         c.kind = 'approval_request',
         c.attempts,
         c.claimed_at
  from claimed c
  join public.orders o on o.id = c.order_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $$;

-- ── 끝내기: 꺼낸 시각이 같을 때만 ─────────────────────────

drop function public.notification_finish(uuid, text, text, text, boolean);

create function public.notification_finish(
  p_id uuid,
  p_claimed_at timestamptz,
  p_outcome text,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_fake boolean default false
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.notification_outbox;
begin
  select * into v from public.notification_outbox n where n.id = p_id for update;
  if v.id is null or v.status <> 'sending' then
    raise exception '보내는 중인 줄이 아니다' using errcode = '55000';
  end if;
  -- 다른 일꾼이 다시 꺼낸 줄이면 이 결과는 받지 않는다
  if p_claimed_at is null or v.claimed_at is distinct from p_claimed_at then
    raise exception '다른 일꾼이 다시 꺼낸 줄이다' using errcode = '55000';
  end if;
  if p_outcome = 'sent' then
    -- INV-N11: 가짜 표시를 받지 않는 DB 에서 가짜 통로로 「보냄」은 실제로 안 간 것이다 — 이번 시도 실패로
    if coalesce(p_fake, false) and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_notifications') then
      return public.notification_retry_or_fail(v, 'fake_rejected');
    end if;
    update public.notification_outbox
    set status = 'sent', provider_message_id = p_provider_message_id, fake = coalesce(p_fake, false),
        claimed_at = null, finished_at = now(), error_code = null
    where id = p_id;
    return 'sent';
  elsif p_outcome = 'skipped' then
    if p_error_code is null then
      raise exception '건너뛴 이유 코드가 없다' using errcode = '22023';
    end if;
    update public.notification_outbox
    set status = 'skipped', error_code = p_error_code, claimed_at = null, finished_at = now()
    where id = p_id;
    return 'skipped';
  elsif p_outcome = 'error' then
    if p_error_code is null then
      raise exception '오류 코드가 없다' using errcode = '22023';
    end if;
    return public.notification_retry_or_fail(v, p_error_code);
  end if;
  raise exception '끝내기 결과는 sent · skipped · error 중 하나' using errcode = '22023';
end $$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.notification_enqueue(text, uuid, uuid, smallint, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.notification_claim(integer) from public, anon, authenticated;
revoke all on function public.notification_finish(uuid, timestamptz, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.notification_claim(integer) to service_role;
grant execute on function public.notification_finish(uuid, timestamptz, text, text, text, boolean) to service_role;
