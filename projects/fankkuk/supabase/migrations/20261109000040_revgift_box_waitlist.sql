-- 선물함(팬에게 보내기) 2026-11-09 개정 — 대기 신청 · 마감 때 대기 고르기(정원 무관) · 0명 마감 · 초기 크리에이터 혜택 = 계정 유지 동안.
-- 스펙: docs/specs/revgift-box.md 머리 주석 「2026-11-09 개정」 — INV-GB1·GB2·GB5·GB7·GB8·GB9·GB14·GB20, 정할 것 Q20·Q21.
-- 요금 인상 30일 뒤 적용(admin-console INV-K18)은 이 파일의 범위가 아니다.
--
-- 개인정보 구역(pii)을 쓰는 곳은 하나다 — 고르지 않은 대기 신청의 사본을 마감 처리에서 지울 때의 까닭 「waitlist_at_close」.
-- 사본 삭제 함수(pii.revgift_box_drop_copies)가 그 까닭을 받는 것은 사람이 적용하는 supabase/manual/0036_revgift_box_waitlist.sql 이다.
-- 0036 전에는 고르지 않은 대기 신청이 있는 마감이 「까닭이 목록에 없다」로 통째로 실패한다(아무것도 바뀌지 않는다 — 실패 쪽으로 멈춘다).
-- 대기 신청이 없거나 모두 고른 마감은 0036 없이도 된다(그 까닭으로 부르지 않는다). 그래서 함수 본문 검사를 끄고 만든다.
--
-- 바뀌는 것
--   1) 신청 상태 waitlisted(대기) — 정원이 차 있거나 대기 신청이 남아 있으면 새 신청은 대기다(INV-GB5 · Q20). 순번은 신청 시각 순(같으면 신청 번호 순).
--      대기 신청은 open 동안 그대로이고(자동 당첨 없음), 팬이 거둘 수 있으며(Q5), 제외·다시 넣기 대상이 아니다(INV-GB2).
--      마감에서 고르지 않은 대기 신청은 상태 이름을 그대로 둔 채 끝난다 — 선물함이 open 이 아니면 waitlisted 는 끝난 상태다(제외와 같은 취급).
--   2) 마감(revgift_box_close) — 넣을 대기 신청 목록을 받는다(비어도 된다). 목록이 그 선물함의 대기 신청이 아니면 마감 전체를 거부(P0028).
--      0명이어도 마감한다 — closed 이고 담길 차례 0명이면 끝(끝난 시각 = 마감 시각, Q21). 옛 오류 P0024(제외 안 된 신청 없음)는 없어진다.
--   3) 0명 마감 선물함은 다음 전환이 없다 — 상자 고르기 「다음」(6자리 발급)·선물함 취소 거부. 탈퇴 판정·5년 자동 삭제는 끝난 선물함으로 센다.
--   4) 읽기 — 크리에이터 신청 줄과 팬의 내 신청에 대기 순번(waitlist_no). 대기 신청이 아니거나 선물함이 open 이 아니면 null.
--   5) 초기 크리에이터 혜택 = 계정을 유지하는 동안(앞선 「승인일부터 달력 3개월」을 대체, INV-GB14). 탈퇴(creators.withdrawn_at)하면 그 시각부터 끝.
--      규칙 값에서 early_months 를 뺀다.
--
-- 오류 코드(2부와 같은 뜻에 하나 더): P0028 넣을 수 없는 대기 신청(다른 선물함·정원 안·제외·없는 번호 — 모두 같은 답).
-- 잠금 순서: 선물함 줄 → (팔로우 줄) → 신청 줄 (INV-GB2, office-workflow INV-W12 의 순서).

set local check_function_bodies = off;

-- ── 규칙 값 ────────────────────────────────────────────
-- 4부(20261109000002) 값에서 early_months 를 뺐다(INV-GB14 개정 — 혜택 기간이 개월 수가 아니다). 나머지는 그대로다.
create or replace function public.revgift_box_rules()
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'capacity_max', 100,        -- INV-GB3 받을 인원
    'name_max', 40,             -- INV-GB3 이름 (Q3)
    'early_max_rank', 50,       -- INV-GB14 초기 크리에이터(혜택은 계정을 유지하는 동안 — 2026-11-09)
    'early_monthly_lines', 30,  -- INV-GB15 한 달 300원 줄
    'personal_max_krw', 100000, -- INV-GB16 개인접수 실비 상한 (Q13)
    'cod_max_krw', 100000,      -- INV-GB13 착불 큰 상자 택배비 상한 (Q13)
    'tier_limits', jsonb_build_array(                                   -- INV-GB12 실측 구간(작은 것부터)
      jsonb_build_object('tier', 'xsmall', 'size_cm', 80, 'weight_kg', 2),
      jsonb_build_object('tier', 'small', 'size_cm', 100, 'weight_kg', 5),
      jsonb_build_object('tier', 'medium', 'size_cm', 120, 'weight_kg', 10),
      jsonb_build_object('tier', 'large', 'size_cm', 140, 'weight_kg', 15)),
    'carton_count_max', 100,    -- INV-GB11 보낸 상자 수(1 이상 — 상한은 선물함 받을 인원과 같게)
    'carton_wait_hours', 168,   -- INV-GB11 첫 큰 상자 입고 뒤 도착 안 함까지
    'awaiting_box_hours', 720,  -- INV-GB1 Q10 「다음」 뒤 큰 상자가 하나도 없으면 자동 취소
    'hold_hours', 168,          -- INV-GB12 Q11 확인 필요 카드 기한
    'cancelled_arrival_hours', 168, -- INV-GB23 취소한 선물함 상자 카드 기한
    'pay_due_hours', 72,        -- INV-GB18 결제 기한(명세서 발행 + 72시간 → 결제 기한 지남)
    'unpaid_return_hours', 168, -- INV-GB19 명세서 발행 + 168시간까지 결제가 없으면 착불 반송
    'pending_payment_hours', 24, -- INV-GB18 결제 대기는 만든 지 24시간이 지나면 닫힌다(payment INV-M15)
    'copy_after_ship_hours', 72, -- INV-GB20 출고 확정 + 72시간에 사본 삭제(reverse-gift INV-R9)
    'print_max', 3              -- INV-GB20 한 신청에 주소 열기 최대 3회(다시 출력 포함)
  )
$$;

-- ── 표 ────────────────────────────────────────────────

-- 신청 상태에 대기(waitlisted)를 더한다(INV-GB2)
alter table public.revgift_box_applications drop constraint if exists revgift_box_applications_status_check;
alter table public.revgift_box_applications add constraint revgift_box_applications_status_check
  check (status in ('applied', 'excluded', 'withdrawn', 'waitlisted', 'selected', 'measured', 'missing', 'rejected', 'paid', 'shipped', 'delivered', 'ended'));
-- 대기 순번 세기(선물함 안 대기 신청을 신청 시각 순으로)
create index if not exists revgift_box_applications_waitlist_idx on public.revgift_box_applications (box_id, applied_at, id) where status = 'waitlisted';

-- 주소 사본 기록의 까닭에 「마감 때 고르지 않은 대기 신청」을 더한다(INV-GB7 · GB20)
alter table public.revgift_box_address_events drop constraint revgift_box_address_events_reason_check;
alter table public.revgift_box_address_events add constraint revgift_box_address_events_reason_check
  check (reason in ('excluded_at_close', 'box_cancelled', 'withdrawn', 'missing', 'unpaid_return', 'shipped', 'waitlist_at_close'));

-- 끝난 시각 — 4부 본문에 0명 마감을 더한다. open → closed 이고 담길 차례가 하나도 없으면 그 순간이 끝난 시각이다(INV-GB1 · Q21).
-- 마감 함수는 신청 줄을 먼저 바꾸고 선물함 줄을 바꾸므로, 이 트리거가 볼 때 담길 차례는 이미 정해져 있다.
-- 「closed 이고 끝난 시각이 있음」= 0명 마감이다. 상태 이름을 따로 두지 않는다(스펙 INV-GB1).
create or replace function public.revgift_boxes_mark_ended()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status in ('done', 'returned', 'cancelled') and old.status not in ('done', 'returned', 'cancelled') then
    new.ended_at := now();
  elsif new.status = 'closed' and old.status = 'open' then
    new.ended_at := case when not exists (select 1 from public.revgift_box_applications a where a.box_id = new.id and a.status = 'selected') then now() end;
  elsif new.status = 'closed' and old.status = 'closed' then
    new.ended_at := old.ended_at;
  elsif new.status not in ('done', 'returned', 'cancelled') then
    new.ended_at := null; -- 다시 연 선물함(INV-GB23)
  end if;
  return new;
end $$;
revoke all on function public.revgift_boxes_mark_ended() from public, anon, authenticated, service_role;

-- ── 대기 순번 (INV-GB5 · GB9) ───────────────────────────
-- 그 신청이 신청 받는 중인 선물함의 대기 신청이면 순번(1부터), 아니면 null. 신청 시각 순, 같으면 신청 번호 순 — 앞 순번이 거두면 당겨진다.
create or replace function public.revgift_box_waitlist_no(p_application_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select (select count(*)::integer from public.revgift_box_applications w
          where w.box_id = a.box_id and w.status = 'waitlisted' and (w.applied_at, w.id) <= (a.applied_at, a.id))
  from public.revgift_box_applications a
  join public.revgift_boxes b on b.id = a.box_id
  where a.id = p_application_id and a.status = 'waitlisted' and b.status = 'open';
$$;
revoke all on function public.revgift_box_waitlist_no(uuid) from public, anon, authenticated, service_role;

-- ── 신청 · 신청 취소 (INV-GB4 · GB5 · GB6 · Q5 · Q20) ───────

-- 2부 본문 그대로에서 「다 찼다(P0023) 거부」만 바꾼다 — 정원이 차 있거나 대기 신청이 남아 있으면 대기(waitlisted)로 받는다(Q20 — 먼저 기다린 팬보다 앞서지 않는다).
-- 선물함 줄을 잠근 뒤 세므로 마지막 자리에 둘이 와도 하나만 정원 안, 다른 하나는 대기 1번이다. 사본 저장까지 한 처리다(대기도 같은 폼·같은 봉인).
create or replace function public.revgift_box_apply(p_box_id uuid, p_token text, p_envelope jsonb, p_region text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
  v_role public.user_role;
  v_app public.revgift_box_applications;
  v_active integer;
  v_status text;
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
  v_status := case
    when v_active >= v.capacity
      or exists (select 1 from public.revgift_box_applications a where a.box_id = v.id and a.status = 'waitlisted') then 'waitlisted'
    else 'applied' end;

  -- 사본 저장 함수(pii, manual 0031·0032)는 「신청(applied)」 줄에만 사본을 넣는다 — 그래서 신청으로 넣고 사본을 저장한 뒤 같은 처리에서 대기로 바꾼다.
  -- 선물함 줄을 잠근 채라 그 사이에 이 줄을 정원 안으로 세는 다른 처리가 없다.
  if v_app.id is null then
    insert into public.revgift_box_applications (box_id, fan_id, status) values (v.id, auth.uid(), 'applied') returning id into v_app_id;
  else
    update public.revgift_box_applications set status = 'applied', applied_at = now() where id = v_app.id returning id into v_app_id;
  end if;
  perform pii.revgift_box_save_copy(v_app_id, auth.uid(), p_envelope, p_region);
  if v_status = 'waitlisted' then
    update public.revgift_box_applications set status = 'waitlisted' where id = v_app_id;
  end if;
  return v_app_id;
end $$;

-- 신청 취소(Q5) — 2부 본문 그대로에 대기 신청을 더한다. 대기 신청을 거두면 뒤 순번이 하나씩 당겨진다(순번은 세어서 정하므로 따로 고칠 것이 없다).
create or replace function public.revgift_box_withdraw(p_box_id uuid)
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
  if v.status <> 'open' or v_app.status not in ('applied', 'excluded', 'waitlisted') then
    raise exception '지금은 신청을 취소할 수 없다' using errcode = 'P0022';
  end if;
  update public.revgift_box_applications set status = 'withdrawn' where id = v_app.id;
  perform pii.revgift_box_drop_copies(array[v_app.id], 'withdrawn');
end $$;

-- ── 마감 (INV-GB8 · GB7 · GB1 · Q21) ─────────────────────
-- 인자가 바뀌어(넣을 대기 신청 목록) 옛 함수를 지우고 만든다. 목록을 빼고 부르면 빈 목록이다.
drop function if exists public.revgift_box_close(uuid);
create or replace function public.revgift_box_close(p_box_id uuid, p_waitlisted uuid[] default '{}')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
  v_pick uuid[] := coalesce(p_waitlisted, '{}');
  v_selected integer;
  v_left uuid[];
begin
  if v.status <> 'open' then
    raise exception '신청 받는 중인 선물함만 마감한다' using errcode = 'P0022';
  end if;
  if array_position(v_pick, null) is not null then
    raise exception '넣을 신청 꼴이 틀리다' using errcode = '22023';
  end if;
  perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
  -- 넣을 목록은 모두 이 선물함의 대기 신청이어야 한다 — 하나라도 아니면 마감 전체를 거부(다른 선물함의 팬 주소를 끌어오는 길이 없다)
  if exists (
    select 1 from unnest(v_pick) x(id)
    where not exists (select 1 from public.revgift_box_applications a where a.id = x.id and a.box_id = v.id and a.status = 'waitlisted')
  ) then
    raise exception '넣을 수 없는 대기 신청이 있다' using errcode = 'P0028';
  end if;
  -- 제외 안 된 신청과 고른 대기 신청이 담길 차례 — 정원과 무관하다
  update public.revgift_box_applications set status = 'selected'
  where box_id = v.id and (status = 'applied' or (status = 'waitlisted' and id = any (v_pick)));
  get diagnostics v_selected = row_count;
  -- 0명이어도 마감(끝난 시각은 트리거가 같은 처리에서 적는다)
  update public.revgift_boxes set status = 'closed' where id = v.id;
  perform pii.revgift_box_drop_copies(array(
    select a.id from public.revgift_box_applications a where a.box_id = v.id and a.status = 'excluded'), 'excluded_at_close');
  -- 고르지 않은 대기 신청은 그대로 끝나고(선물함이 open 이 아니므로) 그 사본을 지운다(INV-GB7 개정) — 없으면 부르지 않는다
  v_left := array(select a.id from public.revgift_box_applications a where a.box_id = v.id and a.status = 'waitlisted' order by a.id);
  if cardinality(v_left) > 0 then
    perform pii.revgift_box_drop_copies(v_left, 'waitlist_at_close');
  end if;
  return v_selected;
end $$;

-- ── 선물함 취소 (INV-GB1 · GB2 · GB20) ───────────────
-- 3부 공용 처리 본문 그대로에 대기 신청을 더한다 — 함께 끝나고(끝나기 전 상태를 남긴다), 사본은 모든 신청과 같이 지운다.
create or replace function public.revgift_box_cancel_locked(p_box_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
begin
  select * into v from public.revgift_boxes b where b.id = p_box_id;
  perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
  update public.revgift_box_applications set status_before_end = status, status = 'ended'
  where box_id = v.id and status in ('applied', 'excluded', 'waitlisted', 'selected');
  update public.revgift_boxes
  set status = 'cancelled', cancelled_from = v.status,
      code_voided_at = case when inbound_code is not null then coalesce(code_voided_at, now()) end
  where id = v.id;
  perform pii.revgift_box_drop_copies(array(
    select a.id from public.revgift_box_applications a where a.box_id = v.id), 'box_cancelled');
end $$;

-- 크리에이터 선물함 취소 — 3부 본문 그대로에 0명 마감(끝 — 다음 전환 없음)을 거부한다.
create or replace function public.revgift_box_cancel(p_box_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
begin
  if v.status not in ('open', 'closed', 'awaiting_box')
     or (v.status = 'closed' and v.ended_at is not null)
     or exists (select 1 from public.revgift_box_cartons c where c.box_id = v.id) then
    raise exception '지금은 선물함을 취소할 수 없다' using errcode = 'P0022';
  end if;
  perform public.revgift_box_cancel_locked(v.id);
end $$;

-- 2페이지 「다음」 — 3부 본문 그대로에서 0명 마감을 거부하는 조건만 더한다.
create or replace function public.revgift_box_submit_tiers(p_box_id uuid, p_tiers jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
  v_code text;
  v_try integer := 0;
begin
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'object' then
    raise exception '구간 꼴이 틀리다' using errcode = '22023';
  end if;
  -- 0명 마감(끝난 시각이 있음)은 끝 — 6자리를 발급하지 않는다(INV-GB1, 2026-11-09)
  if v.status <> 'closed' or v.ended_at is not null then
    raise exception '마감된 선물함에서만 고른다' using errcode = 'P0022';
  end if;
  perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
  if exists (
    select 1 from jsonb_each_text(p_tiers) x
    where x.value not in ('xsmall', 'small', 'medium', 'large')
       or x.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from public.revgift_box_applications a where a.id = x.key::uuid and a.box_id = v.id and a.status = 'selected')
  ) then
    raise exception '이 선물함의 담길 신청과 구간만 받는다' using errcode = '22023';
  end if;
  if exists (select 1 from public.revgift_box_applications a where a.box_id = v.id and a.status = 'selected' and not (p_tiers ? a.id::text)) then
    raise exception '구간을 고르지 않은 신청이 있다' using errcode = 'P0022';
  end if;
  update public.revgift_box_applications a set chosen_tier = p_tiers ->> a.id::text where a.box_id = v.id and a.status = 'selected';
  loop
    v_try := v_try + 1;
    if v_try > 100 then
      raise exception '받는 주소 6자리를 발급하지 못했다' using errcode = '55000';
    end if;
    v_code := public.inbound_code_draw();
    exit when not public.inbound_code_taken(v_code);
  end loop;
  update public.revgift_boxes
  set status = 'awaiting_box', inbound_code = v_code, box_requested_at = now(), carton_count = 1
  where id = v.id;
  return v_code;
end $$;

-- ── 크리에이터·팬 읽기 (INV-GB7 · GB9) ──────────────────

-- 내 선물함 목록 — 2부 본문 그대로에서 신청 수에 대기 신청을 넣지 않는다(정원을 차지하지 않는다, INV-GB5).
create or replace function public.my_revgift_boxes()
returns table (id uuid, name text, capacity smallint, is_public boolean, status text, created_at timestamptz, active_count integer)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, b.capacity, b.is_public, b.status, b.created_at,
         (select count(*)::integer from public.revgift_box_applications a
          where a.box_id = b.id and a.status not in ('excluded', 'withdrawn', 'ended', 'waitlisted'))
  from public.revgift_boxes b
  where auth.uid() is not null and b.owner_id = auth.uid()
  order by b.created_at desc;
$$;

-- 크리에이터 신청 관리 창 — 20261109000010 본문 그대로에 신청 줄마다 대기 순번(waitlist_no)만 더했다. 사람 칸은 여전히 닉네임뿐(INV-GB9).
create or replace function public.my_revgift_box(p_box_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'capacity', b.capacity, 'is_public', b.is_public, 'status', b.status,
    'invite_token', b.invite_token, 'created_at', b.created_at,
    'inbound_code', case when b.code_voided_at is null and b.status in ('awaiting_box', 'arrived', 'held') then b.inbound_code end,
    'carton_count', b.carton_count,
    'cartons_received', (select count(*) from public.revgift_box_cartons c where c.box_id = b.id),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nickname', p.nickname, 'applied_at', a.applied_at, 'status', a.status, 'chosen_tier', a.chosen_tier,
                                         'waitlist_no', public.revgift_box_waitlist_no(a.id))
                       order by a.applied_at, a.id)
      from public.revgift_box_applications a
      join public.profiles p on p.id = a.fan_id
      where a.box_id = b.id and a.status <> 'withdrawn'
    ), '[]'::jsonb),
    'invoice', (
      select jsonb_build_object(
        'amount_krw', i.amount_krw, 'shipping_fee_krw', i.shipping_fee_krw, 'service_fee_krw', i.service_fee_krw,
        'carton_cod_krw', i.carton_cod_krw, 'created_at', i.created_at,
        'pay_due_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'pay_due_hours')::integer),
        'return_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'unpaid_return_hours')::integer),
        'paying', exists (select 1 from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'confirming'),
        'paid_at', (select x.settled_at from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'done'),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'nickname', p.nickname, 'tier', l.tier, 'shipping_fee_krw', l.shipping_fee_krw, 'surcharge_region', l.surcharge_region,
                   'surcharge_krw', l.surcharge_krw, 'service_fee_krw', l.service_fee_krw, 'amount_krw', l.amount_krw,
                   'progress', case
                     when a.status in ('shipped', 'delivered') then 'shipped'
                     when a.status = 'ended' and exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done') then 'refunded'
                     when a.status = 'ended' then 'ended'
                     when a.status = 'paid' then 'paid'
                     else 'unpaid' end,
                   -- 배송 단계 재료(delivery-status INV-DS1·DS2) — 송장 출력 여부·출고한 서울 날짜·팬의 받았어요. 송장번호는 넣지 않는다(INV-DS3)
                   'printed', a.printed_at is not null or a.shipped_at is not null,
                   'shipped_on', case when a.shipped_at is not null then to_char((a.shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') end,
                   'received', a.fan_received_at is not null,
                   'carrier', (select t.carrier_state from public.delivery_trackings t where t.application_id = a.id order by t.created_at desc limit 1)) order by l.line_no)
          from public.revgift_box_invoice_lines l
          join public.revgift_box_applications a on a.id = l.application_id
          join public.profiles p on p.id = a.fan_id
          where l.invoice_id = i.id), '[]'::jsonb))
      from public.revgift_box_invoices i where i.box_id = b.id))
  from public.revgift_boxes b
  where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid();
$$;

-- 팬이 보는 선물함 — 20261109000010 본문 그대로에 내 신청이 대기면 「waitlisted」와 자기 순번(waitlist_no)을 더했다. 대기는 제외 여부처럼 드러낼 것이 없다(자기 신청이다).
create or replace function public.revgift_box_for_fan(p_box_id uuid, p_token text)
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
      when a.status = 'waitlisted' and b.status = 'open' then 'waitlisted'
      when a.status in ('selected', 'measured', 'paid', 'shipped', 'delivered') then 'preparing'
      when b.status = 'cancelled' then 'cancelled'
      else 'closed' end,
    -- 자기 대기 순번 하나(INV-GB9 · Q6, 2026-11-09) — 다른 대기자·신청자는 보이지 않는다
    'waitlist_no', public.revgift_box_waitlist_no(a.id),
    'delivery', case
      when a.status in ('paid', 'shipped', 'delivered') and (a.printed_at is not null or a.shipped_at is not null) then jsonb_build_object(
        'shipped_on', case when a.shipped_at is not null then to_char((a.shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') end,
        'received', a.fan_received_at is not null,
        'can_confirm', a.status in ('shipped', 'delivered') and a.fan_received_at is null,
        'carrier', (select t.carrier_state from public.delivery_trackings t where t.application_id = a.id order by t.created_at desc limit 1)) end)
  from public.revgift_boxes b
  join public.creators c on c.id = b.creator_id
  left join public.revgift_box_applications a on a.box_id = b.id and auth.uid() is not null and a.fan_id = auth.uid()
  where b.id = p_box_id and (b.is_public or (p_token is not null and b.invite_token = p_token));
$$;
revoke all on function public.revgift_box_for_fan(uuid, text) from public, service_role;
grant execute on function public.revgift_box_for_fan(uuid, text) to anon, authenticated;

-- ── 초기 크리에이터 혜택 기간 (INV-GB14 개정) ─────────────
-- 그 순간에 혜택을 받는 초기 크리에이터인가 — 순번이 있고, 순번을 받은 뒤이고, 그 시각에 탈퇴하지 않았다(계정을 유지하는 동안).
-- 앞선 「승인 시각부터 달력 3개월」을 대체한다. 순번은 계정에 묶이고 빈 자리를 채우지 않는다(Q14 — 카운터는 내려가지 않는다).
create or replace function public.early_creator_active(p_creator_id uuid, p_at timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.early_creators e
    join public.creators c on c.id = e.creator_id
    where e.creator_id = p_creator_id
      and p_at >= e.granted_at
      and (c.withdrawn_at is null or p_at < c.withdrawn_at)
  )
$$;
revoke all on function public.early_creator_active(uuid, timestamptz) from public, anon, authenticated;

-- ── 탈퇴 판정 (my-account INV-A15) ──────────────────────
-- 20261109000010 본문 그대로에서 선물함 두 갈래만 바꾼다 — 0명 마감 선물함은 끝, 고르지 않은 채 마감된 대기 신청은 끝.
create or replace function public.account_has_open_work(p_account uuid, p_creator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with my_orders as (
    select o.id from public.orders o where o.fan_id = p_account or (p_creator is not null and o.creator_id = p_creator)
  ), my_shares as (
    select s.id, s.reply, s.shipped_at, s.returned_at, s.cancelled_at, s.disposed_at
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where (s.fan_id = p_account or (p_creator is not null and d.creator_id = p_creator))
      and d.status <> 'failed'
  )
  select exists (select 1 from my_orders m where not public.order_is_finished(m.id))
    or exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id join my_orders m on m.id = b.order_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from public.office_parcels op join my_shares m on m.id = op.share_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from my_shares where reply in ('waiting', 'accepted')
               and shipped_at is null and returned_at is null and cancelled_at is null and disposed_at is null)
    or exists (select 1 from public.revgift_sends d where p_creator is not null and d.creator_id = p_creator and d.status in ('pending', 'confirming'))
    -- 돌려줄 환불이 끝나지 않음(INV-A15 S15d): 주문 결제 · 닫힌 상자 · 역조공 몫.
    --   금액 함수를 부르기 전의 조건은 그 함수가 null 을 돌려주는 경우를 미리 거르는 것뿐이다(결과는 같고 줄마다 부르지 않는다)
    or exists (select 1 from public.payments p join my_orders m on m.id = p.order_id join public.orders o on o.id = p.order_id
               where p.status = 'done' and o.shipped_at is null
                 and coalesce(public.refund_due_of_payment(p.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.payment_id = p.id and r.box_id is null and r.status = 'done'))
    or exists (select 1 from public.boxes b join my_orders m on m.id = b.order_id
               where b.missing_at is not null
                 and coalesce(public.refund_due_of_box(b.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_id = b.id and r.status = 'done'))
    or exists (select 1 from my_shares m
               where m.reply in ('declined', 'expired') and m.shipped_at is null
                 and coalesce(public.refund_due_of_share(m.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.share_id = m.id and r.status = 'done'))
    -- 6자리를 살려 둔 동안은 환불 금액이 아직 정해지지 않았다 — 닫히면 환불이 생기고, 늦게 오면 사무실에 상자가 생긴다(보안·코드 리뷰 중간)
    or exists (select 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id join my_orders m on m.id = b.order_id
               where c.kept_at is not null and c.state = 'valid')
    or exists (select 1 from public.inbound_codes c join my_shares m on m.id = c.share_id
               where c.kept_at is not null and c.state = 'valid')
    -- 선물함(revgift-box) — 내가 만든 선물함이 끝나지 않았거나(끝 = 완료·반송됨·취소), 그 줄 환불이 끝나지 않았다
    -- 0명 마감(closed 이고 끝난 시각이 있음)도 끝이다(INV-GB1 · Q21)
    or exists (select 1 from public.revgift_boxes gb where gb.owner_id = p_account and gb.status not in ('done', 'returned', 'cancelled') and gb.ended_at is null)
    or exists (select 1 from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id
               join public.revgift_boxes gb on gb.id = i.box_id
               where gb.owner_id = p_account and coalesce(public.revgift_box_line_refund_due(l.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done'))
    -- 선물함에 신청한 팬 — 신청한 순간부터 그 선물이 끝날 때까지(2026-11-09 결정). 끝난 신청 = 출고(배송 완료 포함 — 주문의 「출고면 끝」과 같다)·
    --   제외·신청 취소, 또는 선물함이 끝남(완료·반송됨·취소). 그 밖(신청·담길 차례·실측됨·결제됨, 그리고 도착 안 함·끝남이어도 선물함이 아직
    --   반송·발송 중)은 진행 중이다. 제외는 신청 받는 중이면 크리에이터가 되돌릴 수 있어 탈퇴 처리가 같은 처리에서 신청 취소로 닫는다.
    or exists (select 1 from public.revgift_box_applications a join public.revgift_boxes gb on gb.id = a.box_id
               where a.fan_id = p_account
                 and a.status not in ('shipped', 'delivered', 'excluded', 'withdrawn')
                 and not (a.status = 'waitlisted' and gb.status <> 'open') -- 고르지 않은 채 마감된 대기 신청은 끝(2026-11-09)
                 and gb.status not in ('done', 'returned', 'cancelled') and gb.ended_at is null)
    -- 배송 조회가 webhook 이면 출고가 아니라 배달 완료(또는 출고 + 신호 없음 상한)가 끝이다(delivery-status INV-DS11 ④). estimate 면 아래 셋은 늘 거짓이다
    or exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id join my_orders m on m.id = b.order_id
               where op.state = 'shipped' and not public.delivery_done(op.id, null, op.shipped_at))
    or exists (select 1 from public.office_parcels op join my_shares m on m.id = op.share_id
               where op.state = 'shipped' and not public.delivery_done(op.id, null, op.shipped_at))
    or exists (select 1 from public.revgift_box_applications a
               where a.fan_id = p_account and a.status = 'shipped' and not public.delivery_done(null, a.id, a.shipped_at));
$$;
revoke all on function public.account_has_open_work(uuid, uuid) from public, anon, authenticated, service_role;

-- ── 5년 자동 삭제 (my-account INV-A16 · Q21) ──────────────
-- 20261109000002 본문 그대로에서 선물함 고르기 조건 한 줄만 바꾼다 — 0명 마감 선물함(closed 이고 끝난 시각 = 마감 시각)도 끝난 선물함이다.
create or replace function public.retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_shared_fan constant uuid := 'ffffffff-0000-4000-8000-000000000001';
  c_shared_creator constant uuid := 'ffffffff-0000-4000-8000-000000000002';
  v_signatures integer;
  v_inquiries integer;
  v_orders integer;
  v_unlinked integer;
  v_rg_shares integer;
  v_rg_sends integer;
  v_rg_unlinked integer;
  v_gb_unlinked integer := 0;
  v_gb_boxes integer := 0;
  v_n integer;
  v_tab regclass;
  v_counts jsonb;
  v_locked regclass[] := array[
    'public.approval_signatures', 'public.decrypt_log', 'public.decrypt_releases', 'public.office_inspections', 'public.office_envelope_shreds',
    'public.office_not_mine_reports', 'public.office_held_links', 'public.office_creator_check_events', 'public.office_share_moves',
    'public.office_police_handovers', 'public.office_disposals', 'public.return_decrypt_log', 'public.return_decrypt_releases',
    'public.return_address_events', 'public.office_unmatched_look_edits', 'public.revgift_decrypt_log', 'public.revgift_decrypt_releases',
    'public.revgift_box_decrypt_log', 'public.revgift_box_decrypt_releases'
  ]::regclass[];
begin
  -- 한 처리 안에서 두 번 불려도 되게(예약 작업은 회차마다 따로 처리다)
  drop table if exists retention_old_orders, retention_unlink, retention_gone, retention_del_orders, retention_del_boxes,
    retention_del_parcels, retention_del_unmatched, retention_del_payments,
    retention_old_sends, retention_rg_shares, retention_unlink_parcels, retention_del_shares,
    retention_old_gboxes, retention_del_gboxes;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, false);
  end loop;

  -- 가명 처리된 서명 기록(INV-S14) — 그 주문이 끝난 때(마지막 기록)부터 5년. 주문이 회원 쪽 내역으로 남아도 서명은 지운다(카드 d125).
  delete from public.approval_signatures s
   using public.approval_requests r
    join public.orders o on o.id = r.order_id
   where r.request_id = s.request_id
     and o.created_at < now() - interval '5 years' -- 마지막 기록은 주문을 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and s.signed_content is null and s.signer_id is null and s.content_hash is not null
     -- 탈퇴한 크리에이터의 서명만 — 새 서명 기록은 처음부터 원문·서명자 식별값이 비어 있어 꼴로는 가명 처리된 줄과 같다(INV-S14 S14c)
     and exists (select 1 from public.creators wc where wc.id = o.creator_id and wc.withdrawn_at is not null)
     and public.order_is_finished(r.order_id)
     and public.order_ended_at(r.order_id) < now() - interval '5 years';
  get diagnostics v_signatures = row_count;

  -- 탈퇴한 사람이 쓴 1:1 문의(INV-A16 — 3년)
  delete from public.inquiries i
   using public.profiles p
   where p.id = i.author_id and p.withdrawn_at is not null
     and i.created_at < now() - interval '3 years';
  get diagnostics v_inquiries = row_count;

  -- 끝났고 마지막 기록이 5년 넘은 주문 중 한쪽이라도 탈퇴한 것
  create temp table retention_old_orders on commit drop as
  select o.id, (fp.withdrawn_at is not null) as fan_gone, (c.withdrawn_at is not null) as creator_gone, o.fan_id, o.creator_id
    from public.orders o
    join public.profiles fp on fp.id = o.fan_id
    join public.creators c on c.id = o.creator_id
   where (fp.withdrawn_at is not null or c.withdrawn_at is not null)
     and o.created_at < now() - interval '5 years' -- 마지막 기록은 주문을 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and public.order_is_finished(o.id)
     and public.order_ended_at(o.id) < now() - interval '5 years';

  -- 끝났고 마지막 기록이 5년 넘은 보내기 중 크리에이터나 받는 팬 한쪽이라도 탈퇴한 것 · 그 보내기에서 손댈 몫
  create temp table retention_old_sends on commit drop as
  select d.id, (c.withdrawn_at is not null) as creator_gone, d.creator_id
    from public.revgift_sends d
    join public.creators c on c.id = d.creator_id
   where (c.withdrawn_at is not null
          or exists (select 1 from public.revgift_shares s join public.profiles p on p.id = s.fan_id where s.send_id = d.id and p.withdrawn_at is not null))
     and d.created_at < now() - interval '5 years' -- 마지막 기록은 보내기를 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and public.revgift_send_finished(d.id)
     and public.revgift_send_ended_at(d.id) < now() - interval '5 years';
  create temp table retention_rg_shares on commit drop as
  select s.id, (p.withdrawn_at is not null) as fan_gone, o.creator_gone, o.creator_id
    from public.revgift_shares s
    join retention_old_sends o on o.id = s.send_id
    join public.profiles p on p.id = s.fan_id
   where p.withdrawn_at is not null or o.creator_gone;

  -- ① 한쪽만 탈퇴 — 주문·몫은 남기고, 그 기록에 든 가명(탈퇴한 사람)을 같이 쓰는 표시로 바꾼다
  create temp table retention_unlink on commit drop as
  select * from retention_old_orders where not (fan_gone and creator_gone);
  create temp table retention_gone on commit drop as
  select p.id from public.profiles p where p.withdrawn_at is not null and p.id <> c_shared_fan;
  -- 남는 주문·몫의 사무실 상자(선물·역조공 한 목록)
  create temp table retention_unlink_parcels on commit drop as
  select op.id, u.creator_gone, u.creator_id
    from retention_unlink u join public.boxes b on b.order_id = u.id join public.office_parcels op on op.box_id = b.id
  union all
  select op.id, r.creator_gone, r.creator_id
    from retention_rg_shares r join public.office_parcels op on op.share_id = r.id
   where not (r.fan_gone and r.creator_gone);

  update public.orders o
     set fan_id = case when u.fan_gone then c_shared_fan else o.fan_id end,
         creator_id = case when u.creator_gone then c_shared_creator else o.creator_id end
    from retention_unlink u
   where o.id = u.id and ((u.fan_gone and o.fan_id <> c_shared_fan) or (u.creator_gone and o.creator_id <> c_shared_creator));
  get diagnostics v_unlinked = row_count;

  update public.order_cancellations oc set canceled_by = c_shared_fan
    from retention_unlink u where oc.order_id = u.id and oc.canceled_by in (select id from retention_gone);
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_unlink u, public.payments p
   where p.order_id = u.id and rc.payment_id = p.id and rc.requested_by in (select id from retention_gone);

  update public.revgift_shares s set fan_id = c_shared_fan
    from retention_rg_shares r
   where s.id = r.id and r.fan_gone and not r.creator_gone and s.fan_id <> c_shared_fan;
  get diagnostics v_rg_unlinked = row_count;
  update public.revgift_sends d
     set creator_id = c_shared_creator,
         sender_id = case when d.sender_id in (select id from retention_gone) then c_shared_fan else d.sender_id end
    from retention_old_sends o
   where d.id = o.id and o.creator_gone and d.creator_id <> c_shared_creator;
  get diagnostics v_n = row_count;
  v_rg_unlinked := v_rg_unlinked + v_n;
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_old_sends o
   where rc.send_id = o.id and rc.requested_by in (select id from retention_gone);

  update public.office_creator_checks cc set answered_by = c_shared_fan
    from retention_unlink_parcels up where cc.parcel_id = up.id and cc.answered_by in (select id from retention_gone);
  update public.office_creator_check_events ce set actor = c_shared_fan
    from retention_unlink_parcels up where ce.parcel_id = up.id and ce.actor in (select id from retention_gone);
  update public.office_held_links hl set account_id = c_shared_fan
    from retention_unlink_parcels up where hl.parcel_id = up.id and hl.account_id in (select id from retention_gone);
  update public.office_unmatched um set nickname_profile_id = c_shared_fan
    from retention_unlink_parcels up where um.matched_parcel_id = up.id and um.nickname_profile_id in (select id from retention_gone);
  update public.office_hold_alerts ha set creator_id = c_shared_creator
    from retention_unlink_parcels up where up.creator_gone and ha.parcel_id = up.id and ha.creator_id = up.creator_id;

  -- ② 둘 다 탈퇴 — 주문·몫과 거기 달린 기록을 아래에서부터 지운다
  create temp table retention_del_orders on commit drop as select id from retention_old_orders where fan_gone and creator_gone;
  create temp table retention_del_shares on commit drop as select id from retention_rg_shares where fan_gone and creator_gone;
  create temp table retention_del_boxes on commit drop as select b.id from public.boxes b where b.order_id in (select id from retention_del_orders);
  create temp table retention_del_parcels on commit drop as
    select op.id from public.office_parcels op
     where op.box_id in (select id from retention_del_boxes) or op.share_id in (select id from retention_del_shares);
  create temp table retention_del_unmatched on commit drop as select u.id from public.office_unmatched u where u.matched_parcel_id in (select id from retention_del_parcels);
  create temp table retention_del_payments on commit drop as
    select p.id from public.payments p where p.order_id in (select id from retention_del_orders) or p.box_id in (select id from retention_del_boxes);

  delete from public.office_held_links where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched);
  -- 지우는 몫을 가리키는 옮기기 기록은 남는 몫 쪽 상자의 것이어도 함께 지운다(두 칸 모두 그 몫을 가리켜야 하는 외래 키라 남길 수 없다)
  delete from public.office_share_moves where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched)
     or from_share_id in (select id from retention_del_shares) or to_share_id in (select id from retention_del_shares);
  delete from public.office_unmatched_look_edits where unmatched_id in (select id from retention_del_unmatched);
  delete from public.office_unmatched where id in (select id from retention_del_unmatched);
  delete from public.office_inspections where parcel_id in (select id from retention_del_parcels);
  delete from public.office_hold_alerts where parcel_id in (select id from retention_del_parcels);
  delete from public.office_envelope_shreds where parcel_id in (select id from retention_del_parcels);
  delete from public.office_not_mine_reports where parcel_id in (select id from retention_del_parcels);
  delete from public.office_creator_check_events where parcel_id in (select id from retention_del_parcels);
  delete from public.office_creator_checks where parcel_id in (select id from retention_del_parcels);
  delete from public.office_police_handovers where parcel_id in (select id from retention_del_parcels);
  delete from public.office_disposals where parcel_id in (select id from retention_del_parcels);
  delete from public.return_address_events where parcel_id in (select id from retention_del_parcels);
  delete from public.return_decrypt_releases where parcel_id in (select id from retention_del_parcels)
     or opened_log_id in (select l.id from public.return_decrypt_log l where l.parcel_id in (select id from retention_del_parcels));
  delete from public.return_decrypt_log where parcel_id in (select id from retention_del_parcels);
  delete from public.decrypt_releases where box_id in (select id from retention_del_boxes)
     or opened_log_id in (select l.id from public.decrypt_log l where l.order_id in (select id from retention_del_orders) or l.box_id in (select id from retention_del_boxes));
  delete from public.decrypt_log where order_id in (select id from retention_del_orders) or box_id in (select id from retention_del_boxes);
  delete from public.refunds where box_id in (select id from retention_del_boxes) or payment_id in (select id from retention_del_payments);
  delete from public.payments where id in (select id from retention_del_payments);
  delete from public.approval_signatures where request_id in (select r.request_id from public.approval_requests r where r.order_id in (select id from retention_del_orders));
  delete from public.approval_requests where order_id in (select id from retention_del_orders);
  delete from public.orders where id in (select id from retention_del_orders);
  get diagnostics v_orders = row_count;

  -- 역조공 — 받는 주소 6자리를 먼저 지운다(사무실 상자가 지워질 때 그 줄을 고치려 들지 않게)
  delete from public.inbound_codes where share_id in (select id from retention_del_shares);
  delete from public.revgift_decrypt_releases where share_id in (select id from retention_del_shares)
     or opened_log_id in (select l.id from public.revgift_decrypt_log l where l.share_id in (select id from retention_del_shares));
  delete from public.revgift_decrypt_log where share_id in (select id from retention_del_shares);
  delete from public.refunds where share_id in (select id from retention_del_shares);
  -- 사무실 상자는 몫과 함께 지워진다(그 상자의 기록은 위에서 지웠다)
  delete from public.revgift_shares where id in (select id from retention_del_shares);
  get diagnostics v_rg_shares = row_count;
  delete from public.revgift_sends d
   where d.id in (select id from retention_old_sends where creator_gone)
     and not exists (select 1 from public.revgift_shares s where s.send_id = d.id);
  get diagnostics v_rg_sends = row_count;

  -- 선물함(revgift-box) — 끝났고(완료·반송됨·취소) 끝난 지 5년 넘은 선물함 중 만든 크리에이터나 신청한 팬 한쪽이라도 탈퇴한 것.
  -- ① 크리에이터만 탈퇴했거나 탈퇴하지 않은 팬이 남아 있으면 선물함·신청은 남기고 탈퇴한 쪽 가명을 같이 쓰는 표시로 바꾼다.
  --    같은 선물함에 탈퇴한 팬이 여럿이어도 같은 표시 하나가 된다(신청 유일 색인이 그 표시를 뺀다).
  -- ② 크리에이터가 탈퇴했고 남은 신청이 모두 탈퇴한 팬이면 선물함과 거기 달린 기록을 지운다.
  create temp table retention_old_gboxes on commit drop as
  select gb.id, (cp.withdrawn_at is not null) as creator_gone,
         not exists (select 1 from public.revgift_box_applications a join public.profiles p on p.id = a.fan_id
                     where a.box_id = gb.id and p.withdrawn_at is null) as fans_gone
    from public.revgift_boxes gb
    join public.profiles cp on cp.id = gb.owner_id
   where (gb.status in ('done', 'returned', 'cancelled') or (gb.status = 'closed' and gb.ended_at is not null)) -- 0명 마감도 끝(Q21)
     and gb.ended_at < now() - interval '5 years'
     and (cp.withdrawn_at is not null
          or exists (select 1 from public.revgift_box_applications a join public.profiles p on p.id = a.fan_id where a.box_id = gb.id and p.withdrawn_at is not null));

  update public.revgift_box_applications a set fan_id = c_shared_fan
    from retention_old_gboxes o, public.profiles p
   where a.box_id = o.id and not (o.creator_gone and o.fans_gone) and p.id = a.fan_id and p.withdrawn_at is not null and a.fan_id <> c_shared_fan;
  get diagnostics v_gb_unlinked = row_count;
  update public.revgift_boxes gb set owner_id = c_shared_fan, creator_id = c_shared_creator
    from retention_old_gboxes o
   where gb.id = o.id and o.creator_gone and not o.fans_gone and gb.owner_id <> c_shared_fan;
  get diagnostics v_n = row_count;
  v_gb_unlinked := v_gb_unlinked + v_n;

  create temp table retention_del_gboxes on commit drop as select id from retention_old_gboxes where creator_gone and fans_gone;
  delete from public.revgift_box_decrypt_releases x using public.revgift_box_applications a
   where a.id = x.application_id and a.box_id in (select id from retention_del_gboxes);
  delete from public.revgift_box_decrypt_log x using public.revgift_box_applications a
   where a.id = x.application_id and a.box_id in (select id from retention_del_gboxes);
  delete from public.refunds r using public.revgift_box_invoice_lines l, public.revgift_box_invoices i
   where r.box_line_id = l.id and l.invoice_id = i.id and i.box_id in (select id from retention_del_gboxes);
  delete from public.revgift_box_address_events e using public.revgift_box_applications a
   where a.id = e.application_id and a.box_id in (select id from retention_del_gboxes);
  -- 신청·큰 상자·명세서·결제·확인 필요·취소 상자 카드는 선물함과 함께 지워진다
  delete from public.revgift_boxes where id in (select id from retention_del_gboxes);
  get diagnostics v_gb_boxes = row_count;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  v_counts := jsonb_build_object('signatures', v_signatures, 'inquiries', v_inquiries, 'orders', v_orders, 'unlinked', v_unlinked, 'access_logs', 0,
                                 'revgift_shares', v_rg_shares, 'revgift_sends', v_rg_sends, 'revgift_unlinked', v_rg_unlinked,
                                 'gift_boxes', v_gb_boxes, 'gift_box_unlinked', v_gb_unlinked);
  insert into public.retention_purge_runs (counts) values (v_counts);
  return v_counts;
end $$;
revoke all on function public.retention_purge() from public, anon, authenticated, service_role;

-- ── 권한 ─────────────────────────────────────────
-- 마감은 인자가 바뀌어 다시 만들었다 — 로그인한 사람만(주인 판정은 로그인 토큰). 앱 서버 키로는 부르지 못한다.
revoke all on function public.revgift_box_close(uuid, uuid[]) from public, anon, service_role;
grant execute on function public.revgift_box_close(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
