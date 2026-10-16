-- 6자리 없이 온 팬 선물 상자를 닉네임으로 찾기 (docs/specs/inbound-address-code.md INV-C4 ②-가 · INV-C5 끝 문단 · INV-C9 · INV-C12,
-- office-workflow INV-W5·W7·W12, notifications INV-N21 — 2026-10-16 카드 d94).
--
-- 1) 미확인 입고 표(office_unmatched): 직원이 넣던 「보낸 사람 이름 앞 1글자」 칸(sender_initial)을 없애고, 송장 「보내는 분」 이름이
--    팬꾹 닉네임과 맞은 계정 칸(nickname_profile_id)을 둔다. 직원이 넣은 이름 글자는 어디에도 저장하지 않는다(INV-C5·W7).
--    남은 행: 앞 1글자는 새 규칙에서 쓰지 않는 값이라 칸째 지운다. 그 행들은 닉네임 칸이 비어 「닉네임 없음」이 되고,
--    주인은 운영자 확인(INV-C12)으로만 이어진다. 적용 전 로컬 DB 의 행은 0건이었다(2026-10-16 셈) — 운영 DB 는 적용 전에 센다:
--      select count(*) from public.office_unmatched where matched_parcel_id is null and expired_at is null;
-- 2) 입고(office_scan_inbound): p_sender_initial → p_sender_name. 서버가 lower(btrim()) 로 닉네임과 비교한다(닉네임 유일 인덱스와 같은 비교,
--    20261015000001). 6자리 없이 온 상자가 닉네임과 맞고 그 계정에 결제가 끝났고 입고 전인 팬 선물 주문이 있으면 같은 처리에서
--    「코드 없이 온 상자」 알림 줄을 넣는다(INV-N21, 상자마다 한 번 — 줄 이름에 보류 상자 칸).
-- 3) 팬의 찾기(find_held_parcel): 이름 글자 인자를 뺀다. 팬 상자는 송장번호·택배사가 같고 그 보류 상자가 로그인한 팬과 닉네임이 맞았을 때만(INV-C4 ②-가).
--    역조공 몫(크리에이터)은 송장번호·택배사 두 값(INV-C4 ②-나 — 이름 첫 글자 칸 없음).
--    시도 횟수(INV-C10, 카드 d92): 그날(서울 날짜)의 틀린 시도만 5번 — 맞힌 찾기는 세지 않는다. 운영자 확인 표시(24시간 안 틀린 3번)는 그대로.
-- 4) 운영자 확인 목록(admin_unmatched_parcels): 이름 앞 1글자 칸 대신 닉네임 일치면 그 닉네임(INV-C9).
-- 5) 운영자 잇기(admin_link_held_parcel)와 그 후보 읽기(admin_held_link_candidates), 잇기 기록 표(office_held_links, 추가만) — INV-C12.
--    운영자(직원·대표)만. 6자리 없이 온(붙어 온 6자리 줄이 없는) 보류 상자를 문의한 계정(닉네임으로 고름)의 결제 완료·입고 전 팬 선물 상자에만.
--    「송장번호·내용물 확인함」 표시가 없으면 거부. 잠금 순서는 찾기와 같다(번호 잠금 → 상자 줄 → 승인 요청 → 주문 → 6자리 → 상자 작업 줄 → 보류 줄, INV-W12).
--
-- 다시 적용해도 결과가 같다(칸·표·색인은 if not exists / if exists, 제약은 drop if exists 뒤 add, 함수는 drop if exists 뒤 create 또는 create or replace).
-- 오류 꼴: 42501 권한 없음 · 22023 입력 꼴(확인 표시 없음 포함) · P0002 없음 · 55000 이미 이어짐·반송 대상·기한 지남·6자리가 붙어 온 상자
--          · P0047 후보 아님(남의 주문·결제 대기·이미 온 상자·닉네임이 맞은 다른 계정의 상자) · P0048 같은 송장번호가 다른 상자에 등록됨(분쟁)

-- ── 1) 미확인 입고 표 ─────────────────────────────────────────

alter table public.office_unmatched add column if not exists nickname_profile_id uuid references public.profiles (id) on delete set null;
create index if not exists office_unmatched_nickname_idx on public.office_unmatched (nickname_profile_id) where nickname_profile_id is not null;
alter table public.office_unmatched drop column if exists sender_initial;

-- ── 5-가) 운영자 잇기 기록 (INV-C12 — 추가만) ─────────────────────────

create table if not exists public.office_held_links (
  id bigint generated always as identity primary key,
  unmatched_id uuid not null unique references public.office_unmatched (id),
  parcel_id uuid not null references public.office_parcels (id),
  account_id uuid not null references public.profiles (id),
  linked_by uuid not null references public.profiles (id),
  contents_checked boolean not null check (contents_checked),
  linked_at timestamptz not null default now()
);
alter table public.office_held_links enable row level security;
revoke all on public.office_held_links from public, anon, authenticated;
create or replace trigger office_held_links_no_update before update on public.office_held_links
  for each row execute function public.append_only_log();
create or replace trigger office_held_links_no_delete before delete on public.office_held_links
  for each row execute function public.append_only_log();

-- ── 2-가) 「코드 없이 온 상자」 알림 종류 (INV-N21) ─────────────────────

alter table public.notification_outbox add column if not exists unmatched_id uuid references public.office_unmatched (id) on delete cascade;

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check', 'box_no_code'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check', 'box_no_code'
]));
-- 보류 상자를 가리키는 종류는 이것 하나 — 상자마다 한 번이 줄 이름(notification_outbox_once)으로 지켜진다
alter table public.notification_outbox drop constraint if exists notification_outbox_unmatched_kind;
alter table public.notification_outbox add constraint notification_outbox_unmatched_kind
  check ((kind = 'box_no_code') = (unmatched_id is not null));
drop index if exists public.notification_outbox_once;
create unique index notification_outbox_once
  on public.notification_outbox (kind, order_id, approval_request_id, parcel_id, unmatched_id, round, account_id, channel) nulls not distinct;

-- 20261007000007 의 지킴이와 같고, 줄 이름에 보류 상자 칸을 더했다.
create or replace function public.notification_outbox_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.attempts <> 0 then
      raise exception '발송 대기 줄은 대기로만 생긴다' using errcode = '23514';
    end if;
  else
    if old.status in ('sent', 'failed', 'skipped') then
      raise exception '끝난 발송 줄은 바꿀 수 없다' using errcode = '55000';
    end if;
    if (new.kind, new.order_id, new.approval_request_id, new.parcel_id, new.unmatched_id, new.round, new.account_id, new.channel, new.event_at, new.created_at)
       is distinct from (old.kind, old.order_id, old.approval_request_id, old.parcel_id, old.unmatched_id, old.round, old.account_id, old.channel, old.event_at, old.created_at) then
      raise exception '발송 줄의 이름은 바꿀 수 없다' using errcode = '55000';
    end if;
    if not (
      (old.status = 'pending' and new.status in ('pending', 'sending', 'skipped', 'failed'))
      or (old.status = 'sending' and new.status in ('pending', 'sent', 'failed', 'skipped'))
    ) then
      raise exception '발송 줄 상태를 % 에서 % 로 바꿀 수 없다', old.status, new.status using errcode = '55000';
    end if;
  end if;
  if new.fake and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_notifications') then
    raise exception '가짜 발송 표시는 이 DB 에서 받지 않는다' using errcode = '42501';
  end if;
  return new;
end $$;

-- notifications INV-N6 표: 끌 수 없음 11종(코드 없이 온 상자 — 168시간 안에 찾지 않으면 착불 반송, 카드 d94). 모르는 종류·빈 값은 거짓.
create or replace function public.notification_kind_must_deliver(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_kind = any (array[
    'approval_request', 'hold', 'creator_check', 'hold_fan', 'box_missing', 'gift_pending_box', 'gift_undelivered',
    'difference_due', 'payment_canceled', 'difference_canceled', 'box_no_code'
  ]), false);
$$;

-- ── 공통: 「6자리 없이 온 상자」 — 보류 사유가 6자리 없음(no_code)·없는 6자리(unknown_code) 둘. 붙어 온 6자리 줄이 없는 상자다.
-- 알림(INV-N21)·운영자 잇기(INV-C12)가 이 하나를 쓴다(앱의 잇기 버튼은 entities/parcel 의 HELD_WITHOUT_CODE_REASONS 가 같은 목록).
create or replace function public.inbound_held_without_code(p_reason text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(p_reason in ('no_code', 'unknown_code'), false);
$$;

-- ── 공통: 팬 선물 상자가 「결제가 끝났고 아직 입고 전」인가 (INV-C4 ②-가 · C12 · N21 이 같은 판정을 쓴다) ──
-- 그 팬의 주문이고, 주문이 결제 뒤 진행 중(registered~inspected — find_held_parcel 과 같은 범위)이며, 도착하지 않음으로 닫히지 않았고,
-- 상자 작업 줄이 없거나 아직 대기(awaiting)인 상자.
create or replace function public.fan_box_before_inbound(p_box_id uuid, p_fan_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = p_box_id and o.fan_id = p_fan_id and b.missing_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and not exists (select 1 from public.office_parcels p where p.box_id = b.id and p.state <> 'awaiting')
  );
$$;

-- 「코드 없이 온 상자」 알림 줄(INV-N21): 보류 상자 하나 → 닉네임이 맞은 계정에게, 결제 완료·입고 전 팬 선물 주문이 있을 때만.
-- 줄은 그 계정의 가장 먼저 결제한 해당 주문을 가리킨다(링크가 그 주문의 「받는 주소 없이 보냈어요」로 간다). 본문 칸은 없다(INV-N1).
create or replace function public.notification_enqueue_box_no_code(p_unmatched_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_order_id uuid;
  v_count integer;
begin
  select u.nickname_profile_id into v_account from public.office_unmatched u where u.id = p_unmatched_id;
  if v_account is null then
    return 0;
  end if;
  select o.id into v_order_id
  from public.orders o
  where o.fan_id = v_account
    and exists (select 1 from public.boxes b where b.order_id = o.id and public.fan_box_before_inbound(b.id, v_account))
  order by o.registered_at, o.id
  limit 1;
  if v_order_id is null then
    return 0;
  end if;
  insert into public.notification_outbox (kind, order_id, unmatched_id, round, account_id, channel, event_at)
  select 'box_no_code', v_order_id, p_unmatched_id, 1, v_account, ch.channel, now()
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email'
     or exists (select 1 from public.notification_kakao_templates t where t.kind = 'box_no_code')
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ── 2) 입고 ─────────────────────────────────────────────────

-- 20261007000007 과 같고, 보류 때 받는 값이 「이름 앞 1글자」에서 송장 「보내는 분」 이름(1~40자)으로 바뀌었다.
-- 그 이름은 닉네임 비교에만 쓰고 저장하지 않는다(INV-C5·W7). 보류 결과에 닉네임 일치면 그 닉네임을 돌려준다(작업 화면 표시용 — INV-C9 의 운영자 칸과 같은 값).
drop function if exists public.office_scan_inbound(text, text, text, text, text);
create function public.office_scan_inbound(
  p_barcode text,
  p_code text,
  p_carrier text default null,
  p_sender_name text default null,
  p_shelf text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
  insert into public.office_unmatched (waybill_no, nickname_profile_id, shelf, recorded_by, carrier, reason, code_id, suspected_theft)
  values (p_barcode, v_nick_id, v_shelf, auth.uid(), p_carrier, v_reason, c.id, v_theft)
  returning id into v_unmatched_id;
  -- INV-N21: 6자리 없이 온 상자가 닉네임과 맞으면 같은 처리에서 그 팬에게 한 번(결제 완료·입고 전 주문이 있을 때만 — 함수가 본다)
  if public.inbound_held_without_code(v_reason) and v_nick_id is not null then
    perform public.notification_enqueue_box_no_code(v_unmatched_id);
  end if;
  return jsonb_build_object('result', 'hold', 'qr', null, 'order_no', null, 'reason', v_reason, 'nickname', v_nickname);
end $$;

-- 서울 날짜 판정에 쓰는 색인 — 계정별 틀린 시도를 시각 순으로 찾는다
create index if not exists office_match_attempts_wrong_idx on public.office_match_attempts (profile_id, at) where not matched;

-- 보류 상자를 상자 작업 줄로 받은 뒤의 마무리 — 찾기(INV-C4 ②)와 운영자 잇기(INV-C12)가 같이 쓴다.
-- 부르는 쪽이 상자 줄 → 승인 요청 → 주문 → 6자리 → 상자 작업 줄 → 보류 줄을 이미 잠갔다(INV-W12). 여기서는 잠금 순서를 바꾸지 않는다:
-- 보류 상자 이어짐 표시 → 6자리 사용됨(6자리로 입고될 때와 같은 끝, INV-C5) → 주문 단계 맞추기(주문 행을 먼저 무겁게) → 상자 도착 알림 줄.
create or replace function public.office_finish_held_receive(p_unmatched_id uuid, p_parcel_id uuid, p_code_id uuid)
returns void
language plpgsql set search_path = ''
as $f$
begin
  update public.office_unmatched set matched_parcel_id = p_parcel_id, matched_at = now() where id = p_unmatched_id;
  if p_code_id is not null then
    update public.inbound_codes
    set state = case when state = 'valid' then 'used' else state end,
        used_at = case when state = 'valid' then now() else used_at end,
        first_parcel_id = p_parcel_id
    where id = p_code_id;
  end if;
  -- 알림 줄을 먼저 넣으면 주문 행에 가벼운 잠금이 걸려 같은 주문의 상자 둘이 동시에 올 때 교착(40P01)이 난다 — 단계 맞추기가 먼저
  perform public.office_sync(p_parcel_id);
  perform public.notification_enqueue_box_arrived(p_parcel_id);
end $f$;

-- ── 3) 주인의 찾기 ──────────────────────────────────────────

-- 20261008000009 와 같고, 이름 앞 1글자 인자를 뺐다. 팬 상자는 보류 상자의 닉네임 일치 계정이 로그인한 팬이어야 한다(INV-C4 ②-가).
-- 역조공 몫은 송장번호·택배사 두 값(INV-C4 ②-나).
drop function if exists public.find_held_parcel(uuid, uuid, text, text, text);
create or replace function public.find_held_parcel(p_box_id uuid, p_share_id uuid, p_waybill text, p_carrier text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.inbound_codes;
  t public.office_parcels;
  u public.office_unmatched;
  v public.office_parcels;
  v_order_id uuid;
  v_result text := 'not_found';
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  if num_nonnulls(p_box_id, p_share_id) <> 1 or p_carrier is null or not public.inbound_carrier_ok(p_carrier) then
    raise exception '상자 하나와 택배사가 필요하다' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_waybill, 0));
  -- INV-C10: 시도 기록과 횟수 확인을 한 처리로 — 같은 계정의 찾기는 하나씩
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.find:' || v_uid::text, 0));
  -- INV-C10(2026-10-16 카드 d92): 그날(서울 날짜)의 틀린 시도만 센다 — 맞아서 이어진 찾기는 세지 않는다.
  -- 틀린 시도 = 이어지지 않은 모든 찾기(두 값은 맞았지만 고른 몫이 후보가 아니어서 거부된 시도 포함 — 아래에서 matched = false 로 남는다).
  if (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched
        and a.at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) >= 5 then
    raise exception '오늘은 더 찾을 수 없다' using errcode = 'P0045';
  end if;

  -- 잠금 순서(교착 방지 — 입고 함수와 같다): 상자 줄 → 승인 요청 줄 → 주문 줄(역조공은 몫 줄) → 6자리 줄 → 상자 작업 줄 → 보류 줄
  if p_box_id is not null then
    select b.order_id into v_order_id from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = p_box_id and b.missing_at is null and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
    for update of b;
    if v_order_id is not null then
      perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
      perform 1 from public.orders o
      where o.id = v_order_id and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
      for update;
    end if;
  else
    perform 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_share_id and d.sender_id = v_uid and d.status = 'done' and s.cancelled_at is null
      and s.reply in ('waiting', 'accepted')
    for update of s;
  end if;

  if found then
    select * into c from public.inbound_codes x where x.box_id = p_box_id or x.share_id = p_share_id for update;
    select * into t from public.office_parcels x where x.box_id = p_box_id or x.share_id = p_share_id for update;

    if t.id is not null and t.hold_reason in ('code_dispute', 'waybill_dispute') and t.inbound_waybill_no = p_waybill
       and not exists (select 1 from public.office_not_mine_reports r where r.parcel_id = t.id) then
      update public.office_parcels set hold_reason = null, hold_at = null where id = t.id;
      v_result := 'matched';
    elsif t.id is null or t.state = 'awaiting' or t.hold_reason in ('code_dispute', 'waybill_dispute') then
      select * into u from public.office_unmatched x
      where x.waybill_no = p_waybill and x.carrier = p_carrier
        -- INV-C4 ②-가: 6자리 없이 온 팬 상자는 입고 때 로그인한 팬의 닉네임과 맞은 보류 상자만. 6자리가 붙어 온 보류 상자(분쟁·무효 등)는
        -- 그 6자리가 이 팬이 고른 자기 상자의 것일 때만(바로 아래 code_id 조건) 닉네임 없이 찾는다.
        and (p_share_id is not null or x.code_id is not null or x.nickname_profile_id = v_uid)
        and x.matched_parcel_id is null and x.expired_at is null and x.arrived_at > now() - interval '168 hours'
        and (x.code_id is null or x.code_id is not distinct from c.id)
        and not exists (select 1 from public.office_parcels y where y.inbound_waybill_no = p_waybill)
      for update;
      if u.id is not null then
        if t.id is not null and t.state <> 'awaiting' then
          update public.office_parcels set box_id = null, share_id = null, hold_reason = 'detached', hold_at = now()
          where id = t.id;
          insert into public.office_parcels (box_id, share_id, inbound_waybill_no, state, received_at)
          values (p_box_id, p_share_id, p_waybill, 'received', u.arrived_at)
          returning * into v;
        elsif t.id is null then
          insert into public.office_parcels (box_id, share_id, inbound_waybill_no, state, received_at)
          values (p_box_id, p_share_id, p_waybill, 'received', u.arrived_at)
          returning * into v;
        else
          update public.office_parcels set inbound_waybill_no = p_waybill, state = 'received', received_at = u.arrived_at
          where id = t.id returning * into v;
        end if;
        perform public.office_finish_held_receive(u.id, v.id, c.id);
        v_result := 'matched';
      end if;
    end if;
  end if;

  insert into public.office_match_attempts (profile_id, matched) values (v_uid, v_result = 'matched');
  if v_result <> 'matched' and (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched and a.at > now() - interval '24 hours') >= 3 then
    insert into public.office_find_flags (profile_id) values (v_uid)
    on conflict (profile_id) do update set last_flagged_at = now();
  end if;
  return v_result;
end $$;

-- ── 4) 운영자 확인 목록 (INV-C9·W5·W7) ─────────────────────────────

-- 20261008000008 과 같고, 이름 앞 1글자 칸 대신 닉네임 일치면 그 닉네임(nickname). 주문번호·6자리·실명은 여전히 없다.
drop function if exists public.admin_unmatched_parcels();
create function public.admin_unmatched_parcels()
returns table (
  id uuid, source text, qr text, waybill_no text, carrier text, arrived_at timestamptz, nickname text, shelf text,
  reason text, suspected_theft boolean, state text, deadline_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select u.id, 'unmatched'::text, null::text, u.waybill_no, u.carrier, u.arrived_at, pr.nickname, u.shelf,
           u.reason, u.suspected_theft,
           case when u.matched_parcel_id is not null then 'matched' when u.expired_at is not null then 'expired' else 'waiting' end,
           u.arrived_at + interval '168 hours'
    from public.office_unmatched u
    left join public.profiles pr on pr.id = u.nickname_profile_id
    union all
    select p.id, 'parcel', p.qr_code, p.inbound_waybill_no, null, p.received_at, null, null,
           p.hold_reason,
           p.hold_reason in ('not_mine', 'detached') or exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
           case when p.hold_closed_at is not null then 'expired' else 'on_hold' end,
           p.hold_at + interval '168 hours'
    from public.office_parcels p
    where p.hold_reason is not null
  ) h (id, source, qr, waybill_no, carrier, arrived_at, nickname, shelf, reason, suspected_theft, state, deadline_at)
  where public.is_operator()
  order by (h.state in ('waiting', 'on_hold')) desc, h.arrived_at desc nulls last
  limit 500;
$$;

-- ── 5) 운영자 잇기 (INV-C12) ───────────────────────────────────

-- 후보 읽기: 문의한 계정(닉네임)의 결제 완료·입고 전 팬 선물 상자. 운영자에게만(아니면 0줄). 상자 이름은 주문번호(상자가 여럿이면 -순번).
-- 보류 상자는 이 읽기에서 바뀌지 않는다 — 판정은 잇기 함수가 잠금 뒤 다시 한다.
create or replace function public.admin_held_link_candidates(p_id uuid, p_nickname text)
returns table (box_id uuid, label text, tier text, paid_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text,
         o.registered_at
  from public.profiles pr
  join public.orders o on o.fan_id = pr.id
  join public.boxes b on b.order_id = o.id
  where public.is_operator()
    and exists (select 1 from public.office_unmatched u where u.id = p_id)
    and lower(btrim(pr.nickname)) = lower(btrim(coalesce(p_nickname, '')))
    and public.fan_box_before_inbound(b.id, pr.id)
  order by o.registered_at, b.seq
  limit 50;
$$;

-- 잇기: 돌려주는 값 'linked'. 이으면 같은 처리에서 그 상자는 고른 상자로 입고(도착 시각 = 보류 기록 시각), 6자리 사용됨, 보류 상자는 이어짐,
-- 주문 단계 맞추기·상자 도착 알림(6자리로 입고될 때와 같은 끝), 잇기 기록 1줄(누가·언제·확인 표시). 라벨은 바코드를 다시 찍을 때 나온다(찾기와 같다).
create or replace function public.admin_link_held_parcel(p_id uuid, p_nickname text, p_box_id uuid, p_checked boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_fan uuid;
  u public.office_unmatched;
  c public.inbound_codes;
  t public.office_parcels;
  v public.office_parcels;
  v_order_id uuid;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_id is null or p_box_id is null or p_checked is not true then
    raise exception '송장번호·내용물 확인 표시와 보류 상자·주문 상자가 필요하다' using errcode = '22023';
  end if;
  select p.id into v_fan from public.profiles p where lower(btrim(p.nickname)) = lower(btrim(coalesce(p_nickname, '')));
  if v_fan is null then
    raise exception '없는 닉네임이다' using errcode = 'P0002';
  end if;
  -- 보류 줄은 잠그지 않고 먼저 읽어 바코드를 안다 — 그 번호의 입고·찾기와 같은 번호 잠금을 먼저 건다
  select * into u from public.office_unmatched where id = p_id;
  if u.id is null then
    raise exception '없는 보류 상자다' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || u.waybill_no, 0));

  -- 잠금 순서(office-workflow INV-W12, 찾기와 같다): 상자 줄 → 승인 요청 → 주문 줄 → 6자리 → 상자 작업 줄 → 보류 줄
  select b.order_id into v_order_id from public.boxes b join public.orders o on o.id = b.order_id
  where b.id = p_box_id and o.fan_id = v_fan
  for update of b;
  if v_order_id is null then
    raise exception '후보가 아닌 상자다' using errcode = 'P0047';
  end if;
  perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
  perform 1 from public.orders o where o.id = v_order_id for update;
  select * into c from public.inbound_codes x where x.box_id = p_box_id for update;
  select * into t from public.office_parcels x where x.box_id = p_box_id for update;
  -- 잠근 뒤 후보를 다시 본다 — 문의한 계정의 결제 완료·입고 전 상자만(남의 주문·결제 대기·끝난 주문·이미 온 상자는 후보 아님)
  if not public.fan_box_before_inbound(p_box_id, v_fan) then
    raise exception '후보가 아닌 상자다' using errcode = 'P0047';
  end if;

  select * into u from public.office_unmatched where id = p_id for update;
  -- 6자리 없이 온 상자만(붙어 온 6자리가 있으면 분쟁·무효 갈래 — INV-C9 기한·주인의 찾기를 따른다), 아직 이어지지 않았고 반송 대상이 아니며 168시간 안
  if u.matched_parcel_id is not null or u.expired_at is not null or not public.inbound_held_without_code(u.reason)
     or u.arrived_at <= now() - interval '168 hours'
     or exists (select 1 from public.office_parcels y where y.inbound_waybill_no = u.waybill_no) then
    raise exception '이미 이어졌거나 반송 대상이거나 기한이 지난 보류 상자다' using errcode = '55000';
  end if;
  -- INV-C12 ②·③: 운영자 잇기는 닉네임 없음 상자의 길 — 닉네임이 맞은 상자는 그 계정에만(남에게는 후보 아님)
  if u.nickname_profile_id is not null and u.nickname_profile_id <> v_fan then
    raise exception '닉네임이 맞은 다른 계정의 상자다' using errcode = 'P0047';
  end if;
  -- INV-C7: 같은 송장번호를 다른 상자에 등록해 둔 사람이 있으면 분쟁 사안 — 운영자가 손으로 고르지 않는다
  if exists (select 1 from public.office_parcels y where y.tracking_no = u.waybill_no and y.box_id is distinct from p_box_id) then
    raise exception '다른 상자에 같은 송장번호가 등록돼 있다' using errcode = 'P0048';
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
  values (u.id, v.id, v_fan, auth.uid(), true);
  perform public.office_finish_held_receive(u.id, v.id, c.id);
  return 'linked';
end $$;

-- ── 실행 권한 ────────────────────────────────────────────────

revoke all on function public.fan_box_before_inbound(uuid, uuid) from public, anon, authenticated;
revoke all on function public.inbound_held_without_code(text) from public, anon, authenticated;
revoke all on function public.office_finish_held_receive(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.notification_enqueue_box_no_code(uuid) from public, anon, authenticated, service_role;
revoke all on function public.office_scan_inbound(text, text, text, text, text) from public, anon;
revoke all on function public.find_held_parcel(uuid, uuid, text, text) from public, anon;
revoke all on function public.admin_unmatched_parcels() from public, anon;
revoke all on function public.admin_held_link_candidates(uuid, text) from public, anon;
revoke all on function public.admin_link_held_parcel(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.office_scan_inbound(text, text, text, text, text) to authenticated;
grant execute on function public.find_held_parcel(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_unmatched_parcels() to authenticated;
grant execute on function public.admin_held_link_candidates(uuid, text) to authenticated;
grant execute on function public.admin_link_held_parcel(uuid, text, uuid, boolean) to authenticated;
