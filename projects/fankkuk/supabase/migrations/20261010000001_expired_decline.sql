-- 2026-10-10 정책 문제집 메모 C6·C2 (DECISIONS 2026-10-10 A~C).
-- ① decline-block INV-D2 · approval-signature INV-S6: 결제 완료부터 168시간이 지나면 자동 처리 전이라도 승인·거절 모두 「expired」로 답한다.
--    차단으로 함께 거절하는 다른 주문(INV-D8)도 지난 것은 건드리지 않는다.
-- ② decline-block INV-D5: 팬 읽기 my_gifts 가 7일 자동 반려(expired)를 거절(rejected)과 합치지 않는다. 직접 거절과 차단 거절은
--    둘 다 주문 상태가 rejected 라 여전히 구분되지 않는다. 반환 칸은 그대로라 my_gift 는 다시 만들지 않는다.

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
  -- INV-D2 (2026-10-10): 결제 완료(등록 시각)부터 168시간이 지났으면 자동 처리 전이라도 거절하지 않는다 — 차단도 하지 않는다.
  -- 승인(approve_request)과 같은 답이다.
  if exists (select 1 from public.orders o where o.id = v_order_id and v_now >= o.registered_at + interval '168 hours') then
    return jsonb_build_object('result', 'expired', 'also_declined', '[]'::jsonb);
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
        -- INV-D2: 168시간이 지난 주문은 자동 처리가 반려한다(결제 대기는 등록 시각이 없어 그대로 대상)
        and (o.registered_at is null or v_now < o.registered_at + interval '168 hours')
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

create or replace function public.approve_request(
  p_request_id text,
  p_actor_id uuid,
  p_signed_content text,
  p_signer_id text,
  p_method text
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.approval_requests;
  v_now timestamptz := now();
begin
  -- INV-S11: 승인하는 사람이 그 주문의 크리에이터일 때만. 아니면 없는 요청과 같은 답.
  if p_actor_id is null or not exists (
    select 1 from public.approval_requests q
    join public.orders o on o.id = q.order_id
    join public.creators c on c.id = o.creator_id
    where q.request_id = p_request_id and c.profile_id = p_actor_id
  ) then
    return 'not_found';
  end if;

  select * into v_req from public.approval_requests where request_id = p_request_id for update;
  if v_req.status = 'approved' then
    return 'already';
  end if;

  -- INV-S2 를 DB 에서도: 서명된 원문은 저장한 원문과 같아야 한다. fake 서명자는 그 크리에이터의 가짜 식별값뿐.
  if p_signed_content is distinct from v_req.payload
     or p_method is null or p_method not in ('kakao', 'fake')
     or p_signer_id is null or p_signer_id = ''
     or (p_method = 'fake' and p_signer_id <> 'fake:' || p_actor_id::text)
     -- 가짜 서명은 허용 줄이 있는 DB(로컬 — seed.sql 이 넣는다)에서만. 운영 DB 에는 seed 가 돌지 않아 줄이 없다.
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return 'signature_mismatch';
  end if;

  -- INV-S6 (2026-10-10): 대기 중인데 결제 완료부터 168시간이 지났으면 「기한 지남」 — 반려는 자동 처리가 한다(decline_gift 와 같은 답)
  if v_req.status = 'waiting' and exists (
    select 1 from public.orders o
    where o.id = v_req.order_id and o.approved_at is null and v_now >= o.registered_at + interval '168 hours'
  ) then
    return 'expired';
  end if;

  if v_req.status <> 'waiting' or not exists (
    select 1 from public.orders o
    where o.id = v_req.order_id
      and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and v_now < o.registered_at + interval '168 hours'
  ) then
    return 'not_approvable';
  end if;

  perform set_config('fankkuk.approving', 'on', true);
  update public.approval_requests set status = 'approved', decided_at = v_now where id = v_req.id;
  update public.orders set approved_at = v_now where id = v_req.order_id;
  perform set_config('fankkuk.approving', '', true);
  -- INV-S12: 승인과 서명 저장은 한 처리
  insert into public.approval_signatures (request_id, signed_content, signer_id, method, signed_at)
  values (p_request_id, p_signed_content, p_signer_id, p_method, v_now);
  return 'approved';
end $$;

create or replace function public.my_gifts()
returns table (order_no text, creator_name text, item_kind text, box_count integer, has_electronics_or_metal boolean, status public.order_status,
               registered_at timestamptz, approved_at timestamptz, received_at timestamptz, inspection_result text, inspected_at timestamptz,
               shipped_at timestamptz, expected_arrival_date date, delivery text, fan_tracking_no text, fan_send_ack_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_no, c.name, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         o.has_electronics_or_metal,
         -- decline-block INV-D5 (2026-10-10): 직접 거절·차단 거절은 둘 다 rejected 라 구분되지 않고, 7일 자동 반려(expired)만 따로 보인다
         o.status,
         o.registered_at,
         case when o.status in ('rejected', 'expired') then null else o.approved_at end,
         o.received_at, o.inspection_result, o.inspected_at, o.shipped_at, o.expected_arrival_date, o.delivery, o.fan_tracking_no,
         o.fan_send_ack_at
  from public.orders o
  join public.creators c on c.id = o.creator_id
  where o.fan_id = auth.uid() and o.registered_at is not null
  order by o.registered_at desc;
$$;
