-- 수동 SQL(supabase/manual)이 이 DB 에 어디까지 적용됐는지 — 읽기만 한다(아무것도 바꾸지 않는다).
-- Supabase SQL 편집기에 통째로 붙여 넣고 Run. 결과: 파일 번호 · 적용됨(true/false) · 무엇으로 판정했는지.
--
-- 같은 함수를 여러 파일이 차례로 고쳐 쓰는 경우(송장 출력 0008→0009→0010→0015 등)는 그 판에만 있는 줄·낱말이
-- 지금 함수 본문에 있는지로 가린다. false 인 첫 번호부터 번호순으로 적용하면 된다 — 앞 번호를 다시 돌리지 않는다
-- (0008 처럼 create function 으로 시작하는 파일은 두 번 돌리면 「이미 있음」으로 멈춘다).
-- 0001~0007·0011~0014 는 표시를 두지 않았다 — 0008 이상이 true 면 그 앞도 적용된 것으로 본다(앞 파일이 만든 표·함수를 쓴다).

with fn as (
  select n.nspname || '.' || p.proname as name, string_agg(pg_get_functiondef(p.oid), E'\n') as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'pii')
  group by 1
),
body as (select name, coalesce(def, '') as def from fn)
select file, applied, marker
from (values
  ('0008', exists (select 1 from body where name = 'public.invoice_claim_print'),
           '송장 출력 함수(invoice_claim_print)가 있다'),
  ('0009', exists (select 1 from body where name = 'public.invoice_claim_print' and def like '%insert into public.decrypt_log (order_id, box_id,%'),
           '송장 출력이 열람 기록에 상자를 남긴다'),
  ('0010', exists (select 1 from body where name = 'public.invoice_claim_print' and def like '%decrypt_releases%'),
           '송장 출력이 돌려준 줄을 뺀다'),
  ('0015', exists (select 1 from body where name = 'public.invoice_claim_print' and def like '%shipped%'),
           '출고 뒤 재출력을 받는다'),
  ('0016', exists (select 1 from body where name = 'public.notification_contact' and def like '%notification_kind_must_deliver%'),
           '꼭 보내야 하는 알림 연락처 판정'),
  ('0017', exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'creator_addresses' and column_name = 'label'),
           '크리에이터 주소 이름표 칸'),
  ('0018', exists (select 1 from body where name = 'public.create_account' and def like '%nickname_problem%'),
           '가입이 닉네임을 검사한다'),
  ('0019', exists (select 1 from body where name = 'public.set_my_fan_address'),
           '팬 주소 등록 함수'),
  ('0020', to_regclass('pii.return_addresses') is not null,
           '반송 주소 표'),
  ('0021', exists (select 1 from body where name = 'public.close_revgift_share' and def like '%p_outcome = ''disposed''%'),
           '역조공 처분 닫기'),
  ('0022', exists (select 1 from body where name = 'public.return_claim_print' and def like '%''confirmed_at'', v.return_confirmed_at%'),
           '반송 송장이 확인 시각을 본다'),
  ('0023', to_regclass('pii.unmatched_phone_last4') is not null,
           '전화번호 뒤 4자리 표'),
  ('0024', exists (select 1 from body where name = 'public.office_drop_address_copies'),
           '주소 복사본 72시간 지우기'),
  ('0025', exists (select 1 from body where name = 'pii.withdraw_account'),
           '탈퇴 처리 함수'),
  ('0026', exists (select 1 from body where name = 'public.check_phone_code'),
           '문자 인증번호 확인 함수'),
  ('0027', exists (select 1 from body where name = 'public.settle_signature_link'),
           '승인 서명 연결 함수'),
  ('0028', exists (select 1 from body where name = 'public.start_approval_sign' and def like '%v_env, v_order.creator_id;%'),
           '승인 서명 요청 — 「승인」 누를 때 서명 요청·결과로 승인 (서명 요청이 크리에이터 ID 를 같이 돌려주는 판)')
) as v(file, applied, marker)
order by file;
