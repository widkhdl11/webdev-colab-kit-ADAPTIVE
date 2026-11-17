-- 0040 크리에이터 주소 등록·변경에 카카오 서명 — 서명이 검증된 뒤에만 주소 칸을 쓴다(2026-11-17).
-- 스펙: docs/specs/address-protection.md INV-P22 ①~⑤ (S22~S22e) · INV-P13·P14·P16 그대로.
--
-- 사람이 직접 적용한다(개인정보 구역 pii 에 새 표 하나, 기록 표에 칸 하나, 함수). 에이전트는 로컬에도 적용하지 않는다.
-- manual 0030(할증 구분)·0037(가입 카카오 서명) 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0040.sh
-- 확인: npx vitest run --config vitest.integration.config.mts creator-address-sign-db creator-address-db
--   → 적용 전에는 「(manual/0040 뒤)」 시험이 함수가 없다고 실패하고, 적용 뒤에는 통과한다.
--
-- 무엇을 바꾸나
--   1) pii.creator_address_sign_requests — 주소 저장 서명 요청 하나에 줄 하나. 봉인 주소·이름표·할증 구분·원문·방식·거래 ID·기한(5분)·상태.
--      상태: pending → saved(주소 칸을 씀) / rejected(서명 거절) · expired(5분 지남) · failed(원문 불일치·보내지 못함) · superseded(새 요청).
--      봉인 주소는 기다리는 동안만 가진다 — 끝나는 처리에서 지운다(표 검사로도 막는다). 평문 칸은 없다.
--   2) pii.creator_address_events — 방식에 'signup'(가입 서명 갈음, INV-P22 ④)을 더하고, sign_request_id 칸(주소 서명 요청 또는 가입 서명 요청 ID)을 더한다.
--   3) 옛 「바로 저장」 함수 public.set_creator_address 를 지운다. 주소 칸을 쓰는 곳은 내부 함수 pii.write_creator_address 하나이고,
--      누구에게도(서비스 키 포함) 실행 권한이 없다 — 아래 함수 둘(가입 갈음 · 서명 결과 적기)만 안에서 부른다(INV-P22 강제 위치, S22e).
--   4) 앱 서버 키 전용 함수 다섯:
--      start_creator_address_sign — 요청 만들기. 가입 갈음 조건(④)이면 요청 없이 바로 저장하고 saved_signup 으로 답한다.
--        아니면 승인 서명 연결이 있어야 하고(①, 없으면 not_linked), 같은 봉인 주소로 기다리는 요청이 있으면 그것을 돌려준다(③).
--        한도: 크리에이터당 1시간 5번·하루 5번(한국 시간 0시부터). 새 요청이면 연결 봉투와 크리에이터 ID 를 같이 돌려준다(게이트웨이가 서명 대상을 지정한다).
--      record_creator_address_sign_tx — 게이트웨이 거래 ID 적기.
--      creator_address_sign_request — 결과 확인 전에 그 요청 읽기(기한이 지났으면 expired 로 끝내고 봉인을 지운다).
--      settle_creator_address_sign — 서명 결과 적기. signed 는 기한 안·방식 같음·거래 ID 있음·서명된 원문이 저장 원문과 같을 때만 —
--        한 처리에서 주소 칸 덮어쓰기 · 기록(방식 kakao/fake + 요청 ID) · 요청 끝냄 · 봉인 지움(②). 그 밖에는 주소 칸 그대로, 봉인 지움.
--      close_creator_address_sign — 보내지 못한 요청을 끝낸다(봉인 지움).
--      다섯 함수 모두 탈퇴한 크리에이터의 요청은 없는 요청과 같은 답을 한다. 방식이 요청 때와 다르면 그 자리에서 요청을 끝내고(봉인 지움) method_refused.
--   5) purge_creator_address_sign_requests() — 기한이 지난 기다림을 expired 로 끝내고 봉인을 지운다, 이틀 지난 줄은 지운다. 10분마다(DB 예약 작업 fankkuk-address-sign).
--
-- 앱과 이 파일이 한쪽만 적용된 상태
--   이 파일만(앱은 옛 코드): 옛 앱의 주소 저장은 지운 함수를 부르다 실패한다(저장 안 됨 — 닫힌 쪽). 승인·송장은 그대로다.
--   앱만(이 파일 없음): 새 앱의 주소 저장은 요청 함수가 없어 실패한다(저장 안 됨 — 닫힌 쪽). 옛 바로 저장 함수는 남지만 새 앱은 부르지 않는다.
--   그래서 운영에는 앱 배포와 같은 때 적용한다.
--
-- 되돌리기(이 파일을 거두려면 — 한 트랜잭션으로):
--   select cron.unschedule('fankkuk-address-sign');
--   drop function public.start_creator_address_sign(uuid, jsonb, text, text, text, boolean);
--   drop function public.record_creator_address_sign_tx(uuid, uuid, text);
--   drop function public.creator_address_sign_request(uuid, uuid);
--   drop function public.settle_creator_address_sign(uuid, uuid, text, text, text);
--   drop function public.close_creator_address_sign(uuid, uuid);
--   drop function public.purge_creator_address_sign_requests();
--   drop function pii.write_creator_address(uuid, uuid, jsonb, text, text, text, uuid);
--   drop table pii.creator_address_sign_requests;
--   그다음 0030_surcharge_region.sql 의 「2) 저장 함수」 중 set_creator_address 정의와 권한 두 줄을 다시 실행한다.
--   기록 표의 칸(sign_request_id)·방식 'signup' 은 남겨 둔다 — 기록은 추가만이라 이미 남은 줄을 지울 수 없다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 다시 적용해도 결과가 같다.

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'creator_addresses' and column_name = 'surcharge_region') then
    raise exception 'manual 0030_surcharge_region 을 먼저 적용해야 한다';
  end if;
  if to_regclass('pii.signup_sign_requests') is null then
    raise exception 'manual 0037_signup_kakao_sign 을 먼저 적용해야 한다';
  end if;
end $$;

-- ── 1) 요청 표 ───────────────────────────────────────

create table if not exists pii.creator_address_sign_requests (
  id uuid primary key,
  creator_id uuid not null references public.creators (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  -- 기다리는 동안만 — 끝나면 지운다
  envelope jsonb check (envelope is null or pii.is_sealed_envelope(envelope)),
  label text not null check (label in ('home', 'studio', 'office', 'other')),
  surcharge_region text not null check (surcharge_region in ('none', 'jeju', 'island')),
  -- 원문: 「팬꾹 배송지 등록(또는 변경)」 · 요청 ID · 요청 시각 · 주소 별칭 — 주소 값은 들어가지 않는다(서버는 주소를 모른다)
  payload text not null check (payload ~ '^팬꾹 배송지 (등록|변경)\n요청 ID: [0-9a-f-]{36}\n요청 시각: [0-9T:.Z-]+\n주소 별칭: (집|작업실|사무실|기타)$'),
  method text not null check (method in ('kakao', 'fake')),
  gateway_tx_id text check (gateway_tx_id is null or gateway_tx_id ~ '^[0-9A-Za-z_.:-]{1,128}$'),
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'saved', 'rejected', 'expired', 'failed', 'superseded')),
  finished_at timestamptz,
  check (expires_at = requested_at + interval '5 minutes'),
  check ((state = 'pending') = (finished_at is null)),
  -- 봉인 주소는 기다리는 줄만 가진다(INV-P22 ②)
  check ((envelope is not null) = (state = 'pending'))
);
create index if not exists creator_address_sign_requests_creator on pii.creator_address_sign_requests (creator_id, requested_at);
alter table pii.creator_address_sign_requests enable row level security;
revoke all on pii.creator_address_sign_requests from public, anon, authenticated, service_role;

-- ── 2) 기록 표 ───────────────────────────────────────

alter table pii.creator_address_events drop constraint if exists creator_address_events_method_check;
alter table pii.creator_address_events drop constraint if exists creator_address_events_method;
alter table pii.creator_address_events add constraint creator_address_events_method check (method in ('kakao', 'fake', 'signup'));
-- 주소 서명 요청 ID(kakao·fake) 또는 가입 서명 요청 ID(signup). 이 파일 전의 줄은 비어 있다.
-- 외래 키를 걸지 않는다 — 가입 서명 요청 줄은 이틀 뒤 지워지고, 기록은 추가만이다.
alter table pii.creator_address_events add column if not exists sign_request_id uuid;

-- ── 3) 주소 칸을 쓰는 내부 함수 · 옛 바로 저장 함수 지움 ─────────

drop function if exists public.set_creator_address(uuid, jsonb, text, text, text);

-- 주소 칸 덮어쓰기와 기록 한 줄을 한 처리에서(INV-P13). 부르는 쪽(아래 둘)이 서명 검증·가입 갈음을 이미 확인했다.
-- 누구에게도 실행 권한이 없다 — security definer 함수 안에서만 불린다.
create or replace function pii.write_creator_address(
  p_creator_id uuid, p_actor_id uuid, p_envelope jsonb, p_label text, p_region text, p_method text, p_sign_request_id uuid
)
returns void
language plpgsql set search_path = ''
as $fn$
declare
  v_existing boolean;
begin
  if not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  if p_sign_request_id is null then
    raise exception '서명 요청 없이 주소를 쓰지 않는다' using errcode = '22023';
  end if;
  select exists (select 1 from pii.creator_addresses where creator_id = p_creator_id) into v_existing;
  insert into pii.creator_addresses (creator_id, envelope, label, surcharge_region, updated_at) values (p_creator_id, p_envelope, p_label, p_region, now())
  on conflict (creator_id) do update
    set envelope = excluded.envelope, label = excluded.label, surcharge_region = excluded.surcharge_region, updated_at = excluded.updated_at;
  insert into pii.creator_address_events (creator_id, actor_id, event, method, sign_request_id)
  values (p_creator_id, p_actor_id, case when v_existing then 'changed' else 'registered' end, p_method, p_sign_request_id);
end;
$fn$;

-- ── 4) 요청 만들기 ─────────────────────────────────────

-- result: saved_signup(가입 서명 갈음으로 바로 저장 — 요청 없음, ④) · started(새 요청 — 연결 봉투가 있다) · pending(같은 봉인 주소로 기다리는 요청 그대로)
--         · not_creator · method_refused · not_linked(①) · too_many(1시간 5번) · too_many_day(하루 5번)
-- p_resend: 「다시 보내기」 — 기다리는 요청이 있어도 끝내고(superseded) 새로 보낸다(한도 안에서).
create or replace function public.start_creator_address_sign(
  p_actor_id uuid, p_envelope jsonb, p_label text, p_region text, p_method text, p_resend boolean
)
returns table (result text, request_id uuid, payload text, expires_at timestamptz, envelope jsonb, creator_id uuid)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_creator_id uuid;
  v_existing boolean;
  v_signup_req uuid;
  v_link jsonb;
  v_pending pii.creator_address_sign_requests%rowtype;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_payload text;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  -- INV-P16: 이름표는 정해진 목록에서만
  if p_label is null or p_label not in ('home', 'studio', 'office', 'other') then
    raise exception '이름표가 목록에 없다' using errcode = '22023';
  end if;
  -- INV-P20 ②: 할증 구분도 목록에서만
  if p_region is null or p_region not in ('none', 'jeju', 'island') then
    raise exception '할증 구분이 목록에 없다' using errcode = '22023';
  end if;

  -- 크리에이터 줄을 잠근다 — 같은 크리에이터의 요청 둘이 겹쳐도 기다리는 요청은 하나다(③)
  select c.id into v_creator_id
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where p_actor_id is not null and c.profile_id = p_actor_id and p.role = 'creator' and c.withdrawn_at is null
  for update of c;
  if v_creator_id is null then
    return query select 'not_creator'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;

  -- ⑤ 가짜 서명은 허용 줄이 있는 DB(로컬·시험 사이트)에서만
  if p_method is null or p_method not in ('kakao', 'fake')
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return query select 'method_refused'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;

  -- ④ 가입 직후 갈음: 주소가 아직 없고, 가입 3단계 서명이 검증된 때(그 요청이 끝난 시각)부터 10분 안. 브라우저 값은 쓰지 않는다.
  select exists (select 1 from pii.creator_addresses a where a.creator_id = v_creator_id) into v_existing;
  if not v_existing then
    select r.id into v_signup_req
    from pii.signup_sign_requests r
    where r.creator_id = v_creator_id and r.state = 'used' and r.finished_at is not null
      and r.finished_at > v_now - interval '10 minutes' and r.finished_at <= v_now
    order by r.finished_at desc
    limit 1;
    if v_signup_req is not null then
      perform pii.write_creator_address(v_creator_id, p_actor_id, p_envelope, p_label, p_region, 'signup', v_signup_req);
      -- 기다리던 주소 서명 요청이 있으면 끝낸다(주소가 생겼으니 그 요청으로는 다시 쓰지 않는다)
      update pii.creator_address_sign_requests r set state = 'superseded', finished_at = v_now, envelope = null
       where r.creator_id = v_creator_id and r.state = 'pending';
      return query select 'saved_signup'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
      return;
    end if;
  end if;

  -- ① 서명 대상은 승인 서명 연결 때 등록한 정보로 지정한다 — 연결 전이면 보낼 곳이 없다
  select l.envelope into v_link from pii.signature_links l where l.creator_id = v_creator_id;
  if v_link is null then
    return query select 'not_linked'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;

  -- 기한이 지난 기다림은 끝낸다(봉인 지움)
  update pii.creator_address_sign_requests r set state = 'expired', finished_at = v_now, envelope = null
   where r.creator_id = v_creator_id and r.state = 'pending' and r.expires_at <= v_now;
  -- ③ 같은 봉인 주소·이름표·구분으로 기다리는 요청이 있으면 그것을 이어 보인다(카카오톡을 다시 보내지 않는다)
  select r.* into v_pending from pii.creator_address_sign_requests r where r.creator_id = v_creator_id and r.state = 'pending';
  if v_pending.id is not null and not coalesce(p_resend, false)
     and v_pending.envelope = p_envelope and v_pending.label = p_label and v_pending.surcharge_region = p_region then
    return query select 'pending'::text, v_pending.id, v_pending.payload, v_pending.expires_at, null::jsonb, null::uuid;
    return;
  end if;

  -- ③ 한도 — 승인 서명 연결과 같은 수치
  if (select count(*) from pii.creator_address_sign_requests r
      where r.creator_id = v_creator_id and r.requested_at > v_now - interval '1 hour') >= 5 then
    return query select 'too_many'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;
  if (select count(*) from pii.creator_address_sign_requests r
      where r.creator_id = v_creator_id and r.requested_at >= v_day_start) >= 5 then
    return query select 'too_many_day'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;

  -- 다른 주소로 다시 눌렀거나 「다시 보내기」 — 앞 요청은 끝낸다(기다리는 요청은 하나)
  update pii.creator_address_sign_requests r set state = 'superseded', finished_at = v_now, envelope = null
   where r.creator_id = v_creator_id and r.state = 'pending';

  v_payload := '팬꾹 배송지 ' || case when v_existing then '변경' else '등록' end
               || E'\n요청 ID: ' || v_id::text
               || E'\n요청 시각: ' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               || E'\n주소 별칭: ' || case p_label when 'home' then '집' when 'studio' then '작업실' when 'office' then '사무실' else '기타' end;
  insert into pii.creator_address_sign_requests (id, creator_id, actor_id, envelope, label, surcharge_region, payload, method, requested_at, expires_at)
  values (v_id, v_creator_id, p_actor_id, p_envelope, p_label, p_region, v_payload, p_method, v_now, v_now + interval '5 minutes');

  return query select 'started'::text, v_id, v_payload, v_now + interval '5 minutes', v_link, v_creator_id;
end;
$fn$;

-- 게이트웨이가 요청을 받고 돌려준 거래 ID 를 적는다. 기다리는 중이고 비어 있을 때만. result: recorded · not_found · not_pending
create or replace function public.record_creator_address_sign_tx(p_actor_id uuid, p_request_id uuid, p_tx_id text)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.creator_address_sign_requests%rowtype;
begin
  select r.* into v_req
  from pii.creator_address_sign_requests r
  join public.creators c on c.id = r.creator_id
  where r.id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id and c.withdrawn_at is null
  for update of r;
  if not found then
    return 'not_found';
  end if;
  if v_req.state <> 'pending' or v_req.gateway_tx_id is not null then
    return 'not_pending';
  end if;
  update pii.creator_address_sign_requests r set gateway_tx_id = p_tx_id where r.id = v_req.id;
  return 'recorded';
end;
$fn$;

-- 결과 확인 전에 그 요청을 읽는다. 남의 요청은 없는 요청과 같은 답.
-- state: pending(원문·방식·거래 ID 를 준다) · saved · rejected · expired · failed · not_found. 봉인 주소는 돌려주지 않는다.
create or replace function public.creator_address_sign_request(p_actor_id uuid, p_request_id uuid)
returns table (state text, payload text, method text, gateway_tx_id text)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.creator_address_sign_requests%rowtype;
begin
  select r.* into v_req
  from pii.creator_address_sign_requests r
  join public.creators c on c.id = r.creator_id
  where r.id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id and c.withdrawn_at is null
  for update of r;
  if not found then
    return query select 'not_found'::text, null::text, null::text, null::text;
    return;
  end if;
  if v_req.state = 'pending' and v_req.expires_at <= now() then
    update pii.creator_address_sign_requests r set state = 'expired', finished_at = now(), envelope = null where r.id = v_req.id;
    return query select 'expired'::text, null::text, null::text, null::text;
    return;
  end if;
  if v_req.state = 'pending' then
    return query select 'pending'::text, v_req.payload, v_req.method, v_req.gateway_tx_id;
    return;
  end if;
  return query select (case v_req.state when 'superseded' then 'failed' else v_req.state end)::text, null::text, null::text, null::text;
end;
$fn$;

-- 서명 결과를 적는다 — 주소 칸을 쓰는 유일한 서명 입구(INV-P22 ②).
-- p_outcome: signed · rejected · expired · failed. result: saved · rejected · expired · failed · not_found · method_refused
create or replace function public.settle_creator_address_sign(p_actor_id uuid, p_request_id uuid, p_outcome text, p_signed_content text, p_method text)
returns table (result text)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.creator_address_sign_requests%rowtype;
  v_now timestamptz := now();
begin
  if p_outcome is null or p_outcome not in ('signed', 'rejected', 'expired', 'failed') then
    raise exception '결과는 signed·rejected·expired·failed 넷뿐이다' using errcode = '22023';
  end if;
  select r.* into v_req
  from pii.creator_address_sign_requests r
  join public.creators c on c.id = r.creator_id
  where r.id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id and c.withdrawn_at is null
  for update of r;
  if not found then
    return query select 'not_found'::text;
    return;
  end if;
  if v_req.state <> 'pending' then
    return query select (case v_req.state when 'superseded' then 'failed' else v_req.state end)::text;
    return;
  end if;
  if v_req.expires_at <= v_now then
    update pii.creator_address_sign_requests r set state = 'expired', finished_at = v_now, envelope = null where r.id = v_req.id;
    return query select 'expired'::text;
    return;
  end if;
  if p_outcome in ('rejected', 'expired', 'failed') then
    update pii.creator_address_sign_requests r set state = p_outcome, finished_at = v_now, envelope = null where r.id = v_req.id;
    return query select p_outcome;
    return;
  end if;
  -- ⑤ 방식은 요청 때와 같고, 가짜는 허용 줄이 있는 DB 에서만
  if p_method is distinct from v_req.method
     or (v_req.method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    -- 그 자리에서 끝낸다(봉인 지움) — 기한까지 봉인을 남기지 않는다. 답은 method_refused 그대로
    update pii.creator_address_sign_requests r set state = 'failed', finished_at = v_now, envelope = null where r.id = v_req.id;
    return query select 'method_refused'::text;
    return;
  end if;
  -- ② 서명된 원문이 저장 원문과 같고(INV-S2 와 같은 대조) 게이트웨이를 거친 결과일 때만
  if p_signed_content is null or p_signed_content is distinct from v_req.payload or v_req.gateway_tx_id is null then
    update pii.creator_address_sign_requests r set state = 'failed', finished_at = v_now, envelope = null where r.id = v_req.id;
    return query select 'failed'::text;
    return;
  end if;
  -- 한 처리: 주소 칸 덮어쓰기 · 기록(방식 + 요청 ID) · 요청 끝냄 · 봉인 지움
  perform pii.write_creator_address(v_req.creator_id, v_req.actor_id, v_req.envelope, v_req.label, v_req.surcharge_region, v_req.method, v_req.id);
  update pii.creator_address_sign_requests r set state = 'saved', finished_at = v_now, envelope = null where r.id = v_req.id;
  return query select 'saved'::text;
end;
$fn$;

-- 보내지 못한 요청(창구가 받지 않음·거래 ID 를 못 적음)을 끝낸다 — 봉인 지움. result: closed · not_found · not_pending
create or replace function public.close_creator_address_sign(p_actor_id uuid, p_request_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.creator_address_sign_requests%rowtype;
begin
  select r.* into v_req
  from pii.creator_address_sign_requests r
  join public.creators c on c.id = r.creator_id
  where r.id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id and c.withdrawn_at is null
  for update of r;
  if not found then
    return 'not_found';
  end if;
  if v_req.state <> 'pending' then
    return 'not_pending';
  end if;
  update pii.creator_address_sign_requests r set state = 'failed', finished_at = now(), envelope = null where r.id = v_req.id;
  return 'closed';
end;
$fn$;

-- ── 5) 정리 ───────────────────────────────────────────

create or replace function public.purge_creator_address_sign_requests()
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  update pii.creator_address_sign_requests r set state = 'expired', finished_at = now(), envelope = null
   where r.state = 'pending' and r.expires_at <= now();
  delete from pii.creator_address_sign_requests r where r.requested_at < now() - interval '2 days';
end;
$fn$;

-- ── 권한 ─────────────────────────────────────────────

revoke all on function pii.write_creator_address(uuid, uuid, jsonb, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.start_creator_address_sign(uuid, jsonb, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.record_creator_address_sign_tx(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.creator_address_sign_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_creator_address_sign(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.close_creator_address_sign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.purge_creator_address_sign_requests() from public, anon, authenticated;
grant execute on function public.start_creator_address_sign(uuid, jsonb, text, text, text, boolean) to service_role;
grant execute on function public.record_creator_address_sign_tx(uuid, uuid, text) to service_role;
grant execute on function public.creator_address_sign_request(uuid, uuid) to service_role;
grant execute on function public.settle_creator_address_sign(uuid, uuid, text, text, text) to service_role;
grant execute on function public.close_creator_address_sign(uuid, uuid) to service_role;
grant execute on function public.purge_creator_address_sign_requests() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fankkuk-address-sign') then
    perform cron.unschedule('fankkuk-address-sign');
  end if;
end $$;
select cron.schedule('fankkuk-address-sign', '*/10 * * * *', 'select public.purge_creator_address_sign_requests()');

notify pgrst, 'reload schema';

commit;
