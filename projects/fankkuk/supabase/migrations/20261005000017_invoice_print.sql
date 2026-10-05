-- 송장 출력 = 크리에이터 주소 열기 — 복호화 전용 역할의 자리 (address-protection INV-P4·P5·P7·P8·P14, office-workflow INV-W3).
--
-- 주소를 여는 코드는 송장 출력 함수 하나다. 그 함수는 앱 서버 키가 아니라 복호화 전용 역할(address_decryptor)의 토큰으로 DB 를 부른다.
-- 이 파일은 pii 를 건드리지 않는 쪽만 담는다 — 봉투를 내주는 함수(invoice_claim_print)는 manual/0008_invoice_print.sql(사람이 적용).
--
-- 1) 게이트웨이(PostgREST)가 복호화 전용 역할 토큰을 받아 그 역할로 바꿀 수 있게 한다. 토큰은 송장 출력 함수의 설정에만 있다.
-- 2) invoice_print_context: 판정 재료(주문·단계·차액·연 횟수·승인 원문·저장된 서명). 주소는 없다.
-- 3) invoice_finish_print: 주소를 연 뒤 첫 출력이면 송장 출력 단계로 넘기고, 재출력이면 처음 송장번호를 돌려준다.
-- 4) 열람 기록의 거부 사유에 address_mismatch(INV-P14 — 연 봉인 속 크리에이터가 주소 칸의 크리에이터와 다름)를 더한다.
-- 세 함수 모두 복호화 전용 역할만 부른다. 앱 서버 키·로그인 키로는 부를 수 없다.

grant address_decryptor to authenticator;

alter table public.decrypt_log drop constraint decrypt_log_deny_reason_check;
alter table public.decrypt_log add constraint decrypt_log_deny_reason_check check (deny_reason in (
  'not_owner', 'no_valid_approval', 'order_mismatch', 'order_not_printable', 'difference_unpaid', 'decrypt_limit_reached', 'address_mismatch'
));

-- 판정 재료. 팬 선물 상자가 아니면 {kind: share}, 없는 QR 이면 null. 승인 원문·서명은 승인된 요청의 것 하나(INV-S5 — 승인은 하나).
create function public.invoice_print_context(p_qr text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  r jsonb;
begin
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  select * into v from public.office_parcels where qr_code = p_qr;
  if v.id is null then
    return null;
  end if;
  if v.box_id is null then
    return jsonb_build_object('kind', 'share');
  end if;
  select jsonb_build_object(
    'kind', 'gift',
    'order_id', o.id,
    'order_no', o.order_no,
    'order_status', o.status,
    'parcel_state', v.state,
    'creator_profile_id', c.profile_id,
    'difference_unpaid', exists (select 1 from public.payments d where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done'),
    'decrypt_count', (select count(*) from public.decrypt_log l where l.order_id = o.id and l.result = 'opened'),
    'stored_payload', q.payload,
    'signed_content', s.signed_content,
    'signer_id', s.signer_id,
    'signer_method', s.method
  ) into r
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  left join public.approval_requests q on q.order_id = o.id and q.status = 'approved'
  left join public.approval_signatures s on s.request_id = q.request_id
  where b.id = v.box_id;
  return r;
end $$;

-- 주소를 연 뒤(봉인 속 크리에이터 대조까지 통과) 부른다. 첫 출력이면 송장 출력 단계로 넘기고 그 번호를, 재출력이면 처음 번호를 돌려준다.
-- 출고 조건(W3)은 잠근 뒤 다시 본다.
create function public.invoice_finish_print(p_qr text, p_waybill text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  perform public.office_check_waybill(p_waybill);
  v := public.office_lock_qr(p_qr);
  if v.box_id is null then
    raise exception '팬 선물 상자가 아니다' using errcode = '22023';
  end if;
  perform 1 from public.orders o join public.boxes b on b.order_id = o.id where b.id = v.box_id for update of o;
  if v.state = 'label_printed' then
    return v.outbound_waybill_no;
  end if;
  if v.state <> 'inspected' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if not public.office_parcel_shippable(v) then
    raise exception '출고 조건을 지키지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'label_printed', printed_at = now(), outbound_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return p_waybill;
end $$;

revoke all on function public.invoice_print_context(text) from public, anon, authenticated, service_role;
revoke all on function public.invoice_finish_print(text, text) from public, anon, authenticated, service_role;
grant execute on function public.invoice_print_context(text) to address_decryptor;
grant execute on function public.invoice_finish_print(text, text) to address_decryptor;

-- 게이트웨이가 새 함수를 알게 한다
notify pgrst, 'reload schema';
