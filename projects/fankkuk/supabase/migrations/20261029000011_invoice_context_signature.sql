-- 송장 출력 재검증 재료에 서명값(signature)을 더한다 — address-protection INV-P4 (a).
-- 스펙: docs/specs/address-protection.md INV-P4 (a), approval-signature.md INV-S12.
--
-- 20261029000010 의 invoice_print_context 그대로에 한 칸('signature')만 더했다. 송장 출력 함수는 kakao 서명 기록이면
-- 「서명값이 있다·방식이 kakao·원문 해시가 같다」만으로 열지 않고, 이 서명값(전자서명문 base64)을 서명 게이트웨이에서
-- 체인·서명·폐기까지 다시 검증한 뒤 서명된 원문이 그 주문 서명 요청의 원문과 같을 때만 연다(DB 에 가짜 kakao 줄을 심어도 열리지 않게).
-- 이 칸이 없으면(이 파일 적용 전) 송장 출력 함수는 kakao 기록을 전부 거부한다(닫힌 쪽). fake 기록은 이 칸과 관계없다.
-- create or replace 라 다시 돌려도 결과가 같다. 권한은 함수에 붙어 있어 그대로 남는다. 개인정보 구역(pii)은 건드리지 않는다.

create or replace function public.invoice_print_context(p_qr text)
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
    'box_id', b.id,
    'order_no', o.order_no,
    'order_status', o.status,
    'parcel_state', v.state,
    'creator_profile_id', c.profile_id,
    'difference_unpaid', exists (select 1 from public.payments d where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done'),
    -- INV-P5: 이 상자에서 주소를 연 횟수 = 연 줄 − 돌려준 줄(INV-P15)
    'decrypt_count', (select count(*) from public.decrypt_log l where l.box_id = b.id and l.result = 'opened')
                   - (select count(*) from public.decrypt_releases rl where rl.box_id = b.id),
    'signature_present', s.id is not null and (s.signature is not null or s.signed_content is not null),
    -- INV-P4 (a): 서명값 그대로 — kakao 면 송장 출력 함수(게이트웨이)가 전자서명문을 다시 검증한다
    'signature', s.signature,
    'signer_method', s.method,
    'recorded_hash', coalesce(s.content_hash, case when s.signed_content is not null
                       then encode(extensions.digest(convert_to(s.signed_content, 'UTF8'), 'sha256'), 'hex') end),
    'approval_plaintext', coalesce(sr.plaintext, s.signed_content)
  ) into r
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  left join public.approval_requests q on q.order_id = o.id and q.status = 'approved'
  left join public.approval_signatures s on s.request_id = q.request_id
  left join public.approval_sign_requests sr on sr.id = s.sign_request_id and sr.state = 'signed'
  where b.id = v.box_id;
  return r;
end $$;
