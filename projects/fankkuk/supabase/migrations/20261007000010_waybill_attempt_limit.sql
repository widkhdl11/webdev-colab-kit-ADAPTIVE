-- 송장번호 등록 — 계정마다 24시간에 10번 · 처리 시작에서 번호 잠금 (docs/specs/inbound-address-code.md INV-C7·C10, 리뷰 반영).
--
-- 송장번호는 배송 조회용 선택 칸이지만, 같은 번호를 넣으면 다른 상자가 「같은 송장번호 분쟁」으로 보류된다(INV-C7).
-- 남의 송장번호를 계속 바꿔 넣어 남의 상자를 멈추는 길을 좁히려고 찾기(find_held_parcel)와 같은 방식으로 횟수를 센다.
-- 1) office_waybill_attempts: 등록 시도 한 줄 = 한 번. 성공·실패 모두 센다.
-- 2) set_box_waybill · set_share_waybill: 처리 시작에서 번호 잠금 → 계정 잠금 → 시도 기록 → 상자 확인 → 등록.
--    「없는 상자」·「이미 입고됨」은 오류가 아니라 값으로 돌려준다 — 오류로 내면 시도 기록이 되돌려진다.
--    24시간 안에 이미 10번이면 아무것도 바꾸지 않고 P0045.
--    번호 잠금을 상자 잠금보다 먼저 거는 이유: 입고(office_scan_inbound)가 번호 잠금 → 상자 순서로 잠근다. 반대 순서면
--    같은 번호의 등록과 입고가 서로를 기다리다 교착이 난다.
--
-- 돌려주는 값: 'saved' · 'not_found'(남의 상자·결제 전·끝난 주문) · 'already_received'(입고된 뒤)
-- 오류 꼴: 22023 송장번호 꼴 · P0045 오늘은 더 넣을 수 없음

create table public.office_waybill_attempts (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index office_waybill_attempts_profile_at_idx on public.office_waybill_attempts (profile_id, at desc);
alter table public.office_waybill_attempts enable row level security;
revoke all on public.office_waybill_attempts from public, anon, authenticated;

-- 계정 잠금 + 24시간 10번 확인 + 시도 기록. 넘으면 P0045(기록하지 않는다).
-- 프로필 줄을 잠그지 않고 계정마다 처리 잠금을 쓴다 — 입고가 넣는 알림 줄이 주인 프로필을 가리켜(가벼운 잠금) 줄 잠금과 엇갈린다.
create function public.office_waybill_attempt(p_uid uuid)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.waybill:' || p_uid::text, 0));
  if (select count(*) from public.office_waybill_attempts a
      where a.profile_id = p_uid and a.at > now() - interval '24 hours') >= 10 then
    raise exception '오늘은 송장번호를 더 넣을 수 없다' using errcode = 'P0045';
  end if;
  insert into public.office_waybill_attempts (profile_id) values (p_uid);
end $$;

-- 팬(또는 크리에이터)이 자기가 보낸 결제 완료 상자에 배송 조회용 송장번호를 넣는다. 입고 전에만 고친다.
drop function public.set_box_waybill(uuid, text);
create function public.set_box_waybill(p_box_id uuid, p_waybill text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v public.office_parcels;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_waybill, 0));
  perform public.office_waybill_attempt(v_uid);
  perform 1 from public.boxes b join public.orders o on o.id = b.order_id
  where b.id = p_box_id and o.fan_id = v_uid
    and o.status in ('registered', 'received', 'labeled', 'inspected', 'label_printed')
  for update of b;
  if not found then
    return 'not_found';
  end if;
  insert into public.office_parcels (box_id) values (p_box_id) on conflict (box_id) do nothing;
  select * into v from public.office_parcels where box_id = p_box_id for update;
  if v.state <> 'awaiting' then
    return 'already_received';
  end if;
  perform public.office_register_tracking(v.id, p_waybill);
  return 'saved';
end $$;

-- 크리에이터가 자기가 보낸 역조공 몫에 배송 조회용 송장번호를 넣는다.
drop function public.set_share_waybill(uuid, text);
create function public.set_share_waybill(p_share_id uuid, p_waybill text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v public.office_parcels;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_waybill, 0));
  perform public.office_waybill_attempt(v_uid);
  perform 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
  where s.id = p_share_id and d.sender_id = v_uid and d.status = 'done' and s.cancelled_at is null
  for update of s;
  if not found then
    return 'not_found';
  end if;
  insert into public.office_parcels (share_id) values (p_share_id) on conflict (share_id) do nothing;
  select * into v from public.office_parcels where share_id = p_share_id for update;
  if v.state <> 'awaiting' then
    return 'already_received';
  end if;
  perform public.office_register_tracking(v.id, p_waybill);
  return 'saved';
end $$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.office_waybill_attempt(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_box_waybill(uuid, text) from public, anon;
revoke all on function public.set_share_waybill(uuid, text) from public, anon;
grant execute on function public.set_box_waybill(uuid, text) to authenticated;
grant execute on function public.set_share_waybill(uuid, text) to authenticated;
