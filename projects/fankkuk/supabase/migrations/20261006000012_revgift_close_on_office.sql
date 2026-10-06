-- 역조공 몫 닫기를 사무실 흐름에 잇는다 (reverse-gift INV-R9, office-workflow INV-W1).
--
-- 지금까지는 출고 확정·반송 확정이 몫의 출고·반송 시각만 적고, 팬 주소를 지우는 몫 닫기(close_revgift_share)는 부르는 곳이 없었다.
-- 그래서 출고가 끝난 몫에도 팬 주소 암호문이 남았다(INV-R9 위반 — 시험 revgift-close-db 가 잡았다).
-- 이 파일은 상자 줄이 바뀐 뒤 몫의 칸을 맞추는 office_sync 만 바꾼다:
--   · 상자가 출고 확정(shipped)이 되면 같은 처리 안에서 몫 닫기(shipped)를 부른다 — 출고 시각을 적고 주소를 지우고 지운 기록을 남긴다
--   · 상자가 반송 확정(returned)이 되면 같은 처리 안에서 몫 닫기(returned)를 부른다
-- 몫 닫기 함수 자체(개인정보 구역을 지우는 쪽)는 supabase/manual/0006 의 것을 그대로 쓴다 — 이 파일은 개인정보 구역을 직접 건드리지 않는다.
-- 이미 닫힌 몫(출고·반송·취소 시각이 있는 몫)에는 다시 부르지 않는다.
--
-- 받지 않음(거절·기한 지남)은 주소가 처음부터 들어가지 않으므로 지울 것이 없다(INV-R4: 주소는 받기 때만 들어간다).
-- 기한 처리 자체는 office_run_expiry(20261005000007)가 이미 부른다 — 운영자가 관리자 화면에서 「지금 돌리기」로.

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
                          then coalesce(s.inspected_at, v.inspected_at) else s.inspected_at end
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
