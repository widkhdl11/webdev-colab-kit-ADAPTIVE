-- 송장 출력 횟수를 상자마다 센다 — 결정 카드 fankkuk-20261001-1-d30. 스펙: docs/specs/address-protection.md (INV-P5)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md). 마이그레이션 20261005000018_print_per_box.sql(열람 기록의 상자 칸) 다음에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0009_print_per_box.sql
--
-- 0008 에서 바뀌는 것은 세 줄이다: 횟수를 주문(order_id)이 아니라 이 상자(box_id)로 센다 · 연 줄과 거부 줄에 상자를 남긴다.
-- 잠금은 그대로다 — 상자(office_lock_qr)와 주문을 잠근 자리에서 세고 늘리므로, 같은 상자에 동시 요청 둘이 와도 3을 넘지 않는다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 마이그레이션 18 이 먼저 적용됐는지 본다. 없으면 여기서 멈춘다(아래 함수는 만들어져도 실행 때마다 실패하기 때문).
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'decrypt_log' and column_name = 'box_id') then
    raise exception '열람 기록에 상자 칸(box_id)이 없다 — 마이그레이션 20261005000018_print_per_box.sql 을 먼저 적용한다';
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
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.box_id is null then
    raise exception '팬 선물 상자가 아니다' using errcode = '22023';
  end if;
  select o.* into v_order from public.orders o join public.boxes b on b.order_id = o.id where b.id = v.box_id for update of o;

  -- INV-P5: 이 상자에서 연 횟수(상자마다 따로 — 카드 d30)
  select count(*) into v_count from public.decrypt_log where box_id = v.box_id and result = 'opened';

  -- INV-P4 (c): 검수 완료 ~ 출고 확정 전. 출고 조건(W3 — 승인·거절 아님·차액)도 잠근 뒤 다시 본다.
  if v.state not in ('inspected', 'label_printed') or v_order.status not in ('inspected', 'label_printed') then
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

  insert into public.decrypt_log (order_id, box_id, requester_id, result, print_no) values (v_order.id, v.box_id, p_requester, 'opened', v_count + 1);
  return jsonb_build_object('result', 'opened', 'print_no', v_count + 1, 'creator_id', v_address.creator_id, 'envelope', v_address.envelope);
end $$;

-- create or replace 는 권한을 그대로 두지만, 0008 과 같은 상태임을 여기서도 못박는다
revoke all on function public.invoice_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.invoice_claim_print(text, uuid) to address_decryptor;

notify pgrst, 'reload schema';

commit;
