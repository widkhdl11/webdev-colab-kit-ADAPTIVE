-- 송장 출력 — 횟수를 올리며 크리에이터 주소 봉투를 내주는 자리. 스펙: docs/specs/address-protection.md (INV-P4 c·P5·P7·P9·P14)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md). 0007_creator_address.sql(pii.creator_addresses)과
-- 마이그레이션 20261005000017_invoice_print.sql(복호화 전용 역할 연결·address_mismatch 사유) 다음에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0008_invoice_print.sql
--
-- 결과(jsonb): {result: opened, print_no, creator_id, envelope} | {result: denied, reason} | {result: no_address}
--   · 22023 QR 꼴이 아니거나 팬 선물 상자가 아님 · P0002 없는 상자
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 송장 출력 함수(복호화 전용 역할)만 부른다. 판정(대표·서명 재검증·주문번호)은 송장 출력 함수가 먼저 했다 —
-- 여기서는 상자·주문을 잠근 자리에서 단계·출고 조건·횟수를 다시 보고, 열 수 있으면 「연 줄」을 남기며 봉투를 내준다.
-- INV-P5: 횟수 확인과 증가가 이 잠금 안에서 한 번에 일어난다 — 동시 요청 둘이 와도 상한(3)을 넘지 않는다.
-- 거부면 같은 자리에서 거부 줄을 남긴다(INV-P7). 주소 칸이 비어 있으면 열 것이 없으므로 줄도 횟수도 남기지 않는다.
-- 봉투와 함께 그 주소 칸의 크리에이터를 돌려준다 — 송장 출력 함수가 봉인 속 크리에이터와 대조한다(INV-P14).
create function public.invoice_claim_print(p_qr text, p_requester uuid)
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

  select count(*) into v_count from public.decrypt_log where order_id = v_order.id and result = 'opened';

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
    insert into public.decrypt_log (order_id, requester_id, result, deny_reason) values (v_order.id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  select * into v_address from pii.creator_addresses where creator_id = v_order.creator_id;
  if v_address.creator_id is null then
    return jsonb_build_object('result', 'no_address');
  end if;

  insert into public.decrypt_log (order_id, requester_id, result, print_no) values (v_order.id, p_requester, 'opened', v_count + 1);
  return jsonb_build_object('result', 'opened', 'print_no', v_count + 1, 'creator_id', v_address.creator_id, 'envelope', v_address.envelope);
end $$;

revoke all on function public.invoice_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.invoice_claim_print(text, uuid) to address_decryptor;

-- 게이트웨이가 새 함수를 알게 한다
notify pgrst, 'reload schema';

commit;
