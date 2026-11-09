-- 2026-11-09 로지아이 답 반영 (DECISIONS 2026-11-09 「로지아이 답 반영」 ③④).
-- ① 팬 선물 출고 알림(shipped)은 주문이 「송장 출력」 단계가 될 때 생긴다 — 전에는 출고 확정(shipped) 때였다(notifications INV-N3).
--    운영 루틴이 「저녁에 송장 출력 → 다음 날 집하」라, 출고 확정 스캔을 기다리면 알림이 하루 늦는다.
--    office_sync_order 본문은 20261017000004 와 같고, 출고 알림을 부르는 단계 번호만 5(출고) → 4(송장 출력)로 바꿨다.
-- ② 월 발송 건수와 「택배 경로 재검토」 기준(admin-console INV-K17). 기준 30건·두 달은 설정값(요금 설정 줄의 두 칸).
-- ③ 요금표 택배 원가 칸을 지금 기본 경로의 값으로 한 번 맞춘다(INV-K15 — 저장할 것이 없으면 맞출 길이 없던 결함).
-- pii 는 건드리지 않는다.

-- ── ① 출고 알림 시점 ───────────────────────────────────
-- 20261017000004 와 같고, 출고 알림 단계만 송장 출력(4)으로
CREATE OR REPLACE FUNCTION public.office_sync_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_min integer;
  v_now integer;
  v_returned boolean;
  v_old public.orders;
  v_new public.orders;
  v_old_idx integer;
  v_new_idx integer;
  v_creator_account uuid;
begin
  select * into v_old from public.orders o where o.id = p_order_id for update;

  -- 닫힌 상자(도착하지 않음, INV-W10)는 세지 않는다 — 그 상자를 기다리느라 남은 상자가 멈추지 않게.
  -- 크리에이터 확인 대기(held)는 「라벨 부착」(2)으로 센다 — 답이 나기 전에는 주문의 검수가 끝나지 않는다(2026-10-12 (2) D3 ②)
  -- 추적기 보관·신고 보관은 검수 반송과 같이 3, 경찰 인계는 반송 확정처럼 세지 않는다 — 셋 다 검수 결과는 「반송」(검수 불합격 줄, INV-W14)
  select coalesce(min(case p.state
           when 'received' then 1 when 'labeled' then 2
           when 'inspected' then 3 when 'return_waiting' then 3 when 'return_printed' then 3 when 'dispose_due' then 3
           when 'tracker_held' then 3 when 'report_held' then 3
           when 'label_printed' then 4 when 'shipped' then 5
           when 'held' then 2 when 'returned' then null when 'police_handed' then null when 'disposed' then null
           else 0 end) filter (where p.state is null or p.state not in ('returned', 'police_handed', 'disposed')), 3),
         bool_or(p.state in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'tracker_held', 'report_held', 'police_handed'))
    into v_min, v_returned
  from public.boxes b left join public.office_parcels p on p.box_id = b.id
  where b.order_id = p_order_id and b.missing_at is null;

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

  -- ── 알림 (notifications INV-N3·N4·N8) ──
  select * into v_new from public.orders o where o.id = p_order_id;
  if v_new.id is null then
    return;
  end if;

  -- 상자가 처음 입고됨 + 승인 요청이 아직 대기 → 승인 요청 2차(크리에이터)
  if v_old.received_at is null and v_new.received_at is not null then
    select c.profile_id into v_creator_account from public.creators c where c.id = v_new.creator_id;
    perform public.notification_enqueue('approval_request', v_new.id, r.id, 2::smallint, v_creator_account, now())
    from public.approval_requests r
    where r.order_id = v_new.id and r.status = 'waiting';
  end if;

  -- 주문 상태가 입고·검수·송장 출력 단계를 넘음 → 팬(출고 알림은 송장 출력 때, INV-N3). 상태는 줄지 않으므로 넘은 단계마다 한 번.
  v_old_idx := coalesce(array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], v_old.status::text) - 1, -1);
  v_new_idx := coalesce(array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], v_new.status::text) - 1, -1);
  if v_old_idx >= 0 and v_new_idx > v_old_idx then
    if v_old_idx < 1 and v_new_idx >= 1 then
      perform public.notification_enqueue('arrived', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
    if v_old_idx < 3 and v_new_idx >= 3 then
      perform public.notification_enqueue('inspected', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
    if v_old_idx < 4 and v_new_idx >= 4 then
      perform public.notification_enqueue('shipped', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
  end if;
end $function$

;

-- ── ② 월 발송 건수 (admin-console INV-K17) ─────────────────

-- 재검토 기준: 한 달 발송이 route_review_min_monthly 건 미만인 달이 route_review_months 달 이어지면 경고(로지아이 월 30건 기준)
alter table public.pricing_settings add column if not exists route_review_min_monthly integer not null default 30;
alter table public.pricing_settings add column if not exists route_review_months integer not null default 2;
alter table public.pricing_settings drop constraint if exists pricing_settings_route_review;
alter table public.pricing_settings add constraint pricing_settings_route_review
  check (route_review_min_monthly between 1 and 100000 and route_review_months between 1 and 12);

-- 서울 달마다 팬꾹이 택배로 내보낸 상자 수. 센 것: 출고 확정(팬 선물·역조공 몫 — 개인접수 상자는 우체국이라 뺀다) ·
-- 반송 확정 · 선물함 신청 출고(개인접수 구간은 뺀다) · 선물함 착불 반송 상자. 이번 달 포함 최근 13달(기준 달 수 상한 12 + 이번 달), 오래된 달부터.
-- 건수만 돌려준다 — 주문번호·사람·상자 식별값 없음(INV-K8). 운영자가 아니면 null(INV-K1).
create or replace function public.admin_monthly_shipments()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with ev as (
    select p.shipped_at as at
    from public.office_parcels p left join public.boxes b on b.id = p.box_id
    where p.shipped_at is not null and b.personal_intake_cost_krw is null
    union all
    select p.returned_at from public.office_parcels p where p.returned_at is not null
    union all
    select a.shipped_at from public.revgift_box_applications a
    where a.shipped_at is not null and a.measured_tier is distinct from 'oversize'
    union all
    select g.returned_at from public.revgift_boxes g where g.returned_at is not null
  ),
  ev_month as (
    select to_char(e.at at time zone 'Asia/Seoul', 'YYYY-MM') as month from ev e
  ),
  months as (
    select to_char(date_trunc('month', now() at time zone 'Asia/Seoul') - make_interval(months => i), 'YYYY-MM') as month, i
    from generate_series(0, 12) i
  )
  select case when public.is_operator() then jsonb_build_object(
    'current_month', (select m.month from months m where m.i = 0),
    'months', (select jsonb_agg(jsonb_build_object('month', m.month, 'count', (select count(*) from ev_month x where x.month = m.month)) order by m.i desc)
               from months m),
    'first_month', (select min(x.month) from ev_month x),
    'min_monthly', (select s.route_review_min_monthly from public.pricing_settings s),
    'months_needed', (select s.route_review_months from public.pricing_settings s)
  ) end;
$$;
revoke all on function public.admin_monthly_shipments() from public, anon;
grant execute on function public.admin_monthly_shipments() to authenticated;

-- ── ③ 요금표 택배 원가를 기본 경로 값으로 맞춘다 (admin-console INV-K15) ──────────

-- 20261107000002 는 운영 요금표를 덮지 않으려고 경로표만 만들고, 요금표 원가 칸은 「경로표 저장」 때 맞추게 했다.
-- 그런데 바뀐 칸이 없으면 저장 버튼이 꺼져 있어, 경로표에 이미 들어 있는 기본 경로 값으로 원가를 맞출 길이 없었다(로컬 확인: 원가 4,000·5,000·6,500 그대로).
-- 여기서 맞추는 값은 개발이 정한 숫자가 아니라 지금 DB 의 기본 경로(운영자가 고른 경로)의 같은 구간 값이다 — 저장 함수의 끝 처리와 같은 일.
-- 바뀐 칸마다 요금 변경 기록을 대표 계정 이름으로 남긴다(INV-K5). 대표 계정이 아직 없으면(첫 배포 전 빈 DB) 기록 없이 맞춘다.
-- 받는 값 < 원가 + 검수비가 되는 구간은 건너뛴다 — 요금 검사(INV-K16)가 /admin/pricing 에 수정안을 띄운다.
create or replace function public.pricing_sync_carrier_costs()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer := 0;
  k record;
  v_owner uuid;
begin
  select o.owner_user_id into v_owner from public.owner_setting o limit 1;
  for k in
    select tp.tier, tp.carrier_cost_krw as before_krw, c.cost_krw as after_krw
    from public.tier_prices tp
    join public.carrier_route_costs c on c.tier = tp.tier::text
    join public.pricing_settings s on s.default_route = c.route
    where c.cost_krw is not null and c.cost_krw <> tp.carrier_cost_krw
      and tp.price_krw >= c.cost_krw + tp.inspection_fee_krw
  loop
    if v_owner is not null then
      insert into public.tier_price_changes (changed_by, tier, field, before_krw, after_krw)
      values (v_owner, k.tier, 'carrier_cost_krw', k.before_krw, k.after_krw);
    end if;
    update public.tier_prices set carrier_cost_krw = k.after_krw where tier = k.tier;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
-- 마이그레이션·DB 직접 점검에서만 부른다(화면·API 에는 열지 않는다)
revoke all on function public.pricing_sync_carrier_costs() from public, anon, authenticated;
select public.pricing_sync_carrier_costs();

notify pgrst, 'reload schema';
