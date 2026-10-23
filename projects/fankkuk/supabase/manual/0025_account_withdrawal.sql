-- 회원 탈퇴 — 개인정보 구역 지우기 (2026-10-23 카드 d121).
-- 스펙: docs/specs/my-account.md INV-A15 (S15~S15c), docs/specs/approval-signature.md INV-S15 (S15·S15b)
-- 사람이 직접 적용한다(개인정보 구역의 연락처·주소·주소 암호문과 키를 지우는 함수). 마이그레이션 20261023000002 다음에 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0025.sh
-- 확인: npx vitest run --config vitest.integration.config.mts account-withdrawal-db
--
-- 무엇을 만드나
--   pii.withdraw_account(account, pseudonym, creator) — public.withdraw_account(마이그레이션 20261023000002) 만 부른다. 한 처리 안에서
--     연락처(휴대폰·이메일)·이메일 확인 기록·휴대폰 확인 기록(그 번호)·팬 주소·반송 복사본·역조공 몫 사본·크리에이터 주소를 지운다.
--     주소 봉투(envelope)에 암호문과 암호화된 데이터 키가 같이 들어 있어, 줄을 지우면 둘 다 사라진다(INV-S15).
--     주소 등록 기록(누가 언제 등록·변경했는지)은 보관 대상이 아니라 지운다 — 이 처리 동안만 「고칠 수 없다」 트리거를 끈다.
--   부를 수 있는 사람: 없음(public.withdraw_account 의 소유자 postgres 만).
--
-- 마이그레이션 20261023000002 과 한쪽만 적용된 상태
--   이 파일만: 부르는 곳이 없다. 지금과 같다. 그래서 아래 첫 검사가 마이그레이션이 먼저인지 보고, 아니면 멈춘다.
--   마이그레이션만: public.withdraw_account 가 이 함수를 찾지 못해 실패하고, 한 처리라 아무것도 지워지지 않는다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regprocedure('public.withdraw_account(text)') is null then
    raise exception '탈퇴 처리 함수가 없다 — 마이그레이션 20261023000002_account_withdrawal.sql 을 먼저 적용한다';
  end if;
end $$;

create or replace function pii.withdraw_account(p_account uuid, p_pseudonym uuid, p_creator uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text;
begin
  if p_account is null or p_pseudonym is null then
    raise exception '계정과 가명 식별자가 있어야 한다' using errcode = '22023';
  end if;
  select c.phone into v_phone from pii.account_contacts c where c.account_id = p_account;

  delete from pii.account_contacts where account_id = p_account;
  delete from pii.email_verifications where account_id = p_account;
  if v_phone is not null then
    delete from pii.phone_verifications where phone = v_phone;
  end if;
  delete from pii.fan_addresses where account_id = p_account;
  delete from pii.return_addresses where account_id = p_account;
  delete from pii.revgift_addresses a using public.revgift_shares s where s.id = a.share_id and s.fan_id = p_account;

  alter table pii.fan_address_events disable trigger fan_address_events_no_update;
  alter table pii.creator_address_events disable trigger creator_address_events_no_update;
  delete from pii.fan_address_events where account_id = p_account;
  delete from pii.creator_address_events where actor_id = p_account or (p_creator is not null and creator_id = p_creator);
  alter table pii.fan_address_events enable trigger fan_address_events_no_update;
  alter table pii.creator_address_events enable trigger creator_address_events_no_update;

  if p_creator is not null then
    delete from pii.creator_addresses where creator_id = p_creator;
  end if;
end $$;

revoke all on function pii.withdraw_account(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- 적용 결과 확인 — 두 줄 모두 t 여야 한다
select to_regprocedure('pii.withdraw_account(uuid,uuid,uuid)') is not null as pii_withdraw_exists;
select not has_function_privilege('authenticated', 'pii.withdraw_account(uuid,uuid,uuid)', 'execute') as not_callable_by_login;

commit;
