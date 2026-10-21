-- 받은 선물(역조공) 화면 대조용 시험 데이터 — 로컬 supabase 전용. 운영·호스팅 DB 에 넣지 않는다.
-- 시드에는 역조공이 없어서 받은 선물·받은 역조공 상세(시안 v34-part1 revgifts.html·revgift-detail.html)를 띄울 수 없었다(2026-10-21).
--
-- 넣기:  docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < projects/fankkuk/workspace/revgift-view-data.sql
-- 지우기: 맨 아래 「지우기」 블록만 따로 실행한다(toss_order_id 가 pay_view_rg_ 로 시작하는 것만 지운다).
--
-- 만드는 것(받는 팬 = byeolbit_fan 「별빛」, 시드에서 하루·모모를 팔로우한다 — INV-R2):
--   RG-VIEW1  하루 → 별빛, 소형, 결제 완료 2일 전 → 「받는 중」 · 받을지 정해 주세요(5일 남음)
--   RG-VIEW2  모모 → 별빛, 소형, 결제 완료 1일 전, 별빛이 받지 않기 → 「완료」 탭
-- 받기(accept)는 받을 주소(pii)가 있어야 해서 만들지 않는다 — 개인정보 칸은 사람이 직접 넣는다.
-- 금액은 서버 계산과 같게 맞춘다(INV-R3, tests/integration/revgift-helpers.ts 의 소형 값).
-- 화면: http://localhost:3000/me/revgifts · http://localhost:3000/me/revgifts/RG-VIEW1 (로그인 byeolbit_fan / fankkuk-local-1234)

begin;

select public.register_revgift(
  '00000000-0000-4000-a000-000000000011',
  '[{"fan_id":"00000000-0000-4000-a000-000000000001","tier":"small","order_no":"RG-VIEW1","amount_krw":5400,"shipping_fee_krw":4000}]'::jsonb,
  'pay_view_rg_1', 0, 1400, 0, 4000, 5400);
select public.settle_revgift_payment('pay_view_rg_1', 'done', 'pk_pay_view_rg_1');
update public.revgift_sends set settled_at = now() - interval '2 days' where toss_order_id = 'pay_view_rg_1';

select public.register_revgift(
  '00000000-0000-4000-a000-000000000012',
  '[{"fan_id":"00000000-0000-4000-a000-000000000001","tier":"small","order_no":"RG-VIEW2","amount_krw":5400,"shipping_fee_krw":4000}]'::jsonb,
  'pay_view_rg_2', 0, 1400, 0, 4000, 5400);
select public.settle_revgift_payment('pay_view_rg_2', 'done', 'pk_pay_view_rg_2');
update public.revgift_sends set settled_at = now() - interval '1 day' where toss_order_id = 'pay_view_rg_2';

-- 받지 않기는 받는 팬 본인으로 부른다(함수가 auth.uid() 로 본인을 확인한다)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select public.decline_revgift('RG-VIEW2');
reset role;

commit;

-- ── 지우기 (따로 실행) ──
-- begin;
-- set local session_replication_role = replica;
-- delete from public.inbound_codes where share_id in (select s.id from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like 'pay_view_rg_%');
-- delete from public.notification_outbox where share_id in (select s.id from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like 'pay_view_rg_%');
-- delete from public.revgift_address_events where share_id in (select s.id from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like 'pay_view_rg_%');
-- delete from public.revgift_sends where toss_order_id like 'pay_view_rg_%';
-- commit;
