-- 선물함(팬에게 보내기) 2부 — 만들기 · 초대 링크 · 신청 · 신청 관리(제외/다시 넣기) · 신청 취소 · 마감 · 선물함 취소.
-- 스펙: docs/specs/revgift-box.md (INV-GB1 open·closed·cancelled · GB2 · GB3 · GB4 · GB5 · GB6 · GB7 · GB8 · GB9 목록), 순서: workspace/revgift-box-plan.md.
--
-- 신청의 주소 사본은 개인정보 구역(pii)에 있다 — 사본 표와 사본 저장·삭제 함수는 사람이 적용하는 supabase/manual/0031_revgift_box_address.sql 이다.
-- 이 파일의 신청·신청 취소·마감·선물함 취소 함수는 그 pii 함수를 같은 처리 안에서 부른다. 0031 이 적용되기 전에는 그 함수가 없어
-- 신청·신청 취소·마감·선물함 취소가 「함수 없음」으로 실패한다(아무것도 바뀌지 않는다 — 실패 쪽으로 멈춘다).
-- 그래서 함수 본문 검사를 끄고 만든다(본문이 아직 없는 pii 함수를 가리킨다).
-- 옛 역조공(revgift_sends·revgift_shares)은 그대로 둔다(INV-GB22 는 4부).
--
-- 누구인지는 모두 로그인 토큰(auth.uid())으로 정한다 — 인자에 계정이 없다(session-login INV-L2). 앱 서버 키(service_role)로는 부르지 못한다.
-- 잠금 순서: 선물함 줄 → (팔로우 줄) → 신청 줄 (INV-GB2, office-workflow INV-W12 의 순서).
--
-- 오류 코드
--   22023 입력 꼴(이름·받을 인원·공개 여부·봉인·할증 구분)
--   42501 역할이 아님(팬이 만들기 · 크리에이터가 신청)
--   P0002 선물함을 찾을 수 없음(없음 · 주인이 아님 · 비공개인데 초대 토큰이 없거나 틀림 — 모두 같은 답)
--   P0022 지금 상태에서 할 수 없음(INV-GB1 전환표 밖)
--   P0023 받을 인원이 다 참(INV-GB5)
--   P0024 제외 안 된 신청이 없음(INV-GB8)
--   P0025 팔로우하지 않음(INV-GB4)
--   P0027 이미 신청함(INV-GB4)
--   P0026 등록한 받을 주소가 없음(0031 의 사본 저장 함수가 낸다)

set local check_function_bodies = off;

-- ── 주소 사본 기록 (INV-GB7 · GB20) ──────────────────
-- 신청의 주소 사본을 넣고 지운 기록 — 신청·사건·까닭·시각만 있다. 주소·이름·전화 칸은 없다(사본 자체는 pii 에).
-- 0031 의 사본 저장·삭제 함수만 쓴다. 추가만 된다. 신청이 통째로 지워져도 기록은 남는다(외래 키 없음 — 지운 사실을 남기려고).
create table public.revgift_box_address_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  event text not null check (event in ('copied', 'entered', 'deleted')),
  reason text check (reason in ('excluded_at_close', 'box_cancelled', 'withdrawn')),
  at timestamptz not null default now(),
  check ((event = 'deleted') = (reason is not null))
);
create index revgift_box_address_events_app_idx on public.revgift_box_address_events (application_id);
alter table public.revgift_box_address_events enable row level security;
revoke all on public.revgift_box_address_events from anon, authenticated;

create function public.revgift_box_address_events_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '주소 사본 기록은 고치거나 지울 수 없다' using errcode = '42501';
end $$;
revoke all on function public.revgift_box_address_events_append_only() from public, anon, authenticated, service_role;
create trigger revgift_box_address_events_no_change before update or delete on public.revgift_box_address_events
  for each row execute function public.revgift_box_address_events_append_only();

-- ── 만들기 · 초대 링크 (INV-GB3) ─────────────────────

-- 추측할 수 없는 초대 토큰 — 24바이트 난수를 URL 에 쓸 수 있는 글자 32개로. 6자리·주문번호와 꼴이 다르다.
create function public.revgift_box_new_token()
returns text
language sql volatile set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
$$;
revoke all on function public.revgift_box_new_token() from public, anon, authenticated, service_role;

-- 크리에이터 역할 계정만 자기 이름으로. 받는 값은 셋뿐(이름·받을 인원·공개 여부). 돌려주는 값: 선물함 id 와 (비공개면) 초대 토큰.
create function public.create_revgift_box(p_name text, p_capacity integer, p_is_public boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_rules jsonb := public.revgift_box_rules();
  v_name text := btrim(coalesce(p_name, ''));
  v_token text;
  v_id uuid;
begin
  select c.id into v_creator_id
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where auth.uid() is not null and c.profile_id = auth.uid() and p.role = 'creator';
  if v_creator_id is null then
    raise exception '크리에이터만 선물함을 만든다' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > (v_rules ->> 'name_max')::integer then
    raise exception '선물함 이름 꼴이 틀리다' using errcode = '22023';
  end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > (v_rules ->> 'capacity_max')::integer then
    raise exception '받을 인원 꼴이 틀리다' using errcode = '22023';
  end if;
  if p_is_public is null then
    raise exception '공개 여부가 없다' using errcode = '22023';
  end if;
  if not p_is_public then
    v_token := public.revgift_box_new_token();
  end if;
  insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, invite_token)
  values (auth.uid(), v_creator_id, v_name, p_capacity, p_is_public, v_token)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end $$;

-- 주인 본인의 선물함 줄을 잠그고 돌려준다. 없거나 주인이 아니면 P0002 — 남의 선물함이 있는지조차 드러내지 않는다.
create function public.revgift_box_lock_mine(p_box_id uuid)
returns public.revgift_boxes
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
begin
  select * into v from public.revgift_boxes b where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid() for update;
  if not found then
    raise exception '선물함을 찾을 수 없다' using errcode = 'P0002';
  end if;
  return v;
end $$;
revoke all on function public.revgift_box_lock_mine(uuid) from public, anon, authenticated, service_role;

-- 「링크 다시 만들기」(정할 것 Q3) — 비공개·신청 받는 중인 선물함의 토큰을 새로 만든다. 옛 토큰은 그 순간 무효다.
create function public.revgift_box_renew_invite(p_box_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
  v_token text;
begin
  if v.status <> 'open' or v.is_public then
    raise exception '지금은 초대 링크를 바꿀 수 없다' using errcode = 'P0022';
  end if;
  v_token := public.revgift_box_new_token();
  update public.revgift_boxes set invite_token = v_token where id = v.id;
  return v_token;
end $$;

-- ── 크리에이터 읽기 (INV-GB7 · GB9) ──────────────────

-- 내 선물함 목록. 사람 칸이 없다 — 신청 수(제외 안 된 신청)만.
create function public.my_revgift_boxes()
returns table (id uuid, name text, capacity smallint, is_public boolean, status text, created_at timestamptz, active_count integer)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, b.capacity, b.is_public, b.status, b.created_at,
         (select count(*)::integer from public.revgift_box_applications a
          where a.box_id = b.id and a.status not in ('excluded', 'withdrawn', 'ended'))
  from public.revgift_boxes b
  where auth.uid() is not null and b.owner_id = auth.uid()
  order by b.created_at desc;
$$;

-- 신청 관리 창. 주인 본인만. 신청 줄마다 보이는 것은 신청 번호·닉네임·신청 시각·상태뿐이다(INV-GB9) —
-- 주소·받는 분 이름·전화번호·로그인 아이디·계정 id 칸이 없다. 신청을 거둔 팬은 목록에 없다.
create function public.my_revgift_box(p_box_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'capacity', b.capacity, 'is_public', b.is_public, 'status', b.status,
    'invite_token', b.invite_token, 'created_at', b.created_at,
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nickname', p.nickname, 'applied_at', a.applied_at, 'status', a.status)
                       order by a.applied_at, a.id)
      from public.revgift_box_applications a
      join public.profiles p on p.id = a.fan_id
      where a.box_id = b.id and a.status <> 'withdrawn'
    ), '[]'::jsonb))
  from public.revgift_boxes b
  where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid();
$$;

-- ── 신청 관리 — 제외·다시 넣기 · 마감 · 선물함 취소 (INV-GB5 · GB7 · GB8 · GB1) ──

-- 제외는 줄마다 토글. `open` 일 때만. 다시 넣기는 받을 인원 안에서만(선물함 줄을 잠근 뒤 센다 — 마지막 자리에 둘이 와도 하나).
-- 제외해도 주소 사본은 지우지 않는다(다시 넣을 때 다시 받지 않으려고 — 정할 것 Q5). 돌려주는 값: 바뀐 뒤 상태.
create function public.revgift_box_set_excluded(p_box_id uuid, p_application_id uuid, p_excluded boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
  v_app public.revgift_box_applications;
  v_active integer;
begin
  if p_excluded is null then
    raise exception '제외 여부가 없다' using errcode = '22023';
  end if;
  select * into v_app from public.revgift_box_applications a where a.id = p_application_id and a.box_id = v.id for update;
  if not found or v_app.status = 'withdrawn' then
    raise exception '신청을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v.status <> 'open' or v_app.status not in ('applied', 'excluded') then
    raise exception '지금은 제외를 바꿀 수 없다' using errcode = 'P0022';
  end if;
  if p_excluded then
    update public.revgift_box_applications set status = 'excluded' where id = v_app.id;
    return 'excluded';
  end if;
  if v_app.status = 'excluded' then
    select count(*) into v_active from public.revgift_box_applications a where a.box_id = v.id and a.status = 'applied';
    if v_active >= v.capacity then
      raise exception '받을 인원이 다 찼다' using errcode = 'P0023';
    end if;
    update public.revgift_box_applications set status = 'applied' where id = v_app.id;
  end if;
  return 'applied';
end $$;

-- 마감 — 주인이 `open` 일 때, 제외 안 된 신청이 1명 이상일 때. 신청 함수와 같은 선물함 줄 잠금이라 먼저 끝난 신청만 들어간다(INV-GB8).
-- 제외 안 된 신청은 「담길 차례」(selected), 제외된 신청은 그대로 끝난 상태로 두고 그 주소 사본을 같은 처리에서 지운다(INV-GB7, 정할 것 Q5).
create function public.revgift_box_close(p_box_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
  v_selected integer;
begin
  if v.status <> 'open' then
    raise exception '신청 받는 중인 선물함만 마감한다' using errcode = 'P0022';
  end if;
  perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
  update public.revgift_box_applications set status = 'selected' where box_id = v.id and status = 'applied';
  get diagnostics v_selected = row_count;
  if v_selected = 0 then
    raise exception '제외 안 된 신청이 없다' using errcode = 'P0024';
  end if;
  update public.revgift_boxes set status = 'closed' where id = v.id;
  perform pii.revgift_box_drop_copies(array(
    select a.id from public.revgift_box_applications a where a.box_id = v.id and a.status = 'excluded'), 'excluded_at_close');
  return v_selected;
end $$;

-- 선물함 취소 — `open`·`closed`·`awaiting_box` 에서, 큰 상자가 하나도 입고되기 전(INV-GB1, 정할 것 Q9). 결제 전이라 환불이 없다.
-- 끝나지 않은 신청은 같은 처리에서 함께 끝나고(INV-GB2), 모든 신청의 주소 사본을 지운다(INV-GB20).
create function public.revgift_box_cancel(p_box_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
begin
  if v.status not in ('open', 'closed', 'awaiting_box')
     or exists (select 1 from public.revgift_box_cartons c where c.box_id = v.id) then
    raise exception '지금은 선물함을 취소할 수 없다' using errcode = 'P0022';
  end if;
  perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
  update public.revgift_box_applications set status = 'ended' where box_id = v.id and status in ('applied', 'excluded', 'selected');
  update public.revgift_boxes set status = 'cancelled' where id = v.id;
  perform pii.revgift_box_drop_copies(array(
    select a.id from public.revgift_box_applications a where a.box_id = v.id), 'box_cancelled');
end $$;

-- ── 팬 쪽 — 입구 · 읽기 · 신청 · 신청 취소 (INV-GB4 · GB5 · GB6 · GB9) ──

-- 크리에이터 상세의 입구 — 그 크리에이터의 공개·신청 받는 중인 선물함. 이름뿐이다(신청 수·받을 인원 없음 — 정할 것 Q6).
create function public.creator_open_revgift_boxes(p_creator_id uuid)
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name from public.revgift_boxes b
  where b.creator_id = p_creator_id and b.is_public and b.status = 'open'
  order by b.created_at desc;
$$;

-- 팬이 보는 선물함 하나. 비공개는 맞는 초대 토큰이 있어야 하고, 아니면 「없음」과 같은 답(null)이다.
-- 다른 신청자의 수·닉네임·받을 인원은 보이지 않는다(INV-GB9, 정할 것 Q6). 내 신청 상태는 제외 여부를 드러내지 않는다 —
-- 신청 받는 중에는 제외돼도 「신청함」, 마감 뒤에는 담긴 팬만 「준비 중」이고 나머지는 「마감」이다.
create function public.revgift_box_for_fan(p_box_id uuid, p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name,
    'creator', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name),
    'open', b.status = 'open',
    'viewer', case
      when auth.uid() is null then 'guest'
      when b.owner_id = auth.uid() then 'owner'
      when (select p.role from public.profiles p where p.id = auth.uid()) <> 'fan' then 'not_fan'
      when exists (select 1 from public.follows f where f.fan_id = auth.uid() and f.creator_id = b.creator_id) then 'follower'
      else 'not_follower' end,
    'my_state', case
      when a.status is null or a.status in ('withdrawn') then 'none'
      when a.status in ('applied', 'excluded') and b.status = 'open' then 'applied'
      when a.status in ('selected', 'measured', 'paid', 'shipped', 'delivered') then 'preparing'
      when b.status = 'cancelled' then 'cancelled'
      else 'closed' end)
  from public.revgift_boxes b
  join public.creators c on c.id = b.creator_id
  left join public.revgift_box_applications a on a.box_id = b.id and auth.uid() is not null and a.fan_id = auth.uid()
  where b.id = p_box_id and (b.is_public or (p_token is not null and b.invite_token = p_token));
$$;

-- 신청. 팬 역할이고, 신청하는 순간 그 크리에이터를 팔로우하고 있어야 한다(팔로우 줄을 잠근 뒤 판정 — 끊기가 진행 중이면 끝날 때까지 기다린다).
-- 주소는 봉인된 값만(p_envelope + 브라우저가 정한 할증 구분) 또는 null = 설정의 등록 주소를 복사(INV-GB6, reverse-gift INV-R4).
-- 선물함 줄을 먼저 잠그고 센다 — 마지막 자리에 둘이 와도, 마감과 겹쳐도 하나만(INV-GB5·GB8). 사본 저장까지 한 처리다.
-- 같은 선물함에서 신청을 거둔 팬은 다시 신청할 수 있다(같은 줄을 다시 쓴다 — 선물함·팬 하나).
create function public.revgift_box_apply(p_box_id uuid, p_token text, p_envelope jsonb, p_region text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
  v_role public.user_role;
  v_app public.revgift_box_applications;
  v_active integer;
  v_app_id uuid;
begin
  -- 봉인·구분 꼴은 무엇보다 먼저 — 평문이 들어올 자리가 없다(INV-GB6)
  if p_envelope is not null and not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  if (p_envelope is null) <> (p_region is null) or (p_region is not null and p_region not in ('none', 'jeju', 'island')) then
    raise exception '할증 구분이 목록에 없다' using errcode = '22023';
  end if;

  select * into v from public.revgift_boxes b
  where b.id = p_box_id and (b.is_public or (p_token is not null and b.invite_token = p_token))
  for update;
  if not found then
    raise exception '선물함을 찾을 수 없다' using errcode = 'P0002';
  end if;

  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if auth.uid() is null or v_role is distinct from 'fan' then
    raise exception '팬 계정만 신청한다' using errcode = '42501';
  end if;
  if v.status <> 'open' then
    raise exception '신청 받는 중이 아니다' using errcode = 'P0022';
  end if;

  perform 1 from public.follows f where f.fan_id = auth.uid() and f.creator_id = v.creator_id for share;
  if not found then
    raise exception '팔로우한 팬만 신청한다' using errcode = 'P0025';
  end if;

  select * into v_app from public.revgift_box_applications a where a.box_id = v.id and a.fan_id = auth.uid() for update;
  if found and v_app.status <> 'withdrawn' then
    raise exception '이미 신청했다' using errcode = 'P0027';
  end if;

  select count(*) into v_active from public.revgift_box_applications a where a.box_id = v.id and a.status = 'applied';
  if v_active >= v.capacity then
    raise exception '받을 인원이 다 찼다' using errcode = 'P0023';
  end if;

  if v_app.id is null then
    insert into public.revgift_box_applications (box_id, fan_id) values (v.id, auth.uid()) returning id into v_app_id;
  else
    update public.revgift_box_applications set status = 'applied', applied_at = now() where id = v_app.id returning id into v_app_id;
  end if;
  perform pii.revgift_box_save_copy(v_app_id, auth.uid(), p_envelope, p_region);
  return v_app_id;
end $$;

-- 신청 취소(정할 것 Q5) — 신청 받는 중에만, 팬 본인의 신청을 거둔다. 그 처리에서 주소 사본을 지운다.
create function public.revgift_box_withdraw(p_box_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
  v_app public.revgift_box_applications;
begin
  select * into v from public.revgift_boxes b where b.id = p_box_id for update;
  if found then
    select * into v_app from public.revgift_box_applications a
    where a.box_id = v.id and auth.uid() is not null and a.fan_id = auth.uid() for update;
  end if;
  if v_app.id is null or v_app.status = 'withdrawn' then
    raise exception '신청을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v.status <> 'open' or v_app.status not in ('applied', 'excluded') then
    raise exception '지금은 신청을 취소할 수 없다' using errcode = 'P0022';
  end if;
  update public.revgift_box_applications set status = 'withdrawn' where id = v_app.id;
  perform pii.revgift_box_drop_copies(array[v_app.id], 'withdrawn');
end $$;

-- ── 권한 ─────────────────────────────────────────
-- 로그인한 사람만, 로그인 토큰으로 판정한다. 앱 서버 키로는 부르지 못한다 — 남의 이름으로 신청·마감하는 길이 없다.
-- 크리에이터 상세의 입구와 팬이 보는 선물함 하나만 로그인 없이 본다(공개 선물함 이름 — 비공개는 토큰이 맞을 때만).

revoke all on function public.create_revgift_box(text, integer, boolean) from public, anon, service_role;
revoke all on function public.revgift_box_renew_invite(uuid) from public, anon, service_role;
revoke all on function public.my_revgift_boxes() from public, anon, service_role;
revoke all on function public.my_revgift_box(uuid) from public, anon, service_role;
revoke all on function public.revgift_box_set_excluded(uuid, uuid, boolean) from public, anon, service_role;
revoke all on function public.revgift_box_close(uuid) from public, anon, service_role;
revoke all on function public.revgift_box_cancel(uuid) from public, anon, service_role;
revoke all on function public.revgift_box_for_fan(uuid, text) from public, service_role;
revoke all on function public.revgift_box_apply(uuid, text, jsonb, text) from public, anon, service_role;
revoke all on function public.revgift_box_withdraw(uuid) from public, anon, service_role;
revoke all on function public.creator_open_revgift_boxes(uuid) from public;

grant execute on function public.create_revgift_box(text, integer, boolean) to authenticated;
grant execute on function public.revgift_box_renew_invite(uuid) to authenticated;
grant execute on function public.my_revgift_boxes() to authenticated;
grant execute on function public.my_revgift_box(uuid) to authenticated;
grant execute on function public.revgift_box_set_excluded(uuid, uuid, boolean) to authenticated;
grant execute on function public.revgift_box_close(uuid) to authenticated;
grant execute on function public.revgift_box_cancel(uuid) to authenticated;
grant execute on function public.revgift_box_for_fan(uuid, text) to anon, authenticated;
grant execute on function public.revgift_box_apply(uuid, text, jsonb, text) to authenticated;
grant execute on function public.revgift_box_withdraw(uuid) to authenticated;
grant execute on function public.creator_open_revgift_boxes(uuid) to anon, authenticated;
