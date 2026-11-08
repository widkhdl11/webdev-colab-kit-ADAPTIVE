-- 제주·도서 할증 지역 구분 — 주소 줄에 구분 칸, 저장 함수에 구분 인자, 결제 대기 생성용 구분 읽기, 송장 출력 때 재판정 기록.
-- 스펙: docs/specs/address-protection.md INV-P20(S20·S20c), docs/specs/payment.md INV-M24(S24~S24c). DECISIONS 2026-11-07 할증 줄들.
-- 사람이 직접 적용한다(개인정보 구역 pii 의 표·함수를 바꾼다). 마이그레이션 20261108000001_surcharge.sql 과 manual 0017·0019 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0030.sh
-- 확인: npx vitest run --config vitest.integration.config.mts surcharge-region-db creator-address-db fan-address-db
--   → 「(manual/0030 뒤)」 시험들이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 바꾸나
--   1) pii.creator_addresses · pii.fan_addresses 에 surcharge_region 칸('none'·'jeju'·'island', 옛 줄은 'none').
--      브라우저가 우편번호로 정해 보낸 구분이다 — 우편번호 자체는 어디에도 저장하지 않는다(INV-P20 ②).
--   2) set_creator_address — p_region 인자가 생긴다(목록 밖·빈 값이면 22023). 옛 네 인자 함수는 지운다.
--      set_my_fan_address — 같은 p_region 인자. 옛 두 인자 함수는 지운다. 구분 없이 저장하는 길을 남기지 않는다.
--   3) creator_surcharge_region(크리에이터) — 마이그레이션의 자리 함수(늘 'none')를 진짜로 바꾼다: 지금 등록된 주소의 구분, 주소가 없으면 'none'.
--      누구도(서비스 키 포함) 직접 부르지 못한다 — 결제 대기 생성 함수(register_order)만 안에서 부른다(INV-M24 ⑤).
--   4) invoice_report_surcharge_region(상자, 연 구분) — 송장 출력 함수(복호화 전용 역할)만. 송장이 나온 팬 선물 상자에서, 연 구분이
--      그 크리에이터 주소 줄의 저장 구분과 다르면 불일치 한 줄(상자·두 구분·시각)을 남긴다(INV-P20 ③). 주소·우편번호는 받지도 남기지도 않는다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   DB 만 새것: 옛 앱의 주소 저장(구분 인자 없음)이 함수 없음으로 실패한다(저장 안 됨 — 실패 쪽으로 멈춘다). 결제 대기는 등록된 구분대로 할증이 붙고
--               (옛 줄은 모두 'none'), 옛 앱의 결제 화면에는 할증 줄 없이 할증이 든 금액만 보인다.
--   앱만 새것: 주소 저장이 함수 없음으로 실패한다(저장 안 됨). 결제 대기는 자리 함수 때문에 할증이 없다. 송장 출력의 재판정 호출은 함수 없음으로
--               실패하지만 출력 결과는 그대로다(앱이 오류를 무시한다).
--   그래서 운영에는 앱 배포와 같은 때 적용한다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regclass('public.surcharge_region_mismatches') is null or to_regclass('public.surcharge_fees') is null then
    raise exception '마이그레이션 20261108000001_surcharge.sql 을 먼저 적용해야 한다';
  end if;
  if to_regprocedure('public.set_creator_address(uuid, jsonb, text, text)') is null or to_regprocedure('public.set_my_fan_address(jsonb, text)') is null then
    raise exception 'manual 0017(주소 이름표)·0019(팬 주소)를 먼저 적용해야 한다';
  end if;
end $$;

-- ── 1) 구분 칸 ───────────────────────────────────

alter table pii.creator_addresses add column surcharge_region text not null default 'none'
  constraint creator_addresses_surcharge_region check (surcharge_region in ('none', 'jeju', 'island'));
alter table pii.fan_addresses add column surcharge_region text not null default 'none'
  constraint fan_addresses_surcharge_region check (surcharge_region in ('none', 'jeju', 'island'));

-- ── 2) 저장 함수 ─────────────────────────────────

drop function public.set_creator_address(uuid, jsonb, text, text);

create function public.set_creator_address(p_actor_id uuid, p_envelope jsonb, p_label text, p_region text, p_method text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_existing boolean;
begin
  if not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  -- INV-P16: 이름표는 정해진 목록에서만 — 자유 입력이면 주소가 평문으로 들어올 수 있다
  if p_label is null or p_label not in ('home', 'studio', 'office', 'other') then
    raise exception '이름표가 목록에 없다' using errcode = '22023';
  end if;
  -- INV-P20 ②: 할증 구분도 목록에서만 — 우편번호가 들어올 자리가 없다
  if p_region is null or p_region not in ('none', 'jeju', 'island') then
    raise exception '할증 구분이 목록에 없다' using errcode = '22023';
  end if;

  select c.id into v_creator_id
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = p_actor_id and p.role = 'creator'
  for update of c;
  if p_actor_id is null or v_creator_id is null then
    return 'not_creator';
  end if;

  -- 가짜 서명은 허용 줄이 있는 DB(로컬 — seed.sql 이 넣는다)에서만. 운영 DB 에는 seed 가 돌지 않아 줄이 없다.
  if p_method is null or p_method not in ('kakao', 'fake')
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return 'method_refused';
  end if;

  select exists (select 1 from pii.creator_addresses where creator_id = v_creator_id) into v_existing;
  insert into pii.creator_addresses (creator_id, envelope, label, surcharge_region, updated_at) values (v_creator_id, p_envelope, p_label, p_region, now())
  on conflict (creator_id) do update
    set envelope = excluded.envelope, label = excluded.label, surcharge_region = excluded.surcharge_region, updated_at = excluded.updated_at;
  insert into pii.creator_address_events (creator_id, actor_id, event, method)
  values (v_creator_id, p_actor_id, case when v_existing then 'changed' else 'registered' end, p_method);
  return 'saved';
end $$;

drop function public.set_my_fan_address(jsonb, text);

create function public.set_my_fan_address(p_envelope jsonb, p_label text, p_region text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_existing boolean;
begin
  if not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  -- INV-P16: 이름표는 정해진 목록에서만 — 자유 입력이면 주소가 평문으로 들어올 수 있다
  if p_label is null or p_label not in ('home', 'studio', 'office', 'other') then
    raise exception '이름표가 목록에 없다' using errcode = '22023';
  end if;
  -- INV-P20 ②: 할증 구분도 목록에서만
  if p_region is null or p_region not in ('none', 'jeju', 'island') then
    raise exception '할증 구분이 목록에 없다' using errcode = '22023';
  end if;

  select p.id into v_account from public.profiles p where p.id = auth.uid() and p.role = 'fan' for no key update;
  if auth.uid() is null or v_account is null then
    return 'not_fan';
  end if;

  select exists (select 1 from pii.fan_addresses where account_id = v_account) into v_existing;
  insert into pii.fan_addresses (account_id, envelope, label, surcharge_region, updated_at) values (v_account, p_envelope, p_label, p_region, now())
  on conflict (account_id) do update
    set envelope = excluded.envelope, label = excluded.label, surcharge_region = excluded.surcharge_region, updated_at = excluded.updated_at;
  insert into pii.fan_address_events (account_id, event) values (v_account, case when v_existing then 'changed' else 'registered' end);
  return 'saved';
end $$;

-- ── 3) 결제 대기 생성용 구분 읽기 ─────────────────

-- 지금 등록된 주소의 구분, 주소가 없으면 'none'. register_order(공개 구역, 서버 전용)만 안에서 부른다 — 누구에게도 실행 권한이 없다(INV-M24 ⑤).
create or replace function public.creator_surcharge_region(p_creator_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select a.surcharge_region from pii.creator_addresses a where a.creator_id = p_creator_id), 'none');
$$;

-- ── 4) 송장 출력 때 재판정 기록 ───────────────────

-- 송장 출력 함수가 연 우편번호로 다시 정한 구분을 넘긴다. 송장이 나온(라벨 출력·출고) 팬 선물 상자에서만, 저장 구분과 다르면 한 줄 남기고 true.
-- 같거나 그런 상자가 아니면 false. 돌려주는 값에 저장 구분은 없다.
create function public.invoice_report_surcharge_region(p_box_id uuid, p_opened_region text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_stored text;
begin
  if p_opened_region is null or p_opened_region not in ('none', 'jeju', 'island') then
    raise exception '할증 구분이 목록에 없다' using errcode = '22023';
  end if;
  select coalesce(a.surcharge_region, 'none') into v_stored
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.office_parcels x on x.box_id = b.id and x.state in ('label_printed', 'shipped')
  left join pii.creator_addresses a on a.creator_id = o.creator_id
  where b.id = p_box_id;
  if v_stored is null or v_stored = p_opened_region then
    return false;
  end if;
  insert into public.surcharge_region_mismatches (box_id, stored_region, opened_region) values (p_box_id, v_stored, p_opened_region);
  return true;
end $$;

revoke all on function public.set_creator_address(uuid, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.set_creator_address(uuid, jsonb, text, text, text) to service_role;
revoke all on function public.set_my_fan_address(jsonb, text, text) from public, anon, service_role;
grant execute on function public.set_my_fan_address(jsonb, text, text) to authenticated;
revoke all on function public.creator_surcharge_region(uuid) from public, anon, authenticated, service_role;
revoke all on function public.invoice_report_surcharge_region(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.invoice_report_surcharge_region(uuid, text) to address_decryptor;

commit;
