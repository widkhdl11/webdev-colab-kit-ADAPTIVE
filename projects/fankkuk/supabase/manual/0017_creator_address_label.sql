-- 승인 전 주소 확인 — 주소 이름표·바꾼 시각, 주소 없는 승인 거부.
-- 스펙: docs/specs/address-protection.md INV-P16, docs/specs/approval-signature.md INV-S13 (2026-10-14, 결정 카드 d83 「이름표와 날짜만」)
-- 사람이 직접 적용한다(개인정보 구역 표·함수를 바꾼다). manual/0007_creator_address.sql 과
-- 마이그레이션 20261010000001_expired_decline.sql(approve_request 의 직전 정의) 다음에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0017_creator_address_label.sql
-- 확인: npx vitest run --config vitest.integration.config.mts creator-address-db approval-db
--   → 「(manual/0017 뒤)」 시험들이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 바꾸나
--   1) pii.creator_addresses 에 label 칸(home·studio·office·other 중 하나, 옛 줄은 비어 있음). 주소에서 나온 값이 아니라 고른 값이다.
--   2) set_creator_address — 인자에 p_label 이 생긴다(목록 밖·빈 값이면 22023). 옛 세 인자 함수는 지운다 — 이름표 없이 저장하는 길을 남기지 않는다.
--   3) my_creator_address_status — 등록 여부에 더해 이름표·바꾼 시각을 돌려준다. 주소·암호문은 여전히 내보내지 않는다(INV-P9).
--   4) approve_request — 20261010000001 과 같고, 그 크리에이터의 주소 칸이 없으면 'no_address' 로 답하고 아무것도 바꾸지 않는다(INV-S13).
--      ※ 앞으로 approve_request 를 다시 정의하는 파일은 이 확인을 그대로 옮겨야 한다 — approval-db 시험의 S13 이 빠지면 잡는다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   DB 만 새것: 옛 앱의 주소 저장(세 인자)이 함수 없음으로 실패하고, 주소 상태 읽기가 모르는 칸 때문에 실패해 설정·승인 화면이 오류로 멈춘다.
--               주소가 새거나 잘못 저장되는 일은 없다(실패 쪽으로 멈춘다). 승인은 'no_address' 를 옛 앱이 몰라 오류로 멈춘다.
--   앱만 새것: 주소 저장이 함수 없음으로 실패한다(저장 안 됨). 주소 상태는 이름표·시각 없이 「등록됨/등록 전」만 보인다.
--               승인은 화면이 주소 없을 때 입력을 먼저 띄우지만 DB 는 주소 없는 승인을 아직 막지 않는다(지금과 같음).
--   그래서 운영에는 앱 배포와 같은 때 적용한다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- ── 1) 이름표 칸 ─────────────────────────────────

alter table pii.creator_addresses add column label text
  constraint creator_addresses_label check (label in ('home', 'studio', 'office', 'other'));

-- ── 2) 등록·변경 ─────────────────────────────────

drop function public.set_creator_address(uuid, jsonb, text);

create function public.set_creator_address(p_actor_id uuid, p_envelope jsonb, p_label text, p_method text)
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
  insert into pii.creator_addresses (creator_id, envelope, label, updated_at) values (v_creator_id, p_envelope, p_label, now())
  on conflict (creator_id) do update set envelope = excluded.envelope, label = excluded.label, updated_at = excluded.updated_at;
  insert into pii.creator_address_events (creator_id, actor_id, event, method)
  values (v_creator_id, p_actor_id, case when v_existing then 'changed' else 'registered' end, p_method);
  return 'saved';
end $$;

-- ── 3) 본인 주소 상태 ─────────────────────────────

drop function public.my_creator_address_status();

-- 로그인 토큰의 크리에이터 줄 하나만. 등록 여부·이름표·바꾼 시각만 — 주소 값(암호문 포함)은 내보내지 않는다(INV-P9·P16).
create function public.my_creator_address_status()
returns table (creator_id uuid, registered boolean, label text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, a.creator_id is not null, a.label, a.updated_at
  from public.creators c
  left join pii.creator_addresses a on a.creator_id = c.id
  where auth.uid() is not null and c.profile_id = auth.uid();
$$;

-- ── 4) 승인 — 주소 없는 승인 거부 ─────────────────
create or replace function public.approve_request(
  p_request_id text,
  p_actor_id uuid,
  p_signed_content text,
  p_signer_id text,
  p_method text
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.approval_requests;
  v_now timestamptz := now();
begin
  -- INV-S11: 승인하는 사람이 그 주문의 크리에이터일 때만. 아니면 없는 요청과 같은 답.
  if p_actor_id is null or not exists (
    select 1 from public.approval_requests q
    join public.orders o on o.id = q.order_id
    join public.creators c on c.id = o.creator_id
    where q.request_id = p_request_id and c.profile_id = p_actor_id
  ) then
    return 'not_found';
  end if;

  select * into v_req from public.approval_requests where request_id = p_request_id for update;
  if v_req.status = 'approved' then
    return 'already';
  end if;

  -- INV-S2 를 DB 에서도: 서명된 원문은 저장한 원문과 같아야 한다. fake 서명자는 그 크리에이터의 가짜 식별값뿐.
  if p_signed_content is distinct from v_req.payload
     or p_method is null or p_method not in ('kakao', 'fake')
     or p_signer_id is null or p_signer_id = ''
     or (p_method = 'fake' and p_signer_id <> 'fake:' || p_actor_id::text)
     -- 가짜 서명은 허용 줄이 있는 DB(로컬 — seed.sql 이 넣는다)에서만. 운영 DB 에는 seed 가 돌지 않아 줄이 없다.
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return 'signature_mismatch';
  end if;

  -- INV-S6 (2026-10-10): 대기 중인데 결제 완료부터 168시간이 지났으면 「기한 지남」 — 반려는 자동 처리가 한다(decline_gift 와 같은 답)
  if v_req.status = 'waiting' and exists (
    select 1 from public.orders o
    where o.id = v_req.order_id and o.approved_at is null and v_now >= o.registered_at + interval '168 hours'
  ) then
    return 'expired';
  end if;

  if v_req.status <> 'waiting' or not exists (
    select 1 from public.orders o
    where o.id = v_req.order_id
      and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and v_now < o.registered_at + interval '168 hours'
  ) then
    return 'not_approvable';
  end if;

  -- INV-S13 (2026-10-14): 받는 주소를 등록하지 않은 크리에이터는 승인하지 못한다 — 승인·검수 뒤 출고에서야 멈추지 않게
  if not exists (
    select 1 from public.orders o
    join pii.creator_addresses a on a.creator_id = o.creator_id
    where o.id = v_req.order_id
  ) then
    return 'no_address';
  end if;

  perform set_config('fankkuk.approving', 'on', true);
  update public.approval_requests set status = 'approved', decided_at = v_now where id = v_req.id;
  update public.orders set approved_at = v_now where id = v_req.order_id;
  perform set_config('fankkuk.approving', '', true);
  -- INV-S12: 승인과 서명 저장은 한 처리
  insert into public.approval_signatures (request_id, signed_content, signer_id, method, signed_at)
  values (p_request_id, p_signed_content, p_signer_id, p_method, v_now);
  return 'approved';
end $$;

revoke all on function public.set_creator_address(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.set_creator_address(uuid, jsonb, text, text) to service_role;
revoke all on function public.my_creator_address_status() from public, anon, service_role;
grant execute on function public.my_creator_address_status() to authenticated;

commit;
