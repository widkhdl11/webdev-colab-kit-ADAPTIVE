-- 0029 가입 휴대폰 번호 암호화 2차 — 옛 숫자 칸 지우기 (signup INV-U18)
--
-- 사람이 직접 적용한다. 0028 적용 → 앱 배포 → 변환 스크립트(scripts/phone-encrypt-backfill.mjs)가 「남은 줄 0」을 낸 **뒤에만**.
-- 변환이 덜 끝났으면 첫 확인에서 멈추고 아무것도 바꾸지 않는다.
--
-- 바뀌는 것:
--   1) 옛 칸을 쓰던 두 함수를 옛 칸 없이 다시 만든다 — change_my_phone(옛 칸 비우기 줄 뺌) · pii.withdraw_account(옛 칸 지우기 줄 뺌)
--   2) pii.account_contacts.phone · pii.phone_verifications.phone 칸과 그 색인을 지운다
--   3) 변환용 임시 함수 둘을 지운다
--
-- 파일 전체가 한 트랜잭션이다.

begin;

do $$
begin
  if to_regclass('pii.phone_encrypt_marker') is null then
    raise exception '0028_phone_encrypt.sql 을 먼저 적용한다';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'account_contacts' and column_name = 'phone') then
    if exists (select 1 from pii.account_contacts where phone is not null) then
      raise exception '변환하지 않은 번호가 남아 있다 — 변환 스크립트를 먼저 끝까지 돌린다';
    end if;
  end if;
end $$;

-- ── 1) 옛 칸 없이 다시 만들기 ─────────────────────────────

create or replace function public.change_my_phone(p_account_id uuid, p_phone text, p_verification_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_ver pii.phone_verifications%rowtype;
  v_constraint text;
  v_hash text;
  v_sealed text;
  v_prefix text;
  v_last4 text;
begin
  if p_account_id is null or not exists (select 1 from public.profiles p where p.id = p_account_id) then
    raise exception '계정이 없다' using errcode = '42501';
  end if;
  -- INV-U18: p_phone 은 번호 묶음
  select b.b_hash, b.b_sealed, b.b_prefix, b.b_last4 into v_hash, v_sealed, v_prefix, v_last4 from pii.phone_bundle(p_phone) b;
  if exists (select 1 from pii.account_contacts c where c.account_id = p_account_id and c.phone_hash = v_hash) then
    raise exception '지금 번호와 같다' using errcode = 'FKU03';
  end if;

  select * into v_ver from pii.phone_verifications v where v.id = p_verification_id for update;
  if not found or v_ver.verified_at is null or v_ver.used_at is not null
     or v_ver.verified_at <= now() - interval '10 minutes' or v_ver.phone_hash is distinct from v_hash then
    raise exception '본인 확인을 쓸 수 없다' using errcode = 'FKU01';
  end if;
  if exists (select 1 from pii.account_contacts c where c.phone_hash = v_hash and c.account_id <> p_account_id) then
    raise exception '이미 가입된 번호다' using errcode = 'FKU02';
  end if;

  begin
    insert into pii.account_contacts (account_id, phone_sealed, phone_hash, phone_prefix, phone_last4)
    values (p_account_id, v_sealed, v_hash, v_prefix, v_last4)
    on conflict (account_id) do update
      set phone_sealed = excluded.phone_sealed, phone_hash = excluded.phone_hash,
          phone_prefix = excluded.phone_prefix, phone_last4 = excluded.phone_last4, updated_at = now();
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'account_contacts_phone_hash_unique' then
      raise exception '이미 가입된 번호다' using errcode = 'FKU02';
    end if;
    raise;
  end;

  update pii.phone_verifications set used_at = now() where id = v_ver.id;
  insert into public.phone_change_events (account_id) values (p_account_id);
  return 'changed';
end;
$fn$;

create or replace function pii.withdraw_account(p_account uuid, p_pseudonym uuid, p_creator uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_hash text;
begin
  if p_account is null or p_pseudonym is null then
    raise exception '계정과 가명 식별자가 있어야 한다' using errcode = '22023';
  end if;
  select c.phone_hash into v_hash from pii.account_contacts c where c.account_id = p_account;

  delete from pii.account_contacts where account_id = p_account;
  delete from pii.email_verifications where account_id = p_account;
  if v_hash is not null then
    delete from pii.phone_verifications where phone_hash = v_hash;
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
end $fn$;

-- ── 2) 옛 칸 지우기 ──────────────────────────────────────

drop function if exists public.phone_backfill_set(uuid, text, text);
drop function if exists public.phone_backfill_pending(integer);

drop index if exists pii.account_contacts_phone_unique;
alter table pii.account_contacts drop column if exists phone;
drop index if exists pii.phone_verifications_phone_requested;
alter table pii.phone_verifications drop column if exists phone;

revoke all on function public.change_my_phone(uuid, text, uuid) from public, anon, authenticated;
revoke all on function pii.withdraw_account(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.change_my_phone(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;

-- 적용 결과 확인 — 모두 t 여야 한다
select not exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'account_contacts' and column_name = 'phone') as contacts_plain_gone;
select not exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'phone_verifications' and column_name = 'phone') as verifications_plain_gone;
select to_regprocedure('public.phone_backfill_pending(integer)') is null as backfill_gone;
