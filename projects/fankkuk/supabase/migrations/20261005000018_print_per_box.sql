-- 송장 출력 횟수를 상자마다 센다 — 결정 카드 fankkuk-20261001-1-d30(사용자 「상자마다로 하자. 당연히 개별 카운트지」). address-protection INV-P5.
--
-- 지금까지는 한 주문에서 주소를 연 횟수를 셌다. 그러면 상자 4개짜리 주문은 4번째 상자에서 「상한 도달」로 송장을 못 뽑았다.
-- 1) 열람 기록에 어느 상자의 출력인지 남기는 칸(box_id)을 더한다. 주소를 연 줄은 이 칸이 반드시 있어야 한다 —
--    빠진 줄은 어느 상자의 횟수에도 안 잡혀 상한을 넘길 수 있기 때문이다. 이 마이그레이션 전의 줄(로컬 시험 기록뿐,
--    운영 배포 전)은 고칠 수 없는 기록이라(INV-P7) 그대로 두고, 조건은 새 줄부터 건다(not valid).
-- 2) 판정 재료(invoice_print_context)의 「연 횟수」를 그 상자 기준으로 바꾸고, 상자 id 를 같이 내준다(거부 줄에 쓴다).
-- 횟수를 실제로 세고 늘리는 자리(invoice_claim_print)는 pii 를 읽으므로 manual/0009_print_per_box.sql(사람이 적용).
--
-- 한쪽만 적용된 상태:
--   · 이 파일만 → 옛 invoice_claim_print 는 연 줄에 상자 칸을 안 채워 1) 조건에 막힌다 → 송장 출력이 실패한다(주소는 안 열림).
--   · manual/0009 만 → 그 파일이 처음에 상자 칸이 있는지 보고 없으면 멈춘다(아무것도 안 바뀜).

alter table public.decrypt_log add column box_id uuid references public.boxes (id);
alter table public.decrypt_log add constraint decrypt_log_opened_has_box check (result <> 'opened' or box_id is not null) not valid;
create index decrypt_log_box_opened on public.decrypt_log (box_id) where result = 'opened';

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
    -- INV-P5: 이 상자에서 주소를 연 횟수(상자마다 따로 — 카드 d30)
    'decrypt_count', (select count(*) from public.decrypt_log l where l.box_id = b.id and l.result = 'opened'),
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

notify pgrst, 'reload schema';
