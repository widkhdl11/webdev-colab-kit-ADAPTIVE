-- 결제하지 않고 닫힌 주문·보내기는 진행 중인 일이 아니다 (2026-10-23, 배포 전 확인). 스펙: docs/specs/my-account.md INV-A15·A16,
-- docs/specs/payment.md INV-M15 · M22, docs/specs/reverse-gift.md INV-R15.
--
-- 무엇이 틀렸나
--   24시간 지난 결제 대기 닫기(office_run_expiry 0a)는 결제 줄만 「실패」로 바꾸고 주문 줄은 결제 대기로 둔다.
--   order_is_finished 는 결제 대기 주문을 끝난 것으로 보지 않아서, 결제창을 닫고 떠난 주문이 하나라도 있는 팬(과 그 주문을 받은 크리에이터)은
--   탈퇴가 「진행 중인 선물」로 영영 거부되고, 그 주문은 자동 삭제 대상에도 들지 않았다.
--   역조공도 같다 — 닫힌 보내기(0b, 「실패」)의 몫은 답이 기본값 「기다림」으로 남아 받는 팬과 보낸 크리에이터의 탈퇴를 막았다.
--
-- 무엇을 바꾸나
--   1) order_is_finished — 결제 대기 주문은 이어 하기(INV-M22)도 더는 안 되는 때부터 끝난 주문이다:
--      첫 결제 줄을 처음 결제 대기로 만든 지 24시간이 지났고(INV-M22 ④ 와 같은 시계 — gift_payment_resumable 이 그 칸을 본다),
--      그 줄이 결제 대기·승인 중·완료가 아니다(= 닫힘 · 승인 거절 뒤 시간이 지남). 주문과 첫 결제 줄은 등록 함수가 함께 만든다.
--      승인 중(결과 모름)은 INV-M19 가 정리할 때까지 끝나지 않은 것으로 둔다. 24시간이 지났는데 아직 닫기 전인 결제 대기 줄(예약 작업이 돌기 전 몇 분)도 그렇다.
--   2) account_has_open_work — 역조공 몫은 결제가 닫힌(「실패」) 보내기의 것을 뺀다. 닫힌 보내기는 다시 결제 대기로 돌아가지 않는다.
--      나머지는 20261023000006 그대로.

-- ── 1) 끝난 주문 ─────────────────────────────────────

create or replace function public.order_is_finished(p_order uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order
      and (
        o.status in ('shipped', 'rejected', 'expired', 'canceled')
        or (o.status in ('received', 'labeled', 'inspected', 'label_printed')
            and not exists (
              select 1 from public.boxes b left join public.office_parcels p on p.box_id = b.id
              where b.order_id = o.id and b.missing_at is null
                and (p.id is null or p.state not in ('returned', 'disposed', 'police_handed'))
            ))
        or (o.status = 'pending_payment'
            and not exists (
              select 1 from public.payments p
              where p.order_id = o.id and p.kind = 'initial'
                and (p.status in ('pending', 'confirming', 'done') or now() < p.created_at + interval '24 hours')
            ))
      )
  );
$$;
revoke all on function public.order_is_finished(uuid) from public, anon, authenticated, service_role;

-- ── 2) 진행 중인 일 ────────────────────────────────────

create or replace function public.account_has_open_work(p_account uuid, p_creator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with my_orders as (
    select o.id from public.orders o where o.fan_id = p_account or (p_creator is not null and o.creator_id = p_creator)
  ), my_shares as (
    select s.id, s.reply, s.shipped_at, s.returned_at, s.cancelled_at, s.disposed_at
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where (s.fan_id = p_account or (p_creator is not null and d.creator_id = p_creator))
      and d.status <> 'failed'
  )
  select exists (select 1 from my_orders m where not public.order_is_finished(m.id))
    or exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id join my_orders m on m.id = b.order_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from public.office_parcels op join my_shares m on m.id = op.share_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from my_shares where reply in ('waiting', 'accepted')
               and shipped_at is null and returned_at is null and cancelled_at is null and disposed_at is null)
    or exists (select 1 from public.revgift_sends d where p_creator is not null and d.creator_id = p_creator and d.status in ('pending', 'confirming'));
$$;
revoke all on function public.account_has_open_work(uuid, uuid) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
