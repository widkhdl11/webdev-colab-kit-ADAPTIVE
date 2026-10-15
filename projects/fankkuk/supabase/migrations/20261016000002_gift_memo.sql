-- 나만 보는 선물 메모 — 선물 이름(한 줄 0~20자)·내용(0~200자) (together INV-F7·F8, 카드 d87 ②·d91, DECISIONS 2026-10-15 「정할 것 다섯」 ②).
--
-- 운영 적용 순서: 이 파일 → 앱 배포. 개인정보 구역(pii)은 건드리지 않으므로 사람이 따로 적용할 수동 SQL 이 없다.
-- 앱이 먼저 배포되면 등록 함수를 없는 인자(p_memo_title)로 불러 선물 등록이 실패한다 — 반드시 이 파일이 먼저다.
--
-- 1) gift_memos — 메모만 담는 따로 된 표, 주문당 한 줄(INV-F7). 주문 표의 칸으로 두지 않는다: 크리에이터·운영자용 함수가
--    주문 줄 전체를 잡기도 하므로 칸 하나를 더 적는 순간 샌다. 행 보안을 켜고 정책을 두지 않으며 화면 쪽 키(anon·authenticated)에 권한이 없다.
--    길이는 표 제약으로도 막는다(이름 1~20자·줄바꿈 없음, 내용 1~200자, 둘 다 비면 줄을 만들지 않는다).
-- 2) register_order — 맨 뒤에 p_memo_title·p_memo_body(기본 null)를 더한다. 앞뒤 공백을 빼고 검사해 틀리면 22023(주문도 생기지 않는다),
--    둘 다 비면 저장하지 않는다. 메모 주인은 이 함수의 보낸 사람(서버가 세션에서 확인한 p_fan_id)이고, 메모는 물품 이름(item_kind)을 채우지 않는다.
--    나머지는 20261012000002_metrics.sql 의 정의 그대로다.
-- 3) my_gifts — 보낸 선물 목록에 memo_title 한 칸을 더한다(돌려주는 칸이 바뀌어 다시 만든다). 나머지는 20261010000001 그대로.
-- 4) my_gift_memo(p_order_no) — 선물 상세의 메모. 계정 ID 인자가 없고, 로그인 토큰의 계정이 그 주문의 보낸 사람일 때만 준다(INV-F8).
--
-- 메모 표를 참조하는 함수는 위 셋뿐이다 — 배포 전 개인정보 노출 검사(scripts/pii-exposure.mjs)가 허용 목록으로 지킨다.
-- 다시 적용해도 결과가 같다(표는 if not exists, 함수는 drop if exists 뒤 create).

-- ── 1) 메모 표 ──────────────────────────────────

create table if not exists public.gift_memos (
  order_id uuid primary key references public.orders (id) on delete cascade,
  title text,
  body text,
  created_at timestamptz not null default now(),
  constraint gift_memos_title_len check (title is null or (char_length(title) between 1 and 20 and title !~ '[\r\n]')),
  constraint gift_memos_body_len check (body is null or char_length(body) between 1 and 200),
  constraint gift_memos_not_empty check (title is not null or body is not null)
);

alter table public.gift_memos enable row level security;
revoke all on public.gift_memos from public, anon, authenticated;

-- ── 2) register_order ──────────────────────────────────

drop function if exists public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text, text);

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

  insert into public.orders (order_no, fan_id, creator_id, item_kind, item_category, has_electronics_or_metal, anniversary_name, hard_notice_category)
  values (p_order_no, p_fan_id, p_creator_id, v_item_name, p_item_category, v_metal, v_mark, v_notice)
  returning id into v_order_id;

  -- together INV-F7: 메모는 같은 처리에서 따로 된 표에 — 둘 다 비면 줄을 만들지 않는다. 주인은 이 주문의 보낸 사람(p_fan_id)이다
  if v_memo_title is not null or v_memo_body is not null then
    insert into public.gift_memos (order_id, title, body) values (v_order_id, v_memo_title, v_memo_body);
  end if;

  -- INV-M14: 상자마다 등록 순간의 요금(신고 구간)을 적는다. 합은 위에서 검사한 결제 금액과 같다(처리 끝에 DB 가 다시 확인).
  insert into public.boxes (order_id, seq, declared_tier, price_krw)
  select v_order_id, t.ord::smallint, t.tier, tp.price_krw
  from unnest(p_tiers) with ordinality as t(tier, ord)
  join public.tier_prices tp on tp.tier = t.tier;

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw);

  return v_order_id;
end $$;

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text, text, text, text) to service_role;

-- ── 3) my_gifts — 목록에 선물 이름 ──────────────────────────────────

drop function if exists public.my_gifts();

create function public.my_gifts()
returns table (order_no text, creator_name text, item_kind text, box_count integer, has_electronics_or_metal boolean, status public.order_status,
               registered_at timestamptz, approved_at timestamptz, received_at timestamptz, inspection_result text, inspected_at timestamptz,
               shipped_at timestamptz, expected_arrival_date date, delivery text, fan_tracking_no text, fan_send_ack_at timestamptz,
               memo_title text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_no, c.name, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         o.has_electronics_or_metal,
         -- decline-block INV-D5 (2026-10-10): 직접 거절·차단 거절은 둘 다 rejected 라 구분되지 않고, 7일 자동 반려(expired)만 따로 보인다
         o.status,
         o.registered_at,
         case when o.status in ('rejected', 'expired') then null else o.approved_at end,
         o.received_at, o.inspection_result, o.inspected_at, o.shipped_at, o.expected_arrival_date, o.delivery, o.fan_tracking_no,
         o.fan_send_ack_at,
         -- together INV-F8: 보낸 사람 본인 목록에만 선물 이름(나만 보는 메모) — 아래 fan_id = auth.uid() 가 본인 줄만 남긴다
         m.title
  from public.orders o
  join public.creators c on c.id = o.creator_id
  left join public.gift_memos m on m.order_id = o.id
  where o.fan_id = auth.uid() and o.registered_at is not null
  order by o.registered_at desc;
$$;

revoke all on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated, service_role;

-- ── 4) my_gift_memo — 선물 상세의 메모 ──────────────────────────────────

create or replace function public.my_gift_memo(p_order_no text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- together INV-F8: 계정 ID 인자 없이 로그인 토큰의 계정이 보낸 주문만. 남의 주문·메모 없는 주문·결제 전 주문은 null
  select jsonb_build_object('title', m.title, 'body', m.body)
  from public.orders o
  join public.gift_memos m on m.order_id = o.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null;
$$;

revoke all on function public.my_gift_memo(text) from public, anon;
grant execute on function public.my_gift_memo(text) to authenticated, service_role;
