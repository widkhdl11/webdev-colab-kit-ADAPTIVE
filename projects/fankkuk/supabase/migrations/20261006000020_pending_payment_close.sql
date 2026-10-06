-- 24시간 지난 결제 대기 닫기 — 「지금 돌리기」(office_run_expiry)에 두 단계를 더한다.
-- 스펙: docs/specs/payment.md (INV-M15), docs/specs/reverse-gift.md (INV-R15), docs/specs/office-workflow.md (INV-W6 — 같은 자리)
--
-- 정해진 시각에 부르는 장치가 생기기 전에는 운영자의 「지금 돌리기」로만 닫힌다.
-- 닫힌 뒤 결제창에서 성공 주소로 돌아와도 결제 확정 흐름이 「실패」를 보고 승인 API 를 부르지 않는다(앱 서버 confirm-flow).
-- 닫힌 보내기의 몫은 받은·보낸 역조공 읽기가 결제 완료만 보여 주므로 어느 화면에도 나오지 않는다.
-- 함수 몸통은 20261006000013 의 정의 그대로에 0a·0b 단계와 돌려주는 숫자 둘만 더했다.

create or replace function public.office_run_expiry(p_order_no text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_gifts integer;
  v_unmatched integer;
  v_differences integer;
  v_revgifts integer;
  v_pending_gifts integer;
  v_pending_revgifts integer;
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 0a) 24시간 지난 팬 선물 결제 대기(payment INV-M15): 결제 대기인 줄만 실패로 닫는다 — 조건부 갱신 한 문장.
  --     결제 확정 시작(claim_payment: 결제 대기 → 승인 중)도 같은 줄의 조건부 갱신이라, 겹치면 먼저 잡은 쪽만 반영되고
  --     뒤에 온 쪽은 바뀐 상태를 다시 보고 아무것도 하지 않는다. 승인 중·완료·실패 줄은 건드리지 않는다. 주문 줄은 지우지 않는다.
  update public.payments p
  set status = 'failed', settled_at = now()
  where p.kind = 'initial' and p.status = 'pending'
    and p.created_at <= now() - interval '24 hours'
    and (p_order_no is null or p.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_pending_gifts = row_count;

  -- 0b) 24시간 지난 역조공 결제 대기(reverse-gift INV-R15): 같은 규칙. 주문번호를 주면 그 몫이 든 보내기만.
  --     보내기의 결제 완료 시각은 받기 기한의 시작이라 결제 완료에만 둔다(표 제약) — 닫을 때는 상태만 바꾼다.
  update public.revgift_sends d
  set status = 'failed'
  where d.status = 'pending'
    and d.created_at <= now() - interval '24 hours'
    and (p_order_no is null or exists (select 1 from public.revgift_shares s where s.send_id = d.id and s.order_no = p_order_no));
  get diagnostics v_pending_revgifts = row_count;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  with expired as (
    update public.approval_requests r
    set status = 'expired', decided_at = now()
    from public.orders o
    where o.id = r.order_id and r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    returning r.order_id
  )
  update public.orders o set status = 'expired'
  from expired e where o.id = e.order_id and o.approved_at is null;
  get diagnostics v_gifts = row_count;

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

  -- 3) 차액 요청 뒤 168시간 미납(payment INV-M13): 차액 줄에 기한 지남을 적는다. 결제 중(confirming)·완료 줄은 건드리지 않는다.
  --    그 주문의 상자는 나갈 수 없게 되고(office_parcel_dead), 아래에서 검수 완료 상자가 반송 대기로 간다.
  update public.payments d
  set expired_at = now()
  where d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
    and d.created_at <= now() - interval '168 hours'
    and (p_order_no is null or d.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_differences = row_count;

  -- 4) 역조공 받기 기한(reverse-gift INV-R10)
  if p_order_no is null then
    v_revgifts := public.expire_revgifts();
  else
    -- 몫 하나만: expire_revgifts 와 같은 조건(결제 완료 + 168시간, 아직 답이 없음)
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로(반려된 팬 선물 · 차액 미납 · 받지 않은 역조공)
  update public.office_parcels p
  set state = 'return_waiting'
  where p.state = 'inspected' and public.office_parcel_dead(p)
    and (p_order_no is null
         or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
         or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no));

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts,
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts);
end $$;


-- 자동 처리 현황: 24시간 지난 결제 대기(unpaid)를 줄로 보인다 — 운영자가 그 줄의 「지금 돌리기」로 닫는다.
-- 조건은 위 0a·0b 와 같다(결제 대기, 만든 지 24시간). 역조공은 보내기 한 건을 한 줄로, 주문번호는 첫 몫의 번호다
-- (그 번호로 돌리면 0b 가 그 몫이 든 보내기를 닫는다). 금액은 결제할 금액이다.
create or replace function public.admin_expiry_due()
returns table (category text, order_no text, sender_nickname text, receiver_name text, due_at timestamptz, detail text)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select 'gift'::text, o.order_no, f.nickname, c.name, o.registered_at + interval '168 hours', null::text
    from public.orders o
    join public.approval_requests r on r.order_id = o.id and r.status = 'waiting'
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
    union all
    select 'revgift', s.order_no, c.name, f.nickname, public.revgift_deadline(d.settled_at), null
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
    join public.creators c on c.id = d.creator_id
    join public.profiles f on f.id = s.fan_id
    where s.reply = 'waiting' and now() >= public.revgift_deadline(d.settled_at)
    union all
    select 'difference', o.order_no, f.nickname, c.name, pd.created_at + interval '168 hours',
           '+' || to_char(pd.amount_krw, 'FM999,999,999') || '원'
    from public.payments pd
    join public.orders o on o.id = pd.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where pd.kind = 'difference' and pd.status in ('pending', 'failed') and pd.expired_at is null
      and pd.created_at <= now() - interval '168 hours'
    union all
    select 'unpaid', o.order_no, f.nickname, c.name, pi.created_at + interval '24 hours',
           to_char(pi.amount_krw, 'FM999,999,999') || '원'
    from public.payments pi
    join public.orders o on o.id = pi.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where pi.kind = 'initial' and pi.status = 'pending' and pi.created_at <= now() - interval '24 hours'
    union all
    select 'unpaid', first.order_no, c.name,
           f.nickname || case when shares.n > 1 then ' 외 ' || (shares.n - 1) || '명' else '' end,
           d.created_at + interval '24 hours', to_char(d.amount_krw, 'FM999,999,999') || '원'
    from public.revgift_sends d
    join public.creators c on c.id = d.creator_id
    join lateral (select s.order_no, s.fan_id from public.revgift_shares s where s.send_id = d.id order by s.seq limit 1) first on true
    join lateral (select count(*) as n from public.revgift_shares s where s.send_id = d.id) shares on true
    join public.profiles f on f.id = first.fan_id
    where d.status = 'pending' and d.created_at <= now() - interval '24 hours'
  ) due
  where public.is_operator()
  order by 5, 2
  limit 500;
$$;
