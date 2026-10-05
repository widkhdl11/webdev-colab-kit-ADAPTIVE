-- 크리에이터 주소 등록·변경. 스펙: docs/specs/address-protection.md (INV-P1·P9·P13)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md). 0005_revgift_address.sql(봉인 형식 검사 함수 pii.is_sealed_envelope)과
-- 마이그레이션 20261005000016_approval_fake_guard.sql(public.local_dev_flags) 다음에 적용한다.
--
-- 적용(로컬, PowerShell):
--   Get-Content projects/fankkuk/supabase/manual/0007_creator_address.sql -Raw -Encoding utf8 | docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- 결과·오류: set_creator_address → 'saved' | 'not_creator'(크리에이터가 아니거나 크리에이터 줄이 없음) | 'method_refused'(이 DB 가 받지 않는 서명 방식)
--            · 22023 봉인 형식이 아님
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 크리에이터 한 명에 주소 하나(INV-P13) — 바꾸면 덮어쓴다. 값은 크리에이터 브라우저에서 봉인된 봉투(INV-P1):
-- 받는 사람 이름·전화번호·주소와 그 크리에이터의 식별값(creators.id)을 함께 봉인한 것.
create table pii.creator_addresses (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  envelope jsonb not null check (pii.is_sealed_envelope(envelope)),
  updated_at timestamptz not null default now()
);
alter table pii.creator_addresses enable row level security;
revoke all on pii.creator_addresses from public, anon, authenticated, service_role;

-- 등록·변경 기록: 누가·언제·어떤 서명 방식으로. 주소 칸은 없다. 추가만 된다.
create table pii.creator_address_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id),
  actor_id uuid not null references public.profiles (id),
  event text not null check (event in ('registered', 'changed')),
  method text not null check (method in ('kakao', 'fake')),
  at timestamptz not null default now()
);
alter table pii.creator_address_events enable row level security;
revoke all on pii.creator_address_events from public, anon, authenticated, service_role;

-- 고치기·지우기·통째로 비우기는 누구도(서비스 키 포함) 못 한다
create function pii.creator_address_events_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '주소 등록 기록은 추가만 된다' using errcode = '42501';
end $$;
create trigger creator_address_events_no_update before update or delete on pii.creator_address_events
for each row execute function pii.creator_address_events_append_only();
create trigger creator_address_events_no_truncate before truncate on pii.creator_address_events
for each statement execute function pii.creator_address_events_append_only();

-- ── 등록·변경(앱 서버 전용, INV-P13) ─────────────────────

-- 앱 서버가 세션에서 확인한 사람 ID 만 넘긴다(INV-L3). 그 사람이 크리에이터 역할이고 크리에이터 줄이 있어야 쓴다.
-- 크리에이터 줄을 잠근 뒤 주소 칸 덮어쓰기와 기록 한 줄을 한 처리에서 한다 — 같은 크리에이터의 등록 두 번이 겹쳐도
-- 주소 칸은 하나, 기록은 등록마다 한 줄이고 registered/changed 가 뒤섞이지 않는다.
create function public.set_creator_address(p_actor_id uuid, p_envelope jsonb, p_method text)
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
  insert into pii.creator_addresses (creator_id, envelope, updated_at) values (v_creator_id, p_envelope, now())
  on conflict (creator_id) do update set envelope = excluded.envelope, updated_at = excluded.updated_at;
  insert into pii.creator_address_events (creator_id, actor_id, event, method)
  values (v_creator_id, p_actor_id, case when v_existing then 'changed' else 'registered' end, p_method);
  return 'saved';
end $$;

-- ── 등록 여부 읽기(로그인한 크리에이터 본인, INV-P9·P13) ──

-- 로그인 토큰의 크리에이터 줄 하나만. 크리에이터 ID 와 등록 여부만 돌려준다 — 주소 값(암호문 포함)은 내보내지 않는다.
create function public.my_creator_address_status()
returns table (creator_id uuid, registered boolean)
language sql stable security definer set search_path = ''
as $$
  select c.id, exists (select 1 from pii.creator_addresses a where a.creator_id = c.id)
  from public.creators c
  where auth.uid() is not null and c.profile_id = auth.uid();
$$;

revoke all on function pii.creator_address_events_append_only() from public, anon, authenticated, service_role;
revoke all on function public.set_creator_address(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.set_creator_address(uuid, jsonb, text) to service_role;
revoke all on function public.my_creator_address_status() from public, anon, service_role;
grant execute on function public.my_creator_address_status() to authenticated;

commit;
