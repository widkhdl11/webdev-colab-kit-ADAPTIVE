-- 승인 재알림은 크리에이터마다 24시간에 한 통 (docs/specs/notification-batching.md INV-NB2 · S2e·S2f, 2026-11-19 사용자 지시)
--
-- 전에는 재알림이 요청마다 3일째·6일째에 한 통씩 갔다. 선물이 매일 오는 크리에이터는 3일 전 건·6일 전 건 재알림이 같은 날 두 통 겹쳤고,
-- 본문은 둘 다 「대기 전체 건수 · 가장 급한 건의 남은 일수」라 내용이 같았다.
-- 이제: 그 크리에이터에게 24시간 안에 만들어진 재알림 줄(건너뜀으로 끝난 것은 빼고)이 있으면 만들지 않는다. 한 번에 여럿이 차례가 되면
-- 가장 빨리 자동 반려될 요청의 것 하나만. 밀린 차례는 24시간이 지난 뒤 다음 자동 처리에서 간다. 승인 요청(INV-NB1)은 세지 않는다.
-- 크리에이터마다 재알림 셈을 빨리 하도록 부분 색인을 하나 더한다(if not exists).
-- 함수 하나를 다시 만들 뿐이라 여러 번 적용해도 결과가 같다. 권한은 create or replace 가 그대로 둔다.

create or replace function public.notification_enqueue_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_windows integer;
  v_count integer;
  v_shares integer;
begin
  -- 창 끝 통을 여기서도 만든다 — 꺼내기 바로 앞이라 끝 통이 창이 끝나고 5분 안에 간다(INV-NB1 ③). 자동 처리(office_run_scheduled)도 같은 함수를 부른다
  v_windows := public.notification_close_windows();
  -- 자동 처리 둘(일꾼·office_run_scheduled)이 동시에 돌면 둘 다 「24시간 안 재알림 없음」을 보고 서로 다른 요청의 줄을 하나씩 만든다 —
  -- 재알림 만들기는 차례대로 한다. 잠금을 잡은 뒤의 문장은 앞 처리가 끝내며 남긴 줄을 본다(문장마다 새로 읽는다)
  perform pg_advisory_xact_lock(hashtext('notification_enqueue_due:approval_reminder'));
  -- 승인 재알림: 결제 완료 + 72시간(1)·144시간(2)이 된 대기 요청, 요청·차례마다 한 번(줄의 이름). 6일째가 이미 지난 요청에 3일째를 뒤늦게 만들지 않는다.
  -- 크리에이터마다 24시간에 한 통: 그 사이 만든 재알림 줄(건너뜀이 됐거나 될 것은 빼고)이 있으면 건너뛰고, 후보가 여럿이면 가장 빨리 반려될(결제가 가장 이른) 요청 하나만.
  -- 「보낼 수 있게 된 시각」은 재알림 시각과 직전 재알림 + 24시간 중 늦은 쪽이다. 그 시각을 승인 요청 창이 덮고 있으면 만들지 않는다 — 10분 안에 승인 요청 알림이
  -- 이미 갔다(INV-NB2). 재알림 시각으로만 재면, 미뤄진 사이에 새 선물로 창이 한 번 열렸다 닫히기만 해도 그 차례가 영영 안 만들어진다(2026-11-19 코드 리뷰 높음).
  -- 이미 줄이 있는 요청·차례는 후보에서 뺀다 — 빼지 않으면 그 건이 계속 「가장 급한 건」으로 뽑혀 다른 요청의 재알림이 영영 안 만들어진다. 재알림은 창을 열지 않는다
  select coalesce(sum(public.notification_enqueue('approval_reminder', d.order_id, d.request_id, d.round, d.account_id, now())), 0)::integer
  into v_count
  from (
    select distinct on (c.profile_id) o.id as order_id, r.id as request_id, k.round::smallint as round, c.profile_id as account_id
    from public.approval_requests r
    join public.orders o on o.id = r.order_id
    join public.creators c on c.id = o.creator_id
    cross join (values (1, 72), (2, 144)) as k (round, hours)
    -- 그 크리에이터의 마지막으로 센 재알림(24시간 셈과 같은 조건). 없으면 비어 있다
    left join lateral (
      select max(n.created_at) as at
      from public.notification_outbox n
      where n.kind = 'approval_reminder' and n.account_id = c.profile_id and n.status <> 'skipped'
        -- 아직 꺼내지 않은 줄인데 그 요청이 이미 처리됐으면 꺼낼 때 건너뜀이 된다 — 가지 않을 줄이라 세지 않는다
        and (n.status <> 'pending' or public.approval_request_open(n.approval_request_id))
    ) last on true
    cross join lateral (
      select greatest(o.registered_at + make_interval(hours => k.hours), coalesce(last.at + interval '24 hours', '-infinity'::timestamptz)) as at
    ) due
    where public.approval_request_open(r.id)
      and o.registered_at <= now() - make_interval(hours => k.hours)
      and (k.round = 2 or o.registered_at > now() - interval '144 hours')
      and due.at <= now()
      and not exists (
        select 1 from public.approval_notice_windows w
        where w.account_id = c.profile_id and w.opened_at <= due.at and w.ends_at > due.at
      )
      and not exists (
        select 1 from public.notification_outbox n
        where n.kind = 'approval_reminder' and n.order_id = o.id and n.approval_request_id = r.id and n.round = k.round
      )
    order by c.profile_id, o.registered_at, r.id
  ) d;
  select coalesce(sum(public.notification_enqueue_share(s.id, 2::smallint)), 0)::integer
  into v_shares
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  where d.status = 'done' and s.reply = 'waiting' and s.cancelled_at is null
    and d.settled_at <= now() - interval '72 hours'
    and now() < public.revgift_deadline(d.settled_at);
  return v_windows + v_count + v_shares;
end $$;

-- 24시간 셈(크리에이터의 마지막 재알림)을 5분마다 후보마다 하므로 — 재알림 줄만 담는 작은 색인
create index if not exists notification_outbox_reminder_by_account
  on public.notification_outbox (account_id, created_at)
  where kind = 'approval_reminder';
