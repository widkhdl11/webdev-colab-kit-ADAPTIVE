-- 「규칙 바꾸기 넷」 리뷰 고침 (2026-10-17) — public 만 바꾼다. 개인정보 구역 함수(반송 송장 봉투 내주기)는 supabase/manual/0022_return_claim_confirmed_at.sql.
-- 스펙: office-workflow INV-W15, address-protection INV-P18, reverse-gift INV-R9, inbound-address-code INV-C8(팬·크리에이터 버튼 없앰, 2026-10-17 사용자 결정)
--
-- 무엇을 바꾸나
--   1) my_received_revgift — 받은 역조공 상세(몫 하나). 목록 함수(my_received_revgifts)에 disposed 칸이 더해진 뒤(20261017000008) 이 함수의 반환 칸이
--      그대로라 「반환 칸 수가 다르다」(42P13)로 모든 상세 읽기가 실패했다. 반환 칸을 목록과 같게 맞춘다(지우고 다시 만든다, 권한은 그대로).
--   2) report_not_mine — 「제가 보낸 게 아니에요」 버튼을 없앴다. 보낸 사람은 입고 때 원 송장 바코드 + 받는 주소 6자리로 정해지므로 검수에서 나온 것은
--      보낸 사람 책임이고, 잘못 이어진 드문 경우는 1:1 문의로 운영자가 처리한다. 로그인한 사람의 실행 권한을 거둔다(함수는 남긴다 — 부르는 다른 함수는 없다).
--      보류 사유 'not_mine' 값·이미 남은 신고 줄·운영자의 보류 넘기기는 기존 데이터 때문에 그대로 둔다.
--   3) office_sync — 처분 기록 때 몫을 「처분」으로만 닫는다. 20261017000008 의 「몫 닫기가 'disposed' 를 모르면(22023) 반송으로 닫는」 우회를 뺀다
--      (manual/0021 이 적용됐다). 0021 이 없는 DB 에서는 처분 기록이 22023 으로 실패하고 아무것도 바뀌지 않는다(주소가 남거나 반송으로 잘못 닫히지 않는다).
--   4) return_finish_print(QR, 송장번호, 확인 시각) — 반송 송장 출력 단계로 넘길 때, 봉투를 내준 순간의 확인 시각(manual/0022 의 봉투 함수가 같이 내준다)을
--      상자를 잠근 자리에서 지금 적힌 확인 시각과 비교해 다르면 거부한다(P0041). 봉투를 내준 뒤 보낸 사람이 다른 주소로 다시 확인했는데 먼저 연 주소로
--      송장이 나가는 길을 막는다. 옛 두 인자 함수는 지운다(그 길로는 비교 없이 넘어간다).
--
-- manual/0022 와 한쪽만 적용된 상태
--   이 파일만: 봉투 함수가 확인 시각을 내주지 않는다 — 앱은 마무리를 부르지 않고 연 줄을 돌려받은 뒤 「실패」로 끝낸다. 반송 송장이 멈출 뿐, 주소는 출력되지 않는다.
--   0022 만: 세 인자 마무리가 없어 앱의 마무리 호출이 실패한다 — 앱이 연 줄을 돌려받고 「실패」. 역시 출력이 멈출 뿐이다.
-- 다시 적용해도 결과가 같다(함수는 drop if exists 뒤 create 또는 create or replace, 권한 문장은 반복해도 같다).

-- ── 1) 받은 역조공 상세 ─────────────────────────────

drop function if exists public.my_received_revgift(text);
create function public.my_received_revgift(p_order_no text)
returns table (order_no text, creator_name text, tier public.parcel_tier, reply text, deadline timestamptz,
               shipped boolean, returned boolean, disposed boolean, cancelled boolean)
language sql stable security definer set search_path = ''
as $$
  select r.order_no, r.creator_name, r.tier, r.reply, r.deadline, r.shipped, r.returned, r.disposed, r.cancelled
  from public.my_received_revgifts() r where r.order_no = p_order_no;
$$;
revoke all on function public.my_received_revgift(text) from public, anon;
grant execute on function public.my_received_revgift(text) to authenticated;

-- ── 2) 「제가 보낸 게 아니에요」 실행 권한 거두기 ─────────────

revoke all on function public.report_not_mine(uuid, uuid) from public, anon, authenticated, service_role;

-- ── 3) 처분 기록 때 몫 닫기 — 우회 없이 ─────────────────

-- 20261017000008 과 같고, 처분된 몫 상자는 몫을 「처분」으로만 닫는다
create or replace function public.office_sync(p_parcel_id uuid)
returns void
language plpgsql
set search_path to ''
as $function$
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
      inspected_at = case when v.state in ('inspected', 'held', 'return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped', 'dispose_due', 'disposed')
                          then coalesce(s.inspected_at, v.inspected_at) else s.inspected_at end,
      -- 취소로 이미 닫힌 몫: 몫 닫기를 다시 부르지 않으므로 반송 시각만 적는다(20261005000007 동작)
      returned_at = case when v.state = 'returned' and s.cancelled_at is not null
                         then coalesce(s.returned_at, v.returned_at) else s.returned_at end
  where s.id = v.share_id
  returning * into v_share;

  -- INV-R9: 출고 확정·반송 확정·처분 기록이 되는 그 처리 안에서 몫을 닫는다(주소 삭제 + 지운 기록)
  if v_share.id is not null and v_share.shipped_at is null and v_share.returned_at is null and v_share.cancelled_at is null then
    if v.state = 'shipped' then
      perform public.close_revgift_share(v_share.order_no, 'shipped');
    elsif v.state = 'returned' then
      perform public.close_revgift_share(v_share.order_no, 'returned');
    elsif v.state = 'disposed' then
      -- 처분된 몫 상자(INV-W15)는 「처분」으로 닫는다 — 받는 팬 주소 복사본은 같은 처리 안에서 지워진다(INV-R9)
      perform public.close_revgift_share(v_share.order_no, 'disposed');
    end if;
  end if;
end $function$;
revoke all on function public.office_sync(uuid) from public, anon, authenticated;

-- ── 4) 반송 송장 마무리 — 봉투를 내준 때의 확인 시각과 비교 ─────

drop function if exists public.return_finish_print(text, text);
create or replace function public.return_finish_print(p_qr text, p_waybill text, p_confirmed_at timestamptz)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  v := public.office_lock_qr(p_qr);
  if v.box_id is null and v.share_id is null then
    raise exception '주문에 이어진 상자가 아니다' using errcode = '22023';
  end if;
  if v.state not in ('return_waiting', 'return_printed') then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if v.return_confirmed_at is null then
    raise exception '보낸 사람이 반송 주소를 확인하지 않았다' using errcode = 'P0041';
  end if;
  -- 봉투를 내준 뒤 다시 확인했으면(다른 주소일 수 있다) 먼저 연 주소로 넘기지 않는다 — 앱이 연 줄을 돌려받는다
  if p_confirmed_at is null or p_confirmed_at is distinct from v.return_confirmed_at then
    raise exception '봉투를 내준 뒤 반송 주소 확인이 바뀌었다' using errcode = 'P0041';
  end if;
  if v.state = 'return_printed' then
    return jsonb_build_object('waybill', v.return_waybill_no, 'first', false);
  end if;
  perform public.office_check_waybill(p_waybill);
  update public.office_parcels set state = 'return_printed', return_printed_at = now(), return_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;
revoke all on function public.return_finish_print(text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.return_finish_print(text, text, timestamptz) to address_decryptor;

notify pgrst, 'reload schema';
