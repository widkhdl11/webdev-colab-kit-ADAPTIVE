-- 다음 할 일에 「차액 결제를 기다려요」(wait_difference) 갈래를 더한다.
-- 승인이 끝났는데 차액만 미납인 팬 선물 상자를 출고 화면이 「크리에이터 승인을 기다려요」로 안내하던 것을 고친다(BACKLOG 2026-10-06).
-- 출고 가부 판정(office_parcel_shippable · office_parcel_dead)은 그대로다 — 안내 문구를 고르는 갈래만 하나 늘었다.
-- 갈래 순서: 나갈 수 있음 → 나갈 수 없음(7일 처리가 닫은 차액 포함) → 기한(요청 + 168시간)이 지났는데 7일 처리가 아직 닫지 않은 차액
-- → 승인됐고 아직 안 끝난 차액 → 승인 대기 / 받기 대기.
-- 기한 지난 미납 차액은 더 낼 수 없고(결제 준비가 거부된다) 다음 7일 처리에서 닫히므로 「자동 처리 대기」다 — 승인 여부와 상관없다.
--   조건은 7일 처리의 차액 단계와 같은 줄(결제 대기·실패, 아직 안 닫힘, 168시간)이라, 결제 중(confirming)인 차액은 여기 오지 않는다.
-- 승인 전이면서 기한 안의 차액이 미납이면 승인 대기로 둔다 — 승인이 먼저 있어야 하는 일이다.
-- 앱이 이 값을 모르면 상자 읽기가 형식 검사에서 실패하므로, 운영에서는 앱(NEXT_STEPS 에 wait_difference)과 같이 내보낸다.

create or replace function public.office_next_step(p_parcel public.office_parcels, p_kind text)
returns text
language sql stable set search_path = ''
as $$
  select case coalesce(p_parcel.state::text, 'no_waybill')
    when 'no_waybill' then 'wait_waybill'
    when 'awaiting' then 'scan_inbound'
    when 'received' then 'confirm_label'
    when 'labeled' then 'inspect'
    when 'inspected' then case when public.office_parcel_shippable(p_parcel) then 'print_label'
                               when public.office_parcel_dead(p_parcel) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.payments d on d.order_id = b.order_id
                                 where b.id = p_parcel.box_id and d.kind = 'difference' and d.status in ('pending', 'failed')
                                   and d.expired_at is null and d.created_at <= now() - interval '168 hours'
                               ) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.orders o on o.id = b.order_id
                                 where b.id = p_parcel.box_id and o.approved_at is not null
                                   and exists (select 1 from public.payments d
                                               where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')
                               ) then 'wait_difference'
                               when p_kind = 'gift' then 'wait_approval' else 'wait_accept' end
    when 'held' then 'held'
    when 'return_waiting' then 'print_return'
    when 'return_printed' then 'confirm_return'
    when 'label_printed' then 'confirm_shipment'
    else 'done'
  end;
$$;

revoke all on function public.office_next_step(public.office_parcels, text) from public, anon, authenticated;
