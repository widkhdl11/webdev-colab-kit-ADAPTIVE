-- 역조공·반송 주소 사본을 확정 순간이 아니라 확정 + 72시간에 지우고, 그동안 남은 횟수로 재출력 (2026-10-23 카드 d120 ①).
-- 스펙: docs/specs/reverse-gift.md INV-R7 (c)·R9 (S9·S9c), docs/specs/address-protection.md INV-P5·P18 (S18d), docs/specs/office-workflow.md INV-W11
-- 근거 문서: workspace/spec-additions-2026-10-23-d120.md
-- 사람이 직접 적용한다(개인정보 구역의 주소 사본을 지우고 내주는 함수를 바꾼다). manual/0021·0022 와 마이그레이션 20261023000001 다음에 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0024.sh
-- 확인: npx vitest run --config vitest.integration.config.mts revgift-print-db revgift-close-db revgift-address-db return-address-confirm-db
--
-- 무엇을 바꾸나
--   1) close_revgift_share — 'shipped' 로 닫을 때는 팬 주소 사본을 지우지 않는다(72시간 지우기가 지운다). 받지 않음(returned)·취소·처분은 지금처럼 그 처리에서 지운다.
--   2) revgift_claim_print — 출고 확정된 몫도 봉투를 내준다: 이미 한 번 이상 연 재출력 · 상자가 출고 확정 · 출고 확정 + 72시간 전 · 반송·취소 아님일 때만.
--      그 밖의 판정(받기·결제·단계·상한 3회·기록 줄)은 manual/0019 와 같다.
--   3) return_claim_print — 반송 확정된 상자도 같은 조건(한 번 이상 연 재출력 · 반송 확정 + 72시간 전)으로 봉투를 내준다. 확인 시각을 같이 내주는 것은 manual/0022 와 같다.
--   4) 반송 복사본 지우기 트리거 — 처분(disposed) 때만 그 처리에서 지운다. 반송 확정(returned)된 상자는 72시간 지우기가 지운다.
--   5) office_drop_address_copies() — 출고 확정 + 72시간이 지난 몫 사본 · 반송 확정 + 72시간이 지난 반송 복사본을 지우고 지운 기록을 한 줄씩 남긴다.
--      5분 예약 작업(office_run_scheduled, 마이그레이션 20261023000001)이 부른다. 실행 권한은 아무에게도 주지 않는다(예약 작업 실행자 postgres 만).
--      돌려주는 값: {revgift: 지운 몫 사본 수, return: 지운 반송 복사본 수}.
--
-- 마이그레이션 20261023000001 과 한쪽만 적용된 상태
--   이 파일만: 마무리 함수가 확정 상자를 55000 으로 거부해 재출력 송장이 나가지 않고, 그 연 줄은 횟수에 남는다. 사본은 남지만 예약 작업이 지우는 함수를
--             부르지 않아 72시간 뒤에도 남는다 — 그래서 아래 첫 검사가 마이그레이션이 먼저인지 보고, 아니면 멈춘다.
--   마이그레이션만: 지금과 같다(확정 뒤 봉투를 내주지 않고, 사본은 확정 순간 지운다).
-- 이미 확정 순간 지워진 사본은 되살리지 않는다 — 이 파일 뒤에 확정되는 몫·상자부터 72시간 규칙이다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 앞 파일이 먼저 적용됐는지 본다. 없으면 여기서 멈춘다.
do $$
begin
  if to_regclass('pii.revgift_addresses') is null or to_regclass('pii.return_addresses') is null
     or to_regprocedure('public.return_claim_print(text,uuid)') is null or to_regprocedure('public.revgift_claim_print(text,uuid)') is null then
    raise exception '몫 사본·반송 복사본·봉투 함수가 없다 — manual/0019·0020·0022 를 먼저 적용한다';
  end if;
  if position('''shipped''' in (select prosrc from pg_proc where oid = 'public.revgift_finish_print(text,text)'::regprocedure)) = 0
     or position('''returned''' in (select prosrc from pg_proc where oid = 'public.return_finish_print(text,text,timestamptz)'::regprocedure)) = 0 then
    raise exception '확정 뒤 재출력 마무리가 없다 — 마이그레이션 20261023000001_reprint_after_close.sql 을 먼저 적용한다';
  end if;
end $$;

-- ── 1) 몫 닫기 — 출고는 사본을 남긴다 (INV-R9) ─────────

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
    -- 사본은 남긴다 — 기사가 오기 전 망가진 라벨을 다시 뽑도록. 출고 확정 + 72시간에 office_drop_address_copies 가 지운다(카드 d120)
    return;
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

-- ── 2) 역조공 봉투 내주기 — 출고 확정 뒤 재출력 (INV-R7 c) ─────────

create or replace function public.revgift_claim_print(p_qr text, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_share public.revgift_shares;
  v_paid boolean;
  v_count integer;
  v_reason text;
  v_address pii.revgift_addresses;
  v_log_id bigint;
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.share_id is null then
    raise exception '역조공 상자가 아니다' using errcode = '22023';
  end if;
  select * into v_share from public.revgift_shares where id = v.share_id for update;
  select d.status = 'done' into v_paid from public.revgift_sends d where d.id = v_share.send_id;

  select (select count(*) from public.revgift_decrypt_log where share_id = v_share.id and result = 'opened')
       - (select count(*) from public.revgift_decrypt_releases where share_id = v_share.id)
    into v_count;

  select * into v_address from pii.revgift_addresses where share_id = v_share.id;

  if v_share.reply <> 'accepted' or v_address.share_id is null then
    v_reason := 'no_valid_approval';                                                                 -- (a) 받기 때 복사한 암호문
  elsif v_share.returned_at is not null or v_share.cancelled_at is not null then
    v_reason := 'order_not_printable';                                                               -- (c) 반송·취소
  elsif v_share.shipped_at is not null then
    -- (c) 출고 확정 뒤 — 이미 한 번 이상 연 재출력만, 상자가 출고 확정이고 출고 확정 + 72시간 전(카드 d120, INV-R9)
    -- 경계는 잠금을 기다린 뒤의 실제 시각으로 본다(now() 는 트랜잭션 시작 시각이라 잠금 대기만큼 늦게 열릴 수 있다 — 보안 리뷰 낮음)
    if v_count < 1 or v.state <> 'shipped' or clock_timestamp() >= v_share.shipped_at + interval '72 hours' then
      v_reason := 'order_not_printable';
    end if;
  elsif not v_paid or v.state not in ('inspected', 'label_printed') or v_share.inspected_at is null
     or not public.office_parcel_shippable(v) then
    v_reason := 'order_not_printable';                                                               -- (c) 검수 완료 ~ 송장 출력
  end if;
  if v_reason is null and v_count >= 3 then
    v_reason := 'decrypt_limit_reached';
  end if;
  if v_reason is not null then
    insert into public.revgift_decrypt_log (share_id, requester_id, result, deny_reason) values (v_share.id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  insert into public.revgift_decrypt_log (share_id, requester_id, result, print_no) values (v_share.id, p_requester, 'opened', v_count + 1)
    returning id into v_log_id;
  return jsonb_build_object('result', 'opened', 'print_no', v_count + 1, 'log_id', v_log_id, 'order_no', v_share.order_no,
    'fan_id', v_share.fan_id, 'envelope', v_address.envelope);
end $$;

-- ── 3) 반송 봉투 내주기 — 반송 확정 뒤 재출력 (INV-P18 a) ─────────

create or replace function public.return_claim_print(p_qr text, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_count integer;
  v_reason text;
  v_address pii.return_addresses;
  v_sender uuid;
  v_log_id bigint;
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  select (select count(*) from public.return_decrypt_log where parcel_id = v.id and result = 'opened')
       - (select count(*) from public.return_decrypt_releases where parcel_id = v.id)
    into v_count;
  select * into v_address from pii.return_addresses where parcel_id = v.id;
  v_sender := public.return_sender_of(v.id);

  if v.box_id is null and v.share_id is null then
    v_reason := 'no_valid_approval';                                                  -- 어느 주문에도 이어지지 않은 상자 — 확인할 사람이 없다
  elsif not (v.state in ('return_waiting', 'return_printed')
             -- 반송 확정 뒤 — 이미 한 번 이상 연 재출력만, 반송 확정 + 72시간 전(카드 d120)
             or (v.state = 'returned' and v_count >= 1 and v.returned_at is not null and clock_timestamp() < v.returned_at + interval '72 hours')) then
    v_reason := 'order_not_printable';                                                -- (a)
  elsif v.return_confirmed_at is null or v_address.parcel_id is null or v_address.account_id is distinct from v_sender then
    v_reason := 'no_valid_approval';                                                  -- (a) 보낸 사람이 확인하며 복사한 암호문
  elsif v_count >= 3 then
    v_reason := 'decrypt_limit_reached';
  end if;
  if v_reason is not null then
    insert into public.return_decrypt_log (parcel_id, requester_id, result, deny_reason) values (v.id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  insert into public.return_decrypt_log (parcel_id, requester_id, result, print_no) values (v.id, p_requester, 'opened', v_count + 1)
    returning id into v_log_id;
  return jsonb_build_object(
    'result', 'opened', 'print_no', v_count + 1, 'log_id', v_log_id,
    'order_no', coalesce((select o.order_no from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id),
                         (select s.order_no from public.revgift_shares s where s.id = v.share_id)),
    'sender_id', v_sender,
    'sender_creator_id', (select c.id from public.creators c join public.profiles p on p.id = c.profile_id where c.profile_id = v_sender and p.role = 'creator'),
    -- 이 봉투를 내준 순간의 확인 시각 — 출력 단계 함수가 잠근 자리에서 이 값과 비교한다(그 사이 다시 확인했으면 거부)
    'confirmed_at', v.return_confirmed_at,
    'envelope', v_address.envelope);
end $$;

-- ── 4) 반송 복사본 — 처분 때만 그 처리에서 지운다 (INV-P18) ─────────

drop trigger if exists office_parcels_return_copy_drop on public.office_parcels;
create trigger office_parcels_return_copy_drop after update of state on public.office_parcels
  for each row when (new.state = 'disposed' and old.state is distinct from new.state)
  execute function pii.return_address_drop_copy();

-- ── 5) 확정 + 72시간 사본 지우기 (INV-W11 · R9 · P18) ─────────

-- 시각은 몫의 출고 확정(revgift_shares.shipped_at) · 상자의 반송 확정(office_parcels.returned_at). 봉투 함수도 같은 시각으로 72시간을 보므로,
-- 이 함수가 늦게 돌아도(예약 작업 사이 5분) 72시간이 지난 사본은 열리지 않는다. 지운 사실은 기록 표에 한 줄(값 없음) — 사본이 있을 때만이라 두 번 돌려도 한 줄이다.
create function public.office_drop_address_copies()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_revgift integer := 0;
  v_return integer := 0;
begin
  for v_id in
    select a.share_id from pii.revgift_addresses a join public.revgift_shares s on s.id = a.share_id
    where s.shipped_at is not null and s.shipped_at <= now() - interval '72 hours'
  loop
    delete from pii.revgift_addresses where share_id = v_id;
    if found then
      insert into public.revgift_address_events (share_id, event, outcome) values (v_id, 'deleted', 'shipped');
      v_revgift := v_revgift + 1;
    end if;
  end loop;

  for v_id in
    select a.parcel_id from pii.return_addresses a join public.office_parcels p on p.id = a.parcel_id
    where p.state = 'returned' and p.returned_at is not null and p.returned_at <= now() - interval '72 hours'
  loop
    delete from pii.return_addresses where parcel_id = v_id;
    if found then
      insert into public.return_address_events (parcel_id, event, outcome) values (v_id, 'deleted', 'returned');
      v_return := v_return + 1;
    end if;
  end loop;

  return jsonb_build_object('revgift', v_revgift, 'return', v_return);
end $$;

-- ── 권한 ─────────────────────────────────────────

revoke all on function public.close_revgift_share(text, text) from public, anon, authenticated;
grant execute on function public.close_revgift_share(text, text) to service_role;
revoke all on function public.revgift_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.revgift_claim_print(text, uuid) to address_decryptor;
revoke all on function public.return_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.return_claim_print(text, uuid) to address_decryptor;
-- 예약 작업 실행자(postgres)만 — 앱 서버 키·로그인 키·익명 키로는 부를 수 없다(INV-W11)
revoke all on function public.office_drop_address_copies() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- 적용 결과 확인 — 세 줄 모두 t 여야 한다
select prosrc not like '%delete from pii.revgift_addresses%shipped_at = now()%' and prosrc like '%return;%' as close_keeps_shipped_copy
  from pg_proc where oid = 'public.close_revgift_share(text, text)'::regprocedure;
select pg_get_triggerdef(oid) like '%''disposed''%' and pg_get_triggerdef(oid) not like '%''returned''%' as copy_drop_on_disposed_only
  from pg_trigger where tgname = 'office_parcels_return_copy_drop';
select to_regprocedure('public.office_drop_address_copies()') is not null as drop_function_exists;

commit;
