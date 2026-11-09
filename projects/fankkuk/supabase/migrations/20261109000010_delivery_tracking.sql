-- 배송 조회 서비스(택배API) 연결 — DECISIONS 2026-11-09 「배송 현황 표시·조회 연동」 ⑦~⑨ · 「택배API 환경 변수 이름과 문서 대조」, docs/specs/delivery-status.md INV-DS7~DS14.
-- 하는 일:
--  ① 단계 설정값 하나(delivery_settings.source — estimate | webhook). 화면 단계·헤더 아이콘·선물함 delivered·팬 주소 사본 삭제·탈퇴 기준이 모두 이 값을 따른다(INV-DS11).
--     처음 값은 estimate — 이 파일을 적용해도 지금 동작은 그대로다. 바꾸는 법은 docs/deploy-runbook.md.
--  ② 송장마다 조회 줄(delivery_trackings) — 송장번호가 저장되면 같은 처리에서 구독 대기 줄이 생긴다(트리거, 실패해도 송장 저장은 그대로 — INV-DS12).
--  ③ 수신 처리(delivery_ingest) — 서명 검증은 앱이 먼저 한다(INV-DS7). 모르는 송장 무시(DS9), 단계는 앞으로만·배달 완료 시각 한 번(DS8),
--     이력은 시각·상태 코드만, 원본은 화면이 읽지 못하는 표에 따로 두고 90일 뒤 지운다(DS10). webhook 이면 주문·역조공 몫·선물함 신청에 반영.
--  ④ 판정 둘 — 배달 완료로 보는가(delivery_done) · 사본을 지울 때인가(delivery_copy_drop_due). estimate 면 지금대로 출고 기준.
--  ⑤ 탈퇴 판정(account_has_open_work)과 선물함 자동 처리(revgift_box_tick)의 사본 삭제가 ④ 를 쓴다. 역조공 몫의 사본 삭제(office_drop_address_copies)는
--     개인정보 구역을 지우는 함수라 manual/0035 가 같은 판정으로 바꾼다 — 0035 전에는 그 하나만 출고 + 72시간 그대로다(estimate 에서는 차이 없음).
--  ⑥ 화면 읽기에 택배사 단계(carrier)만 더한다 — 송장번호·이력은 넣지 않는다(INV-DS3). 운영자 읽기는 송장 끝 네 자리·단계·마지막 수신 시각만(DS14).
--  ⑦ 예약 작업 둘: 구독 대기 줄 보내기(앱 /api/cron/delivery, 10분마다) · 원본 90일 정리(하루 한 번).

-- ── ① 설정값 ──────────────────────────────────

create table if not exists public.delivery_settings (
  id boolean primary key default true check (id),
  source text not null default 'estimate' check (source in ('estimate', 'webhook')),
  copy_after_delivery_hours integer not null default 24 check (copy_after_delivery_hours between 1 and 720),
  no_signal_days integer not null default 14 check (no_signal_days between 1 and 60),
  stale_hours integer not null default 24 check (stale_hours between 1 and 240),
  raw_keep_days integer not null default 90 check (raw_keep_days between 1 and 3650)
);
alter table public.delivery_settings enable row level security;
revoke all on public.delivery_settings from anon, authenticated;
insert into public.delivery_settings (id) values (true) on conflict (id) do nothing;

-- 화면이 단계를 계산할 때 넘겨받는 값 — 비밀이 아니다
create or replace function public.delivery_status_source()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.source from public.delivery_settings s), 'estimate');
$$;
revoke all on function public.delivery_status_source() from public;
grant execute on function public.delivery_status_source() to anon, authenticated, service_role;

-- ── ② 조회 줄·이력·원본 ──────────────────────────────────

create table if not exists public.delivery_trackings (
  id uuid primary key default gen_random_uuid(),
  courier_code text not null check (courier_code in ('cj', 'post')),
  waybill_no text not null check (waybill_no ~ '^[0-9]{10,14}$'),
  parcel_id uuid references public.office_parcels (id) on delete cascade,
  application_id uuid references public.revgift_box_applications (id) on delete cascade,
  created_at timestamptz not null default now(),
  subscribe_state text not null default 'pending' check (subscribe_state in ('pending', 'subscribed')),
  subscribe_tries integer not null default 0,
  subscribe_error text check (subscribe_error is null or subscribe_error ~ '^[A-Za-z0-9_]{1,60}$'),
  next_try_at timestamptz not null default now(),
  subscribed_at timestamptz,
  carrier_state text check (carrier_state in ('picked_up', 'in_transit', 'delivered')),
  last_status text check (last_status is null or last_status ~ '^[A-Z_]{1,30}$'),
  last_event_at timestamptz,
  delivered_at timestamptz,
  unique (courier_code, waybill_no),
  check (num_nonnulls(parcel_id, application_id) = 1),
  check ((subscribe_state = 'subscribed') = (subscribed_at is not null)),
  check ((carrier_state is not distinct from 'delivered') = (delivered_at is not null))
);
create index if not exists delivery_trackings_parcel_idx on public.delivery_trackings (parcel_id) where parcel_id is not null;
create index if not exists delivery_trackings_application_idx on public.delivery_trackings (application_id) where application_id is not null;
create index if not exists delivery_trackings_pending_idx on public.delivery_trackings (next_try_at) where subscribe_state = 'pending';
alter table public.delivery_trackings enable row level security;
revoke all on public.delivery_trackings from anon, authenticated;

-- 이력 — 시각·상태 코드만(위치·설명·사람 칸 없음, INV-DS10). (송장, 시각, 상태)마다 한 줄(INV-DS8)
create table if not exists public.delivery_tracking_events (
  tracking_id uuid not null references public.delivery_trackings (id) on delete cascade,
  at timestamptz not null,
  status text not null check (status ~ '^[A-Z_]{1,30}$'),
  received_at timestamptz not null default now(),
  primary key (tracking_id, at, status)
);
alter table public.delivery_tracking_events enable row level security;
revoke all on public.delivery_tracking_events from anon, authenticated;

-- 원본 — 택배사가 준 그대로(대리점·기사·수령인 포함). 분쟁용으로 90일만. 로그인 사용자·익명은 읽지 못하고 읽는 함수도 없다(INV-DS10)
create table if not exists public.delivery_tracking_raw (
  id bigint generated always as identity primary key,
  tracking_id uuid not null references public.delivery_trackings (id) on delete cascade,
  received_at timestamptz not null default now(),
  origin text not null check (origin in ('webhook', 'trace')),
  content_hash text not null,
  body jsonb not null,
  unique (tracking_id, content_hash)
);
create index if not exists delivery_tracking_raw_received_idx on public.delivery_tracking_raw (received_at);
alter table public.delivery_tracking_raw enable row level security;
revoke all on public.delivery_tracking_raw from anon, authenticated;

-- 송장번호가 저장되면 구독 대기 줄 — 택배사 코드는 기본 택배 경로의 실제 운송사(로지아이 → cj, 우체국 → post, 대리점 → 없음).
-- 무슨 일이 있어도 송장 저장을 막지 않는다(INV-DS12) — 실패는 경고만 남긴다.
create or replace function public.delivery_track_waybill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_courier text;
begin
  if new.outbound_waybill_no is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.outbound_waybill_no is not distinct from new.outbound_waybill_no then
      return new;
    end if;
  end if;
  begin
    -- 번호를 고쳐 넣었으면 이전 번호의 조회 줄(이력·원본 포함)을 지운다 — 남의 송장 이력이 쌓이거나 단계에 섞이지 않게
    if tg_op = 'UPDATE' and old.outbound_waybill_no is not null then
      if tg_table_name = 'office_parcels' then
        delete from public.delivery_trackings d where d.parcel_id = new.id and d.waybill_no = old.outbound_waybill_no;
      else
        delete from public.delivery_trackings d where d.application_id = new.id and d.waybill_no = old.outbound_waybill_no;
      end if;
    end if;
    select case s.default_route when 'post_office' then 'post' when 'logii_cj_a' then 'cj' when 'logii_visit' then 'cj' end
      into v_courier from public.pricing_settings s limit 1;
    if v_courier is not null then
      if tg_table_name = 'office_parcels' then
        insert into public.delivery_trackings (courier_code, waybill_no, parcel_id) values (v_courier, new.outbound_waybill_no, new.id)
        on conflict (courier_code, waybill_no) do nothing;
      else
        insert into public.delivery_trackings (courier_code, waybill_no, application_id) values (v_courier, new.outbound_waybill_no, new.id)
        on conflict (courier_code, waybill_no) do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'delivery_track_waybill: 구독 대기 줄을 만들지 못했다 (%)', sqlstate;
  end;
  return new;
end $$;
revoke all on function public.delivery_track_waybill() from public, anon, authenticated, service_role;

drop trigger if exists office_parcels_delivery_track on public.office_parcels;
create trigger office_parcels_delivery_track after insert or update of outbound_waybill_no on public.office_parcels
  for each row execute function public.delivery_track_waybill();
drop trigger if exists revgift_box_applications_delivery_track on public.revgift_box_applications;
create trigger revgift_box_applications_delivery_track after insert or update of outbound_waybill_no on public.revgift_box_applications
  for each row execute function public.delivery_track_waybill();

-- ── ③ 수신 처리 ──────────────────────────────────

-- 택배사 상태 코드 → 단계. 목록 밖·단계 없는 코드는 null(단계를 바꾸지 않는다)
create or replace function public.delivery_state_of(p_status text)
returns text
language sql immutable set search_path = ''
as $$
  select case p_status
    when 'PICKED_UP' then 'picked_up'
    when 'IN_TRANSIT' then 'in_transit'
    when 'OUT_FOR_DELIVERY' then 'in_transit'
    when 'DELIVERED' then 'delivered' end;
$$;

create or replace function public.delivery_state_rank(p_state text)
returns integer
language sql immutable set search_path = ''
as $$
  select case p_state when 'picked_up' then 1 when 'in_transit' then 2 when 'delivered' then 3 else 0 end;
$$;

-- webhook 일 때 주문·역조공 몫·선물함 신청에 반영(INV-DS11 ②). 팬 선물은 주문의 출고 상자가 모두 배달 완료일 때 배달 완료.
create or replace function public.delivery_project(p_tracking uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.delivery_trackings;
  p public.office_parcels;
  v_order uuid;
  v_all boolean;
  v_any boolean;
  v_box uuid;
  v_to text;
begin
  select * into t from public.delivery_trackings d where d.id = p_tracking;
  if t.id is null or t.carrier_state is null then
    return;
  end if;
  if t.application_id is not null then
    if t.carrier_state = 'delivered' then
      -- 잠금 순서: 선물함 → 신청(INV-GB2)
      select a.box_id into v_box from public.revgift_box_applications a where a.id = t.application_id;
      perform 1 from public.revgift_boxes b where b.id = v_box for update;
      update public.revgift_box_applications set status = 'delivered' where id = t.application_id and status = 'shipped';
    end if;
    return;
  end if;
  select * into p from public.office_parcels op where op.id = t.parcel_id;
  if p.share_id is not null then
    v_to := case when t.carrier_state = 'delivered' then 'delivered' else 'in_transit' end;
    update public.revgift_shares s set delivery = v_to
    where s.id = p.share_id and s.shipped_at is not null and s.delivery is distinct from 'delivered' and s.delivery is distinct from v_to;
  elsif p.box_id is not null then
    select b.order_id into v_order from public.boxes b where b.id = p.box_id;
    perform 1 from public.orders o where o.id = v_order for update;
    select bool_and(coalesce(dt.carrier_state = 'delivered', false)), bool_or(dt.carrier_state is not null) into v_all, v_any
    from public.boxes b join public.office_parcels op on op.box_id = b.id
    left join public.delivery_trackings dt on dt.parcel_id = op.id
    where b.order_id = v_order and op.state = 'shipped';
    if coalesce(v_any, false) then
      v_to := case when v_all then 'delivered' else 'in_transit' end;
      update public.orders o set delivery = v_to
      where o.id = v_order and o.status = 'shipped' and o.delivery is distinct from 'delivered' and o.delivery is distinct from v_to;
    end if;
  end if;
end $$;
revoke all on function public.delivery_project(uuid) from public, anon, authenticated, service_role;

-- 받은 항목 처리. p_items 는 앱이 서명을 확인하고 정리한 꼴: [{courier_code, tracking_number, status, progresses:[{at, status}], raw}]
-- 서버(service_role)만 부른다. 돌려주는 것은 수만.
create or replace function public.delivery_ingest(p_items jsonb, p_origin text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  it jsonb;
  pg jsonb;
  t public.delivery_trackings;
  v_progresses jsonb;
  v_state text;
  v_new integer;
  v_status text;
  v_source text := public.delivery_status_source();
  n_saved integer := 0;
  n_ignored integer := 0;
begin
  if p_origin is null or p_origin not in ('webhook', 'trace') then
    raise exception '출처가 목록에 없다' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then
    raise exception '항목 꼴이 아니다' using errcode = '22023';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    t := null;
    select * into t from public.delivery_trackings d
    where d.courier_code = it ->> 'courier_code' and d.waybill_no = it ->> 'tracking_number' for update;
    -- 팬꾹이 등록하지 않은 송장은 아무것도 남기지 않는다(INV-DS9)
    if t.id is null then
      n_ignored := n_ignored + 1;
      continue;
    end if;
    v_status := case when (it ->> 'status') ~ '^[A-Z_]{1,30}$' then it ->> 'status' end;
    v_progresses := case when jsonb_typeof(it -> 'progresses') = 'array' then it -> 'progresses' else '[]'::jsonb end;

    v_new := 0;
    for pg in select * from jsonb_array_elements(v_progresses) loop
      if (pg ->> 'status') ~ '^[A-Z_]{1,30}$' and (pg ->> 'at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then
        insert into public.delivery_tracking_events (tracking_id, at, status) values (t.id, (pg ->> 'at')::timestamptz, pg ->> 'status')
        on conflict do nothing;
        if found then
          v_new := v_new + 1;
        end if;
      end if;
    end loop;

    -- 단계는 앞으로만(INV-DS8): 지금 단계 · 받은 상태 · 이력의 상태 중 가장 앞선 것
    select z.s into v_state from (
      select t.carrier_state as s
      union all select public.delivery_state_of(v_status)
      union all select public.delivery_state_of(e ->> 'status') from jsonb_array_elements(v_progresses) e
    ) z where z.s is not null order by public.delivery_state_rank(z.s) desc limit 1;

    update public.delivery_trackings d
       set carrier_state = v_state,
           last_status = coalesce(v_status, d.last_status),
           last_event_at = now(),
           delivered_at = case when v_state = 'delivered' then coalesce(d.delivered_at, now()) else d.delivered_at end
     where d.id = t.id;

    -- 원본은 처음 받았을 때와 새 이력이 생겼을 때만, 같은 내용이면 하나(INV-DS8·DS10)
    if v_new > 0 or not exists (select 1 from public.delivery_tracking_raw r where r.tracking_id = t.id) then
      insert into public.delivery_tracking_raw (tracking_id, origin, content_hash, body)
      values (t.id, p_origin, md5(coalesce(it -> 'raw', '{}'::jsonb)::text), coalesce(it -> 'raw', '{}'::jsonb))
      on conflict (tracking_id, content_hash) do nothing;
    end if;

    if v_source = 'webhook' then
      perform public.delivery_project(t.id);
    end if;
    n_saved := n_saved + 1;
  end loop;
  return jsonb_build_object('saved', n_saved, 'ignored', n_ignored);
end $$;
revoke all on function public.delivery_ingest(jsonb, text) from public, anon, authenticated;
grant execute on function public.delivery_ingest(jsonb, text) to service_role;

-- ── ④ 판정 둘 (INV-DS11) ──────────────────────────────────

-- 배달 완료로 보는가 — 출고된 것에만 부른다. estimate: 출고 = 끝. webhook: 배달 완료, 또는 출고 + 신호 없음 상한.
-- 조회 줄이 없는 송장(연결 전 출고·대리점 경로)은 estimate 와 같다.
create or replace function public.delivery_done(p_parcel uuid, p_application uuid, p_shipped_at timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when s.source = 'estimate' then true
    else coalesce((
      select t.delivered_at is not null or p_shipped_at <= now() - make_interval(days => s.no_signal_days)
      from public.delivery_trackings t
      where (p_parcel is not null and t.parcel_id = p_parcel) or (p_application is not null and t.application_id = p_application)
      order by t.created_at desc limit 1), true)
  end
  from public.delivery_settings s;
$$;
revoke all on function public.delivery_done(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

-- 팬 주소 사본을 지울 때인가 — estimate: 출고 + p_estimate_hours(지금 72시간). webhook: 배달 완료 + 24시간, 배달 완료가 없으면 출고 + 신호 없음 상한.
create or replace function public.delivery_copy_drop_due(p_parcel uuid, p_application uuid, p_shipped_at timestamptz, p_estimate_hours integer)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_shipped_at is null then false
    when s.source = 'estimate' then p_shipped_at <= now() - make_interval(hours => p_estimate_hours)
    else coalesce((
      select case when t.delivered_at is not null then t.delivered_at <= now() - make_interval(hours => s.copy_after_delivery_hours)
                  else p_shipped_at <= now() - make_interval(days => s.no_signal_days) end
      from public.delivery_trackings t
      where (p_parcel is not null and t.parcel_id = p_parcel) or (p_application is not null and t.application_id = p_application)
      order by t.created_at desc limit 1), p_shipped_at <= now() - make_interval(hours => p_estimate_hours))
  end
  from public.delivery_settings s;
$$;
revoke all on function public.delivery_copy_drop_due(uuid, uuid, timestamptz, integer) from public, anon, authenticated, service_role;

-- ── ⑤ 탈퇴 판정 · 선물함 사본 삭제 ──────────────────────────────────

-- 진행 중인 일 — 20261109000003 본문 그대로에 맨 끝 세 갈래(webhook 일 때 배달 완료 전 출고)를 더한다.
create or replace function public.account_has_open_work(p_account uuid, p_creator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with my_orders as (
    select o.id from public.orders o where o.fan_id = p_account or (p_creator is not null and o.creator_id = p_creator)
  ), my_shares as (
    select s.id, s.reply, s.shipped_at, s.returned_at, s.cancelled_at, s.disposed_at
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where (s.fan_id = p_account or (p_creator is not null and d.creator_id = p_creator))
      and d.status <> 'failed'
  )
  select exists (select 1 from my_orders m where not public.order_is_finished(m.id))
    or exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id join my_orders m on m.id = b.order_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from public.office_parcels op join my_shares m on m.id = op.share_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from my_shares where reply in ('waiting', 'accepted')
               and shipped_at is null and returned_at is null and cancelled_at is null and disposed_at is null)
    or exists (select 1 from public.revgift_sends d where p_creator is not null and d.creator_id = p_creator and d.status in ('pending', 'confirming'))
    -- 돌려줄 환불이 끝나지 않음(INV-A15 S15d): 주문 결제 · 닫힌 상자 · 역조공 몫.
    --   금액 함수를 부르기 전의 조건은 그 함수가 null 을 돌려주는 경우를 미리 거르는 것뿐이다(결과는 같고 줄마다 부르지 않는다)
    or exists (select 1 from public.payments p join my_orders m on m.id = p.order_id join public.orders o on o.id = p.order_id
               where p.status = 'done' and o.shipped_at is null
                 and coalesce(public.refund_due_of_payment(p.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.payment_id = p.id and r.box_id is null and r.status = 'done'))
    or exists (select 1 from public.boxes b join my_orders m on m.id = b.order_id
               where b.missing_at is not null
                 and coalesce(public.refund_due_of_box(b.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_id = b.id and r.status = 'done'))
    or exists (select 1 from my_shares m
               where m.reply in ('declined', 'expired') and m.shipped_at is null
                 and coalesce(public.refund_due_of_share(m.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.share_id = m.id and r.status = 'done'))
    -- 6자리를 살려 둔 동안은 환불 금액이 아직 정해지지 않았다 — 닫히면 환불이 생기고, 늦게 오면 사무실에 상자가 생긴다(보안·코드 리뷰 중간)
    or exists (select 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id join my_orders m on m.id = b.order_id
               where c.kept_at is not null and c.state = 'valid')
    or exists (select 1 from public.inbound_codes c join my_shares m on m.id = c.share_id
               where c.kept_at is not null and c.state = 'valid')
    -- 선물함(revgift-box) — 내가 만든 선물함이 끝나지 않았거나(끝 = 완료·반송됨·취소), 그 줄 환불이 끝나지 않았다
    or exists (select 1 from public.revgift_boxes gb where gb.owner_id = p_account and gb.status not in ('done', 'returned', 'cancelled'))
    or exists (select 1 from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id
               join public.revgift_boxes gb on gb.id = i.box_id
               where gb.owner_id = p_account and coalesce(public.revgift_box_line_refund_due(l.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done'))
    -- 선물함에 신청한 팬 — 신청한 순간부터 그 선물이 끝날 때까지(2026-11-09 결정). 끝난 신청 = 출고(배송 완료 포함 — 주문의 「출고면 끝」과 같다)·
    --   제외·신청 취소, 또는 선물함이 끝남(완료·반송됨·취소). 그 밖(신청·담길 차례·실측됨·결제됨, 그리고 도착 안 함·끝남이어도 선물함이 아직
    --   반송·발송 중)은 진행 중이다. 제외는 신청 받는 중이면 크리에이터가 되돌릴 수 있어 탈퇴 처리가 같은 처리에서 신청 취소로 닫는다.
    or exists (select 1 from public.revgift_box_applications a join public.revgift_boxes gb on gb.id = a.box_id
               where a.fan_id = p_account
                 and a.status not in ('shipped', 'delivered', 'excluded', 'withdrawn')
                 and gb.status not in ('done', 'returned', 'cancelled'))
    -- 배송 조회가 webhook 이면 출고가 아니라 배달 완료(또는 출고 + 신호 없음 상한)가 끝이다(delivery-status INV-DS11 ④). estimate 면 아래 셋은 늘 거짓이다
    or exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id join my_orders m on m.id = b.order_id
               where op.state = 'shipped' and not public.delivery_done(op.id, null, op.shipped_at))
    or exists (select 1 from public.office_parcels op join my_shares m on m.id = op.share_id
               where op.state = 'shipped' and not public.delivery_done(op.id, null, op.shipped_at))
    or exists (select 1 from public.revgift_box_applications a
               where a.fan_id = p_account and a.status = 'shipped' and not public.delivery_done(null, a.id, a.shipped_at));
$$;
revoke all on function public.account_has_open_work(uuid, uuid) from public, anon, authenticated, service_role;

-- 선물함 자동 처리 — 20261109000002 본문 그대로에서 ⑨ 의 시각 조건만 판정 함수로 바꾼다.
create or replace function public.revgift_box_tick()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rules jsonb := public.revgift_box_rules();
  r record;
  v public.revgift_boxes;
  v_ids uuid[];
  n_cancel integer := 0;
  n_missing integer := 0;
  n_hold integer := 0;
  n_card integer := 0;
  n_overdue integer := 0;
  n_return integer := 0;
  n_pending integer := 0;
  n_dropped integer := 0;
  n_failed integer := 0;
begin
  for r in select b.id from public.revgift_boxes b
           where b.status = 'awaiting_box' and now() >= b.box_requested_at + make_interval(hours => (v_rules ->> 'awaiting_box_hours')::integer) loop
    begin
      select * into v from public.revgift_boxes b where b.id = r.id for update;
      if v.status = 'awaiting_box' and not exists (select 1 from public.revgift_box_cartons c where c.box_id = v.id) then
        perform public.revgift_box_cancel_locked(v.id);
        n_cancel := n_cancel + 1;
      end if;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 자동 취소 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select b.id from public.revgift_boxes b
           where b.status in ('arrived', 'held') and now() >= b.first_received_at + make_interval(hours => (v_rules ->> 'carton_wait_hours')::integer)
             and exists (select 1 from public.revgift_box_applications a where a.box_id = b.id and a.status = 'selected') loop
    begin
      select * into v from public.revgift_boxes b where b.id = r.id for update;
      with gone as (
        update public.revgift_box_applications set status = 'missing' where box_id = v.id and status = 'selected' returning id
      ) select array_agg(id) into v_ids from gone;
      if v_ids is not null then
        perform pii.revgift_box_drop_copies(v_ids, 'missing');
        n_missing := n_missing + cardinality(v_ids);
      end if;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 도착 안 함 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select h.id, h.box_id from public.revgift_box_holds h
           where h.resolved_at is null and h.expired_at is null and now() >= h.created_at + make_interval(hours => (v_rules ->> 'hold_hours')::integer) loop
    select * into v from public.revgift_boxes b where b.id = r.box_id for update;
    update public.revgift_box_holds set expired_at = now() where id = r.id and resolved_at is null and expired_at is null;
    if v.status = 'held' and not exists (select 1 from public.revgift_box_holds h where h.box_id = v.id and h.resolved_at is null and h.expired_at is null) then
      update public.revgift_boxes set status = 'arrived' where id = v.id;
    end if;
    n_hold := n_hold + 1;
  end loop;

  for r in select c.id, c.box_id, c.unmatched_id from public.revgift_box_cancelled_arrivals c
           where c.choice is null and now() >= c.created_at + make_interval(hours => (v_rules ->> 'cancelled_arrival_hours')::integer) loop
    perform 1 from public.revgift_boxes b where b.id = r.box_id for update;
    update public.revgift_box_cancelled_arrivals set choice = 'return', chosen_at = now(), auto = true where id = r.id and choice is null;
    update public.office_unmatched set expired_at = coalesce(expired_at, now()) where id = r.unmatched_id and matched_at is null;
    n_card := n_card + 1;
  end loop;

  for r in select b.id from public.revgift_boxes b where b.status = 'arrived' loop
    begin
      perform public.revgift_box_try_invoice(r.id);
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 명세서 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ⑥ 결제 기한 지남 — 조건부 갱신 한 문장(결제 완료가 같은 줄을 잠그고 바꾸면 이 문장은 그 줄을 건너뛴다)
  update public.revgift_boxes b set status = 'overdue'
  where b.status = 'invoiced' and now() >= b.invoiced_at + make_interval(hours => (v_rules ->> 'pay_due_hours')::integer);
  get diagnostics n_overdue = row_count;

  -- ⑦ 착불 반송 — 선물함 줄을 잠근 뒤 다시 본다(결제 확정 시작과 같은 잠금, S19b). 승인 중이 있으면 그대로(S19c)
  for r in select b.id from public.revgift_boxes b
           where b.status in ('invoiced', 'overdue') and now() >= b.invoiced_at + make_interval(hours => (v_rules ->> 'unpaid_return_hours')::integer) loop
    begin
      select * into v from public.revgift_boxes b where b.id = r.id for update;
      if v.status in ('invoiced', 'overdue')
         and clock_timestamp() >= v.invoiced_at + make_interval(hours => (v_rules ->> 'unpaid_return_hours')::integer)
         and not exists (select 1 from public.revgift_box_payments p where p.box_id = v.id and p.status in ('confirming', 'done')) then
        update public.revgift_box_payments set status = 'failed' where box_id = v.id and status = 'pending';
        perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
        update public.revgift_box_applications set status_before_end = status, status = 'ended'
        where box_id = v.id and status in ('selected', 'measured');
        update public.revgift_boxes set status = 'returning', returning_at = now(), code_voided_at = coalesce(code_voided_at, now()) where id = v.id;
        perform public.revgift_box_give_back_early(array(
          select l.id from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id where i.box_id = v.id));
        perform pii.revgift_box_drop_copies(array(select a.id from public.revgift_box_applications a where a.box_id = v.id), 'unpaid_return');
        n_return := n_return + 1;
      end if;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 착불 반송 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ⑧ 24시간 지난 결제 대기 — 결제 대기인 줄만 실패로(결제 확정 시작과 같은 줄의 조건부 갱신이라 겹치면 먼저 잡은 쪽만)
  update public.revgift_box_payments set status = 'failed'
  where status = 'pending' and created_at <= now() - make_interval(hours => (v_rules ->> 'pending_payment_hours')::integer);
  get diagnostics n_pending = row_count;

  -- ⑨ 사본 삭제 — estimate 면 출고 + 72시간, webhook 이면 배달 완료 + 24시간(delivery-status INV-DS11 ③). 재출력은 출력 함수가 출고 + 72시간까지만 연다
  for r in select a.id, a.box_id from public.revgift_box_applications a
           where a.status in ('shipped', 'delivered') and a.copy_dropped_at is null
             and public.delivery_copy_drop_due(null, a.id, a.shipped_at, (v_rules ->> 'copy_after_ship_hours')::integer) loop
    begin
      perform 1 from public.revgift_boxes b where b.id = r.box_id for update;
      perform pii.revgift_box_drop_copies(array[r.id], 'shipped');
      update public.revgift_box_applications set copy_dropped_at = now() where id = r.id;
      n_dropped := n_dropped + 1;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 출고 사본 삭제 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('cancelled', n_cancel, 'missing', n_missing, 'holds_expired', n_hold, 'cards_returned', n_card,
                            'overdue', n_overdue, 'returning', n_return, 'pending_closed', n_pending, 'copies_dropped', n_dropped, 'failed', n_failed);
end $$;
revoke all on function public.revgift_box_tick() from public, anon, authenticated, service_role;

-- ── ⑥ 화면 읽기에 택배사 단계 ──────────────────────────────────

-- 팬이 보는 선물함 — 20261109000004 본문에 「내 배송」의 택배사 단계(carrier)만 더했다. 송장번호·이력 없음(INV-DS3)
create or replace function public.revgift_box_for_fan(p_box_id uuid, p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name,
    'creator', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name),
    'open', b.status = 'open',
    'viewer', case
      when auth.uid() is null then 'guest'
      when b.owner_id = auth.uid() then 'owner'
      when (select p.role from public.profiles p where p.id = auth.uid()) <> 'fan' then 'not_fan'
      when exists (select 1 from public.follows f where f.fan_id = auth.uid() and f.creator_id = b.creator_id) then 'follower'
      else 'not_follower' end,
    'my_state', case
      when a.status is null or a.status in ('withdrawn') then 'none'
      when a.status in ('applied', 'excluded') and b.status = 'open' then 'applied'
      when a.status in ('selected', 'measured', 'paid', 'shipped', 'delivered') then 'preparing'
      when b.status = 'cancelled' then 'cancelled'
      else 'closed' end,
    'delivery', case
      when a.status in ('paid', 'shipped', 'delivered') and (a.printed_at is not null or a.shipped_at is not null) then jsonb_build_object(
        'shipped_on', case when a.shipped_at is not null then to_char((a.shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') end,
        'received', a.fan_received_at is not null,
        'can_confirm', a.status in ('shipped', 'delivered') and a.fan_received_at is null,
        'carrier', (select t.carrier_state from public.delivery_trackings t where t.application_id = a.id order by t.created_at desc limit 1)) end)
  from public.revgift_boxes b
  join public.creators c on c.id = b.creator_id
  left join public.revgift_box_applications a on a.box_id = b.id and auth.uid() is not null and a.fan_id = auth.uid()
  where b.id = p_box_id and (b.is_public or (p_token is not null and b.invite_token = p_token));
$$;
revoke all on function public.revgift_box_for_fan(uuid, text) from public, service_role;
grant execute on function public.revgift_box_for_fan(uuid, text) to anon, authenticated;

-- 크리에이터의 선물함 — 20261109000004 본문에 명세서 줄의 택배사 단계(carrier)만 더했다
create or replace function public.my_revgift_box(p_box_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'capacity', b.capacity, 'is_public', b.is_public, 'status', b.status,
    'invite_token', b.invite_token, 'created_at', b.created_at,
    'inbound_code', case when b.code_voided_at is null and b.status in ('awaiting_box', 'arrived', 'held') then b.inbound_code end,
    'carton_count', b.carton_count,
    'cartons_received', (select count(*) from public.revgift_box_cartons c where c.box_id = b.id),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nickname', p.nickname, 'applied_at', a.applied_at, 'status', a.status, 'chosen_tier', a.chosen_tier)
                       order by a.applied_at, a.id)
      from public.revgift_box_applications a
      join public.profiles p on p.id = a.fan_id
      where a.box_id = b.id and a.status <> 'withdrawn'
    ), '[]'::jsonb),
    'invoice', (
      select jsonb_build_object(
        'amount_krw', i.amount_krw, 'shipping_fee_krw', i.shipping_fee_krw, 'service_fee_krw', i.service_fee_krw,
        'carton_cod_krw', i.carton_cod_krw, 'created_at', i.created_at,
        'pay_due_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'pay_due_hours')::integer),
        'return_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'unpaid_return_hours')::integer),
        'paying', exists (select 1 from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'confirming'),
        'paid_at', (select x.settled_at from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'done'),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'nickname', p.nickname, 'tier', l.tier, 'shipping_fee_krw', l.shipping_fee_krw, 'surcharge_region', l.surcharge_region,
                   'surcharge_krw', l.surcharge_krw, 'service_fee_krw', l.service_fee_krw, 'amount_krw', l.amount_krw,
                   'progress', case
                     when a.status in ('shipped', 'delivered') then 'shipped'
                     when a.status = 'ended' and exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done') then 'refunded'
                     when a.status = 'ended' then 'ended'
                     when a.status = 'paid' then 'paid'
                     else 'unpaid' end,
                   -- 배송 단계 재료(delivery-status INV-DS1·DS2) — 송장 출력 여부·출고한 서울 날짜·팬의 받았어요. 송장번호는 넣지 않는다(INV-DS3)
                   'printed', a.printed_at is not null or a.shipped_at is not null,
                   'shipped_on', case when a.shipped_at is not null then to_char((a.shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') end,
                   'received', a.fan_received_at is not null,
                   'carrier', (select t.carrier_state from public.delivery_trackings t where t.application_id = a.id order by t.created_at desc limit 1)) order by l.line_no)
          from public.revgift_box_invoice_lines l
          join public.revgift_box_applications a on a.id = l.application_id
          join public.profiles p on p.id = a.fan_id
          where l.invoice_id = i.id), '[]'::jsonb))
      from public.revgift_box_invoices i where i.box_id = b.id))
  from public.revgift_boxes b
  where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid();
$$;
revoke all on function public.my_revgift_box(uuid) from public, anon, service_role;
grant execute on function public.my_revgift_box(uuid) to authenticated;

-- 크리에이터가 받은 상자 — 20261011000004 본문에 택배사 단계(carrier)만 더했다(돌려주는 꼴이 바뀌어 지우고 다시 만든다)
drop function if exists public.my_received_boxes();
create or replace function public.my_received_boxes()
returns table (box_id uuid, order_no text, box_seq integer, box_count integer, sender_nickname text, item_category text, item_kind text,
               shipped_on date, received_on date, reply_state text, phrase text, line text, replied_on date, carrier text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, o.order_no, b.seq::integer,
         (select count(*)::integer from public.boxes x where x.order_id = o.id),
         f.nickname, o.item_category, o.item_kind,
         public.receiving_today_at(p.shipped_at),
         public.receiving_today_at(r.received_at),
         case when r.box_id is null then 'none'
              when r.deleted_at is not null then 'deleted'
              when r.phrase is not null then 'replied'
              else 'confirmed' end,
         r.phrase, r.line,
         case when r.deleted_at is null then public.receiving_today_at(r.replied_at) end,
         (select t.carrier_state from public.delivery_trackings t where t.parcel_id = p.id order by t.created_at desc limit 1)
  from public.office_parcels p
  join public.boxes b on b.id = p.box_id
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles me on me.id = c.profile_id and me.role = 'creator'
  join public.profiles f on f.id = o.fan_id
  left join public.gift_replies r on r.box_id = b.id
  where c.profile_id = auth.uid() and p.state = 'shipped'
  order by p.shipped_at desc, o.order_no, b.seq
  limit 200;
$$;
revoke all on function public.my_received_boxes() from public, anon;
grant execute on function public.my_received_boxes() to authenticated;

-- ── 구독 대기 줄 (INV-DS12) ──────────────────────────────────

-- 보낼 차례인 대기 줄을 잡는다 — 잡는 순간 다음 시도 시각을 미뤄 두어 겹쳐 부른 일꾼이 같은 줄을 두 번 보내지 않는다.
-- 출고(줄 생성) + 신호 없음 상한이 지난 줄은 더 보내지 않는다(조회 서비스도 그만큼만 본다). 서버만.
create or replace function public.delivery_subscribe_claim(p_limit integer)
returns table (id uuid, courier_code text, waybill_no text)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  update public.delivery_trackings d
     set subscribe_tries = d.subscribe_tries + 1,
         next_try_at = now() + make_interval(mins => least(1440, 10 * power(2, least(d.subscribe_tries, 8))::integer))
   where d.id in (
     select x.id from public.delivery_trackings x, public.delivery_settings s
     where x.subscribe_state = 'pending' and x.next_try_at <= now()
       and x.created_at > now() - make_interval(days => s.no_signal_days)
     order by x.next_try_at
     limit greatest(1, least(coalesce(p_limit, 50), 100))
     for update of x skip locked)
  returning d.id, d.courier_code, d.waybill_no;
end $$;
revoke all on function public.delivery_subscribe_claim(integer) from public, anon, authenticated;
grant execute on function public.delivery_subscribe_claim(integer) to service_role;

-- 보낸 결과. p_error 가 null 이면 구독됨, 아니면 오류 코드만 남기고 대기 그대로(다음 시도 시각은 잡을 때 이미 미뤘다)
create or replace function public.delivery_subscribe_result(p_ids uuid[], p_error text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if p_error is null then
    update public.delivery_trackings d set subscribe_state = 'subscribed', subscribed_at = now(), subscribe_error = null
    where d.id = any (coalesce(p_ids, '{}')) and d.subscribe_state = 'pending';
  else
    update public.delivery_trackings d
       set subscribe_error = case when p_error ~ '^[A-Za-z0-9_]{1,60}$' then p_error else 'unknown' end
    where d.id = any (coalesce(p_ids, '{}')) and d.subscribe_state = 'pending';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.delivery_subscribe_result(uuid[], text) from public, anon, authenticated;
grant execute on function public.delivery_subscribe_result(uuid[], text) to service_role;

-- ── 운영자 (INV-DS14) ──────────────────────────────────

-- 살펴볼 송장 — 아직 배달 완료가 아니고 신호 없음 상한 안인 것 중, 구독 대기이거나 마지막 수신이 24시간 넘은 것.
-- 송장번호는 끝 네 자리만, 이력·원본 칸 없음(INV-DS10). 운영자가 아니면 빈 목록.
create or replace function public.admin_delivery_watch()
returns table (tracking_id uuid, kind text, waybill_last4 text, carrier_state text, last_status text,
               subscribe_state text, subscribe_error text, since timestamptz, last_event_at timestamptz, stale boolean)
language sql stable security definer set search_path = ''
as $$
  select t.id,
         case when t.application_id is not null then 'gift_box'
              when (select op.share_id from public.office_parcels op where op.id = t.parcel_id) is not null then 'revgift'
              else 'gift' end,
         right(t.waybill_no, 4), t.carrier_state, t.last_status, t.subscribe_state, t.subscribe_error,
         coalesce(t.subscribed_at, t.created_at), t.last_event_at,
         t.subscribe_state = 'subscribed' and coalesce(t.last_event_at, t.subscribed_at) <= now() - make_interval(hours => s.stale_hours)
  from public.delivery_trackings t, public.delivery_settings s
  where public.is_operator()
    and t.delivered_at is null
    and t.created_at > now() - make_interval(days => s.no_signal_days)
    and (t.subscribe_state = 'pending' or coalesce(t.last_event_at, t.subscribed_at) <= now() - make_interval(hours => s.stale_hours))
  order by coalesce(t.last_event_at, t.subscribed_at, t.created_at)
  limit 200;
$$;
revoke all on function public.admin_delivery_watch() from public, anon, service_role;
grant execute on function public.admin_delivery_watch() to authenticated;

-- 수동 조회 대상 — 운영자만, 50개까지. 송장번호 전체는 서버가 조회 서비스에 넘길 때만 쓰고 화면에 돌려주지 않는다.
create or replace function public.admin_delivery_trace_targets(p_ids uuid[])
returns table (tracking_id uuid, courier_code text, waybill_no text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 50 then
    raise exception '한 번에 50개까지' using errcode = '22023';
  end if;
  return query select t.id, t.courier_code, t.waybill_no from public.delivery_trackings t where t.id = any (coalesce(p_ids, '{}'));
end $$;
revoke all on function public.admin_delivery_trace_targets(uuid[]) from public, anon, service_role;
grant execute on function public.admin_delivery_trace_targets(uuid[]) to authenticated;

-- ── 원본 90일 정리 (INV-DS10) ──────────────────────────────────

create or replace function public.delivery_raw_purge()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.delivery_tracking_raw r using public.delivery_settings s
  where r.received_at <= now() - make_interval(days => s.raw_keep_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.delivery_raw_purge() from public, anon, authenticated, service_role;

-- 구독 대기 줄 보내기 — 앱의 /api/cron/delivery 를 알림 예약 발송과 같은 비밀 값·주소로 부른다(20261008000012 와 같은 조건).
create or replace function public.schedule_delivery_subscribe()
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_origin text;
  v_secret text;
begin
  if not exists (select 1 from public.delivery_trackings d where d.subscribe_state = 'pending' and d.next_try_at <= now()) then
    return null;
  end if;
  select s.decrypted_secret into v_origin from vault.decrypted_secrets s where s.name = 'fankkuk_app_origin';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'fankkuk_schedule_secret';
  if v_origin is null or v_secret is null or char_length(v_secret) < 32
     or not (v_origin ~ '^https://[^/?#@]+$' or v_origin ~ '^http://(localhost|127\.0\.0\.1|host\.docker\.internal)(:[0-9]{1,5})?$') then
    return null;
  end if;
  return net.http_post(
    url := v_origin || '/api/cron/delivery',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000
  );
end $$;
revoke all on function public.schedule_delivery_subscribe() from public, anon, authenticated, service_role;

select cron.schedule('fankkuk-delivery-subscribe', '*/10 * * * *', 'select public.schedule_delivery_subscribe()');
select cron.schedule('fankkuk-delivery-raw-purge', '40 18 * * *', 'select public.delivery_raw_purge()');

notify pgrst, 'reload schema';
