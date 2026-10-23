-- 돌려줄 환불이 끝나지 않았으면 탈퇴되지 않는다 (2026-10-24, 사용자 「추천대로 환불 끝나기 전엔 탈퇴 막자」). 스펙: docs/specs/my-account.md INV-A15 (S15d).
--
-- 무엇이 틀렸나
--   account_has_open_work 는 주문·상자·몫이 「끝났는지」만 봤다. 거절로 끝난 주문, 도착하지 않음으로 닫힌 상자, 받지 않음이 된 역조공 몫은
--   끝난 것이라 환불을 누르기 전이거나 환불이 실패한 채여도 탈퇴됐다 — 돌려줄 돈이 남은 회원이 지워졌다(코드 리뷰 low, 2026-10-23).
--
-- 무엇을 바꾸나
--   환불 단위 셋(주문 결제 · 닫힌 상자 · 역조공 몫) 가운데 환불할 금액(refund_due_of_*)이 0보다 큰데 그 단위의 환불 줄이 완료가 아닌 것
--   (줄 없음 = 아직 누르지 않음 · 처리 중 · 실패)이 있으면 진행 중인 일로 센다. 대상은 지금과 같다 — 팬이 보낸 주문·받은 몫,
--   크리에이터가 받은 주문·보낸 보내기의 몫. 환불 금액 계산은 운영자의 환불 누르기(admin_claim_refund)와 같은 함수를 쓴다.
--   6자리를 살려 둔 상자·몫(받지 않음·거절 뒤 늦게 올 수 있는 것)이 있어도 진행 중이다 — 그동안은 환불 금액이 정해지지 않았을 뿐 끝난 것이 아니다.
--   나머지는 20261023000009 그대로.

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
    or exists (select 1 from public.revgift_sends d where p_creator is not null and d.creator_id = p_creator and d.status in ('pending', 'confirming'))
    -- 돌려줄 환불이 끝나지 않음(INV-A15 S15d): 주문 결제 · 닫힌 상자 · 역조공 몫.
    --   금액 함수를 부르기 전의 조건은 그 함수가 null 을 돌려주는 경우를 미리 거르는 것뿐이다(결과는 같고 줄마다 부르지 않는다)
    or exists (select 1 from public.payments p join my_orders m on m.id = p.order_id join public.orders o on o.id = p.order_id
               where p.status = 'done' and o.shipped_at is null
                 and coalesce(public.refund_due_of_payment(p.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.payment_id = p.id and r.box_id is null and r.status = 'done'))
    or exists (select 1 from public.boxes b join my_orders m on m.id = b.order_id
               where b.missing_at is not null
                 and coalesce(public.refund_due_of_box(b.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_id = b.id and r.status = 'done'))
    or exists (select 1 from my_shares m
               where m.reply in ('declined', 'expired') and m.shipped_at is null
                 and coalesce(public.refund_due_of_share(m.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.share_id = m.id and r.status = 'done'))
    -- 6자리를 살려 둔 동안은 환불 금액이 아직 정해지지 않았다 — 닫히면 환불이 생기고, 늦게 오면 사무실에 상자가 생긴다(보안·코드 리뷰 중간)
    or exists (select 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id join my_orders m on m.id = b.order_id
               where c.kept_at is not null and c.state = 'valid')
    or exists (select 1 from public.inbound_codes c join my_shares m on m.id = c.share_id
               where c.kept_at is not null and c.state = 'valid');
$$;
revoke all on function public.account_has_open_work(uuid, uuid) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
