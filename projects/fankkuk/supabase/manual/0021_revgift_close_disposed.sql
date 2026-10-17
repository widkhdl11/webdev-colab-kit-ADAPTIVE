-- 처분된 역조공 몫을 「처분」으로 닫는다 — 몫 닫기에 결과 값 'disposed' 를 더한다.
-- 스펙: docs/specs/office-workflow.md INV-W15, docs/specs/reverse-gift.md INV-R9
-- 사람이 직접 적용한다(개인정보 구역의 주소 복사본을 지우는 함수를 바꾼다). manual/0006 과 마이그레이션 20261017000008 다음에 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0021.sh
-- 확인: npx vitest run --config vitest.integration.config.mts revgift-close-db revgift-address-db
--
-- 무엇을 바꾸나
--   1) revgift_address_events.outcome — 지운 기록의 결과 값에 'disposed' 를 더한다(값은 여전히 결과 이름뿐, 주소 칸 없음).
--   2) close_revgift_share(p_order_no, p_outcome) — 'disposed' 를 받는다. 처분으로 닫으면 처분 시각(disposed_at)과 반송 시각(returned_at)을 같이 적는다
--      (닫힌 몫을 세 시각으로 보는 읽기 함수들이 그대로 끝난 몫으로 보게 — 처분인지는 disposed_at 이 가린다). 그 밖의 동작
--      (잠금·이미 닫힌 몫 거부·출고 조건·같은 처리 안에서 pii.revgift_addresses 의 몫 복사본 삭제 + 지운 기록 한 줄)은 0006 과 같다.
--
-- 마이그레이션과 한쪽만 적용된 상태
--   마이그레이션만: 처분 기록 처리(office_sync)가 'disposed' 거부(22023)를 보고 반송으로 닫는다 — 지금까지와 같다.
--   이 파일만(마이그레이션 전): disposed_at 칸이 없어 이 파일 전체가 실패하고 아무것도 바뀌지 않는다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

alter table public.revgift_address_events drop constraint revgift_address_events_outcome_check;
alter table public.revgift_address_events add constraint revgift_address_events_outcome_check
  check (outcome in ('shipped', 'returned', 'cancelled', 'disposed'));

create or replace function public.close_revgift_share(p_order_no text, p_outcome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_deleted integer;
begin
  if p_outcome not in ('shipped', 'returned', 'cancelled', 'disposed') then
    raise exception 'shipped·returned·cancelled·disposed 만' using errcode = '22023';
  end if;
  select * into v_share from public.revgift_shares where order_no = p_order_no for update;
  if not found then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_share.shipped_at is not null or v_share.returned_at is not null or v_share.cancelled_at is not null then
    raise exception '이미 닫힌 몫이다' using errcode = 'P0022';
  end if;

  if p_outcome = 'shipped' then
    if v_share.reply <> 'accepted' or v_share.inspected_at is null then
      raise exception '받기와 검수가 끝난 몫만 출고한다' using errcode = 'P0022';
    end if;
    update public.revgift_shares set shipped_at = now() where id = v_share.id;
  elsif p_outcome = 'returned' then
    update public.revgift_shares set returned_at = now() where id = v_share.id;
  elsif p_outcome = 'disposed' then
    update public.revgift_shares set returned_at = now(), disposed_at = now() where id = v_share.id;
  else
    update public.revgift_shares set cancelled_at = now() where id = v_share.id;
  end if;

  delete from pii.revgift_addresses where share_id = v_share.id;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into public.revgift_address_events (share_id, event, outcome) values (v_share.id, 'deleted', p_outcome);
  end if;
end $$;

revoke all on function public.close_revgift_share(text, text) from public, anon, authenticated;
grant execute on function public.close_revgift_share(text, text) to service_role;

notify pgrst, 'reload schema';

-- 적용 결과 확인 — 두 줄 모두 t 여야 한다
select pg_get_constraintdef(oid) like '%disposed%' as events_accept_disposed
  from pg_constraint where conname = 'revgift_address_events_outcome_check';
select prosrc like '%disposed_at = now()%' as close_handles_disposed
  from pg_proc where oid = 'public.close_revgift_share(text, text)'::regprocedure;

commit;
