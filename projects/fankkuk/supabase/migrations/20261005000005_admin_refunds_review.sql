-- 관리자 환불 리뷰 반영 (2026-10-04, security·code·test 리뷰). 잡기 함수만 바꾼다.
--
-- 1) 처음 잡은 지 14일이 지난 기록은 다시 잡지 않는다(P0025). 결제사 멱등 키는 첫 요청부터 15일만 유효하다 —
--    그 뒤 같은 키는 새 요청으로 처리돼, 「취소는 됐는데 응답이 끊겨 실패로 남은」 기록을 다시 누르면 두 번 나간다.
--    14일이 지난 건은 결제사 관리 화면에서 취소 여부를 사람이 확인한다(BACKLOG).
-- 2) 역조공은 몫들이 결제 키 하나를 같이 쓴다. 같은 보내기의 다른 몫이 처리 중이면 기다리게 한다(P0024) —
--    앱은 결제사 응답의 마지막 취소 줄로 성공을 판정하므로, 같은 결제의 취소가 동시에 둘 나가면 그 판정이 섞인다.
--    보내기 줄을 잠가 같은 보내기의 잡기를 한 줄로 세운다.

create or replace function public.admin_claim_refund(p_kind text, p_unit_id uuid)
returns table (refund_id uuid, payment_key text, amount_krw integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text;
  v_send_id uuid;
  v_refund public.refunds;
  v_due integer;
begin
  if not public.is_owner() then
    raise exception '환불은 대표만 한다' using errcode = '42501';
  end if;
  if p_kind = 'gift' then
    select p.payment_key into v_key from public.payments p where p.id = p_unit_id for update;
    if not found then
      raise exception '결제를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.payment_id = p_unit_id for update;
  elsif p_kind = 'revgift' then
    select d.payment_key, d.id into v_key, v_send_id
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_unit_id for update of s, d;
    if not found then
      raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.share_id = p_unit_id for update;
    if exists (
      select 1 from public.refunds r join public.revgift_shares s on s.id = r.share_id
      where s.send_id = v_send_id and r.share_id <> p_unit_id
        and r.status = 'requesting' and r.claimed_at > now() - interval '2 minutes'
    ) then
      raise exception '같은 결제의 다른 환불을 처리하고 있다' using errcode = 'P0024';
    end if;
  else
    raise exception '환불 종류는 gift 또는 revgift' using errcode = '22023';
  end if;

  if v_refund.id is not null then
    if v_refund.status = 'done' then
      raise exception '이미 환불했다' using errcode = 'P0023';
    end if;
    if v_refund.status = 'requesting' and v_refund.claimed_at > now() - interval '2 minutes' then
      raise exception '환불을 처리하고 있다' using errcode = 'P0024';
    end if;
    if v_refund.created_at <= now() - interval '14 days' then
      raise exception '다시 시도 기한(14일)이 지났다 — 결제사에서 확인한다' using errcode = 'P0025';
    end if;
    update public.refunds r
    set status = 'requesting', attempts = r.attempts + 1, claimed_at = now(), requested_by = auth.uid(), last_error = null
    where r.id = v_refund.id;
    return query select v_refund.id, v_key, v_refund.amount_krw;
    return;
  end if;

  v_due := case when p_kind = 'gift' then public.refund_due_of_payment(p_unit_id) else public.refund_due_of_share(p_unit_id) end;
  if v_due is null or v_due <= 0 or v_key is null then
    raise exception '환불할 수 있는 상태가 아니다' using errcode = 'P0022';
  end if;
  insert into public.refunds (payment_id, share_id, amount_krw, requested_by)
  values (case when p_kind = 'gift' then p_unit_id end, case when p_kind = 'revgift' then p_unit_id end, v_due, auth.uid())
  returning * into v_refund;
  return query select v_refund.id, v_key, v_refund.amount_krw;
end $$;
