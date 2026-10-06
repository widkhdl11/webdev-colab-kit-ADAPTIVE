-- 차액 결제·몫 닫기 리뷰 반영 (payment INV-M5·M13, reverse-gift INV-R9).
--
-- 1) 차액 승인 권리(claim_difference_payment)가 상자 상태를 보지 않았다.
--    팬이 결제창을 연 사이 운영자가 검수에서 반송·보관을 기록하면, 돌려보낼 상자의 차액이 승인되고
--    환불 갈래(검수 불합격 반송 = 상품 대금 칸만)에서도 돌려받지 못했다(보안 리뷰).
--    이제 상자가 보관·반송 대기·반송 송장 출력·반송·송장 출력·출고 중 하나면 승인 권리를 주지 않는다 —
--    결제 준비(prepare_difference_payment)가 이미 보던 것과 같은 목록이다.
--    잠그는 순서: 결제 줄을 먼저 잠그고(7일 처리와 같은 순서 — 서로 기다릴 뿐 교착되지 않는다) 상자 줄은 공유 잠금으로 읽는다.
--    운영자가 상자 상태를 바꾸는 처리는 상자 줄을 잠그므로, 그 처리가 진행 중이면 끝날 때까지 기다린 뒤 바뀐 상태를 본다.
--
-- 2) 20261006000012 의 office_sync 가 취소된 몫의 상자가 반송 확정될 때 반송 시각을 적지 않았다(퇴행).
--    20261005000007 의 office_sync 는 몫 상태와 상관없이 반송 확정이면 반송 시각을 적었다.
--    취소된 몫은 취소 때 이미 닫혀(주소 삭제·지운 기록) 몫 닫기를 다시 부르지 않으므로, 반송 시각만 여기서 적는다.

create or replace function public.claim_difference_payment(p_toss_order_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_pay public.payments;
  v_state public.office_state;
begin
  select * into v_pay from public.payments p
  where p.toss_order_id = p_toss_order_id and p.kind = 'difference'
  for update;
  if v_pay.id is null or v_pay.status <> 'pending'
     or v_pay.expired_at is not null or now() >= v_pay.created_at + interval '168 hours' then
    return false;
  end if;
  if exists (select 1 from public.orders o where o.id = v_pay.order_id and o.status in ('rejected', 'expired', 'canceled')) then
    return false;
  end if;
  select x.state into v_state from public.office_parcels x where x.box_id = v_pay.box_id for share;
  if v_state in ('held', 'return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped') then
    return false;
  end if;
  update public.payments set status = 'confirming' where id = v_pay.id;
  return true;
end $$;

revoke all on function public.claim_difference_payment(text) from public, anon, authenticated;
grant execute on function public.claim_difference_payment(text) to service_role;

create or replace function public.office_sync(p_parcel_id uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  v public.office_parcels;
  v_share public.revgift_shares;
begin
  select * into v from public.office_parcels where id = p_parcel_id;
  if v.box_id is not null then
    perform public.office_sync_order((select b.order_id from public.boxes b where b.id = v.box_id));
    return;
  end if;

  update public.revgift_shares s
  set received_at = coalesce(s.received_at, v.received_at),
      inspected_at = case when v.state in ('inspected', 'held', 'return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped')
                          then coalesce(s.inspected_at, v.inspected_at) else s.inspected_at end,
      -- 취소로 이미 닫힌 몫: 몫 닫기를 다시 부르지 않으므로 반송 시각만 적는다(20261005000007 동작)
      returned_at = case when v.state = 'returned' and s.cancelled_at is not null
                         then coalesce(s.returned_at, v.returned_at) else s.returned_at end
  where s.id = v.share_id
  returning * into v_share;

  -- INV-R9: 출고 확정·반송 확정이 되는 그 처리 안에서 몫을 닫는다(주소 삭제 + 지운 기록)
  if v_share.id is not null and v_share.shipped_at is null and v_share.returned_at is null and v_share.cancelled_at is null then
    if v.state = 'shipped' then
      perform public.close_revgift_share(v_share.order_no, 'shipped');
    elsif v.state = 'returned' then
      perform public.close_revgift_share(v_share.order_no, 'returned');
    end if;
  end if;
end $$;

revoke all on function public.office_sync(uuid) from public, anon, authenticated;
