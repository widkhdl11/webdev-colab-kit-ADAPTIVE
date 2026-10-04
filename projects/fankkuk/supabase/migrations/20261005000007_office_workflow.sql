-- 사무실 작업 흐름 — 입고·검수·출고 상태 전환, 미확인 입고, 7일 자동 처리 (office-workflow INV-W1~W8).
--
-- 상자 하나 = 작업 줄 하나(office_parcels). 팬 선물 상자(boxes)와 역조공 몫(revgift_shares)이 같은 줄 꼴·같은 QR 번호 체계·
-- 같은 전환 함수를 쓴다(스펙 「팬 선물과 역조공이 같은 흐름을 탄다」, PRODUCT 「입고·검수·송장은 상자 단위」).
-- 줄은 원 송장번호가 처음 들어올 때 생긴다 — 팬(또는 역조공의 크리에이터)이 넣거나, 미확인 입고를 팬이 찾아 이을 때.
-- 상태는 전환 함수로만 바뀐다. 표를 직접 고칠 권한은 아무에게도 없다(INV-W1).
-- 주문의 상태 칸은 그 주문 상자들 중 가장 덜 간 단계를 따라 바뀐다 — 팬·크리에이터 화면이 그 칸을 읽는다.
--
-- 오류 꼴: 42501 권한 없음 · 22023 스캔 값·입력 꼴 · P0002 대상 없음(남의 것 포함 — 같은 답) · 55000 지금 단계에서 할 수 없음
--          · P0041 출고 조건 불충족(W3) · P0042 부착 확인 전 다음 입고(W2) · P0043 스캔한 라벨·송장이 이 상자의 것이 아님 · P0044 검수 기록 없음(W4)
-- 실명·주소·전화는 어느 표에도 없다(INV-W7). 미확인 입고의 발신인은 앞 한 글자뿐이다.

create type public.office_state as enum (
  'awaiting',        -- 원 송장번호만 안다(입고 전)
  'received',        -- 입고 완료 + 내부 라벨 출력
  'labeled',         -- 라벨 부착 확인
  'inspected',       -- 검수 완료
  'held',            -- 추적 장치 — 반송하지 않고 보관(W4)
  'return_waiting',  -- 반송 대기
  'return_printed',  -- 반송 송장 출력
  'returned',        -- 반송 확정
  'label_printed',   -- 출고 송장 출력
  'shipped'          -- 출고 확정
);

create sequence public.office_qr_seq;

create table public.office_parcels (
  id uuid primary key default gen_random_uuid(),
  -- 내부 QR 번호 = 원 송장 보관 봉투 번호(W8)
  qr_code text not null unique default ('Q-' || lpad(nextval('public.office_qr_seq')::text, 6, '0')) check (qr_code ~ '^Q-[0-9]{6}$'),
  box_id uuid unique references public.boxes (id) on delete cascade,
  share_id uuid unique references public.revgift_shares (id) on delete cascade,
  inbound_waybill_no text unique check (inbound_waybill_no ~ '^[0-9]{10,14}$'),
  state public.office_state not null default 'awaiting',
  received_at timestamptz,
  labeled_at timestamptz,
  inspected_at timestamptz,
  printed_at timestamptz,
  shipped_at timestamptz,
  return_printed_at timestamptz,
  returned_at timestamptz,
  outbound_waybill_no text check (outbound_waybill_no ~ '^[0-9]{10,14}$'),
  return_waybill_no text check (return_waybill_no ~ '^[0-9]{10,14}$'),
  created_at timestamptz not null default now(),
  check (num_nonnulls(box_id, share_id) = 1),
  check (state = 'awaiting' or received_at is not null),
  check (state not in ('label_printed', 'shipped') or outbound_waybill_no is not null),
  check (state not in ('return_printed', 'returned') or return_waybill_no is not null)
);

-- W2: 작업자마다 「출력했지만 아직 붙였다고 확인하지 않은 라벨」 하나
create table public.office_label_pending (
  operator_id uuid primary key references public.profiles (id),
  parcel_id uuid not null unique references public.office_parcels (id) on delete cascade,
  printed_at timestamptz not null default now()
);

-- W4: 검수 기록. 추가만. 팬 선물은 블루투스·RF·금속, 역조공은 겉면·금지 물품.
create table public.office_inspections (
  id bigint generated always as identity primary key,
  parcel_id uuid not null references public.office_parcels (id),
  at timestamptz not null default now(),
  inspected_by uuid not null references public.profiles (id),
  bluetooth text check (bluetooth in ('clear', 'found')),
  rf text check (rf in ('clear', 'found')),
  metal text check (metal in ('clear', 'found')),
  surface text check (surface in ('clear', 'found')),
  prohibited text check (prohibited in ('clear', 'found')),
  outcome text not null check (outcome in ('pass', 'return', 'hold')),
  -- 팬 선물 세 칸이 다 있거나, 역조공 두 칸이 다 있다 — 빈칸 검수는 없다
  check (
    (bluetooth is not null and rf is not null and metal is not null and surface is null and prohibited is null)
    or (bluetooth is null and rf is null and metal is null and surface is not null and prohibited is not null)
  )
);
create index office_inspections_parcel_idx on public.office_inspections (parcel_id, at desc, id desc);

-- W4: 추적 장치가 나와 보관한 상자 — 크리에이터에게 알릴 것 한 줄(알림톡 발송은 알림 스펙)
create table public.office_hold_alerts (
  parcel_id uuid primary key references public.office_parcels (id),
  creator_id uuid not null references public.creators (id),
  created_at timestamptz not null default now()
);

-- W8: 원 송장 봉투 파쇄 기록. 추가만. 상자마다 한 번.
create table public.office_envelope_shreds (
  parcel_id uuid primary key references public.office_parcels (id),
  at timestamptz not null default now(),
  shredded_by uuid not null references public.profiles (id)
);

-- W5: 미확인 입고. 사람 칸은 발신인 앞 한 글자뿐(W7).
create table public.office_unmatched (
  id uuid primary key default gen_random_uuid(),
  waybill_no text not null unique check (waybill_no ~ '^[0-9]{10,14}$'),
  arrived_at timestamptz not null default now(),
  sender_initial text not null check (char_length(sender_initial) = 1),
  shelf text not null check (char_length(shelf) between 1 and 20),
  recorded_by uuid not null references public.profiles (id),
  matched_parcel_id uuid unique references public.office_parcels (id),
  matched_at timestamptz,
  expired_at timestamptz,
  check ((matched_parcel_id is null) = (matched_at is null)),
  check (matched_at is null or expired_at is null)
);

-- 「내 물건 찾기」 시도 기록 — 번호 대입으로 남의 상자를 찾아보지 못하게 사람마다 하루 실패 횟수를 센다
create table public.office_match_attempts (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now(),
  matched boolean not null
);
create index office_match_attempts_profile_idx on public.office_match_attempts (profile_id, at desc);
alter table public.office_match_attempts enable row level security;
revoke all on public.office_match_attempts from anon, authenticated;

alter table public.office_parcels enable row level security;
alter table public.office_label_pending enable row level security;
alter table public.office_inspections enable row level security;
alter table public.office_hold_alerts enable row level security;
alter table public.office_envelope_shreds enable row level security;
alter table public.office_unmatched enable row level security;
revoke all on public.office_parcels, public.office_label_pending, public.office_inspections, public.office_hold_alerts,
  public.office_envelope_shreds, public.office_unmatched from anon, authenticated;
revoke all on sequence public.office_qr_seq from anon, authenticated;

create trigger office_inspections_no_update before update on public.office_inspections
  for each row execute function public.append_only_log();
create trigger office_inspections_no_delete before delete on public.office_inspections
  for each row execute function public.append_only_log();
create trigger office_envelope_shreds_no_update before update on public.office_envelope_shreds
  for each row execute function public.append_only_log();
create trigger office_envelope_shreds_no_delete before delete on public.office_envelope_shreds
  for each row execute function public.append_only_log();

-- ── 공용 판정 ────────────────────────────────────────────

create function public.office_check_waybill(p_no text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_no is null or p_no !~ '^[0-9]{10,14}$' then
    raise exception '송장번호는 숫자 10~14자리다' using errcode = '22023';
  end if;
end $$;

-- QR 스캔 → 그 상자 줄을 잠가 돌려준다. 꼴이 다르면 22023, 없으면 P0002.
create function public.office_lock_qr(p_qr text)
returns public.office_parcels
language plpgsql set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  select * into v from public.office_parcels where qr_code = p_qr for update;
  if v.id is null then
    raise exception '없는 상자다' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- W3: 출고 조건. 팬 선물 = 크리에이터 승인 + 거절·반려·취소 아님 + 차액 미납 없음(payment INV-M12).
-- 역조공 = 팬이 받기를 했고 취소·반송되지 않음(reverse-gift INV-R7). 목록의 「다음 단계」와 송장 출력이 같은 판정을 쓴다.
create function public.office_parcel_shippable(p_parcel public.office_parcels)
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when p_parcel.box_id is not null then exists (
      select 1 from public.boxes b join public.orders o on o.id = b.order_id
      where b.id = p_parcel.box_id
        and o.approved_at is not null
        and o.status not in ('rejected', 'expired', 'canceled')
        and exists (select 1 from public.approval_requests r where r.order_id = o.id and r.status = 'approved')
        and not exists (select 1 from public.payments d where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')
    )
    else exists (
      select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
      where s.id = p_parcel.share_id and d.status = 'done' and s.reply = 'accepted'
        and s.cancelled_at is null and s.returned_at is null
    )
  end;
$$;

-- 이 상자가 더는 나갈 수 없는가(거절·반려·취소된 주문, 받지 않은·기한 지난 몫) — 검수 스캔에서 반송 대기로 보낸다.
create function public.office_parcel_dead(p_parcel public.office_parcels)
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when p_parcel.box_id is not null then exists (
      select 1 from public.boxes b join public.orders o on o.id = b.order_id
      where b.id = p_parcel.box_id and o.status in ('rejected', 'expired', 'canceled')
    )
    else exists (
      select 1 from public.revgift_shares s
      where s.id = p_parcel.share_id and (s.reply in ('declined', 'expired') or s.cancelled_at is not null)
    )
  end;
$$;

-- 주문 상태를 상자들 중 가장 덜 간 단계로 맞춘다. 진행 중인 주문만(거절·반려·취소는 그대로).
-- 보관·반송으로 끝난 상자는 나머지 상자의 진행을 막지 않게 빼고 센다(모두 끝났으면 검수 완료).
-- 지금 주문 상태보다 뒤로는 가지 않는다 — 상자 줄이 없던 때 만든 주문(시드)이 상자 하나 스캔으로 되돌아가지 않게.
create function public.office_sync_order(p_order_id uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_min integer;
  v_now integer;
  v_returned boolean;
begin
  select coalesce(min(case p.state
           when 'received' then 1 when 'labeled' then 2
           when 'inspected' then 3 when 'return_waiting' then 3 when 'return_printed' then 3
           when 'label_printed' then 4 when 'shipped' then 5
           when 'held' then null when 'returned' then null
           else 0 end) filter (where p.state is null or p.state not in ('held', 'returned')), 3),
         bool_or(p.state in ('return_waiting', 'return_printed', 'returned'))
    into v_min, v_returned
  from public.boxes b left join public.office_parcels p on p.box_id = b.id
  where b.order_id = p_order_id;

  select array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], o.status::text) - 1
    into v_now
  from public.orders o where o.id = p_order_id;
  v_min := greatest(v_min, coalesce(v_now, 0));

  update public.orders o
  set received_at = (select min(p.received_at) from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id)
  where o.id = p_order_id and o.received_at is null
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.received_at is not null);

  update public.orders o
  set status = (array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'])[v_min + 1]::public.order_status,
      received_at = case when v_min >= 1 then coalesce(o.received_at, now()) else o.received_at end,
      inspected_at = case when v_min >= 3 then coalesce(o.inspected_at, now()) else o.inspected_at end,
      inspection_result = case when v_min >= 3 then (case when coalesce(v_returned, false) then 'returned' else 'passed' end)
                               else o.inspection_result end,
      shipped_at = case when v_min >= 5 then coalesce(o.shipped_at, now()) else o.shipped_at end
  where o.id = p_order_id
    and o.status in ('registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped');
end $$;

-- 상자 줄이 바뀐 뒤 그 주문(또는 역조공 몫)의 칸을 맞춘다.
create function public.office_sync(p_parcel_id uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  select * into v from public.office_parcels where id = p_parcel_id;
  if v.box_id is not null then
    perform public.office_sync_order((select b.order_id from public.boxes b where b.id = v.box_id));
  else
    update public.revgift_shares s
    set received_at = coalesce(s.received_at, v.received_at),
        inspected_at = case when v.state in ('inspected', 'held', 'return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped')
                            then coalesce(s.inspected_at, v.inspected_at) else s.inspected_at end,
        shipped_at = case when v.state = 'shipped' then coalesce(s.shipped_at, v.shipped_at) else s.shipped_at end,
        returned_at = case when v.state = 'returned' then coalesce(s.returned_at, v.returned_at) else s.returned_at end
    where s.id = v.share_id;
  end if;
end $$;

-- ── 원 송장번호 넣기 (팬 · 역조공의 크리에이터) ─────────────

-- 팬이 자기 결제 완료 상자에 원 송장번호를 넣는다. 입고 전에는 고칠 수 있다. 남의 상자는 「없다」.
create function public.set_box_waybill(p_box_id uuid, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  perform public.office_check_waybill(p_waybill);
  perform 1 from public.boxes b join public.orders o on o.id = b.order_id
  where b.id = p_box_id and o.fan_id = auth.uid()
    and o.status in ('registered', 'received', 'labeled', 'inspected', 'label_printed')
  for update of b;
  if not found then
    raise exception '없는 상자다' using errcode = 'P0002';
  end if;
  select * into v from public.office_parcels where box_id = p_box_id for update;
  if v.id is null then
    insert into public.office_parcels (box_id, inbound_waybill_no) values (p_box_id, p_waybill);
  elsif v.state = 'awaiting' then
    update public.office_parcels set inbound_waybill_no = p_waybill where id = v.id;
  else
    raise exception '이미 입고된 상자다' using errcode = '55000';
  end if;
end $$;

-- 크리에이터가 자기가 보낸 역조공 몫에 원 송장번호를 넣는다.
create function public.set_share_waybill(p_share_id uuid, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  perform public.office_check_waybill(p_waybill);
  perform 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
  where s.id = p_share_id and d.sender_id = auth.uid() and d.status = 'done' and s.cancelled_at is null
  for update of s;
  if not found then
    raise exception '없는 몫이다' using errcode = 'P0002';
  end if;
  select * into v from public.office_parcels where share_id = p_share_id for update;
  if v.id is null then
    insert into public.office_parcels (share_id, inbound_waybill_no) values (p_share_id, p_waybill);
  elsif v.state = 'awaiting' then
    update public.office_parcels set inbound_waybill_no = p_waybill where id = v.id;
  else
    raise exception '이미 입고된 상자다' using errcode = '55000';
  end if;
end $$;

-- ── 입고 (W1 1·2행, W2, W5) ──────────────────────────────

-- 원 송장 스캔. 맞는 상자가 있으면 입고 완료 + 이 작업자의 부착 대기 라벨. 없으면 「미확인」(기록은 office_record_unmatched).
-- 입고 완료인데 부착 대기 라벨이 아무에게도 없고 아직 붙이지 않은 상자(미확인을 팬이 이은 상자 등)는 라벨을 다시 낸다.
create function public.office_scan_inbound(p_waybill text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_order_no text;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  -- W2: 붙였다고 확인하지 않은 라벨이 있으면 다음 상자를 받지 않는다
  if exists (select 1 from public.office_label_pending where operator_id = auth.uid()) then
    raise exception '앞 상자의 라벨 부착을 먼저 확인한다' using errcode = 'P0042';
  end if;

  select * into v from public.office_parcels where inbound_waybill_no = p_waybill for update;
  if v.id is null then
    return jsonb_build_object(
      'result', case when exists (select 1 from public.office_unmatched u where u.waybill_no = p_waybill) then 'unmatched_recorded' else 'unmatched' end,
      'qr', null, 'order_no', null);
  end if;
  select coalesce(o.order_no, s.order_no) into v_order_no
  from public.office_parcels p
  left join public.boxes b on b.id = p.box_id left join public.orders o on o.id = b.order_id
  left join public.revgift_shares s on s.id = p.share_id
  where p.id = v.id;

  if v.state = 'awaiting' then
    update public.office_parcels set state = 'received', received_at = now() where id = v.id;
    insert into public.office_label_pending (operator_id, parcel_id) values (auth.uid(), v.id);
    perform public.office_sync(v.id);
    return jsonb_build_object('result', 'received', 'qr', v.qr_code, 'order_no', v_order_no);
  end if;
  if v.state = 'received' and v.labeled_at is null
     and not exists (select 1 from public.office_label_pending where parcel_id = v.id) then
    insert into public.office_label_pending (operator_id, parcel_id) values (auth.uid(), v.id);
    return jsonb_build_object('result', 'reprinted', 'qr', v.qr_code, 'order_no', v_order_no);
  end if;
  raise exception '이미 처리된 상자다' using errcode = '55000';
end $$;

-- 라벨 부착 확인: 이 작업자가 직전에 출력한 라벨이어야 한다.
create function public.office_confirm_label(p_qr text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.state <> 'received' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if not exists (select 1 from public.office_label_pending where operator_id = auth.uid() and parcel_id = v.id) then
    raise exception '직전에 출력한 라벨이 아니다' using errcode = 'P0043';
  end if;
  delete from public.office_label_pending where operator_id = auth.uid();
  update public.office_parcels set state = 'labeled', labeled_at = now() where id = v.id;
  perform public.office_sync(v.id);
end $$;

-- 미확인 입고 기록. 발신인은 앞 한 글자, 보관 선반 번호.
create function public.office_record_unmatched(p_waybill text, p_sender_initial text, p_shelf text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  if char_length(coalesce(p_sender_initial, '')) <> 1 or char_length(btrim(coalesce(p_shelf, ''))) not between 1 and 20 then
    raise exception '발신인은 앞 한 글자, 선반 번호는 1~20자다' using errcode = '22023';
  end if;
  if exists (select 1 from public.office_parcels where inbound_waybill_no = p_waybill)
     or exists (select 1 from public.office_unmatched where waybill_no = p_waybill) then
    raise exception '주인이 있거나 이미 기록한 송장번호다' using errcode = '55000';
  end if;
  insert into public.office_unmatched (waybill_no, sender_initial, shelf, recorded_by)
  values (p_waybill, p_sender_initial, btrim(p_shelf), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- W5: 팬이 「내 물건 찾기」에 원 송장번호를 넣어 자기 결제 완료 상자와 잇는다. 운영자가 잇는 길은 없다 —
-- 상자가 로그인한 사람의 것이어야 한다. 이어진 상자는 입고 완료(도착 시각 = 미확인 입고 시각).
-- 결과: 'matched' · 'not_found'(내 상자가 아니거나 맞는 미확인이 없거나 기한 지남 — 같은 답).
-- 사람마다 하루(24시간) 실패 10번이 넘으면 P0045. 실패를 오류로 내면 시도 기록이 되돌려지므로 값으로 돌려준다.
create function public.match_unmatched(p_box_id uuid, p_waybill text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  u public.office_unmatched;
  v public.office_parcels;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  if (select count(*) from public.office_match_attempts a
      where a.profile_id = auth.uid() and not a.matched and a.at > now() - interval '24 hours') >= 10 then
    raise exception '오늘은 더 찾을 수 없다' using errcode = 'P0045';
  end if;
  perform 1 from public.boxes b join public.orders o on o.id = b.order_id
  where b.id = p_box_id and o.fan_id = auth.uid() and o.status in ('registered', 'received', 'labeled', 'inspected')
  for update of b;
  if found then
    -- W6: 기한(도착 168시간)이 지났거나 이미 이어진 미확인은 「없다」
    select * into u from public.office_unmatched
    where waybill_no = p_waybill and matched_parcel_id is null and expired_at is null
      and arrived_at > now() - interval '168 hours'
    for update;
  end if;
  if u.id is null then
    insert into public.office_match_attempts (profile_id, matched) values (auth.uid(), false);
    return 'not_found';
  end if;
  select * into v from public.office_parcels where box_id = p_box_id for update;
  if v.id is null then
    insert into public.office_parcels (box_id, inbound_waybill_no, state, received_at)
    values (p_box_id, p_waybill, 'received', u.arrived_at)
    returning * into v;
  elsif v.state = 'awaiting' then
    update public.office_parcels set inbound_waybill_no = p_waybill, state = 'received', received_at = u.arrived_at
    where id = v.id returning * into v;
  else
    raise exception '이미 입고된 상자다' using errcode = '55000';
  end if;
  update public.office_unmatched set matched_parcel_id = v.id, matched_at = now() where id = u.id;
  insert into public.office_match_attempts (profile_id, matched) values (auth.uid(), true);
  perform public.office_sync(v.id);
  return 'matched';
end $$;

-- ── 검수 (W1 3행, W4) ────────────────────────────────────

create function public.office_record_inspection(p_qr text, p_result jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_keys text[];
  v_outcome text := p_result ->> 'outcome';
  v_tracker boolean;
  v_found boolean;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.state <> 'labeled' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if exists (select 1 from public.office_inspections i where i.parcel_id = v.id) then
    raise exception '검수 기록은 한 번만 쓴다' using errcode = '55000';
  end if;
  if jsonb_typeof(p_result) is distinct from 'object' then
    raise exception '검수 결과 꼴이 아니다' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_result) k;
  if exists (select 1 from jsonb_each_text(p_result) e where e.key <> 'outcome' and (e.value is null or e.value not in ('clear', 'found')))
     or v_outcome is null or v_outcome not in ('pass', 'return', 'hold') then
    raise exception '검수 결과 값이 아니다' using errcode = '22023';
  end if;

  if v.box_id is not null then
    -- 팬 선물: 블루투스·RF·금속. 추적 장치(블루투스·RF)가 나오면 보관이고, 보관은 추적 장치가 나왔을 때만.
    if v_keys is distinct from array['bluetooth', 'metal', 'outcome', 'rf'] then
      raise exception '팬 선물 검수는 블루투스·RF·금속이다' using errcode = '22023';
    end if;
    v_tracker := p_result ->> 'bluetooth' = 'found' or p_result ->> 'rf' = 'found';
    if v_tracker <> (v_outcome = 'hold') then
      raise exception '추적 장치가 나오면 보관, 보관은 추적 장치가 나왔을 때만' using errcode = '22023';
    end if;
    insert into public.office_inspections (parcel_id, inspected_by, bluetooth, rf, metal, outcome)
    values (v.id, auth.uid(), p_result ->> 'bluetooth', p_result ->> 'rf', p_result ->> 'metal', v_outcome);
  else
    -- 역조공: 겉면·금지 물품만. 하나라도 걸리면 반송, 보관은 없다.
    if v_keys is distinct from array['outcome', 'prohibited', 'surface'] then
      raise exception '역조공 검수는 겉면·금지 물품이다' using errcode = '22023';
    end if;
    v_found := p_result ->> 'surface' = 'found' or p_result ->> 'prohibited' = 'found';
    if v_outcome = 'hold' or (v_found and v_outcome <> 'return') then
      raise exception '걸리면 반송이다' using errcode = '22023';
    end if;
    insert into public.office_inspections (parcel_id, inspected_by, surface, prohibited, outcome)
    values (v.id, auth.uid(), p_result ->> 'surface', p_result ->> 'prohibited', v_outcome);
  end if;
end $$;

-- 검수 스캔: 마지막 검수 기록대로 넘긴다. 나갈 수 없는 상자(거절·반려·받지 않음)는 통과여도 반송 대기.
create function public.office_scan_inspect(p_qr text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_outcome text;
  v_next public.office_state;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.state <> 'labeled' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  select i.outcome into v_outcome from public.office_inspections i
  where i.parcel_id = v.id order by i.at desc, i.id desc limit 1;
  if v_outcome is null then
    raise exception '검수 기록이 없다' using errcode = 'P0044';
  end if;
  v_next := case
    when v_outcome = 'hold' then 'held'
    when v_outcome = 'return' or public.office_parcel_dead(v) then 'return_waiting'
    else 'inspected'
  end;
  update public.office_parcels set state = v_next, inspected_at = now() where id = v.id;
  if v_next = 'held' then
    insert into public.office_hold_alerts (parcel_id, creator_id)
    select v.id, o.creator_id from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return v_next::text;
end $$;

-- ── 출고 (W1 4·5행, W3) ──────────────────────────────────

-- 송장 출력: 대표만, 출고 조건을 지킬 때만. 송장번호는 서버가 택배사에서 받아 넘긴다(연동 전에는 개발용 번호).
-- 실제 주소 열기(복호화)는 주소 보호 작업에서 이 단계에 붙인다.
create function public.office_print_label(p_qr text, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_owner() then
    raise exception '송장 출력은 대표만 한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  v := public.office_lock_qr(p_qr);
  if v.state <> 'inspected' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if v.box_id is not null then
    perform 1 from public.orders o join public.boxes b on b.order_id = o.id where b.id = v.box_id for update of o;
  else
    perform 1 from public.revgift_shares s where s.id = v.share_id for update;
  end if;
  if not public.office_parcel_shippable(v) then
    raise exception '출고 조건을 지키지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'label_printed', printed_at = now(), outbound_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
end $$;

-- 출고 확정: 이 상자에 출력한 송장의 바코드여야 한다. 원 송장 봉투를 파쇄한 기록을 같이 남긴다(W8).
create function public.office_confirm_shipment(p_qr text, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  v := public.office_lock_qr(p_qr);
  if v.state <> 'label_printed' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if v.outbound_waybill_no is distinct from p_waybill then
    raise exception '이 상자의 송장이 아니다' using errcode = 'P0043';
  end if;
  update public.office_parcels set state = 'shipped', shipped_at = now() where id = v.id;
  insert into public.office_envelope_shreds (parcel_id, shredded_by) values (v.id, auth.uid());
  perform public.office_sync(v.id);
end $$;

-- ── 반송 (W8) ────────────────────────────────────────────

-- 반송 송장 출력: 반송 대기 상자의 QR 스캔으로만. 돌려주는 값은 그 상자의 봉투 번호(= QR 번호) 하나.
create function public.office_print_return_label(p_qr text, p_waybill text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  v := public.office_lock_qr(p_qr);
  if v.state <> 'return_waiting' then
    raise exception '반송 대기 상자가 아니다' using errcode = '55000';
  end if;
  update public.office_parcels set state = 'return_printed', return_printed_at = now(), return_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return v.qr_code;
end $$;

create function public.office_confirm_return(p_qr text, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  v := public.office_lock_qr(p_qr);
  if v.state <> 'return_printed' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if v.return_waybill_no is distinct from p_waybill then
    raise exception '이 상자의 반송 송장이 아니다' using errcode = 'P0043';
  end if;
  update public.office_parcels set state = 'returned', returned_at = now() where id = v.id;
  insert into public.office_envelope_shreds (parcel_id, shredded_by) values (v.id, auth.uid());
  perform public.office_sync(v.id);
end $$;

-- ── 7일 자동 처리 (W6) ───────────────────────────────────

-- 승인 함수: 기한(결제 완료 + 168시간)이 지났으면 자동 처리 전이라도 승인하지 않는다(사람 처리 — 행 잠금 뒤 기한 확인).
create or replace function public.approve_request(p_request_id text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.approval_requests;
  v_now timestamptz := now();
begin
  select * into v_req from public.approval_requests where request_id = p_request_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_req.status = 'approved' then
    return 'already';
  end if;
  if v_req.status <> 'waiting' or not exists (
    select 1 from public.orders o
    where o.id = v_req.order_id
      and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and v_now < o.registered_at + interval '168 hours'
  ) then
    return 'not_approvable';
  end if;

  perform set_config('fankkuk.approving', 'on', true);
  update public.approval_requests set status = 'approved', decided_at = v_now where id = v_req.id;
  update public.orders set approved_at = v_now where id = v_req.order_id;
  perform set_config('fankkuk.approving', '', true);
  return 'approved';
end $$;

-- 대상마다 조건부 갱신 한 문장 — 사람의 처리와 겹치면 먼저 잠근 쪽만 반영되고, 두 번 돌려도 같은 대상을 다시 처리하지 않는다.
-- 운영자가 관리자 화면에서 지금 돌리거나, 앱 서버(서비스 키)가 정해진 때 부른다.
-- p_order_no 를 주면 그 주문(역조공은 그 몫)만 처리한다 — 화면의 한 줄 「지금 돌리기」. 기한 조건은 그대로다.
create function public.office_run_expiry(p_order_no text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_gifts integer;
  v_unmatched integer;
  v_differences integer;
  v_revgifts integer;
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  with expired as (
    update public.approval_requests r
    set status = 'expired', decided_at = now()
    from public.orders o
    where o.id = r.order_id and r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    returning r.order_id
  )
  update public.orders o set status = 'expired'
  from expired e where o.id = e.order_id and o.approved_at is null;
  get diagnostics v_gifts = row_count;

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

  -- 3) 차액 요청 뒤 168시간 미납(payment INV-M13) → 그 주문의 검수 완료 상자는 반송 대기
  update public.office_parcels p
  set state = 'return_waiting'
  from public.boxes b
  where p.box_id = b.id and p.state = 'inspected'
    and (p_order_no is null or b.order_id = (select o.id from public.orders o where o.order_no = p_order_no))
    and exists (
      select 1 from public.payments d
      where d.order_id = b.order_id and d.kind = 'difference' and d.status <> 'done'
        and d.created_at <= now() - interval '168 hours'
    );
  get diagnostics v_differences = row_count;

  -- 4) 역조공 받기 기한(reverse-gift INV-R10)
  if p_order_no is null then
    v_revgifts := public.expire_revgifts();
  else
    -- 몫 하나만: expire_revgifts 와 같은 조건(결제 완료 + 168시간, 아직 답이 없음)
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로(반려된 팬 선물 · 받지 않은 역조공)
  update public.office_parcels p
  set state = 'return_waiting'
  where p.state = 'inspected' and public.office_parcel_dead(p)
    and (p_order_no is null
         or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
         or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no));

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts);
end $$;

-- ── 화면 읽기 (작업 화면 · 자동 처리 현황 · 역조공 처리 · 팬·크리에이터의 상자) ─────

-- 상자 줄 → 화면의 「다음 할 일」. 목록과 QR 찾기가 같은 판정을 쓴다.
create function public.office_next_step(p_parcel public.office_parcels, p_kind text)
returns text
language sql stable set search_path = ''
as $$
  select case coalesce(p_parcel.state::text, 'no_waybill')
    when 'no_waybill' then 'wait_waybill'
    when 'awaiting' then 'scan_inbound'
    when 'received' then 'confirm_label'
    when 'labeled' then 'inspect'
    when 'inspected' then case when public.office_parcel_shippable(p_parcel) then 'print_label'
                               when public.office_parcel_dead(p_parcel) then 'wait_expiry'
                               when p_kind = 'gift' then 'wait_approval' else 'wait_accept' end
    when 'held' then 'held'
    when 'return_waiting' then 'print_return'
    when 'return_printed' then 'confirm_return'
    when 'label_printed' then 'confirm_shipment'
    else 'done'
  end;
$$;

-- W2: 이 작업자가 출력하고 아직 부착 확인하지 않은 라벨(0 또는 1줄)
create function public.office_my_pending_label()
returns table (qr text, order_no text)
language sql stable security definer set search_path = ''
as $$
  select p.qr_code, coalesce(o.order_no, s.order_no)
  from public.office_label_pending l
  join public.office_parcels p on p.id = l.parcel_id
  left join public.boxes b on b.id = p.box_id
  left join public.orders o on o.id = b.order_id
  left join public.revgift_shares s on s.id = p.share_id
  where l.operator_id = auth.uid() and public.is_operator();
$$;

-- QR 스캔 → 그 상자의 지금 단계와 다음 할 일. 운영자가 아니면 빈 결과.
create function public.office_parcel_by_qr(p_qr text)
returns table (
  qr text, kind text, order_no text, sender_nickname text, receiver_name text, tier text,
  state text, next_step text, envelope_no text, outbound_waybill_no text, return_waybill_no text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    return;
  end if;
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  return query
  select p.qr_code,
         case when p.box_id is not null then 'gift' else 'revgift' end,
         case when p.box_id is not null
              then o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end
              else s.order_no end,
         case when p.box_id is not null then f.nickname else c2.name end,
         case when p.box_id is not null then c.name else sf.nickname end,
         coalesce(b.declared_tier, s.tier)::text,
         p.state::text,
         public.office_next_step(p, case when p.box_id is not null then 'gift' else 'revgift' end),
         p.qr_code, p.outbound_waybill_no, p.return_waybill_no
  from public.office_parcels p
  left join public.boxes b on b.id = p.box_id
  left join public.orders o on o.id = b.order_id
  left join public.profiles f on f.id = o.fan_id
  left join public.creators c on c.id = o.creator_id
  left join public.revgift_shares s on s.id = p.share_id
  left join public.revgift_sends d on d.id = s.send_id
  left join public.creators c2 on c2.id = d.creator_id
  left join public.profiles sf on sf.id = s.fan_id
  where p.qr_code = p_qr;
  if not found then
    raise exception '없는 상자다' using errcode = 'P0002';
  end if;
end $$;

-- 자동 처리 현황: 기한이 지났는데 아직 처리되지 않은 것(다음 자동 처리 · 「지금 돌리기」 대상)
create function public.admin_expiry_due()
returns table (category text, order_no text, sender_nickname text, receiver_name text, due_at timestamptz, detail text)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select 'gift'::text, o.order_no, f.nickname, c.name, o.registered_at + interval '168 hours', null::text
    from public.orders o
    join public.approval_requests r on r.order_id = o.id and r.status = 'waiting'
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
    union all
    select 'revgift', s.order_no, c.name, f.nickname, public.revgift_deadline(d.settled_at), null
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
    join public.creators c on c.id = d.creator_id
    join public.profiles f on f.id = s.fan_id
    where s.reply = 'waiting' and now() >= public.revgift_deadline(d.settled_at)
    union all
    select 'difference', o.order_no, f.nickname, c.name, pd.created_at + interval '168 hours',
           '+' || to_char(pd.amount_krw, 'FM999,999,999') || '원'
    from public.payments pd
    join public.orders o on o.id = pd.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where pd.kind = 'difference' and pd.status <> 'done' and pd.created_at <= now() - interval '168 hours'
      and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
                  where b.order_id = o.id and p.state = 'inspected')
  ) due
  where public.is_operator()
  order by 5, 2
  limit 500;
$$;

-- 역조공 처리: 몫마다 팬의 답 · 받기 기한 · 입고 · 환불 상태. 팬은 닉네임으로만(주소 없음).
create function public.admin_revgift_shares()
returns table (
  share_id uuid, order_no text, creator_name text, fan_nickname text, tier text, reply text,
  deadline_at timestamptz, received_at timestamptz, refund_status text
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.order_no, c.name, f.nickname, s.tier::text, s.reply,
         public.revgift_deadline(d.settled_at), coalesce(p.received_at, s.received_at),
         (select rf.status from public.refunds rf where rf.share_id = s.id)
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
  join public.creators c on c.id = d.creator_id
  join public.profiles f on f.id = s.fan_id
  left join public.office_parcels p on p.share_id = s.id
  where public.is_operator()
  order by d.settled_at desc, s.seq
  limit 500;
$$;

-- 팬: 내 주문의 상자마다 원 송장번호와 단계. 출고·반송 송장번호는 주지 않는다(PRODUCT — 팬에게 출고 운송장을 보여 주지 않는다).
create function public.my_gift_boxes(p_order_no text)
returns table (box_id uuid, label text, tier text, waybill_no text, state text)
language sql stable security definer set search_path = ''
as $$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, p.inbound_waybill_no, coalesce(p.state::text, 'no_waybill')
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.status <> 'pending_payment'
  order by b.seq;
$$;

-- 크리에이터: 내가 보낸 역조공 몫마다 원 송장번호와 단계
create function public.my_share_boxes()
returns table (share_id uuid, order_no text, fan_nickname text, tier text, waybill_no text, state text)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.order_no, f.nickname, s.tier::text, p.inbound_waybill_no, coalesce(p.state::text, 'no_waybill')
  from public.revgift_sends d
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles f on f.id = s.fan_id
  left join public.office_parcels p on p.share_id = s.id
  where d.sender_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc, s.seq;
$$;

-- ── 읽기 (운영자만 · 사람은 닉네임·이름으로만, INV-W7) ─────────

create function public.admin_office_parcels()
returns table (
  qr text, kind text, order_no text, sender_nickname text, receiver_name text, tier text,
  state text, received_at timestamptz, next_step text
)
language sql stable security definer set search_path = ''
as $$
  with units as (
    select p as parcel, 'gift'::text as kind,
           o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end as order_no,
           f.nickname as sender, c.name as receiver, b.declared_tier::text as tier, o.registered_at as at
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels p on p.box_id = b.id
    where p.id is not null or o.status = 'registered'
    union all
    select p, 'revgift', s.order_no, c.name, f.nickname, s.tier::text, d.settled_at
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
    join public.creators c on c.id = d.creator_id
    join public.profiles f on f.id = s.fan_id
    left join public.office_parcels p on p.share_id = s.id
    where p.id is not null or (s.cancelled_at is null and s.reply in ('waiting', 'accepted'))
  )
  select (u.parcel).qr_code, u.kind, u.order_no, u.sender, u.receiver, u.tier,
         coalesce((u.parcel).state::text, 'no_waybill'),
         (u.parcel).received_at,
         public.office_next_step(u.parcel, u.kind)
  from units u
  where public.is_operator()
  order by u.at desc nulls last, u.order_no
  limit 500;
$$;

create function public.admin_unmatched_parcels()
returns table (
  id uuid, waybill_no text, arrived_at timestamptz, sender_initial text, shelf text, state text,
  deadline_at timestamptz, matched_order_no text
)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.waybill_no, u.arrived_at, u.sender_initial, u.shelf,
         case when u.matched_parcel_id is not null then 'matched' when u.expired_at is not null then 'expired' else 'waiting' end,
         u.arrived_at + interval '168 hours',
         o.order_no
  from public.office_unmatched u
  left join public.office_parcels p on p.id = u.matched_parcel_id
  left join public.boxes b on b.id = p.box_id
  left join public.orders o on o.id = b.order_id
  where public.is_operator()
  order by (u.matched_parcel_id is null and u.expired_at is null) desc, u.arrived_at desc
  limit 500;
$$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.office_check_waybill(text) from public, anon, authenticated;
revoke all on function public.office_lock_qr(text) from public, anon, authenticated;
revoke all on function public.office_parcel_shippable(public.office_parcels) from public, anon, authenticated;
revoke all on function public.office_parcel_dead(public.office_parcels) from public, anon, authenticated;
revoke all on function public.office_sync_order(uuid) from public, anon, authenticated;
revoke all on function public.office_sync(uuid) from public, anon, authenticated;

revoke all on function public.set_box_waybill(uuid, text) from public, anon;
revoke all on function public.set_share_waybill(uuid, text) from public, anon;
revoke all on function public.match_unmatched(uuid, text) from public, anon;
revoke all on function public.office_scan_inbound(text) from public, anon;
revoke all on function public.office_confirm_label(text) from public, anon;
revoke all on function public.office_record_unmatched(text, text, text) from public, anon;
revoke all on function public.office_record_inspection(text, jsonb) from public, anon;
revoke all on function public.office_scan_inspect(text) from public, anon;
revoke all on function public.office_print_label(text, text) from public, anon;
revoke all on function public.office_confirm_shipment(text, text) from public, anon;
revoke all on function public.office_print_return_label(text, text) from public, anon;
revoke all on function public.office_confirm_return(text, text) from public, anon;
revoke all on function public.office_run_expiry(text) from public, anon;
revoke all on function public.admin_office_parcels() from public, anon;
revoke all on function public.admin_unmatched_parcels() from public, anon;
revoke all on function public.office_next_step(public.office_parcels, text) from public, anon, authenticated;
revoke all on function public.office_my_pending_label() from public, anon;
revoke all on function public.office_parcel_by_qr(text) from public, anon;
revoke all on function public.admin_expiry_due() from public, anon;
revoke all on function public.admin_revgift_shares() from public, anon;
revoke all on function public.my_gift_boxes(text) from public, anon;
revoke all on function public.my_share_boxes() from public, anon;

grant execute on function public.set_box_waybill(uuid, text) to authenticated;
grant execute on function public.set_share_waybill(uuid, text) to authenticated;
grant execute on function public.match_unmatched(uuid, text) to authenticated;
grant execute on function public.office_scan_inbound(text) to authenticated;
grant execute on function public.office_confirm_label(text) to authenticated;
grant execute on function public.office_record_unmatched(text, text, text) to authenticated;
grant execute on function public.office_record_inspection(text, jsonb) to authenticated;
grant execute on function public.office_scan_inspect(text) to authenticated;
grant execute on function public.office_print_label(text, text) to authenticated;
grant execute on function public.office_confirm_shipment(text, text) to authenticated;
grant execute on function public.office_print_return_label(text, text) to authenticated;
grant execute on function public.office_confirm_return(text, text) to authenticated;
grant execute on function public.office_run_expiry(text) to authenticated, service_role;
grant execute on function public.admin_office_parcels() to authenticated;
grant execute on function public.admin_unmatched_parcels() to authenticated;
grant execute on function public.office_my_pending_label() to authenticated;
grant execute on function public.office_parcel_by_qr(text) to authenticated;
grant execute on function public.admin_expiry_due() to authenticated;
grant execute on function public.admin_revgift_shares() to authenticated;
grant execute on function public.my_gift_boxes(text) to authenticated;
grant execute on function public.my_share_boxes() to authenticated;
