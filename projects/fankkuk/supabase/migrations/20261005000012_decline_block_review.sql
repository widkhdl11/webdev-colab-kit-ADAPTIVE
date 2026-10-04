-- 거절·차단 리뷰 반영 (2026-10-05, security·code·test 리뷰).
--
-- 1) 차단이 다른 진행 중 주문을 거절할 때, 주문 줄을 잠근 뒤 「출고 송장 나온 상자가 없다」를 다시 확인한다.
--    고르는 것과 잠그는 것 사이에 송장 출력이 끝나면 송장 나간 주문이 거절되고 있었다(INV-D8).
-- 2) 검수 불합격으로 반송 중인 주문은 차단으로 거절하지 않는다 — 거절할 수 있는 주문의 조건(INV-D2)과 맞춘다.
-- 3) 주문에 「차단으로 거절됨」을 남긴다. 처리한 요청 목록이 이것으로 「차단함」을 가린다 —
--    지금 차단돼 있는지만 보면 차단 전에 따로 거절한 주문까지 「차단함」이 되고, 풀면 차단으로 거절된 승인 주문이 「승인함」으로 돌아갔다.
--    이 칸은 팬에게 가는 어떤 읽기 함수에도 넣지 않는다(INV-D5).
-- 4) decline_gift 는 결과와 함께 「이번 차단으로 함께 거절한 주문번호」를 돌려준다 — 화면이 대기 목록을 다시 읽어 짐작하지 않게.
--    반환 꼴이 바뀌므로 지우고 다시 만든다.
-- 5) 한 주문을 거절하는 세 줄(요청·주문·상자)을 함수 하나로 묶는다 — 한쪽만 고치는 실수를 막는다.

alter table public.orders add column rejected_by_block boolean not null default false;

-- 주문 하나를 거절한다. 주문 줄은 부르는 쪽이 이미 잠갔다. 거절할 수 있는 상태가 아니면 아무것도 바꾸지 않고 거짓.
-- 승인된 요청의 승인 기록은 건드리지 않는다(INV-D4 예외) — 대기 중인 요청만 거절로.
create function public.reject_order_for_decline(p_order_id uuid, p_now timestamptz, p_by_block boolean)
returns boolean
language plpgsql volatile set search_path = ''
as $$
begin
  update public.orders o
  set status = 'rejected', rejected_by_block = p_by_block
  where o.id = p_order_id
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

drop function public.decline_gift(text, boolean);

-- 결과: { result: declined | already | not_declinable | not_found, also_declined: [차단으로 함께 거절한 주문번호] }
create function public.decline_gift(p_request_id text, p_block boolean)
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

    -- INV-D8: 같은 쌍의 진행 중 주문 전부(결제 대기 포함). 요청 줄 → 주문 줄 순서로 잠근 뒤, 거절 함수가 조건을 다시 본다
    -- (고른 뒤 잠그기 전에 송장 출력이 끝났으면 거절하지 않는다).
    for r in
      select o.id, o.order_no from public.orders o
      where o.creator_id = v_creator_id and o.fan_id = v_sender_id and o.id <> v_order_id
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

-- 처리한 요청: 차단으로 거절된 주문은 지금도 차단돼 있으면 blocked, 풀렸으면 declined. 그 밖에는 요청 상태 그대로.
create or replace function public.my_decided_requests()
returns table (
  order_no text,
  fan_nickname text,
  item_kind text,
  box_count integer,
  outcome text,
  decided_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select o.order_no, f.nickname, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         case when o.status = 'rejected' and o.rejected_by_block
              then case when public.sender_blocked(o.creator_id, o.fan_id) then 'blocked' else 'declined' end
              else r.status::text end,
         r.decided_at
  from public.approval_requests r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles f on f.id = o.fan_id
  where c.profile_id = auth.uid() and r.status <> 'waiting'
  order by r.decided_at desc
  limit 30;
$$;

revoke all on function public.reject_order_for_decline(uuid, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.decline_gift(text, boolean) from public, anon;
grant execute on function public.decline_gift(text, boolean) to authenticated;
