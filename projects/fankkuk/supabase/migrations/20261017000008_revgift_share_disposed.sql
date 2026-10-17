-- 처분된 역조공 몫을 「처분」으로 닫는다 (office-workflow INV-W15 · reverse-gift INV-R9).
--
-- 지금까지 운영자가 처분을 기록한 몫 상자는 몫 닫기(close_revgift_share, manual/0006)의 결과 값이 출고·반송·취소 셋뿐이라 「반송」으로 닫혔고,
-- 팬의 받은 역조공 화면에 「상자를 OO님에게 돌려보냈어요」가 떴다(사실과 다름).
-- 이 파일은 public 만 바꾼다. 개인정보 구역 함수(몫 닫기)는 manual/0021_revgift_close_disposed.sql 이 바꾼다 — 이 파일 다음에 사람이 적용한다.
--
-- 무엇을 바꾸나
--   1) revgift_shares.disposed_at — 처분으로 닫힌 시각. 처분으로 닫을 때 몫 닫기가 반송 시각(returned_at)도 같이 적는다:
--      「닫힌 몫」을 출고·반송·취소 세 시각으로 보는 읽기 함수들(목록·알림·처리할 일 등)이 처분된 몫도 지금처럼 끝난 몫으로 보게 하려는 것이다.
--      처분인지는 disposed_at 이 가린다.
--   2) my_received_revgifts — 팬 본인 목록에 disposed 칸을 더한다(반환 칸이 바뀌어 지우고 다시 만든다, 권한은 그대로).
--   3) office_sync — 처분 기록 때 몫 닫기를 결과 값 'disposed' 로 부른다. manual/0021 적용 전의 몫 닫기는 'disposed' 를 모르는 값(22023)으로
--      거부하므로, 그때만 지금까지처럼 'returned' 로 닫는다 — 어느 쪽이 먼저 적용돼도 처분 기록이 멈추거나 주소가 남지 않는다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   DB 만 새것: 옛 앱의 받은 역조공 읽기는 모르는 칸(disposed)이 오면 목록을 버린다 — 앱 배포와 같은 때 적용한다.
--   앱만 새것: disposed 칸이 없으면 앱이 처분 아님으로 본다(지금 화면 그대로).

alter table public.revgift_shares add column if not exists disposed_at timestamptz;

drop function public.my_received_revgifts();
create function public.my_received_revgifts()
returns table (order_no text, creator_name text, tier public.parcel_tier, reply text, deadline timestamptz,
               shipped boolean, returned boolean, disposed boolean, cancelled boolean)
language sql stable security definer set search_path = ''
as $$
  select s.order_no, coalesce(cr.name, cp.nickname), s.tier, s.reply, public.revgift_deadline(d.settled_at),
         s.shipped_at is not null, s.returned_at is not null, s.disposed_at is not null, s.cancelled_at is not null
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  join public.profiles cp on cp.id = d.sender_id
  left join public.creators cr on cr.profile_id = d.sender_id
  where s.fan_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc;
$$;
revoke all on function public.my_received_revgifts() from public, anon;
grant execute on function public.my_received_revgifts() to authenticated, service_role;

-- 20261017000004 와 같고, 처분된 몫 상자는 몫을 「처분」으로 닫는다(0021 적용 전에는 반송으로)
CREATE OR REPLACE FUNCTION public.office_sync(p_parcel_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
      -- 처분된 몫 상자(INV-W15)는 「처분」으로 닫는다. 몫 닫기가 아직 'disposed' 를 모르면(manual/0021 적용 전, 22023) 지금까지처럼 반송으로 닫는다 —
      -- 어느 쪽이든 받는 팬 주소 복사본은 같은 처리 안에서 지워진다(INV-R9)
      begin
        perform public.close_revgift_share(v_share.order_no, 'disposed');
      exception when invalid_parameter_value then
        perform public.close_revgift_share(v_share.order_no, 'returned');
      end;
    end if;
  end if;
end $function$;
