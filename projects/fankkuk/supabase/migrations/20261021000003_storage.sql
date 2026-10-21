-- 물품 보관소 (DECISIONS 2026-10-21 배송 문제 재정리 네 절 — 「2번은 너의 말대로」·「B로 하자」·「30일, 주문에 잇고 진행」, 시안 v32 「추천대로 가자」).
-- 스펙: inbound-address-code INV-C4 ②-가 (S4h) · INV-C5 (S5f 꼴) · INV-C9 · INV-C10 · INV-C12 · INV-C13 (S13·S13b·S13c), office-workflow INV-W5·W7.
--
-- 1) 보류 줄 칸 둘: look(포장 모양 한 줄, 40자까지 — 직원이 입고 때 적고 운영자가 수정, 수정 기록은 추가만), tier(크기 구간 — 물품 보관소 줄의 「크기」).
--    입고 함수(office_scan_inbound)가 두 값과 원 송장 전화번호 뒤 4자리를 받는다. 4자리는 꼴(숫자 넷)만 여기서 보고,
--    칸·저장·운영자 검색·지우기는 supabase/manual/0023_phone_last4.sql(사람이 적용)에 있다 — 이 파일만 적용된 DB 는 4자리를 받으면 거부(0A000)한다.
--    운영자 목록의 4자리 칸은 읽기 도우미(office_unmatched_phone_last4)를 거친다 — 여기서는 늘 비어 있고 0023 이 칸을 읽게 바꾼다.
-- 2) 물품 보관소 목록(storage_parcels, 로그인한 회원): 6자리 없이 왔고 닉네임 없음이었던 대기 중 보류 상자만, 도착 + 720시간 안.
--    칸은 id · 도착 시각 · 택배사 · 크기 · 포장 모양 · 기한(도착 + 720시간) · 내 확인 대기 여부뿐 — 송장번호·4자리·선반·크리에이터 단서가 없다.
-- 3) 「내 물품 확인」(claim_storage_parcel): 그 줄의 상자 + 송장번호·택배사 + 본인 입고 전 상자 하나. 맞으면 운영자 확인 대기 줄 하나(한 상자에 대기 하나).
--    틀리면 「찾을 수 없어요」(not_found), 고른 상자가 후보가 아니면(남의 상자·끝난 주문·닫힌 상자) not_candidate — 둘 다 INV-C10 의 하루 5번 틀린 시도에 같이 센다.
--    잠금 순서는 찾기(find_held_parcel)와 같다: 송장번호 잠금 → 계정 잠금 → 상자 → 승인 요청 → 주문 → 6자리 → 사무소 상자 줄 → 보류 줄.
-- 4) 운영자 확인 요청 목록(admin_storage_claims) · 입고 처리(admin_accept_storage_claim — INV-C12 의 잇기와 같은 끝: 그 주문 상자로 입고, 6자리 사용됨, 운영자 기록) ·
--    주인 아님(admin_reject_storage_claim — 대기만 풀림). 잇기 판정은 운영자 잇기와 한 함수(office_link_held_box)다.
-- 5) 보류 줄이 이어지거나 반송 대상이 되면 같은 처리에서 대기 중인 확인 요청은 닫힌다(트리거) — 자동 처리의 도착 + 720시간도 같다(S13c).
-- 6) INV-C4 ②-가 (S4h): 운영자 잇기(admin_link_held_parcel)는 닉네임이 맞은 상자를 받지 않는다 — 그 회원이 「받는 주소 없이 보냈어요」에 두 값을 넣어야 이어진다.
--    운영자 잇기·확인의 기한도 도착 + 720시간(INV-C12, 그 전 168시간).
-- 7) 운영자 보류 목록(admin_unmatched_parcels): 기한을 도착 + 720시간으로, 칸 다섯을 더한다 — 포장 모양 · 크기 · 전화번호 뒤 4자리 · 자동 반송 시각 · 물품 보관소에 보이는지.
--    deadline_at 의 뜻은 그대로다(미확인 입고 = 자동 반송 시각, 주문에 묶인 보류 상자 = 운영자가 넘길 수 있는 시각).
-- 개인정보 구역(pii)은 건드리지 않는다.

-- ── 1) 보류 줄 칸 ──
alter table public.office_unmatched add column if not exists look text;
alter table public.office_unmatched add column if not exists tier public.parcel_tier;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'office_unmatched_look_len' and conrelid = 'public.office_unmatched'::regclass) then
    alter table public.office_unmatched add constraint office_unmatched_look_len check (look is null or char_length(look) between 1 and 40);
  end if;
end $$;
comment on column public.office_unmatched.look is '물품 보관소에 보일 포장 모양 한 줄(inbound-address-code INV-C13). 크리에이터 이름·채널·받는 사람을 쓰지 않는다.';
comment on column public.office_unmatched.tier is '직원이 본 크기 구간(물품 보관소의 「크기」, INV-C13).';

create table if not exists public.office_unmatched_look_edits (
  id bigint generated always as identity primary key,
  unmatched_id uuid not null references public.office_unmatched (id),
  before_look text,
  after_look text,
  edited_by uuid not null references public.profiles (id),
  edited_at timestamptz not null default now()
);
alter table public.office_unmatched_look_edits enable row level security;
revoke all on table public.office_unmatched_look_edits from anon, authenticated;
drop trigger if exists office_unmatched_look_edits_no_update on public.office_unmatched_look_edits;
create trigger office_unmatched_look_edits_no_update before update on public.office_unmatched_look_edits for each row execute function public.append_only_log();
drop trigger if exists office_unmatched_look_edits_no_delete on public.office_unmatched_look_edits;
create trigger office_unmatched_look_edits_no_delete before delete on public.office_unmatched_look_edits for each row execute function public.append_only_log();

-- ── 3) 확인 요청 줄 ──
create table if not exists public.office_storage_claims (
  id uuid primary key default gen_random_uuid(),
  unmatched_id uuid not null references public.office_unmatched (id) on delete cascade,
  box_id uuid not null references public.boxes (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'closed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  check ((status = 'pending') = (decided_at is null))
);
-- INV-C13: 한 상자에 대기는 하나
create unique index if not exists office_storage_claims_one_pending on public.office_storage_claims (unmatched_id) where status = 'pending';
create index if not exists office_storage_claims_account on public.office_storage_claims (account_id) where status = 'pending';
alter table public.office_storage_claims enable row level security;
revoke all on table public.office_storage_claims from anon, authenticated;

create or replace function public.office_storage_claims_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception '확인 요청은 대기로만 생긴다' using errcode = '23514';
    end if;
    return new;
  end if;
  if (new.id, new.unmatched_id, new.box_id, new.account_id, new.created_at) is distinct from (old.id, old.unmatched_id, old.box_id, old.account_id, old.created_at) then
    raise exception '확인 요청의 내용은 바꿀 수 없다' using errcode = '55000';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception '끝난 확인 요청은 바꿀 수 없다' using errcode = '55000';
  end if;
  return new;
end $$;
drop trigger if exists office_storage_claims_guard on public.office_storage_claims;
create trigger office_storage_claims_guard before insert or update on public.office_storage_claims for each row execute function public.office_storage_claims_guard();

-- ── 5) 보류 줄이 이어지거나 반송 대상이 되면 대기 중인 확인 요청을 닫는다 ──
create or replace function public.office_unmatched_close_claims()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.office_storage_claims
  set status = 'closed', decided_at = now(), decided_by = auth.uid()
  where unmatched_id = new.id and status = 'pending';
  return null;
end $$;
revoke all on function public.office_unmatched_close_claims() from public, anon, authenticated;
drop trigger if exists office_unmatched_close_claims on public.office_unmatched;
create trigger office_unmatched_close_claims after update of matched_parcel_id, expired_at on public.office_unmatched
  for each row when ((new.matched_parcel_id is not null and old.matched_parcel_id is null) or (new.expired_at is not null and old.expired_at is null))
  execute function public.office_unmatched_close_claims();

-- ── 1) 전화번호 뒤 4자리 자리표 — manual/0023 이 칸을 만들고 두 함수를 바꾼다 ──
create or replace function public.office_unmatched_phone_last4(p_id uuid)
returns text
language sql stable set search_path = ''
as $$
  -- manual/0023 적용 전: 칸이 없다 — 늘 비어 있다
  select null::text;
$$;
revoke all on function public.office_unmatched_phone_last4(uuid) from public, anon, authenticated;

create or replace function public.office_unmatched_set_phone_last4(p_id uuid, p_last4 text)
returns void
language plpgsql set search_path = ''
as $$
begin
  -- manual/0023 적용 전: 받을 칸이 없다 — 값을 버리지 않고 거부한다(입고 전체가 되돌아간다)
  if p_last4 is not null then
    raise exception '전화번호 뒤 4자리 칸이 아직 없다 — manual/0023 적용 전' using errcode = '0A000';
  end if;
end $$;
revoke all on function public.office_unmatched_set_phone_last4(uuid, text) from public, anon, authenticated;

-- ── 1) 입고 함수 — 포장 모양·크기·전화번호 뒤 4자리를 더 받는다(앞 다섯 인자·판정은 20261016000007 과 같다) ──
drop function if exists public.office_scan_inbound(text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.office_scan_inbound(p_barcode text, p_code text, p_carrier text DEFAULT NULL::text, p_sender_name text DEFAULT NULL::text, p_shelf text DEFAULT NULL::text,
  p_look text DEFAULT NULL::text, p_tier public.parcel_tier DEFAULT NULL::public.parcel_tier, p_phone_last4 text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_code text;
  c public.inbound_codes;
  b public.office_parcels;
  f public.office_parcels;
  v public.office_parcels;
  v_order_id uuid;
  v_reason text;
  v_theft boolean := false;
  v_name text := btrim(coalesce(p_sender_name, ''));
  v_shelf text := btrim(coalesce(p_shelf, ''));
  v_look text := nullif(btrim(coalesce(p_look, '')), '');
  v_order_no text;
  v_nick_id uuid;
  v_nickname text;
  v_unmatched_id uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_barcode);
  -- INV-C1·C5: 꼴(22023)·확인 문자(P0046)가 틀리면 그 자리에서 거부 — 아무것도 바꾸지 않는다
  v_code := public.inbound_code_parse(p_code);
  if p_carrier is not null and not public.inbound_carrier_ok(p_carrier) then
    raise exception '택배사 값이 아니다' using errcode = '22023';
  end if;
  if char_length(v_name) > 40 or char_length(v_shelf) > 20 then
    raise exception '보내는 분 이름은 40자, 선반 번호는 20자까지다' using errcode = '22023';
  end if;
  -- INV-C13: 물품 보관소에 보일 포장 모양 한 줄(40자까지). INV-C5: 원 송장 전화번호는 뒤 4자리 숫자만 받는다 — 전체 번호·다른 꼴은 그 자리에서 거부
  if char_length(v_look) > 40 then
    raise exception '포장 모양은 40자까지다' using errcode = '22023';
  end if;
  if p_phone_last4 is not null and p_phone_last4 !~ '^[0-9]{4}$' then
    raise exception '전화번호는 뒤 4자리 숫자만 받는다' using errcode = '22023';
  end if;
  -- W2: 붙였다고 확인하지 않은 라벨이 있으면 다음 상자를 받지 않는다
  if exists (select 1 from public.office_label_pending where operator_id = auth.uid()) then
    raise exception '앞 상자의 라벨 부착을 먼저 확인한다' using errcode = 'P0042';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_barcode, 0));

  if v_code is not null then
    select * into c from public.inbound_codes x
    where x.code = v_code
    order by (x.state = 'valid') desc, coalesce(x.used_at, x.voided_at, x.issued_at) desc
    limit 1;
  end if;

  select * into b from public.office_parcels where inbound_waybill_no = p_barcode;
  if b.id is not null and (c.id is null or (c.box_id is not distinct from b.box_id and c.share_id is not distinct from b.share_id)) then
    select * into b from public.office_parcels where id = b.id for update;
    if b.state = 'received' and b.labeled_at is null
       and not exists (select 1 from public.office_label_pending where parcel_id = b.id) then
      insert into public.office_label_pending (operator_id, parcel_id) values (auth.uid(), b.id);
      select coalesce(o.order_no, s.order_no) into v_order_no
      from public.office_parcels p
      left join public.boxes bx on bx.id = p.box_id left join public.orders o on o.id = bx.order_id
      left join public.revgift_shares s on s.id = p.share_id
      where p.id = b.id;
      return jsonb_build_object('result', 'reprinted', 'qr', b.qr_code, 'order_no', v_order_no, 'reason', null);
    end if;
    raise exception '이미 처리된 상자다' using errcode = '55000';
  end if;
  if exists (select 1 from public.office_unmatched u where u.waybill_no = p_barcode) then
    return jsonb_build_object('result', 'hold_recorded', 'qr', null, 'order_no', null, 'reason', null);
  end if;

  if c.id is not null and c.state = 'valid' and b.id is null then
    if c.box_id is not null then
      select bx.order_id into v_order_id from public.boxes bx where bx.id = c.box_id for key share;
      perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
      perform 1 from public.orders o where o.id = v_order_id for update;
    else
      perform 1 from public.revgift_shares s where s.id = c.share_id for update;
    end if;
    select * into c from public.inbound_codes where id = c.id for update;
  end if;

  if b.id is not null then
    v_reason := 'barcode_bound';
  elsif v_code is null then
    v_reason := 'no_code';
  elsif c.id is null then
    v_reason := 'unknown_code';
  elsif c.state = 'void' then
    v_reason := 'void_code';
  elsif c.state = 'used' then
    select * into f from public.office_parcels where id = c.first_parcel_id for update;
    if f.id is not null and f.state = 'shipped' then
      v_reason := 'used_code';
      v_theft := true;
    else
      v_reason := 'code_dispute';
    end if;
  elsif exists (
    select 1 from public.office_parcels x
    where x.tracking_no = p_barcode
      and (x.tracking_dispute or x.box_id is distinct from c.box_id or x.share_id is distinct from c.share_id)
  ) then
    v_reason := 'waybill_dispute';
  end if;

  if v_reason is null then
    select * into v from public.office_parcels x
    where (c.box_id is not null and x.box_id = c.box_id) or (c.share_id is not null and x.share_id = c.share_id)
    for update;
    if v.id is null then
      insert into public.office_parcels (box_id, share_id) values (c.box_id, c.share_id) returning * into v;
    end if;
    if v.state <> 'awaiting' then
      raise exception '이미 입고된 상자다' using errcode = '55000';
    end if;
    update public.office_parcels set inbound_waybill_no = p_barcode, state = 'received', received_at = now()
    where id = v.id returning * into v;
    update public.inbound_codes set state = 'used', used_at = now(), first_parcel_id = v.id where id = c.id;
    insert into public.office_label_pending (operator_id, parcel_id) values (auth.uid(), v.id);
    perform public.office_sync(v.id);
    perform public.notification_enqueue_box_arrived(v.id);
    select coalesce(o.order_no, s.order_no) into v_order_no
    from public.office_parcels p
    left join public.boxes bx on bx.id = p.box_id left join public.orders o on o.id = bx.order_id
    left join public.revgift_shares s on s.id = p.share_id
    where p.id = v.id;
    return jsonb_build_object('result', 'received', 'qr', v.qr_code, 'order_no', v_order_no, 'reason', null);
  end if;

  -- 보류: 택배사·송장 「보내는 분」 이름·선반 번호가 있어야 기록한다
  if p_carrier is null or char_length(v_name) = 0 or char_length(v_shelf) = 0 then
    return jsonb_build_object('result', 'need_details', 'qr', null, 'order_no', null, 'reason', v_reason);
  end if;
  -- INV-C5: 이름을 닉네임과 비교(대소문자·앞뒤 공백 무시 — 닉네임 유일 인덱스와 같은 값). 맞는 계정만 남기고 이름 글자는 남기지 않는다.
  select p.id, p.nickname into v_nick_id, v_nickname from public.profiles p where lower(btrim(p.nickname)) = lower(v_name);
  if v_reason = 'code_dispute' and f.id is not null then
    update public.office_parcels
    set hold_reason = coalesce(hold_reason, 'code_dispute'), hold_at = coalesce(hold_at, now())
    where id = f.id;
  end if;
  if v_reason = 'waybill_dispute' then
    update public.office_parcels set tracking_dispute = true where tracking_no = p_barcode;
  end if;
  insert into public.office_unmatched (waybill_no, nickname_profile_id, shelf, recorded_by, carrier, reason, code_id, suspected_theft, look, tier)
  values (p_barcode, v_nick_id, v_shelf, auth.uid(), p_carrier, v_reason, c.id, v_theft, v_look, p_tier)
  returning id into v_unmatched_id;
  -- INV-C5 (2026-10-21): 6자리 없이 온 상자만 원 송장 전화번호 뒤 4자리를 적는다. 칸과 저장은 manual/0023(사람이 적용) — 적용 전에는 값을 받으면 거부된다
  if p_phone_last4 is not null and public.inbound_held_without_code(v_reason) then
    perform public.office_unmatched_set_phone_last4(v_unmatched_id, p_phone_last4);
  end if;
  -- INV-N21: 6자리 없이 온 상자가 닉네임과 맞으면 같은 처리에서 그 팬에게 한 번(결제 완료·입고 전 주문이 있을 때만 — 함수가 본다)
  if public.inbound_held_without_code(v_reason) and v_nick_id is not null then
    perform public.notification_enqueue_box_no_code(v_unmatched_id);
  end if;
  return jsonb_build_object('result', 'hold', 'qr', null, 'order_no', null, 'reason', v_reason, 'nickname', v_nickname);
end $function$;

revoke all on function public.office_scan_inbound(text, text, text, text, text, text, public.parcel_tier, text) from public, anon;
grant execute on function public.office_scan_inbound(text, text, text, text, text, text, public.parcel_tier, text) to authenticated;

-- ── 4)·6) 잇기 판정 한 곳 — 운영자 잇기(INV-C12)와 물품 보관소 입고 처리(INV-C13)가 같이 쓴다 ──
-- p_claim_id 가 있으면 그 확인 요청을 잠그고 대기인지·같은 상자·같은 계정인지 본 뒤 「입고 처리」로 닫는다.
create or replace function public.office_link_held_box(p_unmatched_id uuid, p_box_id uuid, p_fan uuid, p_claim_id uuid)
returns text
language plpgsql set search_path = ''
as $$
declare
  u public.office_unmatched;
  c public.inbound_codes;
  t public.office_parcels;
  v public.office_parcels;
  k public.office_storage_claims;
  v_order_id uuid;
begin
  -- 보류 줄은 잠그지 않고 먼저 읽어 바코드를 안다 — 그 번호의 입고·찾기와 같은 번호 잠금을 먼저 건다
  select * into u from public.office_unmatched where id = p_unmatched_id;
  if u.id is null then
    raise exception '없는 보류 상자다' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || u.waybill_no, 0));

  -- 잠금 순서(office-workflow INV-W12, 찾기와 같다): 상자 줄 → 승인 요청 → 주문 줄 → 6자리 → 상자 작업 줄 → 보류 줄 → 확인 요청 줄
  select b.order_id into v_order_id from public.boxes b join public.orders o on o.id = b.order_id
  where b.id = p_box_id and o.fan_id = p_fan
  for update of b;
  if v_order_id is null then
    raise exception '후보가 아닌 상자다' using errcode = 'P0047';
  end if;
  perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
  perform 1 from public.orders o where o.id = v_order_id for update;
  select * into c from public.inbound_codes x where x.box_id = p_box_id for update;
  select * into t from public.office_parcels x where x.box_id = p_box_id for update;
  -- 잠근 뒤 후보를 다시 본다 — 그 계정의 결제 완료·입고 전·닫히지 않은 상자만(남의 주문·결제 대기·끝난 주문·이미 온 상자는 후보 아님)
  if not public.fan_box_before_inbound(p_box_id, p_fan) then
    raise exception '후보가 아닌 상자다' using errcode = 'P0047';
  end if;

  select * into u from public.office_unmatched where id = p_unmatched_id for update;
  -- 6자리 없이 온 상자만, 아직 이어지지 않았고 반송 대상이 아니며 도착 + 720시간 안(INV-C12, 2026-10-21 — 그 전 168시간)
  if u.matched_parcel_id is not null or u.expired_at is not null or not public.inbound_held_without_code(u.reason)
     or u.arrived_at <= now() - interval '720 hours'
     or exists (select 1 from public.office_parcels y where y.inbound_waybill_no = u.waybill_no) then
    raise exception '이미 이어졌거나 반송 대상이거나 기한이 지난 보류 상자다' using errcode = '55000';
  end if;
  -- INV-C4 ②-가 (2026-10-21): 닉네임이 맞은 상자는 운영자가 잇지 않는다 — 그 회원이 두 값을 넣어야 이어진다(남의 닉네임을 적어 보낸 상자가 그 이름으로 나가지 않게)
  if u.nickname_profile_id is not null then
    raise exception '닉네임이 맞은 상자는 그 회원이 직접 찾는다' using errcode = 'P0047';
  end if;
  -- INV-C7: 같은 송장번호를 다른 상자에 등록해 둔 사람이 있으면 분쟁 사안 — 운영자가 손으로 고르지 않는다
  if exists (select 1 from public.office_parcels y where y.tracking_no = u.waybill_no and y.box_id is distinct from p_box_id) then
    raise exception '다른 상자에 같은 송장번호가 등록돼 있다' using errcode = 'P0048';
  end if;
  if p_claim_id is not null then
    select * into k from public.office_storage_claims where id = p_claim_id for update;
    if k.id is null or k.status <> 'pending' or k.unmatched_id <> u.id or k.box_id <> p_box_id or k.account_id <> p_fan then
      raise exception '대기 중인 확인 요청이 아니다' using errcode = '55000';
    end if;
    -- 보류 줄이 이어질 때 대기 줄을 닫는 트리거보다 먼저 「입고 처리」로 끝낸다
    update public.office_storage_claims set status = 'accepted', decided_at = now(), decided_by = auth.uid() where id = k.id;
  end if;

  if t.id is null then
    insert into public.office_parcels (box_id, inbound_waybill_no, state, received_at)
    values (p_box_id, u.waybill_no, 'received', u.arrived_at)
    returning * into v;
  else
    update public.office_parcels set inbound_waybill_no = u.waybill_no, state = 'received', received_at = u.arrived_at
    where id = t.id returning * into v;
  end if;
  insert into public.office_held_links (unmatched_id, parcel_id, account_id, linked_by, contents_checked)
  values (u.id, v.id, p_fan, auth.uid(), true);
  perform public.office_finish_held_receive(u.id, v.id, c.id);
  return 'linked';
end $$;
revoke all on function public.office_link_held_box(uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.admin_link_held_parcel(p_id uuid, p_nickname text, p_box_id uuid, p_checked boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_fan uuid;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  -- 상자를 고르지 않고(닉네임만으로) 잇는 꼴은 없다(INV-C4 ②-가 S4h)
  if p_id is null or p_box_id is null or p_checked is not true then
    raise exception '송장번호·내용물 확인 표시와 보류 상자·주문 상자가 필요하다' using errcode = '22023';
  end if;
  select p.id into v_fan from public.profiles p where lower(btrim(p.nickname)) = lower(btrim(coalesce(p_nickname, '')));
  if v_fan is null then
    raise exception '없는 닉네임이다' using errcode = 'P0002';
  end if;
  return public.office_link_held_box(p_id, p_box_id, v_fan, null);
end $$;

-- ── 2) 회원 물품 보관소 목록 ──
create or replace function public.storage_parcels()
returns table (id uuid, arrived_at timestamptz, carrier text, tier text, look text, deadline_at timestamptz, claim_pending boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  return query
  select u.id, u.arrived_at, u.carrier, u.tier::text, u.look, u.arrived_at + interval '720 hours',
         exists (select 1 from public.office_storage_claims k where k.unmatched_id = u.id and k.status = 'pending' and k.account_id = v_uid)
  from public.office_unmatched u
  where public.inbound_held_without_code(u.reason) and u.code_id is null and u.nickname_profile_id is null
    and u.matched_parcel_id is null and u.expired_at is null and u.arrived_at > now() - interval '720 hours'
    and not exists (select 1 from public.office_parcels y where y.inbound_waybill_no = u.waybill_no)
  order by u.arrived_at desc, u.id
  limit 500;
end $$;
revoke all on function public.storage_parcels() from public, anon;
grant execute on function public.storage_parcels() to authenticated;

-- 「내 물품 확인」 창의 선물 선택 — 본인의 결제 끝·입고 전·닫히지 않은 상자만
create or replace function public.storage_claim_candidates()
returns table (box_id uuid, label text, item_kind text, creator_name text, paid_at timestamptz, tier text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  return query
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         o.item_kind, c.name, o.registered_at, b.declared_tier::text
  from public.orders o
  join public.boxes b on b.order_id = o.id
  join public.creators c on c.id = o.creator_id
  where o.fan_id = v_uid and public.fan_box_before_inbound(b.id, v_uid)
  order by o.registered_at, b.seq
  limit 50;
end $$;
revoke all on function public.storage_claim_candidates() from public, anon;
grant execute on function public.storage_claim_candidates() to authenticated;

-- ── 3) 「내 물품 확인」 ──
create or replace function public.claim_storage_parcel(p_id uuid, p_box_id uuid, p_waybill text, p_carrier text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_waybill text;
  v_order_id uuid;
  v_ok boolean := false;
  u public.office_unmatched;
  v_result text := 'not_found';
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  if p_id is null or p_box_id is null or p_carrier is null or not public.inbound_carrier_ok(p_carrier) then
    raise exception '보관소 상자·선물 상자와 택배사가 필요하다' using errcode = '22023';
  end if;
  -- 보류 줄의 바코드는 잠그지 않고 먼저 읽는다 — 그 번호의 입고·찾기·잇기와 같은 번호 잠금을 건다(없는 줄이면 넣은 번호로)
  select x.waybill_no into v_waybill from public.office_unmatched x where x.id = p_id;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || coalesce(v_waybill, p_waybill), 0));
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.find:' || v_uid::text, 0));
  -- INV-C10: 그날(서울 날짜)의 틀린 시도만 센다 — 「받는 주소 없이 보냈어요」·「내 상자 찾기」와 같이
  if (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched
        and a.at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) >= 5 then
    raise exception '오늘은 더 찾을 수 없다' using errcode = 'P0045';
  end if;

  -- 잠금 순서(찾기와 같다): 상자 줄 → 승인 요청 줄 → 주문 줄 → 6자리 줄 → 상자 작업 줄 → 보류 줄
  select b.order_id into v_order_id from public.boxes b join public.orders o on o.id = b.order_id
  where b.id = p_box_id and o.fan_id = v_uid
  for update of b;
  if v_order_id is not null then
    perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
    perform 1 from public.orders o where o.id = v_order_id for update;
    perform 1 from public.inbound_codes x where x.box_id = p_box_id for update;
    perform 1 from public.office_parcels x where x.box_id = p_box_id for update;
    -- 끝난 주문(거절·반려·취소)·「도착하지 않음」으로 닫힌 상자·이미 온 상자는 후보가 아니다
    v_ok := public.fan_box_before_inbound(p_box_id, v_uid);
  end if;

  if not v_ok then
    v_result := 'not_candidate';
  else
    select * into u from public.office_unmatched x where x.id = p_id for update;
    if u.id is not null
       and public.inbound_held_without_code(u.reason) and u.code_id is null and u.nickname_profile_id is null
       and u.matched_parcel_id is null and u.expired_at is null and u.arrived_at > now() - interval '720 hours'
       and not exists (select 1 from public.office_parcels y where y.inbound_waybill_no = u.waybill_no)
       and u.waybill_no = p_waybill and u.carrier = p_carrier then
      if exists (select 1 from public.office_storage_claims k
                 where k.unmatched_id = u.id and k.status = 'pending' and k.account_id = v_uid and k.box_id = p_box_id) then
        v_result := 'pending'; -- 같은 요청을 다시 보냄 — 줄을 더 만들지 않는다
      elsif not exists (select 1 from public.office_storage_claims k where k.unmatched_id = u.id and k.status = 'pending') then
        insert into public.office_storage_claims (unmatched_id, box_id, account_id) values (u.id, p_box_id, v_uid);
        v_result := 'pending';
      end if;
      -- 다른 회원의 대기가 있으면 「찾을 수 없어요」(이유를 나누지 않는다)
    end if;
  end if;

  insert into public.office_match_attempts (profile_id, matched) values (v_uid, v_result = 'pending');
  if v_result <> 'pending' and (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched and a.at > now() - interval '24 hours') >= 3 then
    insert into public.office_find_flags (profile_id) values (v_uid)
    on conflict (profile_id) do update set last_flagged_at = now();
  end if;
  return v_result;
end $$;
revoke all on function public.claim_storage_parcel(uuid, uuid, text, text) from public, anon;
grant execute on function public.claim_storage_parcel(uuid, uuid, text, text) to authenticated;

-- ── 4) 운영자 확인 요청 목록 · 입고 처리 · 주인 아님 ──
create or replace function public.admin_storage_claims()
returns table (claim_id uuid, unmatched_id uuid, requested_at timestamptz, nickname text, waybill_no text, carrier text,
               order_no text, box_label text, tier text, shelf text, arrived_at timestamptz, look text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  return query
  select k.id, u.id, k.created_at, pr.nickname, u.waybill_no, u.carrier, o.order_no,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, u.shelf, u.arrived_at, u.look
  from public.office_storage_claims k
  join public.office_unmatched u on u.id = k.unmatched_id
  join public.profiles pr on pr.id = k.account_id
  join public.boxes b on b.id = k.box_id
  join public.orders o on o.id = b.order_id
  where k.status = 'pending'
  order by k.created_at, k.id
  limit 500;
end $$;
revoke all on function public.admin_storage_claims() from public, anon;
grant execute on function public.admin_storage_claims() to authenticated;

create or replace function public.admin_accept_storage_claim(p_claim_id uuid, p_checked boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  k public.office_storage_claims;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_claim_id is null or p_checked is not true then
    raise exception '송장번호·내용물 확인 표시와 확인 요청이 필요하다' using errcode = '22023';
  end if;
  -- 요청 줄은 잠그지 않고 읽는다 — 잠금은 잇기 판정이 보류 줄 다음에 건다(INV-W12 순서)
  select * into k from public.office_storage_claims where id = p_claim_id;
  if k.id is null then
    raise exception '없는 확인 요청이다' using errcode = 'P0002';
  end if;
  if k.status <> 'pending' then
    raise exception '대기 중인 확인 요청이 아니다' using errcode = '55000';
  end if;
  return public.office_link_held_box(k.unmatched_id, k.box_id, k.account_id, k.id);
end $$;
revoke all on function public.admin_accept_storage_claim(uuid, boolean) from public, anon;
grant execute on function public.admin_accept_storage_claim(uuid, boolean) to authenticated;

create or replace function public.admin_reject_storage_claim(p_claim_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  k public.office_storage_claims;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  select * into k from public.office_storage_claims where id = p_claim_id for update;
  if k.id is null then
    raise exception '없는 확인 요청이다' using errcode = 'P0002';
  end if;
  if k.status <> 'pending' then
    raise exception '대기 중인 확인 요청이 아니다' using errcode = '55000';
  end if;
  update public.office_storage_claims set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = k.id;
end $$;
revoke all on function public.admin_reject_storage_claim(uuid) from public, anon;
grant execute on function public.admin_reject_storage_claim(uuid) to authenticated;

-- 포장 모양 수정 — 대기 중인 보류 줄만, 수정 기록(전·후·누가·언제)은 추가만
create or replace function public.admin_set_unmatched_look(p_id uuid, p_look text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  u public.office_unmatched;
  v_look text := nullif(btrim(coalesce(p_look, '')), '');
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if char_length(v_look) > 40 then
    raise exception '포장 모양은 40자까지다' using errcode = '22023';
  end if;
  select * into u from public.office_unmatched where id = p_id for update;
  if u.id is null then
    raise exception '없는 보류 상자다' using errcode = 'P0002';
  end if;
  if u.matched_parcel_id is not null or u.expired_at is not null then
    raise exception '이미 이어졌거나 반송 대상인 상자다' using errcode = '55000';
  end if;
  if u.look is not distinct from v_look then
    return;
  end if;
  insert into public.office_unmatched_look_edits (unmatched_id, before_look, after_look, edited_by) values (u.id, u.look, v_look, auth.uid());
  update public.office_unmatched set look = v_look where id = u.id;
end $$;
revoke all on function public.admin_set_unmatched_look(uuid, text) from public, anon;
grant execute on function public.admin_set_unmatched_look(uuid, text) to authenticated;

-- ── 7) 운영자 보류 목록 ──
drop function if exists public.admin_unmatched_parcels();
create function public.admin_unmatched_parcels()
returns table (id uuid, source text, qr text, waybill_no text, carrier text, arrived_at timestamptz, nickname text, shelf text, reason text,
               suspected_theft boolean, state text, deadline_at timestamptz, share_movable boolean,
               look text, tier text, phone_last4 text, auto_return_at timestamptz, in_storage boolean)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select u.id, 'unmatched'::text, null::text, u.waybill_no, u.carrier, u.arrived_at, pr.nickname, u.shelf,
           u.reason, u.suspected_theft,
           case when u.matched_parcel_id is not null then 'matched' when u.expired_at is not null then 'expired' else 'waiting' end,
           -- 미확인 입고의 기한 = 자동 반송(도착 + 720시간, 2026-10-21 — 그 전 168시간)
           u.arrived_at + interval '720 hours',
           -- 운영자 몫 옮기기(INV-C11)를 받는 줄 — 찾기(②-나)로 이은 6자리 없는 역조공 상자이고 검수 완료 전·보류 아님(admin_move_held_share 와 같은 판정)
           coalesce(u.code_id is null and mp.share_id is not null and mp.state in ('received', 'labeled') and mp.hold_reason is null, false),
           u.look, u.tier::text,
           -- 전화번호 뒤 4자리(INV-C5·C12 ③) — 칸은 manual/0023. 적용 전에는 늘 비어 있다
           public.office_unmatched_phone_last4(u.id),
           u.arrived_at + interval '720 hours',
           -- 회원 물품 보관소에 보이는 줄인가(storage_parcels 와 같은 판정)
           coalesce(public.inbound_held_without_code(u.reason) and u.code_id is null and u.nickname_profile_id is null
                    and u.matched_parcel_id is null and u.expired_at is null and u.arrived_at > now() - interval '720 hours', false)
    from public.office_unmatched u
    left join public.office_parcels mp on mp.id = u.matched_parcel_id
    left join public.profiles pr on pr.id = u.nickname_profile_id
    union all
    select p.id, 'parcel', p.qr_code, p.inbound_waybill_no, null, p.received_at, null, null,
           p.hold_reason,
           p.hold_reason in ('not_mine', 'detached') or exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
           case when p.hold_closed_at is not null then 'expired' else 'on_hold' end,
           -- 주문에 묶인 보류 상자: 운영자가 넘길 수 있는 시각(분쟁은 보류 + 168시간) — 뜻은 그대로
           p.hold_at + interval '168 hours',
           false,
           null, null, null,
           -- 자동 넘기기: 도착 + 720시간, 분쟁은 보류 + 168시간보다 앞서지 않는다(INV-C9 S9e)
           greatest(p.received_at + interval '720 hours',
                    case when p.hold_reason in ('code_dispute', 'waybill_dispute') then p.hold_at + interval '168 hours' end),
           false
    from public.office_parcels p
    where p.hold_reason is not null
  ) h (id, source, qr, waybill_no, carrier, arrived_at, nickname, shelf, reason, suspected_theft, state, deadline_at, share_movable,
       look, tier, phone_last4, auto_return_at, in_storage)
  where public.is_operator()
  order by (h.state in ('waiting', 'on_hold')) desc, h.arrived_at desc nulls last
  limit 500;
$$;
revoke all on function public.admin_unmatched_parcels() from public, anon;
grant execute on function public.admin_unmatched_parcels() to authenticated;

notify pgrst, 'reload schema';
