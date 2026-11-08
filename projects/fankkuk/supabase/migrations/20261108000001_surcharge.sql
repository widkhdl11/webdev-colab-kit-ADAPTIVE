-- 제주·도서 할증 (payment INV-M24 · S24~S24c, address-protection INV-P20 ③). DECISIONS 2026-11-07 할증 줄들.
--
-- 팬 선물 결제 대기를 만들 때 등록 함수가 그 크리에이터가 지금 등록해 둔 주소의 할증 구분을 읽어, 「제주」·「도서」면 상자마다 할증을 더한다.
-- 할증은 배송비 칸에 더해 저장하고(결제·상자 둘 다), 얼마가 할증인지는 surcharge_krw 칸에 따로 적는다 — 환불에서 반송 택배비에 할증을 넣지 않기 위해서다(④).
--
-- 개인정보 구역(pii)은 이 파일에서 건드리지 않는다. 구분은 pii 주소 줄의 칸이라 사람이 적용하는 manual/0030_surcharge_region.sql 이
--   ① 구분 칸, ② 구분 읽기 함수(public.creator_surcharge_region — 이 파일의 자리 함수를 진짜로 바꾼다), ③ 송장 출력 때 재판정 기록 함수를 만든다.
-- 그 전까지 자리 함수는 늘 「할증 없음」이다 — 지금과 같은 금액이 나온다(주소 줄에 구분 칸이 아직 없으니 판정할 재료도 없다).
--
-- 1) surcharge_fees — 할증 금액 설정값(제주 4,000 · 도서 5,000). 화면 쪽 키에 권한이 없다.
-- 2) boxes·payments.surcharge_krw — 그 배송비 칸 중 할증 몫. 0 ≤ 할증 ≤ 배송비 칸. 상자 할증의 합 = 첫 결제 할증(INV-M14 칸 합 검사에 더함).
-- 3) creator_surcharge_region(크리에이터) — 자리 함수(없을 때만 만든다 — 다시 적용해도 manual/0030 의 진짜 함수를 덮지 않는다).
--    누구도(서비스 키 포함) 직접 부르지 못한다. 등록 함수만 안에서 부른다(INV-M24 ⑤).
-- 4) register_order — 20261016000002_gift_memo.sql 정의와 같고, 상자·결제를 넣을 때 할증을 더하는 것만 다르다. 앱이 넘기는 금액은 지금처럼
--    할증 전 요금표 금액이고(INV-K3 비교 그대로), 할증은 이 함수가 더한다. 돌려주는 값(주문 id)도 그대로다.
-- 5) refund_due_of_payment(20261017000002_tracker_report.sql) · refund_due_of_box(20261010000003_late_box.sql) — 그 정의와 같고, 반송 택배비로 빼는 「배송비 칸」에서 할증을 뺀다(④).
--    크리에이터에게 보내기 전에 끝난 상자는 할증이 함께 돌아간다. 검수 불합격(0) 줄과 차액 결제 갈래는 그대로다.
-- 6) surcharge_region_mismatches · admin_surcharge_mismatches() — 송장 출력 때 연 주소의 구분이 저장된 구분과 다른 상자(INV-P20 ③).
--    주소·우편번호 칸이 없다 — 상자와 두 구분 값과 시각만. 쓰기는 manual/0030 의 재판정 함수만, 읽기는 운영자만.
--
-- 다시 적용해도 결과가 같다(표·칸·제약은 있으면 건너뛰고, 함수는 create or replace).

-- ── 1) 할증 금액 설정값 ───────────────────────────────

create table if not exists public.surcharge_fees (
  region text primary key check (region in ('jeju', 'island')),
  fee_krw integer not null check (fee_krw between 0 and 100000),
  updated_at timestamptz not null default now()
);
alter table public.surcharge_fees enable row level security;
revoke all on public.surcharge_fees from public, anon, authenticated;
insert into public.surcharge_fees (region, fee_krw) values ('jeju', 4000), ('island', 5000) on conflict (region) do nothing;

-- ── 2) 할증 몫 칸 ─────────────────────────────────────

alter table public.boxes add column if not exists surcharge_krw integer not null default 0;
alter table public.payments add column if not exists surcharge_krw integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boxes_surcharge_within_shipping') then
    alter table public.boxes add constraint boxes_surcharge_within_shipping check (surcharge_krw >= 0 and surcharge_krw <= shipping_fee_krw);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_surcharge_within_shipping') then
    alter table public.payments add constraint payments_surcharge_within_shipping check (surcharge_krw >= 0 and surcharge_krw <= shipping_fee_krw);
  end if;
end $$;

-- INV-M14 에 할증 몫을 더한다: 상자 할증의 합 = 첫 결제의 할증 칸
create or replace function public.order_box_amounts_match(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  p public.payments;
  v_sum bigint;
  v_shipping bigint;
  v_inspection bigint;
  v_surcharge bigint;
begin
  select * into p from public.payments x where x.order_id = p_order_id and x.kind = 'initial';
  if p.id is null then
    return; -- 결제 줄이 들어올 때 확인한다
  end if;
  select coalesce(sum(b.price_krw), 0), coalesce(sum(b.shipping_fee_krw), 0), coalesce(sum(b.inspection_fee_krw), 0), coalesce(sum(b.surcharge_krw), 0)
    into v_sum, v_shipping, v_inspection, v_surcharge
  from public.boxes b where b.order_id = p_order_id;
  if v_sum <> p.amount_krw then
    raise exception '상자 금액의 합(%)이 결제 금액(%)과 다르다 (INV-M14)', v_sum, p.amount_krw using errcode = '23514';
  end if;
  if v_shipping <> p.shipping_fee_krw or v_inspection <> p.inspection_fee_krw then
    raise exception '상자 배송비·검수비의 합(%·%)이 결제 칸(%·%)과 다르다 (INV-M14)', v_shipping, v_inspection, p.shipping_fee_krw, p.inspection_fee_krw
      using errcode = '23514';
  end if;
  if v_surcharge <> p.surcharge_krw then
    raise exception '상자 할증의 합(%)이 결제 할증(%)과 다르다 (INV-M24)', v_surcharge, p.surcharge_krw using errcode = '23514';
  end if;
end $$;

-- 칸을 바꾸는 갱신에도 합계 검사가 돌게 트리거 대상 칸을 넓힌다
drop trigger if exists boxes_amounts_match on public.boxes;
create constraint trigger boxes_amounts_match after insert or update of price_krw, shipping_fee_krw, inspection_fee_krw, surcharge_krw, order_id on public.boxes
deferrable initially deferred for each row execute function public.boxes_amounts_check();
drop trigger if exists payments_amounts_match on public.payments;
create constraint trigger payments_amounts_match after insert or update of amount_krw, shipping_fee_krw, inspection_fee_krw, surcharge_krw, order_id, kind on public.payments
deferrable initially deferred for each row execute function public.payments_amounts_check();

-- ── 3) 구분 읽기 자리 함수 ────────────────────────────

do $$
begin
  if to_regprocedure('public.creator_surcharge_region(uuid)') is null then
    execute $f$
      create function public.creator_surcharge_region(p_creator_id uuid)
      returns text
      language sql stable security definer set search_path = ''
      as $body$ select 'none'::text $body$
    $f$;
  end if;
end $$;
revoke all on function public.creator_surcharge_region(uuid) from public, anon, authenticated, service_role;

-- ── 4) register_order ─────────────────────────────────

create or replace function public.register_order(p_fan_id uuid, p_creator_id uuid, p_order_no text, p_item_kind text, p_has_electronics_or_metal boolean, p_tiers public.parcel_tier[], p_toss_order_id text, p_goods_krw integer, p_service_fee_krw integer, p_inspection_fee_krw integer, p_shipping_fee_krw integer, p_amount_krw integer, p_anniversary_name text default null, p_item_category text default 'other', p_hard_notice_category text default null, p_memo_title text default null, p_memo_body text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_n integer := coalesce(array_length(p_tiers, 1), 0);
  v_role public.user_role;
  c record;
  v_today date := public.receiving_today();
  v_limit smallint;
  v_mark text;
  v_item_name text;
  v_metal boolean;
  v_notice text;
  v_memo_title text := nullif(public.app_trim(p_memo_title), '');
  v_memo_body text := nullif(public.app_trim(p_memo_body), '');
  v_region text;
  v_fee integer := 0;
begin
  if v_n = 0 or v_n > 10 then
    raise exception '상자는 1~10개 (입력 경계와 같다)' using errcode = '22023';
  end if;
  -- together INV-F7: 나만 보는 메모 — 이름은 앞뒤 공백을 뺀 한 줄 20자까지, 내용은 200자까지(줄바꿈 허용). 틀리면 주문도 만들지 않는다
  if v_memo_title is not null and (char_length(v_memo_title) > 20 or v_memo_title ~ '[\r\n]') then
    raise exception '선물 이름은 한 줄 20자까지' using errcode = '22023';
  end if;
  if v_memo_body is not null and char_length(v_memo_body) > 200 then
    raise exception '메모 내용은 200자까지' using errcode = '22023';
  end if;
  -- hard-items INV-H1: 물품 종류는 여덟 가지 중 하나. 기타면 1~30자 글이 물품 이름, 나머지는 글 없이 종류 이름이 물품 이름이다.
  if public.item_category_label(p_item_category) is null then
    raise exception '목록에 없는 물품 종류' using errcode = '22023';
  end if;
  if p_item_category = 'other' then
    v_item_name := public.app_trim(p_item_kind);
    if v_item_name is null or char_length(v_item_name) not between 1 and 30 then
      raise exception '기타 물품은 1~30자로 적는다' using errcode = '22023';
    end if;
  else
    if p_item_kind is not null then
      raise exception '기타가 아닌 물품 종류에는 글을 받지 않는다' using errcode = '22023';
    end if;
    v_item_name := public.item_category_label(p_item_category);
  end if;
  -- hard-items INV-H2: 전자기기를 고르면 신고를 켠다(팬이 「없어요」를 보내도)
  v_metal := coalesce(p_has_electronics_or_metal, false) or p_item_category = 'electronics';
  -- INV-K3: 등록하는 순간의 요금표로 계산한 금액과 칸마다 같아야 한다. 아니면 요금이 바뀐 것이다 — 다시 계산해 오게 한다.
  select * into c from public.fan_charge_of(p_tiers);
  if c.found <> v_n then
    raise exception '받을 수 없는 상자 구간' using errcode = '22023';
  end if;
  if p_goods_krw <> 0 or p_amount_krw <> c.total or p_shipping_fee_krw <> c.carrier or p_inspection_fee_krw <> c.inspection
     or p_service_fee_krw <> c.total - c.carrier - c.inspection then
    raise exception '요금이 바뀌었다 — 다시 계산해야 한다' using errcode = 'P0031';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_fan_id;
  if v_role is null or v_role not in ('fan', 'creator') then
    raise exception '선물을 보낼 수 있는 계정이 아니다' using errcode = '42501';
  end if;
  -- INV-V12: 받는 크리에이터 행을 공유 잠금 — 이사 신청(같은 행 for no key update)이 끝날 때까지 기다리고, 끝난 뒤의 상태로 판단한다
  -- creator-receiving INV-B2·B4: 받는 상태·한도 저장(같은 행 for no key update)도 이 잠금에서 줄을 선다
  -- hard-items INV-H7: 받기 어려운 품목 저장(같은 행 for no key update)도 이 잠금에서 줄을 선다
  -- payment INV-M24: 주소 저장(같은 행 for update)도 이 잠금에서 줄을 선다 — 아래 구분 읽기는 그 저장 앞이나 뒤의 값 하나다
  perform 1 from public.creators cr where cr.id = p_creator_id for share;
  if not exists (select 1 from public.creators where id = p_creator_id and identity_verified) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  if public.cv_moving(p_creator_id) then
    raise exception '채널 이사 중인 크리에이터라 지금은 선물을 등록할 수 없다' using errcode = 'FKV10';
  end if;
  -- creator-receiving INV-B2: 쉬는 중(다시 받는 날이 한국 시간 오늘보다 뒤)이면 새 주문을 만들지 않는다. 그날 0시부터는 받는다.
  if exists (select 1 from public.creators cr where cr.id = p_creator_id and cr.resume_on > v_today) then
    raise exception '잠시 선물 받기를 쉬는 크리에이터' using errcode = 'FKR01';
  end if;
  -- hard-items INV-H7: 살아 있는 설정이 「등록 막기」이고 고른 종류가 받기 어려운 품목에 있으면 만들지 않는다. 「안내만」·끝난 설정은 지나간다.
  if exists (select 1 from public.creator_hard_items h
              where h.creator_id = p_creator_id and h.action = 'block' and p_item_category = any(h.categories)
                and public.hard_items_live(h.ends_on, v_today)) then
    raise exception '받기 어려운 품목으로 등록을 막아 둔 크리에이터' using errcode = 'FKR03';
  end if;
  -- metrics INV-Q5: 화면이 보낸 안내 품목은 같은 잠금 안에서 그때 살아 있는 받기 어려운 품목과 다시 맞춰 본다 — 없으면 버린다(거부하지 않는다)
  select p_hard_notice_category into v_notice
  from public.creator_hard_items h
  where h.creator_id = p_creator_id and p_hard_notice_category = any(h.categories) and public.hard_items_live(h.ends_on, v_today);
  if v_role = 'creator' then
    if exists (select 1 from public.creators c2 where c2.id = p_creator_id and c2.profile_id = p_fan_id) then
      raise exception '자기 자신에게는 선물을 보낼 수 없다' using errcode = 'P0011';
    end if;
  end if;
  -- INV-L9: 팬·크리에이터 모두 — 보내는 사람이 받는 크리에이터를 팔로우하고 있어야 한다
  if not exists (select 1 from public.follows f where f.fan_id = p_fan_id and f.creator_id = p_creator_id) then
    raise exception '팔로우한 크리에이터에게만 보낼 수 있다' using errcode = 'P0012';
  end if;
  -- INV-D7: 차단 쓰기와 같은 쌍 잠금을 잡고 확인한다 — 이 등록이 끝날 때까지 차단은 줄을 서고, 차단 뒤에는 이 확인이 막는다.
  -- 차단을 말하지 않고 본인 확인 전 크리에이터와 같은 오류를 낸다(카드 d26).
  -- creator-receiving INV-B4: 같은 쌍 잠금 안에서 세고 만든다 — 같은 팬의 동시 등록은 여기서 줄을 서서 앞 등록이 만든 주문을 센다.
  perform public.lock_sender_pair(p_creator_id, p_fan_id);
  if public.sender_blocked(p_creator_id, p_fan_id) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  select cr.monthly_fan_limit into v_limit from public.creators cr where cr.id = p_creator_id;
  if v_limit is not null and public.receiving_counted_orders(p_fan_id, p_creator_id) >= v_limit then
    raise exception '이번 달 한도에 닿았다' using errcode = 'FKR02';
  end if;
  -- creator-receiving INV-B9: 표시는 서버가 그날 다시 계산한다 — 그 크리에이터의 기념일 중 이름이 같고 D-7 ~ D-day 인 것만.
  -- 아니면 표시 없이 저장한다(거부하지 않는다). 이름은 지금 기념일 이름을 복사해 둔다.
  -- 이름은 지금 필터를 다시 거친다 — 저장 뒤 금칙어가 늘어 공개 읽기(creator_receiving)에서 빠진 이름은 표시로도 붙지 않는다.
  if p_anniversary_name is not null then
    select a.name into v_mark
    from public.creator_anniversaries a
    where a.creator_id = p_creator_id and a.name = public.app_trim(p_anniversary_name)
      and public.creator_tag_text_problem(a.name) is null
      and public.receiving_next_date(a.month, a.day, v_today) - v_today between 0 and 7
    order by a.position
    limit 1;
  end if;

  -- payment INV-M24: 결제 순간 그 크리에이터가 등록해 둔 주소의 구분(주소가 없으면 「할증 없음」). 구분 읽기는 이 함수 안에서만(⑤).
  -- 제주·도서면 상자마다 그 할증(설정값)을 배송비 칸에 더한다. 설정값 줄이 없으면 할증을 정할 수 없으니 등록하지 않는다.
  v_region := public.creator_surcharge_region(p_creator_id);
  if v_region in ('jeju', 'island') then
    select f.fee_krw into v_fee from public.surcharge_fees f where f.region = v_region;
    if v_fee is null then
      raise exception '할증 설정값이 없다(%)', v_region using errcode = 'P0032';
    end if;
  elsif v_region is distinct from 'none' then
    raise exception '모르는 할증 구분(%)', v_region using errcode = 'P0032';
  end if;

  insert into public.orders (order_no, fan_id, creator_id, item_kind, item_category, has_electronics_or_metal, anniversary_name, hard_notice_category)
  values (p_order_no, p_fan_id, p_creator_id, v_item_name, p_item_category, v_metal, v_mark, v_notice)
  returning id into v_order_id;

  -- together INV-F7: 메모는 같은 처리에서 따로 된 표에 — 둘 다 비면 줄을 만들지 않는다. 주인은 이 주문의 보낸 사람(p_fan_id)이다
  if v_memo_title is not null or v_memo_body is not null then
    insert into public.gift_memos (order_id, title, body) values (v_order_id, v_memo_title, v_memo_body);
  end if;

  -- INV-M14: 상자마다 등록 순간의 요금(신고 구간)을 적는다. 합은 위에서 검사한 결제 금액과 같다(처리 끝에 DB 가 다시 확인).
  -- INV-M24 ①: 할증은 상자마다 같은 몫을 금액·배송비 칸에 더하고 그 몫을 할증 칸에 적는다.
  insert into public.boxes (order_id, seq, declared_tier, price_krw, shipping_fee_krw, inspection_fee_krw, surcharge_krw)
  select v_order_id, t.ord::smallint, t.tier, tp.price_krw + v_fee, tp.carrier_cost_krw + v_fee, tp.inspection_fee_krw, v_fee
  from unnest(p_tiers) with ordinality as t(tier, ord)
  join public.tier_prices tp on tp.tier = t.tier;

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, surcharge_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw + v_fee * v_n, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw,
          p_shipping_fee_krw + v_fee * v_n, v_fee * v_n);

  return v_order_id;
end $$;

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text, text, text, text) to service_role;

-- ── 5) 환불 — 반송 택배비에서 할증 빼기 ──────────────

-- 20261017000002_tracker_report.sql 의 정의와 같고, 반송 택배비로 빼는 배송비 칸에서 할증 몫을 뺀 것만 다르다(payment INV-M24 ④).
CREATE OR REPLACE FUNCTION public.refund_due_of_payment(p_payment_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when p.status <> 'done' or o.shipped_at is not null then null
    when o.status not in ('rejected', 'expired', 'canceled')
         and exists (select 1 from public.payments d
                     where d.order_id = o.id and d.kind = 'difference' and d.expired_at is not null and d.status <> 'done')
         and not exists (select 1 from public.boxes b where b.order_id = o.id and b.measured_tier = 'oversize')
         and not exists (select 1 from public.boxes b
                         join public.office_parcels x on x.box_id = b.id
                         join public.office_inspections i on i.parcel_id = x.id
                         where b.order_id = o.id and i.outcome = 'return')
      then p.goods_krw
    -- 끝난 주문(INV-M9, 2026-10-10): 상자마다 정한 몫의 합
    when o.status in ('rejected', 'expired', 'canceled') and p.kind = 'initial' then c.ended_sum
    -- 끝난 주문의 차액 결제: 입고 뒤 취소는 그 결제의 검수비·배송비 칸, 거절·반려·크리에이터 사정 취소는 배송비 칸을 뺀다(차액 결제에는 할증이 없다)
    when o.status = 'canceled' and not cc.creator then greatest(p.amount_krw - p.inspection_fee_krw - p.shipping_fee_krw, 0)
    when o.status in ('rejected', 'expired', 'canceled') then p.amount_krw - p.shipping_fee_krw
    when o.received_at is not null and o.inspection_result = 'returned' then p.goods_krw
    else null
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
  cross join lateral (
    -- 크리에이터 사정으로 취소(INV-M21) — 팬 탓이 아니라 거절·반려와 같은 줄
    select exists (select 1 from public.order_cancellations x where x.order_id = o.id and x.kind = 'creator') as creator
  ) cc
  cross join lateral (
    -- whole: 입고 없이 끝났고 살려 둔 상자도 없는 주문 — 닫힌 상자까지 주문 환불이 전부 맡는다(상자 환불은 생기지 않는다)
    select (o.received_at is null
            and not exists (select 1 from public.boxes b join public.inbound_codes k on k.box_id = b.id
                            where b.order_id = o.id and k.kept_at is not null)) as whole
  ) w
  cross join lateral (
    -- payment INV-M24 ④: 반송 택배비로 빼는 몫은 배송비 칸 − 할증(반송은 팬에게 가는 택배라 크리에이터 지역 할증이 없다)
    select coalesce(sum(case
      -- 살려 둔 상자(INV-M18 ①): 상자 금액 − 반송 택배비 — 그 뒤 도착하든 닫히든 그대로
      when exists (select 1 from public.inbound_codes k where k.box_id = b.id and k.kept_at is not null) then b.price_krw - (b.shipping_fee_krw - b.surcharge_krw)
      -- 닫힌 상자: 상자 환불이 맡는다(입고 없이 끝난 주문은 주문 환불이 맡는다)
      when b.missing_at is not null then case when w.whole then b.price_krw else 0 end
      -- 끝날 때 도착해 있던 상자
      when exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting') then case
        -- 검수에 걸림(반송·추적기 보관·중형 초과 실측·크리에이터가 돌려보냄·확인 기한 지남): 검수 불합격 줄 — 상품 대금 칸만인데 상자에는 그 칸이 없다(0)
        when b.measured_tier = 'oversize'
             or exists (select 1 from public.office_parcels x join public.office_inspections i on i.parcel_id = x.id
                        where x.box_id = b.id and i.outcome in ('return', 'hold'))
             or exists (select 1 from public.office_parcels x join public.office_creator_checks k on k.parcel_id = x.id
                        where x.box_id = b.id and k.kind = 'confirm' and k.answer in ('return', 'expired')) then 0
        -- 입고 뒤 취소(INV-M17): 검수비·배송비 칸을 뺀다
        when o.status = 'canceled' and not cc.creator then b.price_krw - b.inspection_fee_krw - (b.shipping_fee_krw - b.surcharge_krw)
        -- 입고 뒤 거절·반려·크리에이터 사정 취소(INV-M21): 배송비 칸을 뺀다
        else b.price_krw - (b.shipping_fee_krw - b.surcharge_krw)
      end
      -- 받는 주소를 본 적이 없어 올 수 없는 상자: 그 상자 금액 전액
      else b.price_krw
    end), 0)::integer as ended_sum
    from public.boxes b
    where b.order_id = o.id
  ) c
  where p.id = p_payment_id;
$function$;

create or replace function public.refund_due_of_box(p_box_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- 상자 환불은 「도착하지 않음」으로 닫힌 상자에만(INV-M9, 2026-10-10)
  select case
    when p.status <> 'done' or b.missing_at is null then null
    -- 살려 둔 상자가 닫힘(INV-M18 ③): 남겨 둔 반송 택배비 — 상자 금액 − 반송 택배비는 주문 환불이 이미 맡았다.
    -- payment INV-M24 ④: 할증은 주문 환불에 이미 들어갔다 — 남겨 둔 몫은 배송비 칸 − 할증
    when exists (select 1 from public.inbound_codes k where k.box_id = b.id and k.kept_at is not null) then b.shipping_fee_krw - b.surcharge_krw
    -- 입고 없이 끝났고 살려 둔 상자도 없는 주문은 주문 환불이 결제 금액 전액을 맡는다
    when o.status in ('rejected', 'expired', 'canceled') and o.received_at is null
         and not exists (select 1 from public.boxes x join public.inbound_codes k on k.box_id = x.id
                         where x.order_id = o.id and k.kept_at is not null) then null
    -- 진행 중 주문에서 30일 뒤 닫힌 상자(INV-W10): 택배·검수를 하지 않았으므로 그 상자 금액 전액(할증 포함)
    else b.price_krw
  end
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.payments p on p.order_id = o.id and p.kind = 'initial'
  where b.id = p_box_id;
$$;

-- ── 6) 할증 지역 불일치 ───────────────────────────────

create table if not exists public.surcharge_region_mismatches (
  id bigint generated always as identity primary key,
  box_id uuid not null references public.boxes (id) on delete cascade,
  stored_region text not null check (stored_region in ('none', 'jeju', 'island')),
  opened_region text not null check (opened_region in ('none', 'jeju', 'island')),
  at timestamptz not null default now(),
  constraint surcharge_region_mismatches_differ check (stored_region <> opened_region)
);
alter table public.surcharge_region_mismatches enable row level security;
revoke all on public.surcharge_region_mismatches from public, anon, authenticated;

-- 운영자 화면(주소 열람 기록)의 불일치 줄 — 최근 200줄. 운영자가 아니면 거부한다.
create or replace function public.admin_surcharge_mismatches()
returns table (at timestamptz, order_no text, box_seq integer, box_count integer, stored_region text, opened_region text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 볼 수 있다' using errcode = '42501';
  end if;
  return query
    select m.at, o.order_no, b.seq::integer, (select count(*)::integer from public.boxes x where x.order_id = o.id), m.stored_region, m.opened_region
    from public.surcharge_region_mismatches m
    join public.boxes b on b.id = m.box_id
    join public.orders o on o.id = b.order_id
    order by m.at desc, m.id desc
    limit 200;
end $$;
revoke all on function public.admin_surcharge_mismatches() from public, anon;
grant execute on function public.admin_surcharge_mismatches() to authenticated;
