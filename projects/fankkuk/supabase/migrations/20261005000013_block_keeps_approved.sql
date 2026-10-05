-- 차단해도 이미 승인한 선물은 그대로 보낸다 (decline-block INV-D8, 카드 d27 — 2026-10-05).
--
-- 사용자: 「알아차리는건 둘째로 치고, 승인한거까지 받는게 맞지」. 처음(d26)에는 차단이 승인된 진행 중 주문까지 거절했다.
-- 1) 주문 하나를 거절하는 함수가 「승인 기록 없음」을 잠근 뒤 다시 본다. 차단이 주문을 고른 뒤 잠그기 전에
--    승인이 끝나면 그 주문은 승인 그대로 간다 — 승인 기록과 거절이 함께 남지 않는다.
-- 2) 차단이 함께 거절할 후보도 승인 안 된 주문만 고른다.
-- 반환 꼴은 그대로라 앱은 바뀌지 않는다.

-- 주문 하나를 거절한다. 주문 줄은 부르는 쪽이 이미 잠갔다. 거절할 수 있는 상태가 아니면 아무것도 바꾸지 않고 거짓.
create or replace function public.reject_order_for_decline(p_order_id uuid, p_now timestamptz, p_by_block boolean)
returns boolean
language plpgsql volatile set search_path = ''
as $$
begin
  update public.orders o
  set status = 'rejected', rejected_by_block = p_by_block
  where o.id = p_order_id
    and o.approved_at is null
    and o.status in ('pending_payment', 'registered', 'received', 'labeled', 'inspected')
    and o.inspection_result is distinct from 'returned'
    and not exists (
      select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
      where b.order_id = o.id and p.state in ('label_printed', 'shipped')
    );
  if not found then
    return false;
  end if;
  update public.approval_requests set status = 'declined', decided_at = p_now where order_id = p_order_id and status = 'waiting';
  perform public.return_inspected_boxes(p_order_id);
  return true;
end $$;

create or replace function public.decline_gift(p_request_id text, p_block boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_creator_id uuid;
  v_sender_id uuid;
  v_req public.approval_requests;
  v_now timestamptz := now();
  v_block boolean := coalesce(p_block, false);
  v_also text[] := '{}';
  r record;
begin
  -- INV-D1: 로그인한 사람이 이 주문의 크리에이터일 때만. 아니면 없는 요청과 같은 답.
  select o.id, o.creator_id, o.fan_id into v_order_id, v_creator_id, v_sender_id
  from public.approval_requests q
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where q.request_id = p_request_id and c.profile_id = auth.uid();
  if v_order_id is null then
    return jsonb_build_object('result', 'not_found', 'also_declined', '[]'::jsonb);
  end if;

  if v_block then
    perform public.lock_sender_pair(v_creator_id, v_sender_id);
  end if;

  -- INV-D4: 승인·자동 반려와 같은 요청 줄을 잠근다
  select * into v_req from public.approval_requests where request_id = p_request_id for update;
  if v_req.status <> 'waiting' then
    return jsonb_build_object('result', 'already', 'also_declined', '[]'::jsonb);
  end if;
  -- INV-D2
  perform 1 from public.orders o
  where o.id = v_order_id
    and o.approved_at is null
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and o.inspection_result is distinct from 'returned'
  for update;
  if not found or not public.reject_order_for_decline(v_order_id, v_now, v_block) then
    return jsonb_build_object('result', 'not_declinable', 'also_declined', '[]'::jsonb);
  end if;

  if v_block then
    -- INV-D6
    insert into public.creator_blocks (creator_id, sender_id) values (v_creator_id, v_sender_id)
    on conflict (creator_id, sender_id) where unblocked_at is null do nothing;

    -- INV-D8: 같은 쌍의 진행 중 주문 가운데 아직 승인하지 않은 것 전부(결제 대기 포함, 카드 d27).
    -- 요청 줄 → 주문 줄 순서로 잠근 뒤, 거절 함수가 조건을 다시 본다(고른 뒤 잠그기 전에 승인이 끝났으면 거절하지 않는다).
    for r in
      select o.id, o.order_no from public.orders o
      where o.creator_id = v_creator_id and o.fan_id = v_sender_id and o.id <> v_order_id
        and o.approved_at is null
        and o.status in ('pending_payment', 'registered', 'received', 'labeled', 'inspected')
        and o.inspection_result is distinct from 'returned'
      order by o.id
    loop
      perform 1 from public.approval_requests q where q.order_id = r.id and q.status = 'waiting' for update;
      perform 1 from public.orders o where o.id = r.id for update;
      if public.reject_order_for_decline(r.id, v_now, true) then
        v_also := v_also || r.order_no;
      end if;
    end loop;
  end if;
  return jsonb_build_object('result', 'declined', 'also_declined', to_jsonb(v_also));
end $$;
