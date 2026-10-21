-- 크리에이터 2파트 화면(지금 할 일·받은 선물·열람 기록·승인 내역) 대조용 시험 데이터 — 로컬 supabase 전용. 운영·호스팅 DB 에 넣지 않는다.
-- 시드 그대로면 하루의 승인 요청 셋이 7일이 지나 자동 반려돼 지금 할 일이 비고, 출고된 상자·주소 열림 기록도 없어 받은 선물·열람 기록이 빈 화면이다(2026-10-21).
-- 개인정보 실데이터 없음 — 시드 팬 닉네임과 지어낸 주문번호·물품 이름만 쓴다. 주소 값은 넣지 않는다(열람 기록은 시각·주문번호·몇 번째 출력뿐).
--
-- 넣기:  docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < projects/fankkuk/workspace/creator-part2-view-data.sql
-- 지우기: 맨 아래 「지우기」 블록만 따로 실행한다(주문번호가 FC-V2 로 시작하는 것과 시드 상자에 붙인 출고 줄만 지운다).
-- 화면(로그인 haru_creator / fankkuk-local-1234): /creator/actions · /creator/boxes · /creator/log · /creator/requests
--
-- 만드는 것(크리에이터 = 하루):
--   FC-V2A01 별빛  → 승인 요청, 1일 전 등록(6일 남음)
--   FC-V2A02 달토끼 → 승인 요청, 5일 전 등록(2일 남음), 상자 2개
--   FC-V2A03 구름빵 → 승인 요청, 오늘 등록(7일 남음)
--   시드 FC-7K3M9·FC-A1B2C 상자 → 출고 줄(받은 선물 카드 둘) + 주소 열림 기록(첫 출력·재출력)

begin;
select set_config('fankkuk.approving', 'on', true);

create temporary table v2_orders (order_no text, fan_login text, item_kind text, box_count int, ago interval) on commit drop;
insert into v2_orders values
  ('FC-V2A01', 'byeolbit_fan', '응원봉 키링과 손편지', 1, interval '1 day'),
  ('FC-V2A02', 'daltokki_fan', '수면 담요와 간식', 2, interval '5 days'),
  ('FC-V2A03', 'gureumppang_fan', '꽃 모양 머그컵', 1, interval '2 hours');

insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal, status, created_at, registered_at)
select v.order_no, p.id, c.id, v.item_kind, false, 'registered', now() - v.ago, now() - v.ago
from v2_orders v join public.profiles p on p.login_id = v.fan_login join public.creators c on c.slug = 'haru';

insert into public.boxes (order_id, seq, declared_tier)
select o.id, g.seq::smallint, 'small' from v2_orders v join public.orders o on o.order_no = v.order_no
cross join lateral generate_series(1, v.box_count) as g(seq);

insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status, payment_key, created_at, settled_at)
select o.id, 'initial', 'pay_v2_' || lower(replace(v.order_no, '-', '')), 6900 * v.box_count, 0, 1400 * v.box_count, 1500 * v.box_count, 4000 * v.box_count,
       'done', 'pk_v2_' || lower(replace(v.order_no, '-', '')), now() - v.ago, now() - v.ago
from v2_orders v join public.orders o on o.order_no = v.order_no;

insert into public.approval_requests (request_id, order_id, payload, created_at, status)
select 'apr_' || replace(v.order_no, '-', ''), o.id,
       'fankkuk-approval:v1|req=apr_' || replace(v.order_no, '-', '') || '|order=' || v.order_no
         || '|at=' || to_char((now() - v.ago) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         || '|fan=' || encode(extensions.digest(p.nickname, 'sha256'), 'hex'),
       now() - v.ago, 'waiting'
from v2_orders v join public.orders o on o.order_no = v.order_no join public.profiles p on p.login_id = v.fan_login;

-- 받은 선물: 시드의 출고된 두 주문 상자에 사무실 출고 줄을 붙인다(my_received_boxes 는 출고된 상자만 센다)
insert into public.office_parcels (box_id, state, received_at, inspected_at, printed_at, shipped_at, outbound_waybill_no)
select b.id, 'shipped', o.received_at, o.inspected_at, o.shipped_at - interval '1 hour', o.shipped_at, o.outbound_waybill_no
from public.orders o join public.boxes b on b.order_id = o.id
where o.order_no in ('FC-7K3M9', 'FC-A1B2C')
  and not exists (select 1 from public.office_parcels x where x.box_id = b.id);

-- 열람 기록: 송장을 출력할 때 주소가 열린 줄(첫 출력 · 재출력). 요청자는 운영자 시험 계정
insert into public.decrypt_log (at, order_id, requester_id, result, print_no, box_id)
select o.shipped_at - interval '1 hour' + (n.k || ' minutes')::interval, o.id, '00000000-0000-4000-a000-000000000021', 'opened', n.k::smallint, b.id
from public.orders o join public.boxes b on b.order_id = o.id
cross join lateral (select generate_series(1, case when o.order_no = 'FC-7K3M9' then 2 else 1 end) as k) n
where o.order_no in ('FC-7K3M9', 'FC-A1B2C');

commit;

-- ── 지우기 (따로 실행) ──
-- begin;
-- set local session_replication_role = replica;
-- delete from public.decrypt_log where order_id in (select id from public.orders where order_no in ('FC-7K3M9', 'FC-A1B2C'));
-- delete from public.office_parcels where box_id in (select b.id from public.boxes b join public.orders o on o.id = b.order_id where o.order_no in ('FC-7K3M9', 'FC-A1B2C'));
-- delete from public.approval_requests where order_id in (select id from public.orders where order_no like 'FC-V2%');
-- delete from public.payments where order_id in (select id from public.orders where order_no like 'FC-V2%');
-- delete from public.boxes where order_id in (select id from public.orders where order_no like 'FC-V2%');
-- delete from public.orders where order_no like 'FC-V2%';
-- commit;
