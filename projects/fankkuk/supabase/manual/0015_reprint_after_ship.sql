-- 출고 확정 뒤 재출력 — 2026-10-10 정책 문제집 메모 C13. 스펙: docs/specs/address-protection.md (INV-P4 (c)·INV-P5)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md — pii 를 읽는 함수). 마이그레이션 20261010000002_reprint_after_ship.sql 다음에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0015_reprint_after_ship.sql
--
-- 0010 에서 바뀌는 것은 한 군데다 — 주소를 내주는 조건:
--   · 출고 확정(shipped) 상자는 이미 한 번 이상 열었고 주문이 송장 출력·출고 단계면 남은 횟수 안에서 다시 연다(재출력).
--   · 출고 확정 상자의 첫 출력은 없다(연 적이 없으면 거부). 횟수·잠금·기록 줄은 그대로다.
-- 부분 적용:
--   · 마이그레이션만 적용(이 파일 전) — 재출력은 지금처럼 거부된다(order_not_printable). 주소가 열리지 않으니 안전하다.
--   · 이 파일만 적용(마이그레이션 전) — 주소를 연 뒤 송장 마무리가 거부돼 출력이 실패하고, 그 시도는 돌려받지 못해 횟수 하나가 남는다.
--     주소는 송장으로 나가지 않는다. 그래서 위 시작 검사가 마이그레이션이 먼저인지 본다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 마이그레이션 20261010000002 가 먼저 적용됐는지 본다 — 송장 마무리가 출고 확정 상자의 재출력을 받아야 한다.
do $$
begin
  if position('v.state in (''label_printed'', ''shipped'')' in (select prosrc from pg_proc where proname = 'invoice_finish_print')) = 0 then
    raise exception '송장 마무리가 아직 출고 확정 재출력을 받지 않는다 — 마이그레이션 20261010000002_reprint_after_ship.sql 을 먼저 적용한다';
  end if;
end $$;

create or replace function public.invoice_claim_print(p_qr text, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_order public.orders;
  v_count integer;
  v_reason text;
  v_address pii.creator_addresses;
  v_log_id bigint;
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.box_id is null then
    raise exception '팬 선물 상자가 아니다' using errcode = '22023';
  end if;
  select o.* into v_order from public.orders o join public.boxes b on b.order_id = o.id where b.id = v.box_id for update of o;

  -- INV-P5: 이 상자에서 연 횟수(상자마다 따로 — 카드 d30) = 연 줄 − 돌려준 줄(INV-P15)
  select (select count(*) from public.decrypt_log where box_id = v.box_id and result = 'opened')
       - (select count(*) from public.decrypt_releases where box_id = v.box_id)
    into v_count;

  -- INV-P4 (c)·INV-P5: ① 검수 완료 ~ 출고 확정 전 — 출고 조건(W3 — 승인·거절 아님·차액)도 잠근 뒤 다시 본다.
  -- ② 출고 확정된 상자의 재출력(2026-10-10) — 이미 한 번 이상 열었고 주문이 송장 출력·출고 단계일 때만. 첫 출력은 없다.
  --    출고 확정은 출고 조건을 지킨 상자만 되므로 W3 은 다시 보지 않는다(승인 뒤라 거절·반려로 바뀌지 않는다).
  if v.state = 'shipped' then
    if v_count < 1 or v_order.status not in ('label_printed', 'shipped') then
      v_reason := 'order_not_printable';
    elsif v_count >= 3 then
      v_reason := 'decrypt_limit_reached';
    end if;
  elsif v.state not in ('inspected', 'label_printed') or v_order.status not in ('inspected', 'label_printed') then
    v_reason := 'order_not_printable';
  elsif exists (select 1 from public.payments d where d.order_id = v_order.id and d.kind = 'difference' and d.status <> 'done') then
    v_reason := 'difference_unpaid';
  elsif not public.office_parcel_shippable(v) then
    v_reason := 'order_not_printable';
  elsif v_count >= 3 then
    v_reason := 'decrypt_limit_reached';
  end if;
  if v_reason is not null then
    insert into public.decrypt_log (order_id, box_id, requester_id, result, deny_reason) values (v_order.id, v.box_id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  select * into v_address from pii.creator_addresses where creator_id = v_order.creator_id;
  if v_address.creator_id is null then
    return jsonb_build_object('result', 'no_address');
  end if;

  insert into public.decrypt_log (order_id, box_id, requester_id, result, print_no) values (v_order.id, v.box_id, p_requester, 'opened', v_count + 1)
    returning id into v_log_id;
  return jsonb_build_object('result', 'opened', 'print_no', v_count + 1, 'log_id', v_log_id, 'creator_id', v_address.creator_id, 'envelope', v_address.envelope);
end $$;

-- create or replace 는 권한을 그대로 두지만, 0010 과 같은 상태임을 여기서도 못박는다
revoke all on function public.invoice_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.invoice_claim_print(text, uuid) to address_decryptor;

notify pgrst, 'reload schema';

commit;
