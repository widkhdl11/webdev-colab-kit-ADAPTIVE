-- 반송 송장 봉투를 내줄 때 그 순간의 반송 주소 확인 시각을 같이 내준다 (출력 사이 재확인 막기).
-- 스펙: docs/specs/office-workflow.md INV-W15, docs/specs/address-protection.md INV-P18
-- 사람이 직접 적용한다(개인정보 구역 복사본을 내주는 함수를 바꾼다). manual/0020 다음에 적용한다. 마이그레이션 20261017000009 와 순서는 상관없다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0022.sh
-- 확인: npx vitest run --config vitest.integration.config.mts return-address-confirm-db
--
-- 왜
--   지금은 대표가 반송 송장을 출력하는 사이(봉투를 내준 뒤 출력 단계로 넘기기 전)에 보낸 사람이 다른 주소로 다시 확인하면, 출력 단계 함수가 「확인했는가」만 봐서
--   먼저 연(옛) 주소로 송장이 나간다. 이 파일은 봉투를 내주는 함수가 그 순간 상자에 적힌 확인 시각(return_confirmed_at)을 결과에 같이 싣게 한다.
--   앱은 그 값을 출력 단계 함수(return_finish_print, 마이그레이션 20261017000009)에 넘기고, 출력 단계 함수가 상자를 잠근 자리에서 비교해 다르면 거부한다.
--
-- 무엇을 바꾸나
--   return_claim_print(QR, 요청자) — 「연 줄」을 남기고 내주는 결과에 confirmed_at 칸 하나를 더한다. 판정·거부 사유·기록 줄·권한은 0020 과 같다.
--
-- 마이그레이션 20261017000009 와 한쪽만 적용된 상태
--   이 파일만: 앱이 세 인자 출력 단계 함수를 부르는데 아직 없다 → 호출 실패 → 앱이 연 줄을 돌려받고 「실패」. 출력이 멈출 뿐 주소는 나가지 않는다.
--   마이그레이션만: 봉투 결과에 confirmed_at 이 없다 → 앱이 출력 단계를 부르지 않고 연 줄을 돌려받고 「실패」. 역시 출력이 멈출 뿐이다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 앞 파일이 먼저 적용됐는지 본다. 없으면 여기서 멈춘다.
do $$
begin
  if to_regprocedure('public.return_claim_print(text,uuid)') is null or to_regclass('pii.return_addresses') is null then
    raise exception '반송 주소 복사본·봉투 함수가 없다 — manual/0020 을 먼저 적용한다';
  end if;
end $$;

create or replace function public.return_claim_print(p_qr text, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_count integer;
  v_reason text;
  v_address pii.return_addresses;
  v_sender uuid;
  v_log_id bigint;
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  select (select count(*) from public.return_decrypt_log where parcel_id = v.id and result = 'opened')
       - (select count(*) from public.return_decrypt_releases where parcel_id = v.id)
    into v_count;
  select * into v_address from pii.return_addresses where parcel_id = v.id;
  v_sender := public.return_sender_of(v.id);

  if v.box_id is null and v.share_id is null then
    v_reason := 'no_valid_approval';                                                  -- 어느 주문에도 이어지지 않은 상자 — 확인할 사람이 없다
  elsif v.state not in ('return_waiting', 'return_printed') then
    v_reason := 'order_not_printable';                                                -- (a) 반송 대기(재출력 포함)
  elsif v.return_confirmed_at is null or v_address.parcel_id is null or v_address.account_id is distinct from v_sender then
    v_reason := 'no_valid_approval';                                                  -- (a) 보낸 사람이 확인하며 복사한 암호문
  elsif v_count >= 3 then
    v_reason := 'decrypt_limit_reached';
  end if;
  if v_reason is not null then
    insert into public.return_decrypt_log (parcel_id, requester_id, result, deny_reason) values (v.id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  insert into public.return_decrypt_log (parcel_id, requester_id, result, print_no) values (v.id, p_requester, 'opened', v_count + 1)
    returning id into v_log_id;
  return jsonb_build_object(
    'result', 'opened', 'print_no', v_count + 1, 'log_id', v_log_id,
    'order_no', coalesce((select o.order_no from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id),
                         (select s.order_no from public.revgift_shares s where s.id = v.share_id)),
    'sender_id', v_sender,
    'sender_creator_id', (select c.id from public.creators c join public.profiles p on p.id = c.profile_id where c.profile_id = v_sender and p.role = 'creator'),
    -- 이 봉투를 내준 순간의 확인 시각 — 출력 단계 함수가 잠근 자리에서 이 값과 비교한다(그 사이 다시 확인했으면 거부)
    'confirmed_at', v.return_confirmed_at,
    'envelope', v_address.envelope);
end $$;

revoke all on function public.return_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.return_claim_print(text, uuid) to address_decryptor;

notify pgrst, 'reload schema';

commit;
