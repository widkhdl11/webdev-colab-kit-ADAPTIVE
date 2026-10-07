-- 받는 주소 6자리 — 운영자 확인 목록의 「반송으로 넘기기」 · 측정 숫자 · 「제가 보낸 게 아니에요」 누른 기록 읽기
-- (docs/specs/inbound-address-code.md INV-C6·C8·C9·C10, 「측정」 절, 카드 d48).
--
-- 1) 반송으로 넘기기(admin_return_unmatched): 운영자만, 아직 이어지지 않은 보류 상자(미확인 입고)만. 7일 자동 처리와 같은 끝 —
--    「반송 대상」(expired_at)으로 바꾸고 누가 넘겼는지 남긴다. 주문에 잇는 길은 만들지 않는다(INV-C4·C9 — 인자에 주문이 없다).
-- 2) 6자리 입력 기록(office_code_inputs): 입고 화면에서 직원이 넣은 6자리가 받아들여졌는지(accepted), 20자 밖 글자로 거부됐는지(format),
--    확인 문자가 틀려 거부됐는지(check). 거부는 상태를 바꾸지 않는 처리라(INV-C5) 입고 함수 안에 남길 수 없다 —
--    서버가 입고 함수를 부르기 전·후에 이 함수로 따로 남긴다. 측정용이라 입고와 한 처리일 필요는 없다.
-- 3) 측정 숫자(admin_inbound_metrics): 최근 30일 — 6자리 없이 들어온 상자 비율 · 확인 문자 불일치로 거부된 입력 비율 ·
--    「제가 보낸 게 아니에요」 건수. 운영자만.
-- 4) 팬·크리에이터 상자 읽기에 「제가 보낸 게 아니에요」를 이미 눌렀는지 한 칸을 더한다(그 상자 주인에게만 — 보류 목록은 여전히 없다, INV-C10).
--
-- 오류 꼴: 42501 권한 없음 · 22023 입력 꼴 · P0002 대상 없음 · 55000 이미 이어졌거나 반송 대상

-- ── 반송으로 넘기기 (INV-C6·C9) ───────────────────────────

alter table public.office_unmatched add column returned_by uuid references public.profiles (id);
alter table public.office_unmatched add constraint office_unmatched_returned_by check (returned_by is null or expired_at is not null);

create function public.admin_return_unmatched(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  u public.office_unmatched;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  select * into u from public.office_unmatched where id = p_id for update;
  if u.id is null then
    raise exception '없는 보류 상자다' using errcode = 'P0002';
  end if;
  if u.matched_parcel_id is not null or u.expired_at is not null then
    raise exception '이미 이어졌거나 반송 대상이다' using errcode = '55000';
  end if;
  update public.office_unmatched set expired_at = now(), returned_by = auth.uid() where id = u.id;
end $$;

-- ── 6자리 입력 기록 (측정) ────────────────────────────────

create table public.office_code_inputs (
  id bigint generated always as identity primary key,
  operator_id uuid not null references public.profiles (id),
  outcome text not null check (outcome in ('accepted', 'format', 'check')),
  at timestamptz not null default now()
);
create index office_code_inputs_at_idx on public.office_code_inputs (at desc);
alter table public.office_code_inputs enable row level security;
revoke all on public.office_code_inputs from public, anon, authenticated;
create trigger office_code_inputs_no_update before update on public.office_code_inputs
  for each row execute function public.append_only_log();
create trigger office_code_inputs_no_delete before delete on public.office_code_inputs
  for each row execute function public.append_only_log();

-- 입력한 값은 남기지 않는다 — 결과만(6자리가 로그에 남지 않게, INV-C2)
create function public.office_log_code_input(p_outcome text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('accepted', 'format', 'check') then
    raise exception '입력 결과 값이 아니다' using errcode = '22023';
  end if;
  insert into public.office_code_inputs (operator_id, outcome) values (auth.uid(), p_outcome);
end $$;

-- ── 측정 숫자 (최근 30일) ─────────────────────────────────

-- 들어온 상자 = 6자리로 입고된 상자 줄(찾기로 이어진 것은 보류 줄로 이미 세므로 뺀다) + 보류로 들어온 상자.
create function public.admin_inbound_metrics()
returns table (
  since timestamptz,
  arrived_total integer,
  arrived_without_code integer,
  code_inputs integer,
  code_check_rejects integer,
  code_format_rejects integer,
  not_mine_reports integer
)
language sql stable security definer set search_path = ''
as $$
  with w as (select now() - interval '30 days' as since)
  select w.since,
         ((select count(*) from public.office_parcels p
           where p.received_at > w.since
             and not exists (select 1 from public.office_unmatched u where u.matched_parcel_id = p.id))
          + (select count(*) from public.office_unmatched u where u.arrived_at > w.since))::integer,
         (select count(*) from public.office_unmatched u where u.arrived_at > w.since and u.reason = 'no_code')::integer,
         (select count(*) from public.office_code_inputs i where i.at > w.since)::integer,
         (select count(*) from public.office_code_inputs i where i.at > w.since and i.outcome = 'check')::integer,
         (select count(*) from public.office_code_inputs i where i.at > w.since and i.outcome = 'format')::integer,
         (select count(*) from public.office_not_mine_reports r where r.at > w.since)::integer
  from w
  where public.is_operator();
$$;

-- ── 상자 읽기: 「제가 보낸 게 아니에요」를 눌렀나 (INV-C8) ───────────

-- 20261007000007 의 my_gift_boxes 와 같고, 맨 끝에 reported_not_mine 칸을 더했다.
drop function public.my_gift_boxes(text);
create function public.my_gift_boxes(p_order_no text)
returns table (box_id uuid, label text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean)
language sql stable security definer set search_path = ''
as $$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, p.tracking_no, coalesce(p.state::text, 'no_waybill'),
         (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid'),
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id)
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$$;

-- 20261007000007 의 my_share_boxes 와 같고, 맨 끝에 reported_not_mine 칸을 더했다.
drop function public.my_share_boxes();
create function public.my_share_boxes()
returns table (share_id uuid, order_no text, fan_nickname text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.order_no, f.nickname, s.tier::text, p.tracking_no, coalesce(p.state::text, 'no_waybill'),
         (select c.code from public.inbound_codes c where c.share_id = s.id and c.state = 'valid'),
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id)
  from public.revgift_sends d
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles f on f.id = s.fan_id
  left join public.office_parcels p on p.share_id = s.id
  where d.sender_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc, s.seq;
$$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.admin_return_unmatched(uuid) from public, anon;
revoke all on function public.office_log_code_input(text) from public, anon;
revoke all on function public.admin_inbound_metrics() from public, anon;
revoke all on function public.my_gift_boxes(text) from public, anon;
revoke all on function public.my_share_boxes() from public, anon;

grant execute on function public.admin_return_unmatched(uuid) to authenticated;
grant execute on function public.office_log_code_input(text) to authenticated;
grant execute on function public.admin_inbound_metrics() to authenticated;
grant execute on function public.my_gift_boxes(text) to authenticated;
grant execute on function public.my_share_boxes() to authenticated;
