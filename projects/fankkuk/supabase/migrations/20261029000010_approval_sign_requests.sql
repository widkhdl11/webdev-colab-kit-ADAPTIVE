-- 승인 서명 요청 — 「승인」을 누를 때 서명 요청을 만들고, 결과를 묻고, 승인한다 (2026-10-29 (2) 「가입 흐름과 승인 흐름 확정」).
-- 스펙: docs/specs/approval-signature.md INV-S1·S2·S12·S14·S17 (S1·S1b·S12·S14c·S17~S17d), address-protection INV-P4 (a)(b).
--
-- 이 파일은 개인정보 구역(pii)을 읽지 않는다. 서명 요청 만들기(연결 봉투를 읽음)와 승인(받는 주소를 확인함)은 pii 에 닿으므로
-- supabase/manual/0028_approval_sign_requests.sql(사람이 적용)에 있다. 이 파일이 먼저다 — 0028 은 첫 줄에서 이 표가 있는지 본다.
--
-- 무엇을 바꾸나
--   1) approval_sign_requests — 서명 요청 하나에 줄 하나. 승인 요청(주문)마다 기다리는 줄은 하나(유일 색인), 만든 때부터 5분 기한,
--      원문(서버가 주문에서 만든 네 값)·게이트웨이 거래 ID·방식(kakao|fake)·상태. 결제 때는 줄이 생기지 않는다(INV-S17).
--   2) approval_sign_plaintext(주문번호, 보낸 팬 닉네임, 선물 종류, 개수) — 원문을 만드는 함수 하나. 인자는 이 넷뿐이다(INV-S1).
--   3) approval_sign_current · record_approval_sign_tx · close_approval_sign — 앱 서버(서비스 키) 전용. 누구의 요청인지는 세션에서 확인한 사람 ID 로.
--   4) approval_signatures 에 서명값(signature)·서명 요청(sign_request_id) 칸. 새 줄은 서명값·원문 해시(SHA-256)·서명 시각·방식만 —
--      서명자 식별값·원문 칸은 비운다(INV-S12). 지난 줄(원문·서명자 식별값이 있는 줄)은 그대로 둔다.
--   5) 크리에이터가 탈퇴로 표시되면 그 크리에이터 주문의 서명 요청 원문을 지운다(INV-S14 — 원문을 남기지 않는다).
--      카카오 서명값이 남아 있으면 탈퇴를 멈춘다 — 서명값 안의 인증서(이름)를 떼는 방법은 카카오 연결 때 정한다(지난 줄과 같은 멈춤).
--   6) retention_purge — 「가명 처리된 서명 기록」을 탈퇴한 크리에이터의 줄로 좁힌다. 새 줄은 처음부터 원문·서명자 식별값이 비어 있어
--      꼴만 보면 가명 처리된 줄과 같다 — 탈퇴하지 않은 크리에이터의 서명이 5년 뒤 지워지지 않게(S14c 「탈퇴하지 않은 크리에이터의 서명은 남는다」).
--   7) invoice_print_context — 송장 출력 재검증 재료를 서명자 식별값 없이: 서명값이 있는가 · 방식 · 기록된 원문 해시 · 그 주문 승인 원문.
--
-- 한쪽만 적용된 상태
--   이 파일만(0028 없음): 표와 읽기 함수만 있다. 새 앱은 서명 요청 만들기 함수를 찾지 못해 승인 요청이 실패한다(닫힌 쪽).
--     옛 승인 함수(approve_request)는 남아 있지만 새 앱은 부르지 않는다. 송장 출력은 지난 줄(원문이 있는 줄)을 그대로 재검증한다.
--   0028 만: 그 파일이 첫 줄에서 이 표가 없으면 멈춘다(아무것도 안 바뀜).

-- ── 1) 서명 요청 표 ──────────────────────────────────────

create table public.approval_sign_requests (
  id uuid primary key default gen_random_uuid(),
  approval_request_id text not null references public.approval_requests (request_id) on delete cascade,
  -- INV-S1: 원문은 서버가 주문에서 만든 네 값뿐(아래 approval_sign_plaintext). 탈퇴 처리만 지운다(INV-S14)
  plaintext text check (plaintext is null or char_length(plaintext) between 1 and 400),
  method text not null check (method in ('kakao', 'fake')),
  -- 게이트웨이가 요청 때 돌려준 거래 ID — 결과를 물을 때 그대로 넘긴다(INV-S4: 결과의 거래 ID 는 요청 때의 것과 같아야 한다)
  gateway_tx_id text check (gateway_tx_id is null or gateway_tx_id ~ '^[0-9A-Za-z_.:-]{1,128}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'signed', 'failed', 'expired')),
  finished_at timestamptz,
  -- INV-S17: 요청 하나는 만든 때부터 5분(드림시큐리티 결과 조회 시간)
  constraint approval_sign_requests_five_minutes check (expires_at = created_at + interval '5 minutes'),
  check ((state = 'pending') = (finished_at is null)),
  check (plaintext is not null or state <> 'pending')
);
-- INV-S17: 승인 요청(= 주문, 승인 요청은 주문마다 열린 것 하나) 하나에 기다리는 서명 요청은 하나
create unique index approval_sign_requests_one_pending on public.approval_sign_requests (approval_request_id) where state = 'pending';
create index approval_sign_requests_by_request on public.approval_sign_requests (approval_request_id, created_at);
alter table public.approval_sign_requests enable row level security;
revoke all on public.approval_sign_requests from public, anon, authenticated, service_role;

-- ── 2) 원문 만들기 ───────────────────────────────────────

-- INV-S1: 원문은 주문번호·보낸 팬 닉네임·선물 종류·개수 네 값으로만. 이 함수가 원문을 만드는 유일한 곳이고 인자는 이 넷뿐이다 —
-- 주소·메모 같은 다른 칸은 넘길 자리가 없다(넘기면 그런 함수가 없다는 오류). 선물 종류는 정해진 목록의 화면 이름만 받는다(팬이 쓴 글 금지).
-- 칸 안에 줄바꿈이 들어오면 다른 줄을 꾸며 넣을 수 있어 거부한다. 앱의 원문 읽기(entities/order/model/approval-plaintext.ts)와 같은 꼴이다.
create function public.approval_sign_plaintext(p_order_no text, p_fan_nickname text, p_gift_kind text, p_box_count integer)
returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if p_order_no is null or p_order_no !~ '^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$' then
    raise exception '주문번호 꼴이 아니다' using errcode = '22023';
  end if;
  if p_fan_nickname is null or char_length(p_fan_nickname) not between 1 and 20 or p_fan_nickname ~ '[[:cntrl:]]' then
    raise exception '닉네임 꼴이 아니다' using errcode = '22023';
  end if;
  if p_gift_kind is null or p_gift_kind not in (
    select public.item_category_label(c) from unnest(array['doll', 'flower', 'clothing', 'beauty', 'large', 'stationery', 'electronics', 'other']) c
  ) then
    raise exception '선물 종류는 정해진 목록의 이름만' using errcode = '22023';
  end if;
  if p_box_count is null or p_box_count not between 1 and 10 then
    raise exception '개수 꼴이 아니다' using errcode = '22023';
  end if;
  return '주문번호: ' || p_order_no || E'\n'
      || '보낸 팬: ' || p_fan_nickname || E'\n'
      || '선물 종류: ' || p_gift_kind || E'\n'
      || '개수: ' || p_box_count::text;
end $$;

-- 주문 하나의 원문 — 선물 종류는 팬이 고른 목록 값의 이름(예전 주문처럼 종류 칸이 비면 「기타」 — 팬이 쓴 물품 이름은 쓰지 않는다), 개수는 그 주문의 상자 수
create function public.approval_sign_plaintext_of_order(p_order_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select public.approval_sign_plaintext(
    o.order_no,
    p.nickname,
    public.item_category_label(coalesce(o.item_category, 'other')),
    (select count(*)::integer from public.boxes b where b.order_id = o.id)
  )
  from public.orders o
  join public.profiles p on p.id = o.fan_id
  where o.id = p_order_id;
$$;

-- ── 3) 앱 서버 전용 읽기·기록 ─────────────────────────────

-- 그 사람의 승인 요청에 걸린 가장 새 서명 요청. 기다리는 중인데 기한이 지났으면 여기서 expired 로 적는다.
-- result: found(아래 칸이 그 요청) · none(서명 요청이 아직 없음) · approved(승인 요청이 이미 승인됨) · not_found(없는 요청·남의 요청 — 같은 답)
create function public.approval_sign_current(p_actor_id uuid, p_request_id text)
returns table (result text, sign_request_id uuid, state text, plaintext text, gateway_tx_id text, method text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.approval_request_status;
  v_sr public.approval_sign_requests;
begin
  select q.status into v_status
  from public.approval_requests q
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where q.request_id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id;
  if v_status is null then
    return query select 'not_found'::text, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  if v_status = 'approved' then
    return query select 'approved'::text, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into v_sr from public.approval_sign_requests r
   where r.approval_request_id = p_request_id
   order by r.created_at desc limit 1
   for update;
  if v_sr.id is null then
    return query select 'none'::text, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  if v_sr.state = 'pending' and now() > v_sr.expires_at then
    update public.approval_sign_requests r set state = 'expired', finished_at = now() where r.id = v_sr.id;
    v_sr.state := 'expired';
  end if;
  return query select 'found'::text, v_sr.id, v_sr.state,
    case when v_sr.state = 'pending' then v_sr.plaintext end,
    v_sr.gateway_tx_id, v_sr.method, v_sr.expires_at;
end $$;

-- 게이트웨이가 요청을 받고 돌려준 거래 ID 를 적는다. 기다리는 중이고 아직 비어 있을 때만 — 한 번 적으면 바꾸지 않는다.
-- result: recorded · not_found · not_pending
create function public.record_approval_sign_tx(p_actor_id uuid, p_sign_request_id uuid, p_tx_id text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_sr public.approval_sign_requests;
begin
  select r.* into v_sr
  from public.approval_sign_requests r
  join public.approval_requests q on q.request_id = r.approval_request_id
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where r.id = p_sign_request_id and p_actor_id is not null and c.profile_id = p_actor_id
  for update of r;
  if v_sr.id is null then
    return 'not_found';
  end if;
  if v_sr.state <> 'pending' or v_sr.gateway_tx_id is not null then
    return 'not_pending';
  end if;
  update public.approval_sign_requests r set gateway_tx_id = p_tx_id where r.id = v_sr.id;
  return 'recorded';
end $$;

-- 기다리는 요청을 끝낸다 — 게이트웨이가 거부·실패·기한 지남으로 답했거나, 요청을 보내지 못했을 때. 승인으로 바꾸는 길은 여기 없다(INV-S7).
-- p_outcome: failed · expired. result: closed · not_found · not_pending
create function public.close_approval_sign(p_actor_id uuid, p_sign_request_id uuid, p_outcome text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_sr public.approval_sign_requests;
begin
  if p_outcome is null or p_outcome not in ('failed', 'expired') then
    raise exception '끝내는 결과는 failed·expired 뿐' using errcode = '22023';
  end if;
  select r.* into v_sr
  from public.approval_sign_requests r
  join public.approval_requests q on q.request_id = r.approval_request_id
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where r.id = p_sign_request_id and p_actor_id is not null and c.profile_id = p_actor_id
  for update of r;
  if v_sr.id is null then
    return 'not_found';
  end if;
  if v_sr.state <> 'pending' then
    return 'not_pending';
  end if;
  update public.approval_sign_requests r set state = p_outcome, finished_at = now() where r.id = v_sr.id;
  return 'closed';
end $$;

-- ── 4) 서명 기록 칸 ──────────────────────────────────────

alter table public.approval_signatures add column if not exists signature text;
alter table public.approval_signatures add column if not exists sign_request_id uuid references public.approval_sign_requests (id);
-- INV-S12: 새 줄(서명값이 있는 줄)은 서명값·원문 해시·서명 시각·방식만 — 원문·서명자 식별값은 비어 있고 서명 요청이 있다
alter table public.approval_signatures drop constraint if exists approval_signatures_new_shape;
alter table public.approval_signatures add constraint approval_signatures_new_shape check (
  signature is null
  or (char_length(signature) between 1 and 65536
      and signed_content is null and signer_id is null
      and content_hash ~ '^[0-9a-f]{64}$'
      and sign_request_id is not null)
);
create unique index if not exists approval_signatures_sign_request on public.approval_signatures (sign_request_id) where sign_request_id is not null;

-- ── 5) 탈퇴하면 서명 요청 원문을 지운다 ──────────────────

create function public.drop_sign_plaintext_on_withdraw()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- 카카오 서명값에는 인증서(이름)가 들어 있다 — 떼는 방법은 카카오 연결 때 정한다(external-connections). 그 전에는 지우지 않고 멈춘다.
  if exists (
    select 1 from public.approval_signatures s
    join public.approval_requests r on r.request_id = s.request_id
    join public.orders o on o.id = r.order_id
    where o.creator_id = new.id and s.method <> 'fake' and s.signature is not null
  ) then
    raise exception '카카오 서명 기록의 가명 처리는 아직 없다' using errcode = '0A000';
  end if;
  -- INV-S14: 원문(보낸 팬 닉네임이 들어 있다)은 지운다. 원문 해시는 서명 기록에 남아 있다.
  update public.approval_sign_requests sr
     set plaintext = null,
         state = case when sr.state = 'pending' then 'failed' else sr.state end,
         finished_at = coalesce(sr.finished_at, now())
    from public.approval_requests r
    join public.orders o on o.id = r.order_id
   where sr.approval_request_id = r.request_id and o.creator_id = new.id and sr.plaintext is not null;
  return new;
end $$;

create trigger creators_drop_sign_plaintext before update of withdrawn_at on public.creators
for each row when (new.withdrawn_at is not null and old.withdrawn_at is null)
execute function public.drop_sign_plaintext_on_withdraw();

-- ── 7) 송장 출력 재검증 재료 ─────────────────────────────

-- address-protection INV-P4 (a)(b): 서명자 식별값 없이 — 서명값이 있는가 · 방식 · 기록된 원문 해시 · 그 주문 승인 원문.
-- 지난 줄(원문이 서명 기록에 있는 줄)은 그 원문과 그 해시를 내준다 — 그 줄은 당시 서명자 대조까지 마친 승인이다.
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

-- ── 권한 ─────────────────────────────────────────────────

revoke all on function public.approval_sign_plaintext(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.approval_sign_plaintext_of_order(uuid) from public, anon, authenticated, service_role;
revoke all on function public.approval_sign_current(uuid, text) from public, anon, authenticated;
revoke all on function public.record_approval_sign_tx(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.close_approval_sign(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approval_sign_current(uuid, text) to service_role;
grant execute on function public.record_approval_sign_tx(uuid, uuid, text) to service_role;
grant execute on function public.close_approval_sign(uuid, uuid, text) to service_role;
revoke all on function public.drop_sign_plaintext_on_withdraw() from public, anon, authenticated, service_role;

-- ── 6) 보관 기한 삭제 — 가명 처리된 서명 기록은 탈퇴한 크리에이터의 줄만 ──
-- 20261023000011 의 retention_purge 그대로에 한 줄(아래 「탈퇴한 크리에이터의 서명만」)을 더했다.

create or replace function public.retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_shared_fan constant uuid := 'ffffffff-0000-4000-8000-000000000001';
  c_shared_creator constant uuid := 'ffffffff-0000-4000-8000-000000000002';
  v_signatures integer;
  v_inquiries integer;
  v_orders integer;
  v_unlinked integer;
  v_rg_shares integer;
  v_rg_sends integer;
  v_rg_unlinked integer;
  v_n integer;
  v_tab regclass;
  v_counts jsonb;
  v_locked regclass[] := array[
    'public.approval_signatures', 'public.decrypt_log', 'public.decrypt_releases', 'public.office_inspections', 'public.office_envelope_shreds',
    'public.office_not_mine_reports', 'public.office_held_links', 'public.office_creator_check_events', 'public.office_share_moves',
    'public.office_police_handovers', 'public.office_disposals', 'public.return_decrypt_log', 'public.return_decrypt_releases',
    'public.return_address_events', 'public.office_unmatched_look_edits', 'public.revgift_decrypt_log', 'public.revgift_decrypt_releases'
  ]::regclass[];
begin
  -- 한 처리 안에서 두 번 불려도 되게(예약 작업은 회차마다 따로 처리다)
  drop table if exists retention_old_orders, retention_unlink, retention_gone, retention_del_orders, retention_del_boxes,
    retention_del_parcels, retention_del_unmatched, retention_del_payments,
    retention_old_sends, retention_rg_shares, retention_unlink_parcels, retention_del_shares;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, false);
  end loop;

  -- 가명 처리된 서명 기록(INV-S14) — 그 주문이 끝난 때(마지막 기록)부터 5년. 주문이 회원 쪽 내역으로 남아도 서명은 지운다(카드 d125).
  delete from public.approval_signatures s
   using public.approval_requests r
    join public.orders o on o.id = r.order_id
   where r.request_id = s.request_id
     and o.created_at < now() - interval '5 years' -- 마지막 기록은 주문을 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and s.signed_content is null and s.signer_id is null and s.content_hash is not null
     -- 탈퇴한 크리에이터의 서명만 — 새 서명 기록은 처음부터 원문·서명자 식별값이 비어 있어 꼴로는 가명 처리된 줄과 같다(INV-S14 S14c)
     and exists (select 1 from public.creators wc where wc.id = o.creator_id and wc.withdrawn_at is not null)
     and public.order_is_finished(r.order_id)
     and public.order_ended_at(r.order_id) < now() - interval '5 years';
  get diagnostics v_signatures = row_count;

  -- 탈퇴한 사람이 쓴 1:1 문의(INV-A16 — 3년)
  delete from public.inquiries i
   using public.profiles p
   where p.id = i.author_id and p.withdrawn_at is not null
     and i.created_at < now() - interval '3 years';
  get diagnostics v_inquiries = row_count;

  -- 끝났고 마지막 기록이 5년 넘은 주문 중 한쪽이라도 탈퇴한 것
  create temp table retention_old_orders on commit drop as
  select o.id, (fp.withdrawn_at is not null) as fan_gone, (c.withdrawn_at is not null) as creator_gone, o.fan_id, o.creator_id
    from public.orders o
    join public.profiles fp on fp.id = o.fan_id
    join public.creators c on c.id = o.creator_id
   where (fp.withdrawn_at is not null or c.withdrawn_at is not null)
     and o.created_at < now() - interval '5 years' -- 마지막 기록은 주문을 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and public.order_is_finished(o.id)
     and public.order_ended_at(o.id) < now() - interval '5 years';

  -- 끝났고 마지막 기록이 5년 넘은 보내기 중 크리에이터나 받는 팬 한쪽이라도 탈퇴한 것 · 그 보내기에서 손댈 몫
  create temp table retention_old_sends on commit drop as
  select d.id, (c.withdrawn_at is not null) as creator_gone, d.creator_id
    from public.revgift_sends d
    join public.creators c on c.id = d.creator_id
   where (c.withdrawn_at is not null
          or exists (select 1 from public.revgift_shares s join public.profiles p on p.id = s.fan_id where s.send_id = d.id and p.withdrawn_at is not null))
     and d.created_at < now() - interval '5 years' -- 마지막 기록은 보내기를 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and public.revgift_send_finished(d.id)
     and public.revgift_send_ended_at(d.id) < now() - interval '5 years';
  create temp table retention_rg_shares on commit drop as
  select s.id, (p.withdrawn_at is not null) as fan_gone, o.creator_gone, o.creator_id
    from public.revgift_shares s
    join retention_old_sends o on o.id = s.send_id
    join public.profiles p on p.id = s.fan_id
   where p.withdrawn_at is not null or o.creator_gone;

  -- ① 한쪽만 탈퇴 — 주문·몫은 남기고, 그 기록에 든 가명(탈퇴한 사람)을 같이 쓰는 표시로 바꾼다
  create temp table retention_unlink on commit drop as
  select * from retention_old_orders where not (fan_gone and creator_gone);
  create temp table retention_gone on commit drop as
  select p.id from public.profiles p where p.withdrawn_at is not null and p.id <> c_shared_fan;
  -- 남는 주문·몫의 사무실 상자(선물·역조공 한 목록)
  create temp table retention_unlink_parcels on commit drop as
  select op.id, u.creator_gone, u.creator_id
    from retention_unlink u join public.boxes b on b.order_id = u.id join public.office_parcels op on op.box_id = b.id
  union all
  select op.id, r.creator_gone, r.creator_id
    from retention_rg_shares r join public.office_parcels op on op.share_id = r.id
   where not (r.fan_gone and r.creator_gone);

  update public.orders o
     set fan_id = case when u.fan_gone then c_shared_fan else o.fan_id end,
         creator_id = case when u.creator_gone then c_shared_creator else o.creator_id end
    from retention_unlink u
   where o.id = u.id and ((u.fan_gone and o.fan_id <> c_shared_fan) or (u.creator_gone and o.creator_id <> c_shared_creator));
  get diagnostics v_unlinked = row_count;

  update public.order_cancellations oc set canceled_by = c_shared_fan
    from retention_unlink u where oc.order_id = u.id and oc.canceled_by in (select id from retention_gone);
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_unlink u, public.payments p
   where p.order_id = u.id and rc.payment_id = p.id and rc.requested_by in (select id from retention_gone);

  update public.revgift_shares s set fan_id = c_shared_fan
    from retention_rg_shares r
   where s.id = r.id and r.fan_gone and not r.creator_gone and s.fan_id <> c_shared_fan;
  get diagnostics v_rg_unlinked = row_count;
  update public.revgift_sends d
     set creator_id = c_shared_creator,
         sender_id = case when d.sender_id in (select id from retention_gone) then c_shared_fan else d.sender_id end
    from retention_old_sends o
   where d.id = o.id and o.creator_gone and d.creator_id <> c_shared_creator;
  get diagnostics v_n = row_count;
  v_rg_unlinked := v_rg_unlinked + v_n;
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_old_sends o
   where rc.send_id = o.id and rc.requested_by in (select id from retention_gone);

  update public.office_creator_checks cc set answered_by = c_shared_fan
    from retention_unlink_parcels up where cc.parcel_id = up.id and cc.answered_by in (select id from retention_gone);
  update public.office_creator_check_events ce set actor = c_shared_fan
    from retention_unlink_parcels up where ce.parcel_id = up.id and ce.actor in (select id from retention_gone);
  update public.office_held_links hl set account_id = c_shared_fan
    from retention_unlink_parcels up where hl.parcel_id = up.id and hl.account_id in (select id from retention_gone);
  update public.office_unmatched um set nickname_profile_id = c_shared_fan
    from retention_unlink_parcels up where um.matched_parcel_id = up.id and um.nickname_profile_id in (select id from retention_gone);
  update public.office_hold_alerts ha set creator_id = c_shared_creator
    from retention_unlink_parcels up where up.creator_gone and ha.parcel_id = up.id and ha.creator_id = up.creator_id;

  -- ② 둘 다 탈퇴 — 주문·몫과 거기 달린 기록을 아래에서부터 지운다
  create temp table retention_del_orders on commit drop as select id from retention_old_orders where fan_gone and creator_gone;
  create temp table retention_del_shares on commit drop as select id from retention_rg_shares where fan_gone and creator_gone;
  create temp table retention_del_boxes on commit drop as select b.id from public.boxes b where b.order_id in (select id from retention_del_orders);
  create temp table retention_del_parcels on commit drop as
    select op.id from public.office_parcels op
     where op.box_id in (select id from retention_del_boxes) or op.share_id in (select id from retention_del_shares);
  create temp table retention_del_unmatched on commit drop as select u.id from public.office_unmatched u where u.matched_parcel_id in (select id from retention_del_parcels);
  create temp table retention_del_payments on commit drop as
    select p.id from public.payments p where p.order_id in (select id from retention_del_orders) or p.box_id in (select id from retention_del_boxes);

  delete from public.office_held_links where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched);
  -- 지우는 몫을 가리키는 옮기기 기록은 남는 몫 쪽 상자의 것이어도 함께 지운다(두 칸 모두 그 몫을 가리켜야 하는 외래 키라 남길 수 없다)
  delete from public.office_share_moves where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched)
     or from_share_id in (select id from retention_del_shares) or to_share_id in (select id from retention_del_shares);
  delete from public.office_unmatched_look_edits where unmatched_id in (select id from retention_del_unmatched);
  delete from public.office_unmatched where id in (select id from retention_del_unmatched);
  delete from public.office_inspections where parcel_id in (select id from retention_del_parcels);
  delete from public.office_hold_alerts where parcel_id in (select id from retention_del_parcels);
  delete from public.office_envelope_shreds where parcel_id in (select id from retention_del_parcels);
  delete from public.office_not_mine_reports where parcel_id in (select id from retention_del_parcels);
  delete from public.office_creator_check_events where parcel_id in (select id from retention_del_parcels);
  delete from public.office_creator_checks where parcel_id in (select id from retention_del_parcels);
  delete from public.office_police_handovers where parcel_id in (select id from retention_del_parcels);
  delete from public.office_disposals where parcel_id in (select id from retention_del_parcels);
  delete from public.return_address_events where parcel_id in (select id from retention_del_parcels);
  delete from public.return_decrypt_releases where parcel_id in (select id from retention_del_parcels)
     or opened_log_id in (select l.id from public.return_decrypt_log l where l.parcel_id in (select id from retention_del_parcels));
  delete from public.return_decrypt_log where parcel_id in (select id from retention_del_parcels);
  delete from public.decrypt_releases where box_id in (select id from retention_del_boxes)
     or opened_log_id in (select l.id from public.decrypt_log l where l.order_id in (select id from retention_del_orders) or l.box_id in (select id from retention_del_boxes));
  delete from public.decrypt_log where order_id in (select id from retention_del_orders) or box_id in (select id from retention_del_boxes);
  delete from public.refunds where box_id in (select id from retention_del_boxes) or payment_id in (select id from retention_del_payments);
  delete from public.payments where id in (select id from retention_del_payments);
  delete from public.approval_signatures where request_id in (select r.request_id from public.approval_requests r where r.order_id in (select id from retention_del_orders));
  delete from public.approval_requests where order_id in (select id from retention_del_orders);
  delete from public.orders where id in (select id from retention_del_orders);
  get diagnostics v_orders = row_count;

  -- 역조공 — 받는 주소 6자리를 먼저 지운다(사무실 상자가 지워질 때 그 줄을 고치려 들지 않게)
  delete from public.inbound_codes where share_id in (select id from retention_del_shares);
  delete from public.revgift_decrypt_releases where share_id in (select id from retention_del_shares)
     or opened_log_id in (select l.id from public.revgift_decrypt_log l where l.share_id in (select id from retention_del_shares));
  delete from public.revgift_decrypt_log where share_id in (select id from retention_del_shares);
  delete from public.refunds where share_id in (select id from retention_del_shares);
  -- 사무실 상자는 몫과 함께 지워진다(그 상자의 기록은 위에서 지웠다)
  delete from public.revgift_shares where id in (select id from retention_del_shares);
  get diagnostics v_rg_shares = row_count;
  delete from public.revgift_sends d
   where d.id in (select id from retention_old_sends where creator_gone)
     and not exists (select 1 from public.revgift_shares s where s.send_id = d.id);
  get diagnostics v_rg_sends = row_count;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  v_counts := jsonb_build_object('signatures', v_signatures, 'inquiries', v_inquiries, 'orders', v_orders, 'unlinked', v_unlinked, 'access_logs', 0,
                                 'revgift_shares', v_rg_shares, 'revgift_sends', v_rg_sends, 'revgift_unlinked', v_rg_unlinked);
  insert into public.retention_purge_runs (counts) values (v_counts);
  return v_counts;
end $$;

revoke all on function public.retention_purge() from public, anon, authenticated, service_role;
